DROP TABLE IF EXISTS stocks;
CREATE TABLE stocks (
    symbol TEXT NOT NULL,
    date DATE NOT NULL,
    close REAL,
    change_percent REAL,
    UNIQUE(symbol, date)
);

-- Enable CSV import mode
.mode csv
.headers on

-- Import SPY data
.import '/Users/opalbronco/Downloads/InvesterMaster-main/files/SPY.csv' temp_spy
INSERT INTO stocks (symbol, date, close, change_percent)
SELECT 'SPY', date, close, change_percent FROM temp_spy;

-- Import QQQ data
.import '/Users/opalbronco/Downloads/InvesterMaster-main/files/QQQ_raw.csv' temp_qqq
INSERT INTO stocks (symbol, date, close, change_percent)
SELECT 'QQQ', date, close, change_percent FROM temp_qqq;

-- Import NASDAQ 100 data
.import '/Users/opalbronco/Downloads/InvesterMaster-main/files/NASDAQ_100.csv' temp_nasdaq
INSERT INTO stocks (symbol, date, close, change_percent)
SELECT 'nasdaq_100', date, close, change_percent FROM temp_nasdaq;

-- Import SP500 data
.import '/Users/opalbronco/Downloads/InvesterMaster-main/files/SP500.csv' temp_sp500
INSERT INTO stocks (symbol, date, close, change_percent)
SELECT 'sp500', date, close, change_percent FROM temp_sp500;

-- Create index for better query performance
CREATE INDEX idx_stocks_symbol_date ON stocks(symbol, date);

-- Verify data after import
SELECT symbol, COUNT(*) as count FROM stocks GROUP BY symbol;
