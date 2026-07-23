from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_cors import CORS
import requests
import yfinance as yf
from calculator_logic import InvestmentCalculator

app = Flask(__name__, template_folder='templates', static_folder='static')
# Simplest CORS configuration
CORS(app, resources={r"/*": {"origins": "*"}})

API_KEY = 'PBM5CSUG6F9IB'
API_URL = 'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${API_KEY}'

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/calculator')
def calculator_page():
    stock = request.args.get('stock', 'SPY')  # Default to SPY if no stock is selected
    return render_template('calculator.html', stock=stock)

@app.route('/api/calculate', methods=['POST'])
def calculate():
    try:
        data = request.json
        symbol = data.get('stock')
        amount = float(data.get('amount'))
        years = float(data.get('years'))

        result = InvestmentCalculator.calculate_returns(symbol, amount, years)
        if result is None:
            return jsonify({'error': 'No data available for this stock.'}), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Use port 5001 instead of 5000 to avoid AirPlay conflict
    app.run(debug=True, host='0.0.0.0', port=5001)