import os
from datetime import datetime

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from calculator_logic import InvestmentCalculator

load_dotenv()

NEWSAPI_KEY = os.environ.get('NEWSAPI_KEY')

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


@app.route('/api/calculate', methods=['POST'])
def calculate():
    data = request.get_json(silent=True) or {}
    symbol = (data.get('symbol') or '').strip()
    start_date = data.get('start_date')
    end_date = data.get('end_date')

    try:
        amount = float(data.get('initial_amount'))
        datetime.strptime(start_date, '%Y-%m-%d')
        datetime.strptime(end_date, '%Y-%m-%d')
    except (TypeError, ValueError):
        return jsonify({'error': 'symbol, initial_amount, start_date and end_date (YYYY-MM-DD) are required.'}), 400

    if not symbol or amount <= 0 or start_date >= end_date:
        return jsonify({'error': 'Invalid input: check symbol, amount, and that start_date is before end_date.'}), 400

    try:
        result = InvestmentCalculator.calculate_returns(symbol, amount, start_date, end_date)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    if result is None:
        return jsonify({'error': f'No price data available for "{symbol}" in that date range.'}), 404
    return jsonify(result)


@app.route('/api/news', methods=['GET'])
def news():
    if not NEWSAPI_KEY:
        return jsonify({'articles': []})

    try:
        resp = requests.get(
            'https://newsapi.org/v2/everything',
            params={'q': 'stocks finance', 'pageSize': 10, 'apiKey': NEWSAPI_KEY},
            timeout=5,
        )
        resp.raise_for_status()
        return jsonify({'articles': resp.json().get('articles', [])})
    except requests.RequestException:
        return jsonify({'articles': []}), 502


if __name__ == '__main__':
    # Use port 5001 instead of 5000 to avoid AirPlay conflict on macOS
    app.run(debug=True, host='0.0.0.0', port=5001)
