"""Export data/stocks.db into Power BI-ready CSVs.

Usage (from repo root):  python scripts/export_powerbi.py [--db data/stocks.db] [--out powerbi_export]

* Opens the database READ-ONLY and builds the views from server/analytics_views.sql as
  TEMP views, so stocks.db is never modified and no yfinance download is triggered.
* Monte Carlo projections reuse RetirementProjector._walk_forward/_summarize from
  server/advanced_analytics.py with a fixed seed, so numbers are reproducible.
"""
import argparse
import os
import sqlite3
import sys

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'server'))
from advanced_analytics import DAYS_PER_MONTH, RetirementProjector  # noqa: E402

SEED = 42
MC_SCENARIOS = [  # (scenario name, symbol, initial, monthly contribution, years, target)
    ('Conservative: BND', 'BND', 10_000, 500, 30, 500_000),
    ('Market: SPY', 'SPY', 10_000, 500, 30, 500_000),
    ('Growth: QQQ', 'QQQ', 10_000, 500, 30, 500_000),
]
MC_SIMULATIONS = 1000
ROLLING_HORIZONS_YEARS = [1, 5, 10, 20]

KPI_DEFINITIONS = [
    ('Total Return', 'End adjusted close / start adjusted close - 1, over the selected months.', 'fact_monthly'),
    ('CAGR', '(1 + Total Return) ^ (12 / months in window) - 1.', 'fact_monthly'),
    ('Annualized Volatility', 'Sample std dev of monthly returns x sqrt(12). (The app uses daily returns x sqrt(252), so values differ slightly.)', 'fact_monthly'),
    ('Sharpe Ratio', '(CAGR - risk-free rate) / Annualized Volatility. Risk-free rate is a what-if parameter (app default 2%).', 'fact_monthly'),
    ('Max Drawdown', 'Lowest daily drawdown_from_peak in the selected dates, where the peak is the running all-time high since the ticker\'s first cached date.', 'fact_daily'),
    ('Real CAGR', '(1 + CAGR) / (1 + CPI CAGR) - 1, using CPI-U (FRED CPIAUCSL), latest reading on or before each month end.', 'fact_monthly'),
    ('Rolling 12M Volatility', 'Std dev of the trailing 12 monthly returns x sqrt(12).', 'fact_monthly'),
    ('Rolling N-Year CAGR', 'Price-only CAGR of the S&P 500 index for every monthly start date with N full years of data after it. Excludes dividends.', 'rolling_windows'),
    ('Monte Carlo percentiles', 'Bootstrap of historical daily returns in 21-day months, same method as /api/retirement-projector, seed 42.', 'mc_projections'),
]


def connect_read_only(db_path):
    conn = sqlite3.connect(f'file:{os.path.abspath(db_path)}?mode=ro', uri=True)
    with open(os.path.join(ROOT, 'server', 'analytics_views.sql')) as f:
        sql = f.read()
    sql = sql.replace('DROP VIEW IF EXISTS ', 'DROP VIEW IF EXISTS temp.').replace('CREATE VIEW', 'CREATE TEMP VIEW')
    conn.executescript(sql)
    return conn


def rolling_windows(conn):
    sp = pd.read_sql_query(
        "SELECT date, close FROM v_index_levels WHERE index_name = 'S&P 500' ORDER BY date", conn)
    sp['month'] = sp['date'].str[:7]
    monthly = sp.groupby('month').last().reset_index()
    rows = []
    for years in ROLLING_HORIZONS_YEARS:
        n = years * 12
        for i in range(len(monthly) - n):
            start, end = monthly.iloc[i], monthly.iloc[i + n]
            rows.append({'index_name': 'S&P 500', 'horizon_years': years,
                         'start_month': start['month'], 'end_month': end['month'],
                         'cagr': (end['close'] / start['close']) ** (1 / years) - 1})
    return pd.DataFrame(rows)


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


def data_quality(conn):
    checks = [
        ('Header row imported as data in index tables',
         "SELECT (SELECT COUNT(*) FROM nasdaq_100 WHERE date='date') + (SELECT COUNT(*) FROM qqq WHERE date='date')"
         " + (SELECT COUNT(*) FROM sp500 WHERE date='date') + (SELECT COUNT(*) FROM spy WHERE date='date')"),
        ('Text (non-numeric) change_percent in index tables, excl. header rows',
         'SELECT ' + ' + '.join(f"(SELECT COUNT(*) FROM {t} WHERE typeof(change_percent)='text' AND date<>'date')"
                                for t in ('nasdaq_100', 'qqq', 'sp500', 'spy'))),
        ('Zero or NULL volume rows in stocks', 'SELECT COUNT(*) FROM stocks WHERE volume = 0 OR volume IS NULL'),
        ('Tickers whose last date trails the latest date in stocks',
         'SELECT COUNT(*) FROM (SELECT symbol FROM stocks GROUP BY symbol'
         ' HAVING MAX(date) < (SELECT MAX(date) FROM stocks))'),
        ('Non-holiday gaps > 5 calendar days in stocks (excl. 2001-09-11 closure)',
         "SELECT COUNT(*) FROM (SELECT date, LAG(date) OVER (PARTITION BY symbol ORDER BY date) p FROM stocks)"
         " WHERE julianday(date) - julianday(p) > 5 AND p <> '2001-09-10'"),
        ('Duplicate (symbol, date) in stocks',
         'SELECT COUNT(*) FROM (SELECT 1 FROM stocks GROUP BY symbol, date HAVING COUNT(*) > 1)'),
        ('Weekend dates in stocks', "SELECT COUNT(*) FROM stocks WHERE strftime('%w', date) IN ('0','6')"),
        ('Missing CPI months', "SELECT COUNT(*) FROM (SELECT date, LAG(date) OVER (ORDER BY date) p FROM cpi)"
                               " WHERE julianday(date) - julianday(p) > 31"),
        ('QQQ legacy table vs stocks: dates differing > $0.01',
         "SELECT COUNT(*) FROM stocks s JOIN qqq q ON q.date = s.date WHERE s.symbol='QQQ' AND ABS(s.close - q.close) > 0.01"),
    ]
    return pd.DataFrame([{'check': c, 'rows_affected': conn.execute(q).fetchone()[0]} for c, q in checks])


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--db', default=os.path.join(ROOT, 'data', 'stocks.db'))
    p.add_argument('--out', default=os.path.join(ROOT, 'powerbi_export'))
    args = p.parse_args()
    os.makedirs(args.out, exist_ok=True)

    conn = connect_read_only(args.db)
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
            'kpi_definitions': pd.DataFrame(KPI_DEFINITIONS, columns=['kpi', 'definition', 'source_table']),
            'data_quality': data_quality(conn),
        }
    finally:
        conn.close()

    for name, df in outputs.items():
        path = os.path.join(args.out, f'{name}.csv')
        df.to_csv(path, index=False)
        print(f'{name:16s} {len(df):>7,} rows -> {path}')


if __name__ == '__main__':
    main()
