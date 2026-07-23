-- Drop existing tables
DROP TABLE IF EXISTS nasdaq_100;
DROP TABLE IF EXISTS qqq;
DROP TABLE IF EXISTS sp500;
DROP TABLE IF EXISTS spy;
DROP TABLE IF EXISTS stocks;

-- Create unified table structure
CREATE TABLE nasdaq_100 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL,
    UNIQUE(date)
);

CREATE TABLE qqq (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL,
    UNIQUE(date)
);

CREATE TABLE sp500 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL,
    UNIQUE(date)
);

CREATE TABLE spy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL,
    UNIQUE(date)
);

CREATE TABLE stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL,
    UNIQUE(symbol, date)
);

-- Enable CSV mode
.mode csv
.headers on

-- Import NASDAQ_100
CREATE TEMP TABLE temp_nasdaq (
    date TEXT,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL
);
.import './files/NASDAQ_100.csv' temp_nasdaq
INSERT INTO nasdaq_100 (date, open, high, low, close, change_percent)
SELECT date, open, high, low, close, change_percent FROM temp_nasdaq;
DROP TABLE temp_nasdaq;

-- Import QQQ
CREATE TEMP TABLE temp_qqq (
    date TEXT,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL
);
.import '/Users/opalbronco/Downloads/InvesterMaster-main/files/QQQ_raw.csv' temp_qqq
INSERT INTO qqq (date, open, high, low, close, change_percent)
SELECT date, open, high, low, close, change_percent FROM temp_qqq;
INSERT INTO stocks (symbol, date, open, high, low, close, change_percent)
SELECT 'QQQ', date, open, high, low, close, change_percent FROM temp_qqq;
DROP TABLE temp_qqq;

-- Import SP500
CREATE TEMP TABLE temp_sp500 (
    date TEXT,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL
);
.import './files/SP500.csv' temp_sp500
INSERT INTO sp500 (date, open, high, low, close, change_percent)
SELECT date, open, high, low, close, change_percent FROM temp_sp500;
DROP TABLE temp_sp500;

-- Import SPY
CREATE TEMP TABLE temp_spy (
    date TEXT,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    change_percent REAL
);
.import './files/SPY.csv' temp_spy
INSERT INTO spy (date, open, high, low, close, change_percent)
SELECT date, open, high, low, close, change_percent FROM temp_spy;
DROP TABLE temp_spy;
-- Create indexes
CREATE INDEX idx_nasdaq_date ON nasdaq_100(date);
CREATE INDEX idx_qqq_date ON qqq(date);
CREATE INDEX idx_sp500_date ON sp500(date);
CREATE INDEX idx_spy_date ON spy(date);
CREATE INDEX idx_stocks_symbol_date ON stocks(symbol, date);
