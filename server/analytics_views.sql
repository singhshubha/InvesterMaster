-- analytics_views.sql
-- Clean, analysis-ready views over data/stocks.db. Read-only: no table is modified.
-- Run permanently:  sqlite3 data/stocks.db < server/analytics_views.sql
-- Or let scripts/export_powerbi.py create them as TEMP views (leaves the .db untouched).

-- 1. Daily prices with return and drawdown. Source of truth = `stocks` (what the app uses).
DROP VIEW IF EXISTS v_daily_prices;
CREATE VIEW v_daily_prices AS
SELECT
    symbol,
    date,
    close,
    adjusted_close,
    NULLIF(volume, 0) AS volume,                       -- 0 volume treated as missing
    adjusted_close
        / LAG(adjusted_close) OVER (PARTITION BY symbol ORDER BY date) - 1 AS daily_return,
    adjusted_close
        / MAX(adjusted_close) OVER (PARTITION BY symbol ORDER BY date
                                    ROWS UNBOUNDED PRECEDING) - 1 AS drawdown_from_peak
FROM stocks
WHERE adjusted_close > 0;

-- 2. Month-end prices joined to CPI (latest CPI on or before month end, same rule as
--    InflationIndex.series_for_dates in calculator_logic.py; forward-fills the 2025-10 gap).
DROP VIEW IF EXISTS v_monthly_prices;
CREATE VIEW v_monthly_prices AS
WITH ranked AS (
    SELECT symbol, date, close, adjusted_close,
           ROW_NUMBER() OVER (PARTITION BY symbol, substr(date, 1, 7) ORDER BY date DESC) AS rn
    FROM stocks
    WHERE adjusted_close > 0
),
month_end AS (
    SELECT symbol, substr(date, 1, 7) AS month, date AS month_end_date, close, adjusted_close
    FROM ranked WHERE rn = 1
),
with_cpi AS (
    SELECT m.*,
           (SELECT c.value FROM cpi c WHERE c.date <= m.month_end_date
            ORDER BY c.date DESC LIMIT 1) AS cpi
    FROM month_end m
)
SELECT
    symbol,
    month,
    month_end_date,
    close,
    adjusted_close,
    cpi,
    adjusted_close / LAG(adjusted_close) OVER w - 1 AS monthly_return,
    cpi / LAG(cpi) OVER w - 1                       AS monthly_inflation,
    (1 + adjusted_close / LAG(adjusted_close) OVER w - 1)
        / (1 + cpi / LAG(cpi) OVER w - 1) - 1       AS real_monthly_return
FROM with_cpi
WINDOW w AS (PARTITION BY symbol ORDER BY month);

-- 3. The four index tables, typed and labeled. Price-only levels (no dividends).
--    S&P 500 and NASDAQ-100 are extended from Yahoo (^GSPC, ^NDX); legacy qqq/spy end
--    2024-04-15 and are superseded by `stocks`. The WHERE/NULLIF guards stay in case the
--    CSVs are ever re-imported with their header row again.
DROP VIEW IF EXISTS v_index_levels;
CREATE VIEW v_index_levels AS
SELECT 'NASDAQ-100' AS index_name, date, CAST(close AS REAL) AS close,
       CAST(NULLIF(change_percent, '') AS REAL) AS change_percent
FROM nasdaq_100 WHERE date <> 'date'
UNION ALL
SELECT 'S&P 500', date, CAST(close AS REAL), CAST(NULLIF(change_percent, '') AS REAL)
FROM sp500 WHERE date <> 'date'
UNION ALL
SELECT 'QQQ (legacy, not split-adjusted)', date, CAST(close AS REAL), CAST(NULLIF(change_percent, '') AS REAL)
FROM qqq WHERE date <> 'date'
UNION ALL
SELECT 'SPY (legacy)', date, CAST(close AS REAL), CAST(NULLIF(change_percent, '') AS REAL)
FROM spy WHERE date <> 'date';

-- 4. One row per ticker: coverage, so the dashboard can show what each line is based on.
DROP VIEW IF EXISTS v_ticker_coverage;
CREATE VIEW v_ticker_coverage AS
SELECT symbol,
       MIN(date) AS first_date,
       MAX(date) AS last_date,
       COUNT(*)  AS trading_days,
       CASE symbol WHEN 'BND' THEN 'Bond ETF'
                   WHEN 'SPY' THEN 'Equity ETF'
                   WHEN 'QQQ' THEN 'Equity ETF'
                   ELSE 'Single stock' END AS asset_class
FROM stocks
GROUP BY symbol;
