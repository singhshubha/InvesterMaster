import sqlite3

import numpy as np
import pandas as pd

from calculator_logic import DB_PATH, PriceCache

DAYS_PER_MONTH = 21  # ~trading days/month, used to keep Monte Carlo and historical-rolling comparable


class RetirementProjector:
    @staticmethod
    def _daily_returns(symbol, drip):
        conn = sqlite3.connect(DB_PATH)
        try:
            price_column = 'adjusted_close' if drip else 'close'
            today = pd.Timestamp.utcnow().strftime('%Y-%m-%d')
            df = PriceCache.get_prices(conn, symbol.upper().strip(), '1970-01-01', today, price_column)
        finally:
            conn.close()
        if df.empty or len(df) < 60:
            return None
        return df['price'].pct_change().dropna().to_numpy()

    @staticmethod
    def _walk_forward(month_growth, initial_amount, monthly_contribution):
        """month_growth: (num_paths, num_months) growth factor per path per month.
        Returns values: (num_paths, num_months + 1), with column 0 = initial_amount."""
        num_paths, num_months = month_growth.shape
        values = np.empty((num_paths, num_months + 1))
        values[:, 0] = initial_amount
        current = np.full(num_paths, float(initial_amount))
        for m in range(num_months):
            current = (current + monthly_contribution) * month_growth[:, m]
            values[:, m + 1] = current
        return values

    @staticmethod
    def _summarize(values, target_amount):
        percentiles = np.percentile(values, [10, 25, 50, 75, 90], axis=0)
        result = {
            'months': list(range(values.shape[1])),
            'p10': np.round(percentiles[0], 2).tolist(),
            'p25': np.round(percentiles[1], 2).tolist(),
            'p50': np.round(percentiles[2], 2).tolist(),
            'p75': np.round(percentiles[3], 2).tolist(),
            'p90': np.round(percentiles[4], 2).tolist(),
            'num_paths': int(values.shape[0]),
            'success_rate_pct': None,
            'median_months_to_target': None,
        }
        if target_amount:
            final_values = values[:, -1]
            success_mask = final_values >= target_amount
            result['success_rate_pct'] = round(float(success_mask.mean()) * 100, 1)
            reached = values >= target_amount
            any_reached = reached.any(axis=1)
            if any_reached.any():
                first_idx = np.argmax(reached, axis=1)
                result['median_months_to_target'] = float(np.median(first_idx[any_reached]))
        return result

    @staticmethod
    def simulate(symbol, initial_amount, monthly_contribution, years, target_amount,
                 method, num_simulations, drip):
        daily_returns = RetirementProjector._daily_returns(symbol, drip)
        if daily_returns is None:
            return None

        num_months = round(years * 12)
        window_len = num_months * DAYS_PER_MONTH

        if method == 'monte_carlo':
            rng = np.random.default_rng()
            sampled = rng.choice(daily_returns, size=(num_simulations, num_months, DAYS_PER_MONTH))
            month_growth = np.prod(1 + sampled, axis=2)
        elif method == 'historical_rolling':
            if len(daily_returns) < window_len:
                return None
            starts = list(range(0, len(daily_returns) - window_len + 1, DAYS_PER_MONTH))
            if not starts:
                return None
            blocks = np.array([daily_returns[s:s + window_len] for s in starts])
            blocks = blocks.reshape(len(starts), num_months, DAYS_PER_MONTH)
            month_growth = np.prod(1 + blocks, axis=2)
        else:
            raise ValueError('method must be "monte_carlo" or "historical_rolling"')

        values = RetirementProjector._walk_forward(month_growth, initial_amount, monthly_contribution)
        summary = RetirementProjector._summarize(values, target_amount)
        summary['symbol'] = symbol.upper().strip()
        summary['method'] = method
        summary['years'] = years
        summary['initial_amount'] = initial_amount
        summary['monthly_contribution'] = monthly_contribution
        summary['target_amount'] = target_amount
        return summary


class PortfolioBuilder:
    REBALANCE_FREQUENCIES = ['none', 'annual', 'quarterly']

    @staticmethod
    def _period_key(date_str, freq):
        if freq == 'annual':
            return date_str[:4]
        if freq == 'quarterly':
            year, month = date_str[:4], int(date_str[5:7])
            return f'{year}Q{(month - 1) // 3 + 1}'
        return None

    @staticmethod
    def _aligned_prices(conn, assets, start_date, end_date, drip):
        price_column = 'adjusted_close' if drip else 'close'
        combined = None
        for asset in assets:
            df = PriceCache.get_prices(conn, asset['symbol'].upper().strip(), start_date, end_date, price_column)
            if df.empty:
                return None
            df = df.rename(columns={'price': asset['symbol']}).set_index('date')
            combined = df[[asset['symbol']]] if combined is None else combined.join(df[[asset['symbol']]], how='inner')
        if combined is None or combined.empty:
            return None
        return combined.sort_index()

    @staticmethod
    def _run_path(prices, symbols, weights, amount, freq, account_type, cg_tax_pct):
        dates = prices.index.tolist()
        first_prices = prices.iloc[0]
        shares = {s: amount * weights[s] / first_prices[s] for s in symbols}
        cost_basis = {s: first_prices[s] for s in symbols}
        total_tax_paid = 0.0
        series_values = []
        last_period = PortfolioBuilder._period_key(dates[0], freq) if freq != 'none' else None

        for date, row in prices.iterrows():
            row_prices = row.to_dict()
            total_value = sum(shares[s] * row_prices[s] for s in symbols)

            if freq != 'none':
                period_key = PortfolioBuilder._period_key(date, freq)
                if period_key != last_period:
                    target_shares = {}
                    tax_this_event = 0.0
                    for s in symbols:
                        target_shares[s] = (total_value * weights[s]) / row_prices[s]
                        delta = target_shares[s] - shares[s]
                        if delta < 0 and account_type == 'taxable':
                            sold = -delta
                            gain_per_share = row_prices[s] - cost_basis[s]
                            if gain_per_share > 0:
                                tax_this_event += sold * gain_per_share * (cg_tax_pct / 100)
                        elif delta > 0:
                            new_share_count = shares[s] + delta
                            old_cost_total = cost_basis[s] * shares[s]
                            cost_basis[s] = (old_cost_total + delta * row_prices[s]) / new_share_count

                    shrink = 1 - (tax_this_event / total_value) if tax_this_event > 0 else 1.0
                    total_tax_paid += tax_this_event
                    for s in symbols:
                        shares[s] = target_shares[s] * shrink
                    total_value *= shrink
                    last_period = period_key

            series_values.append(total_value)

        return dates, series_values, total_tax_paid

    @staticmethod
    def simulate(assets, amount, start_date, end_date, drip, account_type, capital_gains_tax_pct, risk_free_rate_pct):
        conn = sqlite3.connect(DB_PATH)
        try:
            prices = PortfolioBuilder._aligned_prices(conn, assets, start_date, end_date, drip)
        finally:
            conn.close()
        if prices is None:
            return None

        symbols = [a['symbol'].upper().strip() for a in assets]
        prices.columns = symbols
        weights = {a['symbol'].upper().strip(): a['weight'] / 100 for a in assets}

        results = {}
        for freq in PortfolioBuilder.REBALANCE_FREQUENCIES:
            dates, series_values, total_tax_paid = PortfolioBuilder._run_path(
                prices, symbols, weights, amount, freq, account_type, capital_gains_tax_pct
            )
            series_arr = np.array(series_values)
            daily_returns = np.diff(series_arr) / series_arr[:-1]

            final_value = series_arr[-1]
            total_return_pct = (final_value / amount - 1) * 100
            num_days = (pd.to_datetime(dates[-1]) - pd.to_datetime(dates[0])).days
            years = max(num_days / 365.25, 1 / 365.25)
            annualized_return_pct = ((final_value / amount) ** (1 / years) - 1) * 100
            annualized_vol_pct = float(np.std(daily_returns, ddof=1) * np.sqrt(252) * 100) if len(daily_returns) > 1 else 0.0
            sharpe_ratio = (
                (annualized_return_pct - risk_free_rate_pct) / annualized_vol_pct if annualized_vol_pct > 0 else None
            )

            peak = series_arr[0]
            drawdowns = []
            for v in series_arr:
                peak = max(peak, v)
                drawdowns.append((v / peak - 1) * 100)
            max_drawdown_pct = min(drawdowns)

            results[freq] = {
                'final_value': round(float(final_value), 2),
                'total_return_pct': round(float(total_return_pct), 2),
                'annualized_return_pct': round(float(annualized_return_pct), 2),
                'annualized_volatility_pct': round(annualized_vol_pct, 2),
                'sharpe_ratio': round(sharpe_ratio, 2) if sharpe_ratio is not None else None,
                'max_drawdown_pct': round(float(max_drawdown_pct), 2),
                'total_tax_paid': round(float(total_tax_paid), 2),
                'series': [{'date': d, 'value': round(float(v), 2)} for d, v in zip(dates, series_values)],
            }

        return {
            'start_date': prices.index[0],
            'end_date': prices.index[-1],
            'assets': [{'symbol': s, 'weight': weights[s] * 100} for s in symbols],
            'account_type': account_type,
            'capital_gains_tax_pct': capital_gains_tax_pct,
            'results': results,
        }
