"""Export data/stocks.db into Power BI-ready CSVs.

Usage (from repo root):  python scripts/export_powerbi.py [--db data/stocks.db] [--out powerbi_export]

* Opens the database READ-ONLY and builds the views from server/analytics_views.sql as
  TEMP views, so stocks.db is never modified and no yfinance download is triggered.
* KPI definitions, data-quality checks and rolling windows come from
  server/dashboard_logic.py, the same code behind the web dashboard.
* Monte Carlo projections reuse RetirementProjector._walk_forward/_summarize from
  server/advanced_analytics.py with a fixed seed, so numbers are reproducible.
* Run scripts/reconcile_kpis.py afterwards to refresh powerbi_export/reconciliation.csv.
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'server'))
import dashboard_logic as dl  # noqa: E402
from advanced_analytics import DAYS_PER_MONTH, RetirementProjector  # noqa: E402

SEED = 42
MC_SCENARIOS = [  # (scenario name, symbol, initial, monthly contribution, years, target)
    ('Conservative: BND', 'BND', 10_000, 500, 30, 500_000),
    ('Market: SPY', 'SPY', 10_000, 500, 30, 500_000),
    ('Growth: QQQ', 'QQQ', 10_000, 500, 30, 500_000),
]
MC_SIMULATIONS = 1000
ROLLING_HORIZONS_YEARS = [1, 5, 10, 20]


def rolling_windows(conn):
    monthly = dl.sp500_monthly_closes(conn)
    frames = []
    for years in ROLLING_HORIZONS_YEARS:
        w = dl.rolling_window_cagrs(monthly, years)
        w.insert(0, 'horizon_years', years)
        w.insert(0, 'index_name', 'S&P 500')
        frames.append(w)
    return pd.concat(frames, ignore_index=True)


def mc_projections(conn):
    frames = []
    for name, symbol, initial, monthly, years, target in MC_SCENARIOS:
        r = pd.read_sql_query(
            'SELECT daily_return FROM v_daily_prices WHERE symbol = ? AND daily_return IS NOT NULL '
            'ORDER BY date', conn, params=(symbol,))['daily_return'].to_numpy()
        rng = np.random.default_rng(SEED)
        months = years * 12
        sampled = rng.choice(r, size=(MC_SIMULATIONS, months, DAYS_PER_MONTH))
        values = RetirementProjector._walk_forward(np.prod(1 + sampled, axis=2), initial, monthly)
        s = RetirementProjector._summarize(values, target)
        df = pd.DataFrame({k: s[k] for k in ('months', 'p10', 'p25', 'p50', 'p75', 'p90')})
        df['contributed'] = initial + monthly * df['months']
        df.insert(0, 'scenario', name)
        df['symbol'] = symbol
        df['success_rate_pct'] = s['success_rate_pct']
        df['history_start'] = pd.read_sql_query(
            'SELECT MIN(date) d FROM stocks WHERE symbol = ?', conn, params=(symbol,))['d'][0]
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--db', default=dl.DB_PATH)
    p.add_argument('--out', default=os.path.join(ROOT, 'powerbi_export'))
    args = p.parse_args()
    os.makedirs(args.out, exist_ok=True)

    conn = dl.connect_read_only(args.db)
    try:
        monthly = pd.read_sql_query('SELECT * FROM v_monthly_prices ORDER BY symbol, month', conn)
        monthly['rolling_12m_vol'] = (monthly.groupby('symbol')['monthly_return']
                                      .transform(lambda s: s.rolling(12).std() * np.sqrt(12)))
        outputs = {
            'fact_daily': pd.read_sql_query('SELECT * FROM v_daily_prices ORDER BY symbol, date', conn),
            'fact_monthly': monthly,
            'dim_ticker': pd.read_sql_query('SELECT * FROM v_ticker_coverage', conn),
            'cpi': pd.read_sql_query('SELECT date, value AS cpi FROM cpi ORDER BY date', conn),
            'rolling_windows': rolling_windows(conn),
            'mc_projections': mc_projections(conn),
            'kpi_definitions': pd.DataFrame(dl.KPI_DEFINITIONS, columns=['kpi', 'definition', 'consistency']),
            'data_quality': pd.DataFrame(dl.data_quality(conn)),
        }
    finally:
        conn.close()

    for name, df in outputs.items():
        path = os.path.join(args.out, f'{name}.csv')
        df.to_csv(path, index=False)
        print(f'{name:16s} {len(df):>7,} rows -> {path}')


if __name__ == '__main__':
    main()
