from typing import Dict
import sqlite3
import pandas as pd
import os

class InvestmentCalculator:
    def __init__(self, db_path: str = 'stocks.db'):
        self.db_path = db_path
        print(f"Initializing with database: {db_path}")

    def calculate_returns(self, stock: str, amount: float, years: int) -> Dict:
        try:
            # Connect to database
            conn = sqlite3.connect(self.db_path)
            print(f"Connected to database: {self.db_path}")

            # Query the unified stocks table
            query = """
                SELECT date, close, change_percent 
                FROM stocks
                WHERE symbol = ?
                ORDER BY date DESC 
                LIMIT ?
            """
            print(f"Executing query: {query}")
            
            df = pd.read_sql_query(query, conn, params=(stock, years * 252))
            print(f"Retrieved {len(df)} rows for {stock}")

            if df.empty:
                raise ValueError(f"No data found for {stock}")

            # Calculate returns using only valid data
            df = df.dropna()
            avg_daily_return = df['change_percent'].mean()
            annual_return = avg_daily_return * 252  # Trading days per year
            
            # Simple future value calculation
            future_value = amount * ((1 + (annual_return/100)) ** years)
            total_return = future_value - amount

            return {
                'initial_investment': f"${amount:,.2f}",
                'years': years,
                'future_value': f"${future_value:,.2f}",
                'total_return': f"${total_return:,.2f}"
            }

        except Exception as e:
            print(f"Error calculating returns: {str(e)}")
            return {'error': str(e)}
        finally:
            if conn:
                conn.close()

    def get_available_stocks(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT symbol FROM stocks")
            stocks = cursor.fetchall()
            return [stock[0] for stock in stocks]
        finally:
            conn.close()

    def format_currency(self, value: float) -> str:
        return f"${value:,.2f}"