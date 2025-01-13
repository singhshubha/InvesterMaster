from flask import Flask, render_template, request, jsonify
import sqlite3
import pandas as pd

app = Flask(__name__)

def get_annual_return(stock, amount, years):
    # Connect to SQLite database
    conn = sqlite3.connect('stocks.db')
    cursor = conn.cursor()
    
    # Get historical returns for the stock
    cursor.execute("""
        SELECT AVG(return_percentage) 
        FROM stock_returns 
        WHERE stock = ?
    """, (stock,))
    
    avg_return = cursor.fetchone()[0]
    conn.close()
    
    if avg_return is None:
        return None
        
    # Calculate total return over the years
    total_return = avg_return * years
    return total_return

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
