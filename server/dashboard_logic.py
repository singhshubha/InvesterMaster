"""KPI and scenario calculations behind the Market Dashboard (/api/dashboard/*) and the
Power BI export (scripts/export_powerbi.py), so both report the same numbers.

Everything here reads data/stocks.db read-only through the views in analytics_views.sql
(created as TEMP views per connection), so it never writes to the database or calls
yfinance. KPI conventions match the existing engines in calculator_logic.py and
advanced_analytics.py: adjusted close (dividends reinvested), CAGR over calendar days /
365.25, volatility = daily std x sqrt(252), Sharpe = (CAGR - risk-free) / volatility.
"""
import math
import os
import sqlite3

import numpy as np
import pandas as pd

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(SERVER_DIR, '..', 'data', 'stocks.db'))
VIEWS_SQL_PATH = os.path.join(SERVER_DIR, 'analytics_views.sql')

TRADING_DAYS = 252
REBALANCE_FREQUENCIES = ('none', 'quarterly', 'annual')
ROLLING_BIN_WIDTH_PCT = {1: 5, 5: 2, 10: 1, 20: 1}

KPI_DEFINITIONS = [
    ('Total Return', 'Last adjusted close / first adjusted close in the window - 1. Adjusted close assumes dividends are reinvested.',
     'Same as /api/calculate with DRIP on.'),
    ('CAGR', '(End / Start) ^ (1 / years) - 1, where years = calendar days / 365.25.',
     'Same as annualized return in /api/portfolio.'),
    ('Annualized Volatility', 'Sample standard deviation of daily returns x sqrt(252).',
     'Same as /api/portfolio. Power BI: STDEV.S(fact_daily[daily_return]) * SQRT(252).'),
    ('Sharpe Ratio', '(CAGR - risk-free rate) / Annualized Volatility. Risk-free rate is user-set (default 2%).',
     'Same as /api/portfolio.'),
    ('Max Drawdown', 'Largest fall from a running peak inside the selected window, measured on daily closes.',
     'Same as /api/calculate. Power BI fact_daily[drawdown_from_peak] measures from the all-time high instead; the two agree when the window starts at a high.'),
    ('Recovery Date', 'First date after the max drawdown trough when value regained the prior peak. Blank if not yet recovered.', ''),
    ('Real CAGR', 'CAGR after restating the end value in start-date dollars with CPI-U (FRED CPIAUCSL), using the latest CPI reading on or before each date.',
     'Same inflation rule as /api/calculate with inflation adjustment on.'),
    ('Annual Return', 'Year-end value / prior year-end value - 1. First and last years are partial when the window does not cover the full year.', ''),
    ('Rolling 12M Volatility', 'Volatility of the trailing 252 trading days, sampled at each month end.', ''),
    ('Rebalanced Allocation', 'Two-asset portfolio reset to target weights on the first trading day of each quarter or year (or never). No taxes or fees.',
     'Same path logic as /api/portfolio in a tax-advantaged account; checked in powerbi_export/reconciliation.csv.'),
    ('Rolling N-Year CAGR', 'S&P 500 price-index CAGR for every monthly start date with N full years after it. Price only: excludes dividends.', ''),
    ('Monte Carlo Percentiles', 'Bootstrap of historical daily returns in 21-day months, compounded with monthly contributions; p10 to p90 of simulated paths.',
     'Uses /api/retirement-projector.'),
]

# (check, SQL returning a count, note shown when the count is non-zero and expected)
DATA_QUALITY_CHECKS = [
    ('Header row imported as data in index tables',
     'SELECT ' + ' + '.join(f"(SELECT COUNT(*) FROM {t} WHERE date = 'date')"
                            for t in ('nasdaq_100', 'qqq', 'sp500', 'spy')), ''),
    ('Text (non-numeric) change_percent in index tables, excl. header rows',
     'SELECT ' + ' + '.join(f"(SELECT COUNT(*) FROM {t} WHERE typeof(change_percent) = 'text' AND date <> 'date')"
                            for t in ('nasdaq_100', 'qqq', 'sp500', 'spy')), ''),
    ('Zero or NULL volume rows in stocks',
     'SELECT COUNT(*) FROM stocks WHERE volume = 0 OR volume IS NULL',
     'Reported as zero by Yahoo Finance; treated as missing in the views.'),
    ('Tickers whose last date trails the latest date in stocks',
     'SELECT COUNT(*) FROM (SELECT symbol FROM stocks GROUP BY symbol HAVING MAX(date) < (SELECT MAX(date) FROM stocks))', ''),
    ('Non-holiday gaps > 5 calendar days in stocks (excl. 2001-09-11 closure)',
     "SELECT COUNT(*) FROM (SELECT date, LAG(date) OVER (PARTITION BY symbol ORDER BY date) p FROM stocks)"
     " WHERE julianday(date) - julianday(p) > 5 AND p <> '2001-09-10'", ''),
    ('Duplicate (symbol, date) in stocks',
     'SELECT COUNT(*) FROM (SELECT 1 FROM stocks GROUP BY symbol, date HAVING COUNT(*) > 1)', ''),
    ('Weekend dates in stocks', "SELECT COUNT(*) FROM stocks WHERE strftime('%w', date) IN ('0', '6')", ''),
    ('Missing CPI months',
     'SELECT COUNT(*) FROM (SELECT date, LAG(date) OVER (ORDER BY date) p FROM cpi) WHERE julianday(date) - julianday(p) > 31',
     'October 2025 CPI was not published; the prior month is carried forward.'),
    ('QQQ legacy table vs stocks: dates differing > $0.01',
     "SELECT COUNT(*) FROM stocks s JOIN qqq q ON q.date = s.date WHERE s.symbol = 'QQQ' AND ABS(s.close - q.close) > 0.01",
     'Legacy qqq table is not split-adjusted. The dashboard uses stocks only.'),
]


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def connect_read_only(db_path=DB_PATH):
    conn = sqlite3.connect(f'file:{os.path.abspath(db_path)}?mode=ro', uri=True)
    with open(VIEWS_SQL_PATH) as f:
        sql = f.read()
    sql = sql.replace('DROP VIEW IF EXISTS ', 'DROP VIEW IF EXISTS temp.').replace('CREATE VIEW', 'CREATE TEMP VIEW')
    conn.executescript(sql)
    return conn


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _r(x, digits=2):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), digits)


def _pct(x, digits=2):
    return None if x is None else _r(x * 100, digits)


def _years_between(d0, d1):
    days = (pd.Timestamp(d1) - pd.Timestamp(d0)).days
    return max(days / 365.25, 1 / 365.25)


def _month_end_positions(dates):
    """Positions of the last trading day of each month (plus the first date)."""
    months = pd.Series([d[:7] for d in dates])
    last = months.ne(months.shift(-1)).to_numpy().nonzero()[0].tolist()
    return sorted(set([0] + last))


def _cpi_for_dates(conn, dates):
    cpi = pd.read_sql_query('SELECT date, value FROM cpi ORDER BY date', conn)
    cpi['date'] = pd.to_datetime(cpi['date'])
    left = pd.DataFrame({'date': pd.to_datetime(pd.Series(dates))})
    merged = pd.merge_asof(left, cpi, on='date', direction='backward')
    return merged['value'].to_numpy()


def coverage(conn):
    df = pd.read_sql_query('SELECT * FROM v_ticker_coverage ORDER BY symbol', conn)
    return df.to_dict(orient='records')


# ---------------------------------------------------------------------------
# KPIs for one value path
# ---------------------------------------------------------------------------

def path_kpis(dates, values, cpi, rf_pct, amount):
    v = np.asarray(values, dtype=float)
    growth = v / v[0]
    years = _years_between(dates[0], dates[-1])
    total_return = growth[-1] - 1
    cagr = growth[-1] ** (1 / years) - 1

    daily = np.diff(v) / v[:-1]
    vol = float(np.std(daily, ddof=1) * math.sqrt(TRADING_DAYS)) if len(daily) > 1 else 0.0
    sharpe = (cagr * 100 - rf_pct) / (vol * 100) if vol > 0 else None

    peak = np.maximum.accumulate(v)
    dd = v / peak - 1
    trough_i = int(dd.argmin())
    peak_i = int(v[:trough_i + 1].argmax())
    recovery_date = None
    if dd[trough_i] < 0:
        recovered = np.nonzero(v[trough_i:] >= v[peak_i])[0]
        if recovered.size:
            recovery_date = dates[trough_i + int(recovered[0])]

    real_cagr = None
    final_real = None
    if cpi is not None and not np.isnan(cpi[0]) and not np.isnan(cpi[-1]):
        real_growth = growth[-1] * cpi[0] / cpi[-1]
        real_cagr = real_growth ** (1 / years) - 1
        final_real = amount * real_growth

    return {
        'start_date': dates[0],
        'end_date': dates[-1],
        'final_value': _r(amount * growth[-1]),
        'final_value_real': _r(final_real),
        'total_return_pct': _pct(total_return),
        'cagr_pct': _pct(cagr),
        'real_cagr_pct': _pct(real_cagr),
        'volatility_pct': _pct(vol),
        'sharpe': _r(sharpe),
        'max_drawdown_pct': _pct(dd[trough_i]),
        'max_drawdown_date': dates[trough_i],
        'drawdown_peak_date': dates[peak_i],
        'recovery_date': recovery_date,
    }


# ---------------------------------------------------------------------------
# Price loading with a common window
# ---------------------------------------------------------------------------

def _resolve_window(conn, symbols, start, end):
    cov = {c['symbol']: c for c in coverage(conn)}
    unknown = [s for s in symbols if s not in cov]
    if unknown:
        raise ValueError(f'No cached data for: {", ".join(unknown)}. Available: {", ".join(sorted(cov))}.')
    latest_first = max(symbols, key=lambda s: cov[s]['first_date'])
    earliest_last = min(symbols, key=lambda s: cov[s]['last_date'])
    eff_start = max(start or '0000-00-00', cov[latest_first]['first_date'])
    eff_end = min(end or '9999-99-99', cov[earliest_last]['last_date'])
    floor = start or min(cov[s]['first_date'] for s in symbols)
    clipped_by = latest_first if len(symbols) > 1 and cov[latest_first]['first_date'] > floor else None
    return eff_start, eff_end, clipped_by


def _aligned_prices(conn, symbols, start, end):
    placeholders = ','.join('?' * len(symbols))
    df = pd.read_sql_query(
        f'SELECT symbol, date, adjusted_close FROM stocks WHERE adjusted_close > 0 '
        f'AND symbol IN ({placeholders}) AND date BETWEEN ? AND ? ORDER BY date',
        conn, params=[*symbols, start, end])
    wide = df.pivot(index='date', columns='symbol', values='adjusted_close').dropna()
    return wide[symbols]


# ---------------------------------------------------------------------------
# /api/dashboard/performance
# ---------------------------------------------------------------------------

def performance(symbols, start=None, end=None, amount=10_000.0, rf_pct=2.0, db_path=DB_PATH):
    conn = connect_read_only(db_path)
    try:
        eff_start, eff_end, clipped_by = _resolve_window(conn, symbols, start, end)
        if eff_start >= eff_end:
            raise ValueError('The selected tickers have no overlapping dates in that range.')
        prices = _aligned_prices(conn, symbols, eff_start, eff_end)
        if len(prices) < 2:
            raise ValueError('Not enough overlapping trading days in that range.')
        dates = prices.index.tolist()
        cpi = _cpi_for_dates(conn, dates)

        cpi_df = pd.read_sql_query('SELECT date, value FROM cpi ORDER BY date', conn)
    finally:
        conn.close()

    month_pos = _month_end_positions(dates)
    month_dates = [dates[i] for i in month_pos]
    months = pd.Series([d[:7] for d in dates])

    kpis, growth, growth_real, drawdown, rolling_vol = [], {}, {}, {}, {}
    annual_nominal, annual_real = {}, {}
    year_end_pos = pd.Series([d[:4] for d in dates]).pipe(lambda y: y.ne(y.shift(-1))).to_numpy().nonzero()[0]
    years = [dates[i][:4] for i in year_end_pos]

    for s in symbols:
        p = prices[s].to_numpy()
        k = path_kpis(dates, p, cpi, rf_pct, amount)
        k['symbol'] = s

        g = amount * p / p[0]
        g_real = g * cpi[0] / cpi
        dd = p / np.maximum.accumulate(p) - 1
        dd_month_min = pd.Series(dd).groupby(months).min()
        r = pd.Series(p).pct_change()
        rv = r.rolling(TRADING_DAYS).std() * math.sqrt(TRADING_DAYS)

        growth[s] = [_r(g[i]) for i in month_pos]
        growth_real[s] = [_r(g_real[i]) for i in month_pos]
        drawdown[s] = [_pct(dd_month_min[dates[i][:7]]) for i in month_pos]
        rolling_vol[s] = [_pct(rv.iloc[i]) for i in month_pos]

        prev_i = 0
        nom, real = [], []
        for i in year_end_pos:
            nom_r = p[i] / p[prev_i] - 1
            real_r = (1 + nom_r) * cpi[prev_i] / cpi[i] - 1
            nom.append(_pct(nom_r))
            real.append(_pct(real_r))
            prev_i = i
        annual_nominal[s], annual_real[s] = nom, real

        yearly = [(y, n) for y, n in zip(years, nom) if n is not None]
        k['best_year'] = max(yearly, key=lambda t: t[1]) if yearly else None
        k['worst_year'] = min(yearly, key=lambda t: t[1]) if yearly else None
        kpis.append(k)

    partial = []
    for idx, i in enumerate(year_end_pos):
        first_i = 0 if idx == 0 else year_end_pos[idx - 1] + 1
        partial.append(dates[first_i][5:] > '01-07' or dates[i][5:] < '12-24')

    cpi_df['yoy'] = cpi_df['value'] / cpi_df['value'].shift(12) - 1
    in_window = cpi_df[(cpi_df['date'] >= eff_start[:7] + '-01') & (cpi_df['date'] <= eff_end)]

    return {
        'window': {'requested_start': start, 'requested_end': end, 'start': dates[0], 'end': dates[-1],
                   'clipped_by': clipped_by, 'trading_days': len(dates)},
        'amount': amount,
        'risk_free_pct': rf_pct,
        'symbols': symbols,
        'kpis': kpis,
        'series': {'dates': month_dates, 'growth': growth, 'growth_real': growth_real,
                   'drawdown': drawdown, 'rolling_vol': rolling_vol},
        'annual': {'years': years, 'partial': partial, 'nominal': annual_nominal, 'real': annual_real},
        'inflation': {'dates': in_window['date'].tolist(),
                      'yoy_pct': [_pct(x) for x in in_window['yoy'].tolist()]},
    }


# ---------------------------------------------------------------------------
# /api/dashboard/allocation
# ---------------------------------------------------------------------------

def _period_keys(dates, freq):
    if freq == 'annual':
        return [d[:4] for d in dates]
    if freq == 'quarterly':
        return [f'{d[:4]}Q{(int(d[5:7]) - 1) // 3 + 1}' for d in dates]
    return ['all'] * len(dates)


def rebalanced_path(pe, pb, weight, freq, amount):
    """Value of a two-asset portfolio reset to `weight` in asset e at the first trading day
    of each period. Matches PortfolioBuilder._run_path for a tax-advantaged account."""
    keys = _period_keys(pe.index.tolist(), freq)
    e, b = pe.to_numpy(), pb.to_numpy()
    starts = [0] + [i for i in range(1, len(keys)) if keys[i] != keys[i - 1]]
    bounds = starts + [len(e)]
    values = np.empty(len(e))
    v = amount
    for s, nxt in zip(bounds[:-1], bounds[1:]):
        seg_e, seg_b = e[s:nxt] / e[s], b[s:nxt] / b[s]
        values[s:nxt] = v * (weight * seg_e + (1 - weight) * seg_b)
        if nxt < len(e):
            v = v * (weight * e[nxt] / e[s] + (1 - weight) * b[nxt] / b[s])
    return values


def allocation(equity, bond, weight_pct, rebalance='quarterly', start=None, end=None,
               amount=10_000.0, rf_pct=2.0, db_path=DB_PATH):
    if rebalance not in REBALANCE_FREQUENCIES:
        raise ValueError(f'rebalance must be one of {", ".join(REBALANCE_FREQUENCIES)}.')
    if equity == bond:
        raise ValueError('Pick two different assets.')
    conn = connect_read_only(db_path)
    try:
        eff_start, eff_end, clipped_by = _resolve_window(conn, [equity, bond], start, end)
        prices = _aligned_prices(conn, [equity, bond], eff_start, eff_end)
        if len(prices) < 2:
            raise ValueError('Not enough overlapping trading days in that range.')
        dates = prices.index.tolist()
        cpi = _cpi_for_dates(conn, dates)
    finally:
        conn.close()

    w = weight_pct / 100
    pe, pb = prices[equity], prices[bond]
    paths = {
        'blend': rebalanced_path(pe, pb, w, rebalance, amount),
        'equity': amount * pe.to_numpy() / pe.iloc[0],
        'bond': amount * pb.to_numpy() / pb.iloc[0],
    }
    month_pos = _month_end_positions(dates)

    frontier = []
    for wp in range(0, 101, 10):
        k = path_kpis(dates, rebalanced_path(pe, pb, wp / 100, rebalance, amount), cpi, rf_pct, amount)
        frontier.append({'weight_pct': wp, 'cagr_pct': k['cagr_pct'], 'volatility_pct': k['volatility_pct'],
                         'max_drawdown_pct': k['max_drawdown_pct'], 'sharpe': k['sharpe']})

    return {
        'window': {'requested_start': start, 'requested_end': end, 'start': dates[0], 'end': dates[-1],
                   'clipped_by': clipped_by},
        'equity': equity, 'bond': bond, 'weight_pct': weight_pct, 'rebalance': rebalance,
        'amount': amount, 'risk_free_pct': rf_pct,
        'kpis': {name: path_kpis(dates, vals, cpi, rf_pct, amount) for name, vals in paths.items()},
        'series': {'dates': [dates[i] for i in month_pos],
                   **{name: [_r(vals[i]) for i in month_pos] for name, vals in paths.items()}},
        'frontier': frontier,
    }


# ---------------------------------------------------------------------------
# /api/dashboard/rolling-windows
# ---------------------------------------------------------------------------

def sp500_monthly_closes(conn):
    df = pd.read_sql_query(
        "SELECT date, close FROM v_index_levels WHERE index_name = 'S&P 500' ORDER BY date", conn)
    df['month'] = df['date'].str[:7]
    monthly = df.groupby('month').last().reset_index()
    last = monthly.iloc[-1]
    if last['date'][8:] < '25':  # drop a partial current month
        monthly = monthly.iloc[:-1]
    return monthly


def rolling_window_cagrs(monthly, years):
    n = years * 12
    c = monthly['close'].to_numpy()
    if len(c) <= n:
        return pd.DataFrame(columns=['start_month', 'end_month', 'cagr'])
    cagr = (c[n:] / c[:-n]) ** (1 / years) - 1
    return pd.DataFrame({'start_month': monthly['month'].iloc[:-n].to_numpy(),
                         'end_month': monthly['month'].iloc[n:].to_numpy(), 'cagr': cagr})


def rolling_windows(horizon_years, db_path=DB_PATH):
    if horizon_years not in ROLLING_BIN_WIDTH_PCT:
        raise ValueError(f'horizon must be one of {", ".join(map(str, ROLLING_BIN_WIDTH_PCT))}.')
    conn = connect_read_only(db_path)
    try:
        monthly = sp500_monthly_closes(conn)
    finally:
        conn.close()
    w = rolling_window_cagrs(monthly, horizon_years)
    pct = w['cagr'].to_numpy() * 100
    width = ROLLING_BIN_WIDTH_PCT[horizon_years]
    lo, hi = math.floor(pct.min() / width) * width, math.ceil(pct.max() / width) * width
    if hi == lo:
        hi = lo + width
    edges = np.arange(lo, hi + width, width)
    counts, _ = np.histogram(pct, bins=edges)
    best, worst = w.loc[w['cagr'].idxmax()], w.loc[w['cagr'].idxmin()]
    return {
        'index_name': 'S&P 500 (price only)',
        'horizon_years': horizon_years,
        'first_start': w['start_month'].iloc[0],
        'last_end': w['end_month'].iloc[-1],
        'windows': int(len(w)),
        'pct_negative': _r((pct < 0).mean() * 100, 1),
        'median_cagr_pct': _r(np.median(pct)),
        'p10_cagr_pct': _r(np.percentile(pct, 10)),
        'p90_cagr_pct': _r(np.percentile(pct, 90)),
        'best': {'start_month': best['start_month'], 'end_month': best['end_month'], 'cagr_pct': _pct(best['cagr'])},
        'worst': {'start_month': worst['start_month'], 'end_month': worst['end_month'], 'cagr_pct': _pct(worst['cagr'])},
        'bins': [{'from_pct': _r(a), 'to_pct': _r(b), 'count': int(c)} for a, b, c in zip(edges[:-1], edges[1:], counts)],
    }


# ---------------------------------------------------------------------------
# /api/dashboard/meta
# ---------------------------------------------------------------------------

def data_quality(conn):
    rows = []
    for check, sql, note in DATA_QUALITY_CHECKS:
        n = conn.execute(sql).fetchone()[0]
        rows.append({'check': check, 'rows_affected': n, 'status': 'pass' if n == 0 else 'note',
                     'note': note if n else ''})
    return rows


RECONCILIATION_CSV = os.path.abspath(os.path.join(SERVER_DIR, '..', 'powerbi_export', 'reconciliation.csv'))


def reconciliation_summary():
    if not os.path.exists(RECONCILIATION_CSV):
        return None
    df = pd.read_csv(RECONCILIATION_CSV)
    return {'comparisons': int(len(df)), 'max_diff_bps': _r(df['diff_bps'].max(), 4),
            'engines': sorted(df['engine'].unique().tolist()), 'cases': int(df['case'].nunique())}


def meta(db_path=DB_PATH):
    conn = connect_read_only(db_path)
    try:
        has_news = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'news_headlines'").fetchone()[0]
        return {
            'tickers': coverage(conn),
            'as_of': conn.execute('SELECT MAX(date) FROM stocks').fetchone()[0],
            'cpi_as_of': conn.execute('SELECT MAX(date) FROM cpi').fetchone()[0],
            'daily_rows': conn.execute('SELECT COUNT(*) FROM stocks').fetchone()[0],
            'cpi_rows': conn.execute('SELECT COUNT(*) FROM cpi').fetchone()[0],
            'news_headlines_stored': conn.execute('SELECT COUNT(*) FROM news_headlines').fetchone()[0] if has_news else 0,
            'data_quality': data_quality(conn),
            'reconciliation': reconciliation_summary(),
            'kpi_definitions': [{'kpi': k, 'definition': d, 'consistency': c} for k, d, c in KPI_DEFINITIONS],
        }
    finally:
        conn.close()
