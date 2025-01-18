import pandas as pd

# Load the data
data = pd.read_csv('/Stock calculator/SPY.csv')  # Adjust the path to your CSV file

# Convert the date column to datetime
data['date'] = pd.to_datetime(data['date'])

# Calculate the returns
data['return'] = data['adjusted_close'].pct_change()

# Calculate the rolling average of the returns over the past 20 years (20*252 trading days)
data['rolling_avg_return'] = data['return'].rolling(window=20*252).mean()

# Save the processed data
data.to_csv('/path/to/your/processed_sp_data.csv', index=False)


# src/data_processing.py

import pandas as pd

