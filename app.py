from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_cors import CORS
import requests
from calculator_logic import InvestmentCalculator

app = Flask(__name__, template_folder='templates', static_folder='static')
# Simplest CORS configuration
CORS(app, resources={r"/*": {"origins": "*"}})

API_KEY = 'your_api_key'
API_URL = 'https://api.example.com/stock_data'

calculator = InvestmentCalculator('stocks.db')

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/calculator')
def calculator_page():
    stock = request.args.get('stock', 'SPY')  # Default to SPY if no stock is selected
    return render_template('calculator.html', stock=stock)

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.json
        stock = data['stock']
        amount = float(data['amount'])
        years = int(data['years'])

        # Fetch stock data from API
        response = requests.get(f'{API_URL}?symbol={stock}&apikey={API_KEY}')
        response.raise_for_status()
        stock_data = response.json()

        # Perform calculations
        avg_daily_return = sum(item['change_percent'] for item in stock_data) / len(stock_data)
        annual_return = avg_daily_return * 252  # Trading days per year
        future_value = amount * ((1 + (annual_return / 100)) ** years)
        total_return = future_value - amount

        result = {
            'initial_investment': amount,
            'years': years,
            'future_value': future_value,
            'total_return': total_return
        }

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    # Use port 5001 instead of 5000 to avoid AirPlay conflict
    app.run(debug=True, host='0.0.0.0', port=5001)
