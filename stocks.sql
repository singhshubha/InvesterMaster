-- Stock returns table to track historical performance
CREATE TABLE IF NOT EXISTS stock_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock TEXT NOT NULL,
    date DATE NOT NULL,
    return_percentage REAL NOT NULL,
    open_price REAL,
    close_price REAL,
    high_price REAL,
    low_price REAL,
    volume INTEGER,
    adjusted_close REAL,
    rolling_avg_return REAL
);

-- Insert data from SPY.csv
INSERT INTO stock_returns (stock, date, return_percentage, adjusted_close, rolling_avg_return)
SELECT 
    'SPY',
    date,
    return,
    adjusted_close,
    rolling_avg_return
FROM '/Stock calculator/SPY.csv';

-- User portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolio holdings table
CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    stock TEXT NOT NULL,
    shares REAL NOT NULL,
    purchase_price REAL NOT NULL,
    purchase_date DATE NOT NULL,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
);

-- Market analysis table
CREATE TABLE IF NOT EXISTS market_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock TEXT NOT NULL,
    date DATE NOT NULL,
    price REAL NOT NULL,
    volume INTEGER,
    moving_avg_50 REAL,
    moving_avg_200 REAL,
    open_price REAL,
    high_price REAL,
    low_price REAL,
    adjusted_close REAL,
    dividend_amount REAL,
    split_coefficient REAL
);

-- User accounts table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
