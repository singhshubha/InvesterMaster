1. InvestorMaster

InvestorMaster is a stock market analysis and calculation tool that helps investors make informed decisions using historical data and real-time market trends. The project integrates NASDAQ, QQQ ETF, S&P 500 data with SQL database management, providing users with key insights into stock performance.


2. Features:

  - Stock Data Analysis: Retrieve and analyze historical stock prices.

  - Market Index Tracking: Support for NASDAQ, QQQ ETF, and S&P 500.

  - SQL Database Management: Store and query historical returns.

  - Frontend Interface: Built with HTML, CSS, and JavaScript.

  - Backend Processing: Developed using Python for efficient calculations.

  - Interactive Charts: Display stock trends visually.

3. Installation

    Prerequisites

  - Python 3.x

  - No Node.js or external database needed — data is stored in the bundled SQLite file (`data/stocks.db`).

4. Steps

    Clone the repository:

    - git clone https://github.com/yourusername/InvestorMaster.git
    - cd InvestorMaster

    Install backend dependencies:

    - pip install -r requirements.txt

    Configure environment variables:

    - cp server/.env.example server/.env
    - Fill in `NEWSAPI_KEY` in `server/.env` (get a free key at https://newsapi.org/register). This is optional — the news section just shows nothing if it's left blank.

    Start the backend server:

    - python server/app.py
    - This starts the Flask API on http://localhost:5001. It serves `/api/calculate` (backed by `data/stocks.db`, auto-populated from yfinance on first request for a symbol/date range) and `/api/news`.

    Launch the frontend:
    - Open index.html in a browser or serve it using a local development server (e.g. `python -m http.server`). The frontend calls the Flask API at `http://localhost:5001` (see `API_BASE_URL` in `js/shared.js`).

5. Project Structure

    - index.html, calculator.html — page shells; all markup is rendered by JS at load time
    - css/ — stylesheet (royal blue & white theme)
    - js/ — components.js (navbar/footer), shared.js (utilities, API calls), home.js, calculator.js (per-page rendering)
    - server/ — Flask backend (`app.py`, `calculator_logic.py`), DB setup scripts, `.env.example`
    - data/ — stocks.db and historical CSV datasets
    - server/analytics_views.sql — clean analysis views (daily/monthly returns, drawdown, CPI-adjusted real returns, index levels, ticker coverage)
    - scripts/export_powerbi.py — exports the views to powerbi_export/ for Power BI or Excel
    - powerbi_export/ — committed CSV snapshot used by the dashboard

    Power BI / analytics export

    - python scripts/export_powerbi.py
    - Opens stocks.db read-only (views are created as TEMP views), so the export never modifies the database or calls yfinance.
    - Monte Carlo projections reuse RetirementProjector with a fixed seed (42), so the snapshot is reproducible.
    - powerbi_export/kpi_definitions.csv documents every KPI formula; data_quality.csv and data_quality_before_fix.csv show the data-quality checks after and before cleanup.
    - To make the views permanent (e.g. for ODBC): sqlite3 data/stocks.db < server/analytics_views.sql

6. Usage

  - Enter a stock symbol to retrieve historical data.
  
  - View interactive charts displaying trends and analytics.
  
  - Compare stock performance across indices.
  
  - Store and query data from the database.

7. Contributing

  Pull requests are welcome! For major changes, please open an issue first to discuss the proposed update.
