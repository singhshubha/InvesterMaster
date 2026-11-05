"""Reconcile dashboard KPIs against the app's original calculation engines.

Usage (from repo root):  python scripts/reconcile_kpis.py

Two independent code paths compute the same numbers:
  * server/dashboard_logic.py      (vectorized pandas/numpy, used by the dashboard + export)
  * server/calculator_logic.py     InvestmentCalculator.calculate_returns (/api/calculate)
  * server/advanced_analytics.py   PortfolioBuilder.simulate (/api/portfolio)
For each test case this writes the absolute difference in basis points (1 bp = 0.01
percentage point) to powerbi_export/reconciliation.csv and exits non-zero if any
difference exceeds TOLERANCE_BPS. Windows are kept inside the cached data, so neither
engine downloads anything.
"""
import os
import sys

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'server'))
import dashboard_logic as dl  # noqa: E402
from advanced_analytics import PortfolioBuilder  # noqa: E402
from calculator_logic import InvestmentCalculator  # noqa: E402

TOLERANCE_BPS = 1.0
AMOUNT = 10_000.0
RF = 2.0
SINGLE_CASES = [('SPY', '2015-01-01', '2025-12-31'), ('QQQ', '2015-01-01', '2025-12-31'),
                ('BND', '2008-01-01', '2025-12-31'), ('AAPL', '2000-01-01', '2025-12-31'),
                ('MSFT', '1990-01-01', '2025-12-31')]
ALLOCATION_CASES = [('SPY', 'BND', 60, '2008-01-01', '2025-12-31'), ('QQQ', 'BND', 80, '2010-01-01', '2025-12-31'),
                    ('AAPL', 'MSFT', 50, '2000-01-01', '2025-12-31')]


def bps(a, b):
    return round(abs(a - b) * 100, 4)


def main():
    rows = []
    for symbol, start, end in SINGLE_CASES:
        dash = next(k for k in dl.performance([symbol], start, end, AMOUNT, RF)['kpis'])
        app = InvestmentCalculator.calculate_returns(symbol, AMOUNT, start, end, mode='lump', drip=True)
        for kpi, d_key, a_key in [('Total Return %', 'total_return_pct', 'total_return_pct'),
                                  ('Max Drawdown %', 'max_drawdown_pct', 'max_drawdown_pct')]:
            rows.append({'case': f'{symbol} {start} to {end}', 'kpi': kpi, 'engine': '/api/calculate',
                         'dashboard': dash[d_key], 'app': app[a_key], 'diff_bps': bps(dash[d_key], app[a_key])})

    for eq, bd, w, start, end in ALLOCATION_CASES:
        app = PortfolioBuilder.simulate([{'symbol': eq, 'weight': w}, {'symbol': bd, 'weight': 100 - w}],
                                        AMOUNT, start, end, True, 'tax-advantaged', 15, RF)
        for freq in ('none', 'quarterly', 'annual'):
            dash = dl.allocation(eq, bd, w, freq, start, end, AMOUNT, RF)['kpis']['blend']
            a = app['results'][freq]
            for kpi, d_key, a_key in [('Total Return %', 'total_return_pct', 'total_return_pct'),
                                      ('CAGR %', 'cagr_pct', 'annualized_return_pct'),
                                      ('Volatility %', 'volatility_pct', 'annualized_volatility_pct'),
                                      ('Max Drawdown %', 'max_drawdown_pct', 'max_drawdown_pct'),
                                      ('Sharpe x100', 'sharpe', 'sharpe_ratio')]:
                dv, av = dash[d_key], a[a_key]
                if kpi.startswith('Sharpe'):
                    dv, av = dv * 100, av * 100
                rows.append({'case': f'{w}/{100 - w} {eq}/{bd} {freq} {start} to {end}', 'kpi': kpi,
                             'engine': '/api/portfolio', 'dashboard': dv, 'app': av, 'diff_bps': bps(dv, av)})

    df = pd.DataFrame(rows)
    out = os.path.join(ROOT, 'powerbi_export', 'reconciliation.csv')
    df.to_csv(out, index=False)
    worst = df['diff_bps'].max()
    print(f'{len(df)} KPI comparisons, max difference {worst} bps (tolerance {TOLERANCE_BPS}) -> {out}')
    if worst > TOLERANCE_BPS:
        print(df[df['diff_bps'] > TOLERANCE_BPS].to_string(index=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
