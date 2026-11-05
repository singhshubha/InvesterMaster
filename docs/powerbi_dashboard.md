# Power BI version of the Market Dashboard

The web dashboard (`dashboard.html`) and this Power BI report are built on the same data and
the same KPI definitions (`powerbi_export/kpi_definitions.csv`). Build this one to show the
same analysis in Power BI.

## 1. Get the data in

1. From the repo root run `python scripts/export_powerbi.py`. This rewrites `powerbi_export/*.csv`
   from `data/stocks.db`, opening the database read-only.
2. In Power BI Desktop: **Get Data > Folder**, point it at `powerbi_export/`, and load each CSV as its own table.
   A **Refresh** after re-running the export picks up new data.
3. Set the data types: every `date` / `month_end_date` column is **Date**, and prices and returns are **Decimal Number**.

Power BI Desktop runs only on Windows. On an Apple Silicon Mac, use Windows 11 for ARM in Parallels, or a
university Windows lab. The same CSVs also open in Excel for Mac.

## 2. Model

| Table | Grain | Key columns |
|---|---|---|
| `fact_daily` | symbol x trading day | date, adjusted_close, daily_return, drawdown_from_peak |
| `fact_monthly` | symbol x month | month, month_end_date, adjusted_close, cpi, monthly_return, real_monthly_return, rolling_12m_vol |
| `dim_ticker` | symbol | asset_class, first_date, last_date |
| `rolling_windows` | horizon x start month | horizon_years, start_month, cagr |
| `mc_projections` | scenario x month | months, p10 to p90, contributed, success_rate_pct |
| `cpi`, `kpi_definitions`, `data_quality`, `reconciliation` | reference | |

Relationships: `dim_ticker[symbol]` (1) to `fact_daily[symbol]` and `fact_monthly[symbol]` (many).
Create a date table, mark it as the date table, and relate it to `fact_daily[date]` and `fact_monthly[month_end_date]`:

```DAX
DimDate = CALENDAR ( DATE ( 1980, 1, 1 ), DATE ( 2026, 12, 31 ) )
```

What-if parameters (Modeling > New parameter): **Start Amount** (1,000 to 100,000), **Risk Free** (0 to 0.06, step 0.0025)
and **Equity Weight** (0 to 100, step 5).

## 3. Measures

These measures use the same definitions as the API, so the cards match the web dashboard.

```DAX
Start Date = CALCULATE ( MIN ( fact_daily[date] ), ALLSELECTED ( DimDate ) )
End Date   = CALCULATE ( MAX ( fact_daily[date] ), ALLSELECTED ( DimDate ) )

Start Price =
VAR d = [Start Date]
RETURN CALCULATE ( MAX ( fact_daily[adjusted_close] ), REMOVEFILTERS ( DimDate ), fact_daily[date] = d )

End Price =
VAR d = [End Date]
RETURN CALCULATE ( MAX ( fact_daily[adjusted_close] ), REMOVEFILTERS ( DimDate ), fact_daily[date] = d )

Total Return = DIVIDE ( [End Price], [Start Price] ) - 1

CAGR =
VAR yrs = DATEDIFF ( [Start Date], [End Date], DAY ) / 365.25
RETURN IF ( yrs > 0, ( 1 + [Total Return] ) ^ ( 1 / yrs ) - 1 )

Annualized Volatility =
VAR d0 = [Start Date]
RETURN CALCULATE ( STDEV.S ( fact_daily[daily_return] ), fact_daily[date] > d0 ) * SQRT ( 252 )

Sharpe = DIVIDE ( [CAGR] - 'Risk Free'[Risk Free Value], [Annualized Volatility] )

Max Drawdown = MIN ( fact_daily[drawdown_from_peak] )    // from the all-time high; see KPI notes

Growth of X =                                             // line chart, month_end_date on the axis
[Start Amount Value] * DIVIDE ( MAX ( fact_monthly[adjusted_close] ), [Start Price] )

CPI Start = VAR d = CALCULATE ( MIN ( fact_monthly[month_end_date] ), ALLSELECTED ( DimDate ) )
            RETURN CALCULATE ( MAX ( fact_monthly[cpi] ), REMOVEFILTERS ( DimDate ), fact_monthly[month_end_date] = d )
CPI End   = VAR d = CALCULATE ( MAX ( fact_monthly[month_end_date] ), ALLSELECTED ( DimDate ) )
            RETURN CALCULATE ( MAX ( fact_monthly[cpi] ), REMOVEFILTERS ( DimDate ), fact_monthly[month_end_date] = d )
Real CAGR =
VAR yrs = DATEDIFF ( [Start Date], [End Date], DAY ) / 365.25
RETURN ( ( 1 + [Total Return] ) * DIVIDE ( [CPI Start], [CPI End] ) ) ^ ( 1 / yrs ) - 1

Period Return      = PRODUCTX ( fact_monthly, 1 + fact_monthly[monthly_return] ) - 1       // yearly bars
Period Real Return = PRODUCTX ( fact_monthly, 1 + fact_monthly[real_monthly_return] ) - 1

Blend Return =                                            // monthly-rebalanced SPY/BND mix
VAR w = [Equity Weight Value] / 100
RETURN w * CALCULATE ( MAX ( fact_monthly[monthly_return] ), dim_ticker[symbol] = "SPY" )
     + ( 1 - w ) * CALCULATE ( MAX ( fact_monthly[monthly_return] ), dim_ticker[symbol] = "BND" )

Blend Growth =
VAR cur = MAX ( fact_monthly[month] )
VAR m0 = CALCULATE ( MIN ( fact_monthly[month] ), ALLSELECTED ( DimDate ), dim_ticker[symbol] = "BND" )
RETURN [Start Amount Value] * PRODUCTX (
    FILTER ( ALLSELECTED ( fact_monthly[month] ), fact_monthly[month] > m0 && fact_monthly[month] <= cur ),
    1 + [Blend Return] )
```

`Blend Growth` rebalances every month, so it will differ slightly from the web dashboard's quarterly default.
Put `fact_monthly[month]` on the axis and turn off the ticker slicer's interaction with that visual.

## 4. Pages

| Page | Business question | Visuals |
|---|---|---|
| Performance & Risk | Which asset gave the best risk-adjusted return in a window, and what was the worst loss you had to sit through? | KPI cards, ticker x KPI matrix, Growth of X line, drawdown line. Slicers: ticker, asset_class, date. |
| Inflation & Real Returns | How much of the return was real purchasing power? | Nominal vs real CAGR matrix, real growth line, Period Real Return by year, CPI line, rolling_12m_vol line. |
| Scenarios | How do allocation, simulated futures and start date change the outcome? | Equity Weight slider with Blend Growth vs 100% SPY / 100% BND, Monte Carlo fan from `mc_projections`, histogram of `rolling_windows[cagr]` with a horizon slicer. |

## 5. Check your numbers

Set the date slicer to 2015-01-01 to 2025-12-31, select SPY, and set Risk Free to 2%. The cards should read:

| KPI | Expected |
|---|---|
| Total Return | 299.74% |
| CAGR | 13.43% |
| Annualized Volatility | 17.79% |
| Sharpe | 0.64 |
| Max Drawdown | -33.72% (Mar 23, 2020) |
| Real CAGR | 10.09% |

These values come from the web dashboard. `scripts/reconcile_kpis.py` checks them against the original
`/api/calculate` and `/api/portfolio` engines (results in `powerbi_export/reconciliation.csv`).
