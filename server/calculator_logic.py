import os
import sqlite3
from datetime import timedelta

import pandas as pd
import yfinance as yf

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'stocks.db')


class InvestmentCalculator:
    @staticmethod
    def _get_connection():
        return sqlite3.connect(DB_PATH)

    @staticmethod
    def _cached_range(conn, symbol):
        row = conn.execute(
            "SELECT MIN(date), MAX(date) FROM stocks WHERE symbol = ?", (symbol,)
        ).fetchone()
        return row if row else (None, None)

    @staticmethod
    def _fetch_and_cache(conn, symbol, start_date, end_date):
        # yfinance's `end` is exclusive, so push it out a day to include end_date itself.
        fetch_end = (pd.to_datetime(end_date) + timedelta(days=1)).strftime('%Y-%m-%d')
        data = yf.download(symbol, start=start_date, end=fetch_end, interval='1d',
                            auto_adjust=False, progress=False)
        if data.empty:
            return False

        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)

        rows = [
            (
                symbol,
                date.strftime('%Y-%m-%d'),
                float(r['Open']),
                float(r['High']),
                float(r['Low']),
                float(r['Close']),
                int(r['Volume']) if not pd.isna(r['Volume']) else None,
                float(r['Adj Close']) if 'Adj Close' in r else float(r['Close']),
            )
            for date, r in data.iterrows()
        ]
        conn.executemany(
            """
            INSERT OR REPLACE INTO stocks (symbol, date, open, high, low, close, volume, adjusted_close)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.commit()
        return True

    @staticmethod
    def calculate_returns(symbol, amount, start_date, end_date):
        symbol = symbol.upper().strip()
        conn = InvestmentCalculator._get_connection()
        try:
            cached_min, cached_max = InvestmentCalculator._cached_range(conn, symbol)
            if cached_min is None or cached_min > start_date or cached_max < end_date:
                InvestmentCalculator._fetch_and_cache(conn, symbol, start_date, end_date)

            df = pd.read_sql_query(
                "SELECT date, close FROM stocks WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date",
                conn, params=(symbol, start_date, end_date),
            )
            if df.empty:
                return None

            initial_close = float(df.iloc[0]['close'])
            shares = amount / initial_close
            series = [
                {'date': row['date'], 'value': round(shares * row['close'], 2)}
                for _, row in df.iterrows()
            ]

            final_value = series[-1]['value']
            total_return = final_value - amount
            total_return_pct = (final_value / amount - 1) * 100

            return {
                'symbol': symbol,
                'start_date': series[0]['date'],
                'end_date': series[-1]['date'],
                'initial_investment': round(amount, 2),
                'final_value': round(final_value, 2),
                'total_return': round(total_return, 2),
                'total_return_pct': round(total_return_pct, 2),
                'series': series,
            }
        finally:
            conn.close()
