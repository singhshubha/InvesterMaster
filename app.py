from flask import Flask, render_template, request, jsonify
import sqlite3
import pandas as pd

app = Flask(__name__)

# Load stock data (Assuming data is preloaded into stocks.db)
def get_annual_return(stock):
    # Connect to the SQLite database
    conn = sqlite3.connect('data/stocks.db')
    cursor = conn.cursor()
    # Retrieve the average annual return for the selected stock
    cursor.execute("SELECT AVG(return_percentage) FROM stock_returns WHERE stock = ?", (stock,))
    annual_return = cursor.fetchone()[0]
    conn.close()
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
    
    if annual_return:
        # Calculate compound returns over the years
        total_return = amount * ((1 + annual_return/100) ** years)
        profit = total_return - amount
        
        return jsonify({
            "initialInvestment": amount,
            "totalValue": round(total_return, 2),
            "profit": round(profit, 2),
            "annualReturn": round(annual_return, 2)
        })
    
    return jsonify({"error": "Stock data not found"}), 404

if __name__ == '__main__':
    app.run(debug=True)
