import sqlite3
import pandas as pd
from typing import Dict

class InvestmentCalculator:
    def __init__(self, db_path: str = 'stocks.db'):
        self.db_path = db_path

    def calculate_returns(self, stock: str, amount: float, years: int) -> Dict:
        conn = sqlite3.connect(self.db_path)
        query = """
        SELECT 
            AVG(change_percent) as avg_annual_return,
            AVG(rolling_avg_return) as avg_rolling_return,
            STD(change_percent) as volatility
        FROM stock_returns 
        WHERE stock = ? 
        """
        
        df = pd.read_sql_query(query, conn, params=(stock,))
        
        # Annualize the return (252 trading days)
        annual_return = df['avg_annual_return'][0] * 252
        volatility = df['volatility'][0] * (252 ** 0.5)
        
        # Calculate future value with risk adjustment
        risk_factor = 1 - (volatility / 100)
        future_value = amount * ((1 + (annual_return/100)) ** years) * risk_factor
        
        return {
            "initial_investment": f"${amount:,.2f}",
            "years": years,
            "expected_return": f"${future_value:,.2f}",
            "total_return": f"${(future_value - amount):,.2f}",
            "return_percentage": f"{((future_value - amount) / amount * 100):.2f}%",
            "annual_return": f"{annual_return:.2f}%",
            "risk_factor": f"{risk_factor:.2f}"
        }

    def format_currency(self, value: float) -> str:
        return f"${value:,.2f}"