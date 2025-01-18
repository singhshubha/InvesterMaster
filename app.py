from flask import Flask, request, jsonify
from flask_cors import CORS
from calculator_logic import InvestmentCalculator
import os

app = Flask(__name__)
CORS(app)

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.json
        print(f"Received request: {data}")
        
        calculator = InvestmentCalculator('stocks.db')
        
        result = calculator.calculate_returns(
            stock=data['stock'],
            amount=float(data['amount']),
            years=int(data['years'])
        )
        
        print(f"Calculation result: {result}")
        return jsonify(result)

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
