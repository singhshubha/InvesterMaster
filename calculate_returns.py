import yfinance as yf

def calculate_returns(symbol, amount, years):
    # Download historical data for the given symbol
    data = yf.download(symbol, period=f"{int(years)+1}y", interval="1d")
    if data.empty:
        print("No data available for this stock.")
        return

    # Get the oldest and latest closing prices as floats
    oldest_close = float(data['Close'].iloc[0])
    latest_close = float(data['Close'].iloc[-1])

    # Calculate total return over the period
    total_return = (latest_close / oldest_close) - 1
    future_value = amount * (1 + total_return)

    print(f"Initial Investment: ${amount:.2f}")
    print(f"Investment Period: {years} years")
    print(f"Future Value: ${future_value:.2f}")
    print(f"Total Return: ${future_value - amount:.2f}")

