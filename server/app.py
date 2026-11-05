import os
import sqlite3
from datetime import datetime

import pandas as pd
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

import dashboard_logic
from advanced_analytics import PortfolioBuilder, RetirementProjector
from calculator_logic import DB_PATH, InvestmentCalculator

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


@app.route('/api/retirement-projector', methods=['POST'])
def retirement_projector():
    data = request.get_json(silent=True) or {}
    symbol = (data.get('symbol') or '').strip()
    method = data.get('method', 'monte_carlo')
    drip = bool(data.get('drip', True))

    try:
        initial_amount = float(data.get('initial_amount'))
        monthly_contribution = float(data.get('monthly_contribution') or 0)
        years = int(data.get('years'))
        num_simulations = int(data.get('num_simulations') or 1000)
        target_amount = data.get('target_amount')
        target_amount = float(target_amount) if target_amount not in (None, '') else None
        seed = data.get('seed')
        seed = int(seed) if seed not in (None, '') else None
    except (TypeError, ValueError):
        return jsonify({'error': 'symbol, initial_amount, and years are required.'}), 400

    if not symbol or initial_amount <= 0 or monthly_contribution < 0:
        return jsonify({'error': 'Invalid input: check symbol, initial_amount, and monthly_contribution.'}), 400
    if method not in ('monte_carlo', 'historical_rolling'):
        return jsonify({'error': 'method must be "monte_carlo" or "historical_rolling".'}), 400
    if not (1 <= years <= 30):
        return jsonify({'error': 'years must be between 1 and 30.'}), 400
    if not (100 <= num_simulations <= 2000):
        return jsonify({'error': 'num_simulations must be between 100 and 2000.'}), 400
    if target_amount is not None and target_amount <= 0:
        return jsonify({'error': 'target_amount must be positive if provided.'}), 400

    try:
        result = RetirementProjector.simulate(
            symbol, initial_amount, monthly_contribution, years, target_amount,
            method, num_simulations, drip, seed,
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    if result is None:
        hint = ' Try "monte_carlo" or a shorter horizon.' if method == 'historical_rolling' else ''
        return jsonify({'error': f'Not enough price history for "{symbol}" to run this projection.{hint}'}), 404
    return jsonify(result)


@app.route('/api/portfolio', methods=['POST'])
def portfolio():
    data = request.get_json(silent=True) or {}
    raw_assets = data.get('assets') or []
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    drip = bool(data.get('drip', True))
    account_type = data.get('account_type', 'tax-advantaged')

    try:
        amount = float(data.get('amount'))
        capital_gains_tax_pct = float(data.get('capital_gains_tax_pct') or 15)
        risk_free_rate_pct = float(data.get('risk_free_rate_pct') or 2)
        assets = [{'symbol': (a.get('symbol') or '').strip().upper(), 'weight': float(a.get('weight'))}
                  for a in raw_assets if a.get('symbol')]
        datetime.strptime(start_date, '%Y-%m-%d')
        datetime.strptime(end_date, '%Y-%m-%d')
    except (TypeError, ValueError):
        return jsonify({'error': 'assets (symbol+weight), amount, start_date and end_date are required.'}), 400

    if not (2 <= len(assets) <= 5):
        return jsonify({'error': 'Provide between 2 and 5 assets.'}), 400
    if len(set(a['symbol'] for a in assets)) != len(assets):
        return jsonify({'error': 'Each asset symbol must be used only once.'}), 400
    if abs(sum(a['weight'] for a in assets) - 100) > 0.5:
        return jsonify({'error': 'Asset weights must sum to 100.'}), 400
    if amount <= 0 or start_date >= end_date:
        return jsonify({'error': 'Invalid input: check amount, and that start_date is before end_date.'}), 400
    if account_type not in ('taxable', 'tax-advantaged'):
        return jsonify({'error': 'account_type must be "taxable" or "tax-advantaged".'}), 400
    if not (0 <= capital_gains_tax_pct <= 50):
        return jsonify({'error': 'capital_gains_tax_pct must be between 0 and 50.'}), 400

    try:
        result = PortfolioBuilder.simulate(
            assets, amount, start_date, end_date, drip, account_type,
            capital_gains_tax_pct, risk_free_rate_pct,
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    if result is None:
        return jsonify({'error': 'No overlapping price data available for that combination of assets and dates.'}), 404
    return jsonify(result)


@app.route('/api/tax-comparison', methods=['POST'])
def tax_comparison():
    data = request.get_json(silent=True) or {}
    symbol = (data.get('symbol') or '').strip()
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    drip = bool(data.get('drip', True))

    try:
        amount = float(data.get('amount'))
        capital_gains_tax_pct = float(data.get('capital_gains_tax_pct') or 15)
        ordinary_income_tax_pct = float(data.get('ordinary_income_tax_pct') or 22)
        datetime.strptime(start_date, '%Y-%m-%d')
        datetime.strptime(end_date, '%Y-%m-%d')
    except (TypeError, ValueError):
        return jsonify({'error': 'symbol, amount, start_date and end_date (YYYY-MM-DD) are required.'}), 400

    if not symbol or amount <= 0 or start_date >= end_date:
        return jsonify({'error': 'Invalid input: check symbol, amount, and that start_date is before end_date.'}), 400
    if not (0 <= capital_gains_tax_pct <= 50) or not (0 <= ordinary_income_tax_pct <= 50):
        return jsonify({'error': 'Tax rates must be between 0 and 50.'}), 400

    try:
        result = InvestmentCalculator.tax_comparison(
            symbol, amount, start_date, end_date, drip, capital_gains_tax_pct, ordinary_income_tax_pct
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    if result is None:
        return jsonify({'error': f'No price data available for "{symbol}" in that date range.'}), 404
    return jsonify(result)


@app.route('/api/this-week-in-history', methods=['GET'])
def this_week_in_history():
    try:
        facts = InvestmentCalculator.this_week_in_history()
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'facts': facts})


NEWS_QUERY = 'stocks finance'


def store_headlines(articles, query):
    """Keep every headline /api/news serves so it can be analyzed later. Re-serving the
    same article is a no-op thanks to the UNIQUE url. Storage failures never break /api/news."""
    rows = [
        (
            datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            a.get('publishedAt'),
            (a.get('source') or {}).get('name'),
            a.get('title'),
            a.get('description'),
            a.get('url'),
            query,
        )
        for a in articles if a.get('url') and a.get('title')
    ]
    if not rows:
        return
    try:
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS news_headlines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fetched_at TEXT NOT NULL,
                    published_at TEXT,
                    source TEXT,
                    title TEXT NOT NULL,
                    description TEXT,
                    url TEXT NOT NULL UNIQUE,
                    query TEXT
                )""")
            conn.executemany(
                'INSERT OR IGNORE INTO news_headlines '
                '(fetched_at, published_at, source, title, description, url, query) VALUES (?, ?, ?, ?, ?, ?, ?)',
                rows,
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as e:
        app.logger.warning('Could not store headlines: %s', e)


@app.route('/api/news', methods=['GET'])
def news():
    if not NEWSAPI_KEY:
        return jsonify({'articles': []})

    try:
        resp = requests.get(
            'https://newsapi.org/v2/everything',
            params={'q': NEWS_QUERY, 'pageSize': 10, 'apiKey': NEWSAPI_KEY},
            timeout=5,
        )
        resp.raise_for_status()
        articles = resp.json().get('articles', [])
        store_headlines(articles, NEWS_QUERY)
        return jsonify({'articles': articles})
    except requests.RequestException:
        return jsonify({'articles': []}), 502


# ---------------------------------------------------------------------------
# Market Dashboard (dashboard.html). Read-only over data/stocks.db; see dashboard_logic.py.
# ---------------------------------------------------------------------------

def _date_arg(name):
    value = (request.args.get(name) or '').strip()
    if not value:
        return None
    datetime.strptime(value, '%Y-%m-%d')
    return value


def _float_arg(name, default, lo, hi):
    raw = request.args.get(name)
    value = float(raw) if raw not in (None, '') else default
    if not (lo <= value <= hi):
        raise ValueError(f'{name} must be between {lo:g} and {hi:g}.')
    return value


@app.route('/api/dashboard/meta', methods=['GET'])
def dashboard_meta():
    try:
        return jsonify(dashboard_logic.meta())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/performance', methods=['GET'])
def dashboard_performance():
    try:
        symbols = [s.strip().upper() for s in (request.args.get('symbols') or '').split(',') if s.strip()]
        symbols = list(dict.fromkeys(symbols))
        if not (1 <= len(symbols) <= 7):
            raise ValueError('Pick between 1 and 7 tickers.')
        start, end = _date_arg('start'), _date_arg('end')
        amount = _float_arg('amount', 10_000, 1, 1e9)
        rf = _float_arg('rf', 2.0, 0, 20)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    try:
        return jsonify(dashboard_logic.performance(symbols, start, end, amount, rf))
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/allocation', methods=['GET'])
def dashboard_allocation():
    try:
        equity = (request.args.get('equity') or 'SPY').strip().upper()
        bond = (request.args.get('bond') or 'BND').strip().upper()
        weight = _float_arg('weight', 60, 0, 100)
        rebalance = request.args.get('rebalance') or 'quarterly'
        start, end = _date_arg('start'), _date_arg('end')
        amount = _float_arg('amount', 10_000, 1, 1e9)
        rf = _float_arg('rf', 2.0, 0, 20)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    try:
        return jsonify(dashboard_logic.allocation(equity, bond, weight, rebalance, start, end, amount, rf))
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/rolling-windows', methods=['GET'])
def dashboard_rolling_windows():
    try:
        horizon = int(request.args.get('horizon') or 10)
        return jsonify(dashboard_logic.rolling_windows(horizon))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Use port 5001 instead of 5000 to avoid AirPlay conflict on macOS
    app.run(debug=True, host='0.0.0.0', port=5001)
