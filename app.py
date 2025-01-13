from flask import Flask, render_template, request, jsonify
import sqlite3
import pandas as pd

app = Flask(__name__)

def get_annual_return(stock):
    # Connect to SQLite database
    conn = sqlite3.connect('stocks.db')
    cursor = conn.cursor()
    
    # Get all historical returns for the stock
    cursor.execute("""
        SELECT return_percentage 
        FROM stock_returns 
        WHERE stock = ?
        ORDER BY date DESC
    """, (stock,))
    
    returns = cursor.fetchall()
    conn.close()
    
    if not returns:
        return None
        
    # Calculate average annual return
    returns = [r[0] for r in returns]
    annual_return = sum(returns) / len(returns)
    return annual_return

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculator')
def calculator():
    return render_template('calculator.html')

@app.route('/getAnnualReturn', methods=['GET'])
def get_annual_return_api():
    stock = request.args.get('stock')
    amount = float(request.args.get('amount'))
    years = int(request.args.get('years'))
    
    annual_return = get_annual_return(stock)
    
    if annual_return is not None:
        # Calculate compound returns
        total_value = amount
        for _ in range(years):
            total_value *= (1 + annual_return/100)
            
        profit = total_value - amount
        
        return jsonify({
            "initialInvestment": amount,
            "totalValue": round(total_value, 2), 
            "profit": round(profit, 2),
            "annualReturn": round(annual_return, 2),
            "years": years
        })
    
    return jsonify({
        "error": f"No historical data found for stock {stock}"
    }), 404

if __name__ == '__main__':
    app.run(debug=True)
