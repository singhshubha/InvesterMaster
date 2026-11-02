# News Sentiment Feature: Plan

**Status:** planning (November 2026)

## Goal

Predict whether a stock closes up or down on the next trading day, using sentiment from that day's news headlines. Predictions run daily and show up live in InvesterMaster.

- **Focus:** an end to end pipeline, a deployed model and honest evaluation. Accuracy is not the main goal.
- **Expected result:** 52 to 55% balanced accuracy. Above 60% almost always means leakage or a bug.
- **Key question:** does news sentiment improve on a model that uses price data only?

## Where the project starts

InvesterMaster has no ML yet. The current stack (Flask, SQLite, yfinance) already fits this feature, so it can go in as new tables and endpoints without a rewrite.

| Part | What exists now |
| --- | --- |
| Backend | Flask, `server/app.py`: calculate, compare, luck simulator, retirement projector, portfolio, tax comparison, this week in history, news |
| Database | SQLite `data/stocks.db`: stocks, nasdaq_100, qqq, sp500, spy, cpi |
| Frontend | Plain HTML, CSS, JS |
| News | `/api/news` returns 10 generic NewsAPI headlines; they aren't tied to tickers, stored or scored |

## The 10 phase plan

**Rule behind every phase:** each feature has to be known by 4:00 PM ET on the prediction day. Otherwise it leaks future information.

1. **Scope.** 15 to 25 tickers, including retail (WMT, TGT, COST, KR, ACI). Target: 1 if the next close is higher than today's, else 0. At least 2 years of history. Historical news comes from a public headlines dataset, and live news is collected daily from here on.
2. **Collect raw data.** News (ticker, headline, summary, source, timestamp), daily prices from yfinance, and SPY for market context. Raw tables are never edited.
3. **Clean and filter news.**
   - Drop duplicate syndicated stories
   - Keep only headlines about the company
   - Drop junk and clickbait
   - Convert timestamps to US Eastern
   - Map each headline to a trading day: before 4 PM counts for that day; after 4 PM, weekends and holidays count for the next trading day
4. **Score sentiment.** Use FinBERT (ProsusAI/finbert). Score = positive minus negative, from -1 to +1. Store every score. Later, compare against an LLM scorer.
5. **Aggregate.** One row per ticker per day: mean, max and min sentiment, headline count, share of negative headlines. Days with no news get sentiment 0 and `has_news = 0`.
6. **Labels and features.**
   - Label `up_tomorrow`; also test a version that ignores moves under 0.2%
   - Price features: today's return, 5 day return, 10 and 20 day volatility, volume vs its 20 day average, SPY return
   - Sentiment features: 1 and 2 day lags, 3 and 7 day rolling averages, surprise vs the 7 day average
7. **Split by time.** Never shuffle. Use walk forward validation, and hold out the last 3 to 6 months.
8. **Models.** Baselines first (always predict up; predict the same direction as today). Then logistic regression, then random forest or XGBoost. Main experiment: price only vs price plus sentiment. No LSTMs in v1.
9. **Evaluate.** Balanced accuracy, ROC AUC and log loss. Backtest with transaction costs against buy and hold. Explain results with SHAP values or model coefficients.
10. **Deploy and document.** A daily job after the close fetches, cleans, scores, aggregates and predicts. New tables: raw news, scored news, daily features, predictions. The site shows each ticker's sentiment and predicted direction. Every prediction is logged and checked the next day. The README gets a pipeline diagram, the leakage safeguards, results and limitations.

## Timeline (about 6 weeks)

| Week | Focus | Phases |
| --- | --- | --- |
| 1 | Scope, data sources, database tables | 1 to 2 |
| 2 | Cleaning, deduplication, trading day mapping | 3 |
| 3 | FinBERT scoring and daily aggregation | 4 to 5 |
| 4 | Features, walk forward splits, baselines, models | 6 to 8 |
| 5 | Evaluation, backtest, ablation, SHAP | 9 |
| 6 | Deployment into InvesterMaster, documentation | 10 |

## Next steps

- [ ] Pick the final ticker list
- [ ] Choose a historical news dataset (check its date range and ticker coverage)
- [ ] Draft the folder structure and the new database tables
