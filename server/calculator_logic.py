import csv
import io
import os
import sqlite3
from datetime import datetime, timedelta

import pandas as pd
import requests
import yfinance as yf

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'stocks.db')
CPI_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL'
CPI_REFRESH_DAYS = 40


class PriceCache:
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
    def get_prices(conn, symbol, start_date, end_date, price_column):
        cached_min, cached_max = PriceCache._cached_range(conn, symbol)
        if cached_min is None or cached_min > start_date or cached_max < end_date:
            PriceCache._fetch_and_cache(conn, symbol, start_date, end_date)

        return pd.read_sql_query(
            f"SELECT date, {price_column} AS price FROM stocks "
            "WHERE symbol = ? AND date BETWEEN ? AND ? ORDER BY date",
            conn, params=(symbol, start_date, end_date),
        )


class InflationIndex:
    @staticmethod
    def _ensure_table(conn):
        conn.execute("CREATE TABLE IF NOT EXISTS cpi (date DATE PRIMARY KEY, value REAL)")

    @staticmethod
    def _refresh_if_stale(conn):
        InflationIndex._ensure_table(conn)
        last_date = conn.execute("SELECT MAX(date) FROM cpi").fetchone()[0]
        if last_date:
            age_days = (datetime.utcnow().date() - datetime.strptime(last_date, '%Y-%m-%d').date()).days
            if age_days < CPI_REFRESH_DAYS:
                return
        try:
            resp = requests.get(CPI_URL, timeout=10)
            resp.raise_for_status()
            reader = csv.reader(io.StringIO(resp.text))
            next(reader, None)  # header row
            rows = [(r[0], float(r[1])) for r in reader if len(r) == 2 and r[1] not in ('', '.')]
            if rows:
                conn.executemany("INSERT OR REPLACE INTO cpi (date, value) VALUES (?, ?)", rows)
                conn.commit()
        except (requests.RequestException, ValueError):
            pass  # keep serving whatever is already cached, if anything

    @staticmethod
    def series_for_dates(conn, dates):
        """Returns {date: cpi_value} using the latest CPI reading on or before each date."""
        InflationIndex._refresh_if_stale(conn)
        cpi_rows = conn.execute(
            "SELECT date, value FROM cpi WHERE date <= ? ORDER BY date", (dates[-1],)
        ).fetchall()
        if not cpi_rows:
            return {}

        result = {}
        i = 0
        latest_value = None
        for d in dates:
            while i < len(cpi_rows) and cpi_rows[i][0] <= d:
                latest_value = cpi_rows[i][1]
                i += 1
            result[d] = latest_value
        return result


class InvestmentCalculator:
    @staticmethod
    def _get_connection():
        return sqlite3.connect(DB_PATH)

    @staticmethod
    def _build_nominal_series(dates, prices, amount, mode):
        if mode == 'dca':
            shares = 0.0
            total_invested = 0.0
            last_month = None
            values = []
            for date_str, price in zip(dates, prices):
                month_key = date_str[:7]
                if month_key != last_month:
                    shares += amount / price
                    total_invested += amount
                    last_month = month_key
                values.append(shares * price)
            return values, round(total_invested, 2)

        shares = amount / prices[0]
        return [shares * p for p in prices], round(amount, 2)

    @staticmethod
    def calculate_returns(symbol, amount, start_date, end_date, mode='lump', drip=False,
                           expense_ratio_pct=0.0, adjust_inflation=False):
        symbol = symbol.upper().strip()
        conn = InvestmentCalculator._get_connection()
        try:
            price_column = 'adjusted_close' if drip else 'close'
            df = PriceCache.get_prices(conn, symbol, start_date, end_date, price_column)
            if df.empty:
                return None

            dates = df['date'].tolist()
            prices = df['price'].tolist()

            nominal_values, initial_investment = InvestmentCalculator._build_nominal_series(
                dates, prices, amount, mode
            )

            real_values = None
            if adjust_inflation:
                cpi_by_date = InflationIndex.series_for_dates(conn, dates)
                if cpi_by_date and cpi_by_date.get(dates[0]):
                    base_cpi = cpi_by_date[dates[0]]
                    real_values = [
                        v * base_cpi / cpi_by_date[d] if cpi_by_date.get(d) else None
                        for v, d in zip(nominal_values, dates)
                    ]

            fee_values = None
            if expense_ratio_pct and expense_ratio_pct > 0:
                start_dt = datetime.strptime(dates[0], '%Y-%m-%d')
                decay_rate = 1 - (expense_ratio_pct / 100)
                fee_values = [
                    v * (decay_rate ** (((datetime.strptime(d, '%Y-%m-%d') - start_dt).days) / 365.25))
                    for v, d in zip(nominal_values, dates)
                ]

            series = [
                {
                    'date': dates[i],
                    'nominal': round(nominal_values[i], 2),
                    'real': round(real_values[i], 2) if real_values and real_values[i] is not None else None,
                    'fee_adjusted': round(fee_values[i], 2) if fee_values else None,
                }
                for i in range(len(dates))
            ]

            final_value = series[-1]['nominal']
            total_return = round(final_value - initial_investment, 2)
            total_return_pct = round((final_value / initial_investment - 1) * 100, 2)

            return {
                'symbol': symbol,
                'mode': mode,
                'drip': drip,
                'expense_ratio_pct': expense_ratio_pct,
                'adjust_inflation': adjust_inflation,
                'start_date': dates[0],
                'end_date': dates[-1],
                'initial_investment': initial_investment,
                'final_value': final_value,
                'final_value_real': series[-1]['real'],
                'final_value_fee_adjusted': series[-1]['fee_adjusted'],
                'total_return': total_return,
                'total_return_pct': total_return_pct,
                'series': series,
            }
        finally:
            conn.close()
