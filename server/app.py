import os
from datetime import datetime

import pandas as pd
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from advanced_analytics import PortfolioBuilder, RetirementProjector
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
    mode = data.get('mode', 'lump')
    drip = bool(data.get('drip', False))
    adjust_inflation = bool(data.get('adjust_inflation', False))

    try:
        amount = float(data.get('amount'))
        expense_ratio_pct = float(data.get('expense_ratio_pct') or 0)
        datetime.strptime(start_date, '%Y-%m-%d')
        datetime.strptime(end_date, '%Y-%m-%d')
    except (TypeError, ValueError):
        return jsonify({'error': 'symbol, amount, start_date and end_date (YYYY-MM-DD) are required.'}), 400

    if not symbol or amount <= 0 or start_date >= end_date:
        return jsonify({'error': 'Invalid input: check symbol, amount, and that start_date is before end_date.'}), 400
    if mode not in ('lump', 'dca'):
        return jsonify({'error': 'mode must be "lump" or "dca".'}), 400
    if not (0 <= expense_ratio_pct <= 10):
        return jsonify({'error': 'expense_ratio_pct must be between 0 and 10.'}), 400

    try:
        result = InvestmentCalculator.calculate_returns(
            symbol, amount, start_date, end_date,
            mode=mode, drip=drip, expense_ratio_pct=expense_ratio_pct,
            adjust_inflation=adjust_inflation,
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    if result is None:
        return jsonify({'error': f'No price data available for "{symbol}" in that date range.'}), 404
    return jsonify(result)


@app.route('/api/compare', methods=['POST'])
def compare():
    data = request.get_json(silent=True) or {}
    raw_symbols = data.get('symbols') or []
    symbols = [s.strip().upper() for s in raw_symbols if s and s.strip()]
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    drip = bool(data.get('drip', True))

    try:
        amount = float(data.get('amount'))
        cash_apy = float(data.get('cash_apy') or 4.0)
        datetime.strptime(start_date, '%Y-%m-%d')
        datetime.strptime(end_date, '%Y-%m-%d')
    except (TypeError, ValueError):
        return jsonify({'error': 'symbols, amount, start_date and end_date (YYYY-MM-DD) are required.'}), 400

    if not (1 <= len(symbols) <= 3):
        return jsonify({'error': 'Provide between 1 and 3 symbols to compare.'}), 400
    if amount <= 0 or start_date >= end_date:
        return jsonify({'error': 'Invalid input: check amount, and that start_date is before end_date.'}), 400

    assets = []
    reference_dates = None
    pending_cash_slots = []

    for symbol in symbols:
        if symbol == 'CASH':
            asset = {'symbol': 'CASH', 'label': f'Savings ({cash_apy:g}% APY)'}
            assets.append(asset)
            pending_cash_slots.append(asset)
            continue

        try:
            result = InvestmentCalculator.calculate_returns(
                symbol, amount, start_date, end_date, mode='lump', drip=drip
            )
        except Exception as e:
            return jsonify({'error': f'{symbol}: {e}'}), 500

        if result is None:
            return jsonify({'error': f'No price data available for "{symbol}" in that date range.'}), 404

        reference_dates = reference_dates or [p['date'] for p in result['series']]
        assets.append({
            'symbol': symbol,
            'label': symbol,
            'final_value': result['final_value'],
            'total_return_pct': result['total_return_pct'],
            'max_drawdown_pct': result['max_drawdown_pct'],
            'series': [
                {'date': p['date'], 'value': p['nominal'], 'pct_return': round((p['nominal'] / amount - 1) * 100, 2)}
                for p in result['series']
            ],
        })

    if reference_dates is None:
        reference_dates = pd.bdate_range(start_date, end_date).strftime('%Y-%m-%d').tolist()

    for asset in pending_cash_slots:
        values = InvestmentCalculator.cash_series(reference_dates, amount, cash_apy)
        asset['final_value'] = round(values[-1], 2)
        asset['total_return_pct'] = round((values[-1] / amount - 1) * 100, 2)
        asset['max_drawdown_pct'] = 0.0
        asset['series'] = [
            {'date': d, 'value': round(v, 2), 'pct_return': round((v / amount - 1) * 100, 2)}
            for d, v in zip(reference_dates, values)
        ]

    return jsonify({'start_date': start_date, 'end_date': end_date, 'amount': amount, 'assets': assets})


@app.route('/api/luck-simulator', methods=['POST'])
def luck_simulator():
    data = request.get_json(silent=True) or {}
    symbol = (data.get('symbol') or '').strip()
    first_start_date = data.get('first_start_date')
    drip = bool(data.get('drip', True))

    try:
        amount = float(data.get('amount'))
        duration_years = int(data.get('duration_years'))
        count = int(data.get('count') or 10)
        datetime.strptime(first_start_date, '%Y-%m-%d')
    except (TypeError, ValueError):
        return jsonify({'error': 'symbol, amount, duration_years and first_start_date (YYYY-MM-DD) are required.'}), 400

    if not symbol or amount <= 0:
        return jsonify({'error': 'Invalid input: check symbol and amount.'}), 400
    if not (1 <= duration_years <= 30):
        return jsonify({'error': 'duration_years must be between 1 and 30.'}), 400
    if not (2 <= count <= 20):
        return jsonify({'error': 'count must be between 2 and 20.'}), 400

    try:
        runs = InvestmentCalculator.luck_simulator(
            symbol, amount, duration_years, first_start_date, count, drip
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    if not any(r['final_value'] is not None for r in runs):
        return jsonify({'error': f'No price data available for "{symbol}" over that span.'}), 404

    return jsonify({'symbol': symbol.upper(), 'amount': amount, 'duration_years': duration_years, 'runs': runs})


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
