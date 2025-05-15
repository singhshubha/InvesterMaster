import yfinance as yf

class InvestmentCalculator:
    @staticmethod
    def calculate_returns(symbol, amount, years):
        data = yf.download(symbol, period=f"{int(years)+1}y", interval="1d")
        if data.empty:
            return None
        oldest_close = float(data['Close'].iloc[0])
        latest_close = float(data['Close'].iloc[-1])
        total_return = (latest_close / oldest_close) - 1
        future_value = amount * (1 + total_return)
        return {
            'initial_investment': f"{amount:.2f}",
            'years': years,
            'future_value': f"{future_value:.2f}",
            'total_return': f"{future_value - amount:.2f}"
        }