from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_cors import CORS
from calculator_logic import InvestmentCalculator

app = Flask(__name__, template_folder='templates', static_folder='static')
# Simplest CORS configuration
CORS(app, resources={r"/*": {"origins": "*"}})

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
        result = calculator.calculate_returns(
            stock=data['stock'],
            amount=float(data['amount']),
            years=int(data['years'])
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    # Use port 5001 instead of 5000 to avoid AirPlay conflict
    app.run(debug=True, host='0.0.0.0', port=5001)
