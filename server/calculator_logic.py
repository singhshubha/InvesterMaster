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
        # Cached rows are only gap-free between cached_min and cached_max if every fetch
        # widens that same contiguous span. So when the requested range pokes outside it,
        # re-fetch the full enclosing span (old ∪ new) rather than just the new slice —
        # fetching just the slice would leave a silent hole between the two islands.
        if cached_min is None:
            PriceCache._fetch_and_cache(conn, symbol, start_date, end_date)
        elif cached_min > start_date or cached_max < end_date:
            fetch_start = min(cached_min, start_date)
            fetch_end = max(cached_max, end_date)
            PriceCache._fetch_and_cache(conn, symbol, fetch_start, fetch_end)

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

            drawdown_pct = []
            peak = nominal_values[0]
            for v in nominal_values:
                peak = max(peak, v)
                drawdown_pct.append(round((v / peak - 1) * 100, 2))
            max_drawdown_pct = min(drawdown_pct)
            max_drawdown_date = dates[drawdown_pct.index(max_drawdown_pct)]

            series = [
                {
                    'date': dates[i],
                    'nominal': round(nominal_values[i], 2),
                    'real': round(real_values[i], 2) if real_values and real_values[i] is not None else None,
                    'fee_adjusted': round(fee_values[i], 2) if fee_values else None,
                    'drawdown_pct': drawdown_pct[i],
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
                'max_drawdown_pct': max_drawdown_pct,
                'max_drawdown_date': max_drawdown_date,
                'series': series,
            }
        finally:
            conn.close()

    @staticmethod
    def cash_series(dates, amount, apy_pct):
        start_dt = datetime.strptime(dates[0], '%Y-%m-%d')
        rate = apy_pct / 100
        return [
            amount * ((1 + rate) ** ((datetime.strptime(d, '%Y-%m-%d') - start_dt).days / 365.25))
            for d in dates
        ]

    @staticmethod
    def luck_simulator(symbol, amount, duration_years, first_start_date, count, drip):
        today = datetime.utcnow().date()
        runs = []
        for i in range(count):
            start_dt = pd.to_datetime(first_start_date) + pd.DateOffset(years=i)
            end_dt = start_dt + pd.DateOffset(years=duration_years)
            start_date = start_dt.strftime('%Y-%m-%d')
            end_date = min(end_dt, pd.Timestamp(today)).strftime('%Y-%m-%d')

            if start_date >= end_date:
                continue

            try:
                result = InvestmentCalculator.calculate_returns(
                    symbol, amount, start_date, end_date, mode='lump', drip=drip
                )
            except Exception:
                result = None

            runs.append({
                'start_date': start_date,
                'end_date': end_date,
                'final_value': result['final_value'] if result else None,
                'total_return_pct': result['total_return_pct'] if result else None,
                'max_drawdown_pct': result['max_drawdown_pct'] if result else None,
            })
        return runs

    @staticmethod
    def this_week_in_history(symbols=None, lookback_years=None, amount=1000.0):
        symbols = symbols or ['SPY', 'QQQ']
        lookback_years = lookback_years or [5, 10, 15, 20]
        today = datetime.utcnow().date()

        facts = []
        for symbol in symbols:
            for years in lookback_years:
                try:
                    start_dt = today.replace(year=today.year - years)
                except ValueError:
                    start_dt = today.replace(year=today.year - years, day=28)  # Feb 29 in a non-leap target year

                try:
                    result = InvestmentCalculator.calculate_returns(
                        symbol, amount, start_dt.strftime('%Y-%m-%d'), today.strftime('%Y-%m-%d'),
                        mode='lump', drip=True,
                    )
                except Exception:
                    result = None

                if result:
                    facts.append({
                        'symbol': result['symbol'],
                        'years_ago': years,
                        'start_date': result['start_date'],
                        'end_date': result['end_date'],
                        'initial_investment': result['initial_investment'],
                        'final_value': result['final_value'],
                        'total_return_pct': result['total_return_pct'],
                    })
        return facts

    @staticmethod
    def tax_comparison(symbol, amount, start_date, end_date, drip, capital_gains_tax_pct, ordinary_income_tax_pct):
        """Grows `amount` along one real historical price path, then applies three
        simplified account-type tax treatments to that SAME pre-tax trajectory so the
        comparison isolates the effect of taxes, not differences in what was invested in.
        This is an illustrative simplification, not tax advice: real accounts have
        contribution limits, RMDs, state taxes, and early-withdrawal rules this ignores.
        """
        result = InvestmentCalculator.calculate_returns(symbol, amount, start_date, end_date, mode='lump', drip=drip)
        if result is None:
            return None

        final_value = result['final_value']
        gain = final_value - amount

        taxable_gain_tax = max(gain, 0) * (capital_gains_tax_pct / 100)
        taxable_after_tax = final_value - taxable_gain_tax

        traditional_tax = final_value * (ordinary_income_tax_pct / 100)
        traditional_after_tax = final_value - traditional_tax

        roth_after_tax = final_value

        return {
            'symbol': result['symbol'],
            'start_date': result['start_date'],
            'end_date': result['end_date'],
            'initial_investment': amount,
            'pre_tax_final_value': final_value,
            'capital_gains_tax_pct': capital_gains_tax_pct,
            'ordinary_income_tax_pct': ordinary_income_tax_pct,
            'accounts': {
                'taxable': {'after_tax_value': round(taxable_after_tax, 2), 'tax_paid': round(taxable_gain_tax, 2)},
                'roth': {'after_tax_value': round(roth_after_tax, 2), 'tax_paid': 0.0},
                'traditional': {'after_tax_value': round(traditional_after_tax, 2), 'tax_paid': round(traditional_tax, 2)},
            },
        }
