// Builds the calculator page markup (form + quotes sidebar)
// and mounts it into '#app'.

const STOCK_OPTIONS = [
    { value: 'AAPL', label: 'Apple (AAPL)' },
    { value: 'MSFT', label: 'Microsoft (MSFT)' },
    { value: 'GOOGL', label: 'Alphabet (GOOGL)' },
    { value: 'AMZN', label: 'Amazon (AMZN)' },
    { value: 'SPY', label: 'SPDR S&P 500 ETF (SPY)' },
    { value: 'QQQ', label: 'Invesco QQQ Trust (QQQ)' }
];

const COMPARE_OPTIONS = [
    { value: '', label: '— None —' },
    ...STOCK_OPTIONS,
    { value: 'GLD', label: 'Gold (GLD)' },
    { value: 'CASH', label: 'Savings Account (~4% APY)' }
];

const PORTFOLIO_ASSET_OPTIONS = [
    { value: '', label: '— Unused —' },
    ...STOCK_OPTIONS,
    { value: 'GLD', label: 'Gold (GLD)' },
    { value: 'BND', label: 'Total Bond Market (BND)' }
];

const SCENARIO_PRESETS = [
    {
        label: 'The 2008 Investor',
        stock: 'SPY', mode: 'lump', amount: 10000,
        startDate: '2007-10-09', endDate: '2009-03-09',
        drip: true, adjustInflation: false, expenseRatio: 0
    },
    {
        label: 'The COVID Dip Buyer',
        stock: 'SPY', mode: 'lump', amount: 10000,
        startDate: '2020-02-19', endDate: '2020-08-18',
        drip: true, adjustInflation: false, expenseRatio: 0
    },
    {
        label: 'The Boring DCA Retirement Plan',
        stock: 'SPY', mode: 'dca', amount: 500,
        startDate: '2000-01-03', endDate: '2024-12-31',
        drip: true, adjustInflation: true, expenseRatio: 0.5
    }
];

const QUOTES = [
    { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
    { text: "With a good perspective on history, we can have a better understanding of the past and present, and thus a clear vision of the future.", author: "Carlos Slim Helu" },
    { text: "Given a 10% chance of a 100 times payoff, you should take that bet every time.", author: "Jeff Bezos" },
    { text: "Don't look for the needle in the haystack. Just buy the haystack!", author: "John Bogle" },
    { text: "In investing, what is comfortable is rarely profitable.", author: "Robert Arnott" },
    { text: "Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn't, pays it.", author: "Albert Einstein" },
    { text: "Know what you own, and know why you own it.", author: "Peter Lynch" },
    { text: "Investing should be more like watching paint dry or watching grass grow. If you want excitement, take $800 and go to Las Vegas.", author: "Paul Samuelson" }
];

function renderCalculatorPage() {
    const optionsHtml = STOCK_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const compareOptionsHtml = COMPARE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const portfolioOptionsHtml = PORTFOLIO_ASSET_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const quotesHtml = QUOTES.map(q => `
        <div class="quote-slide">
            <div class="quote-text">"${q.text}"</div>
            <div class="quote-author">— ${q.author}</div>
        </div>`).join('');
    const presetButtonsHtml = SCENARIO_PRESETS.map((p, i) => `
        <button type="button" class="preset-btn" data-preset-index="${i}">${p.label}</button>`).join('');

    return `
        <div class="calculator-page">
            <div class="calculator-stack">
                <div class="tool-card">
                    <h3>Quick Scenarios</h3>
                    <p class="tool-desc">One click loads a real historical scenario into the calculator below.</p>
                    <div class="preset-buttons">${presetButtonsHtml}</div>
                </div>

                <div class="calculator-container">
                    <h2><i class="fas fa-calculator"></i> Investment Calculator</h2>

                    <form id="calculatorForm">
                        <table class="calculator-table">
                            <tr>
                                <th>Select Stock</th>
                                <td><select id="stock">${optionsHtml}</select></td>
                            </tr>
                            <tr>
                                <th>Mode</th>
                                <td>
                                    <select id="mode">
                                        <option value="lump">Lump Sum</option>
                                        <option value="dca">Dollar-Cost Averaging (Monthly)</option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <th id="amountLabel">Investment Amount ($):</th>
                                <td><input type="number" id="amount" placeholder="Enter amount" required></td>
                            </tr>
                            <tr>
                                <th>Start Date</th>
                                <td><input type="date" id="startDate" required></td>
                            </tr>
                            <tr>
                                <th>End Date</th>
                                <td><input type="date" id="endDate" required></td>
                            </tr>
                            <tr>
                                <th>Reinvest Dividends (DRIP)</th>
                                <td><input type="checkbox" id="drip" checked></td>
                            </tr>
                            <tr>
                                <th>Adjust for Inflation</th>
                                <td><input type="checkbox" id="adjustInflation"></td>
                            </tr>
                            <tr>
                                <th>Annual Expense Ratio (%)</th>
                                <td><input type="number" id="expenseRatio" placeholder="0.00" step="0.01" min="0" max="10" value="0"></td>
                            </tr>
                        </table>
                        <button type="button" class="calculator-button" id="calculateBtn">Calculate Returns</button>
                    </form>
                </div>

                <div id="result" class="result tool-card" style="display: none;"></div>

                <div class="tool-card">
                    <h3>Compare Assets</h3>
                    <p class="tool-desc">Put the same amount into up to three assets on the same start date and see how they'd have diverged.</p>
                    <div class="inline-form">
                        <label>Asset 1
                            <select id="compareSymbol1">${compareOptionsHtml}</select>
                        </label>
                        <label>Asset 2
                            <select id="compareSymbol2">${compareOptionsHtml}</select>
                        </label>
                        <label>Asset 3
                            <select id="compareSymbol3">${compareOptionsHtml}</select>
                        </label>
                        <label>Amount ($)
                            <input type="number" id="compareAmount" value="10000">
                        </label>
                        <label>Start Date
                            <input type="date" id="compareStartDate">
                        </label>
                        <label>End Date
                            <input type="date" id="compareEndDate">
                        </label>
                        <label class="checkbox-field">
                            <input type="checkbox" id="compareDrip" checked> DRIP
                        </label>
                        <button type="button" class="tool-button" id="compareBtn">Compare</button>
                    </div>
                    <div class="chart-wrap"><canvas id="compareChart"></canvas></div>
                    <div id="compareLegend" class="compare-legend"></div>
                </div>

                <div class="tool-card">
                    <h3>"Start Date Luck" Simulator</h3>
                    <p class="tool-desc">Same amount, same holding period — only the start year changes. See how much market timing luck matters versus time in the market.</p>
                    <div class="inline-form">
                        <label>Stock
                            <select id="luckStock">${optionsHtml}</select>
                        </label>
                        <label>Amount ($)
                            <input type="number" id="luckAmount" value="10000">
                        </label>
                        <label>Hold (years)
                            <input type="number" id="luckDuration" value="5" min="1" max="30">
                        </label>
                        <label>First Start Date
                            <input type="date" id="luckFirstStart" value="2000-01-03">
                        </label>
                        <label># of Start Years
                            <input type="number" id="luckCount" value="10" min="2" max="20">
                        </label>
                        <label class="checkbox-field">
                            <input type="checkbox" id="luckDrip" checked> DRIP
                        </label>
                        <button type="button" class="tool-button" id="luckBtn">Run Simulation</button>
                    </div>
                    <div class="chart-wrap"><canvas id="luckChart"></canvas></div>
                    <div id="luckRuns" class="luck-runs"></div>
                </div>

                <div class="tool-card">
                    <h3>Retirement Projector</h3>
                    <p class="tool-desc">Monte Carlo bootstraps thousands of random future paths from a stock's historical daily returns. Historical Rolling instead walks every real historical window of that length — no randomness, just "what actually happened starting on every possible date." Both are probability cones, not predictions.</p>
                    <div class="inline-form">
                        <label>Stock
                            <select id="retireStock">${optionsHtml}</select>
                        </label>
                        <label>Method
                            <select id="retireMethod">
                                <option value="monte_carlo">Monte Carlo (random)</option>
                                <option value="historical_rolling">Historical Rolling (backtest)</option>
                            </select>
                        </label>
                        <label>Initial Amount ($)
                            <input type="number" id="retireInitial" value="10000">
                        </label>
                        <label>Monthly Contribution ($)
                            <input type="number" id="retireMonthly" value="500">
                        </label>
                        <label>Years
                            <input type="number" id="retireYears" value="20" min="1" max="30">
                        </label>
                        <label>Target Amount ($, optional)
                            <input type="number" id="retireTarget" placeholder="e.g. 1000000">
                        </label>
                        <label># Simulations (Monte Carlo)
                            <input type="number" id="retireSims" value="1000" min="100" max="2000" step="100">
                        </label>
                        <label class="checkbox-field">
                            <input type="checkbox" id="retireDrip" checked> DRIP
                        </label>
                        <button type="button" class="tool-button" id="retireBtn">Run Projection</button>
                    </div>
                    <div class="chart-wrap"><canvas id="retireChart"></canvas></div>
                    <div id="retireSummary" class="retire-summary"></div>
                </div>

                <div class="tool-card">
                    <h3>Portfolio Builder</h3>
                    <p class="tool-desc">Mix up to 4 assets by weight and see the combined historical performance, volatility, and Sharpe ratio — with none/annual/quarterly rebalancing compared side by side, including the tax cost of rebalancing in a taxable account.</p>
                    <div class="inline-form">
                        <label>Asset 1
                            <select id="portSymbol1">${portfolioOptionsHtml}</select>
                        </label>
                        <label>Weight (%)
                            <input type="number" id="portWeight1" value="60" min="0" max="100">
                        </label>
                        <label>Asset 2
                            <select id="portSymbol2">${portfolioOptionsHtml}</select>
                        </label>
                        <label>Weight (%)
                            <input type="number" id="portWeight2" value="20" min="0" max="100">
                        </label>
                        <label>Asset 3
                            <select id="portSymbol3">${portfolioOptionsHtml}</select>
                        </label>
                        <label>Weight (%)
                            <input type="number" id="portWeight3" value="20" min="0" max="100">
                        </label>
                        <label>Asset 4
                            <select id="portSymbol4">${portfolioOptionsHtml}</select>
                        </label>
                        <label>Weight (%)
                            <input type="number" id="portWeight4" value="0" min="0" max="100">
                        </label>
                    </div>
                    <div class="inline-form">
                        <label>Amount ($)
                            <input type="number" id="portAmount" value="100000">
                        </label>
                        <label>Start Date
                            <input type="date" id="portStartDate">
                        </label>
                        <label>End Date
                            <input type="date" id="portEndDate">
                        </label>
                        <label>Account Type
                            <select id="portAccountType">
                                <option value="tax-advantaged">Tax-Advantaged (401k/IRA)</option>
                                <option value="taxable">Taxable</option>
                            </select>
                        </label>
                        <label>Capital Gains Tax (%)
                            <input type="number" id="portCapGainsTax" value="15" min="0" max="50">
                        </label>
                        <label class="checkbox-field">
                            <input type="checkbox" id="portDrip" checked> DRIP
                        </label>
                        <button type="button" class="tool-button" id="portBtn">Build Portfolio</button>
                    </div>
                    <div class="chart-wrap"><canvas id="portChart"></canvas></div>
                    <div id="portTable"></div>
                </div>

                <div class="tool-card">
                    <h3>Tax-Aware: Account Type Comparison</h3>
                    <p class="tool-desc">The same real growth path, taxed three ways: Taxable (capital gains at sale), Traditional (withdrawals taxed as ordinary income), Roth (tax-free withdrawals). Simplified for illustration — it doesn't model Traditional's upfront tax deduction, contribution limits, or state taxes, so treat it as educational, not tax advice.</p>
                    <div class="inline-form">
                        <label>Stock
                            <select id="taxStock">${optionsHtml}</select>
                        </label>
                        <label>Amount ($)
                            <input type="number" id="taxAmount" value="10000">
                        </label>
                        <label>Start Date
                            <input type="date" id="taxStartDate">
                        </label>
                        <label>End Date
                            <input type="date" id="taxEndDate">
                        </label>
                        <label>Capital Gains Tax (%)
                            <input type="number" id="taxCapGains" value="15" min="0" max="50">
                        </label>
                        <label>Ordinary Income Tax (%)
                            <input type="number" id="taxOrdinary" value="24" min="0" max="50">
                        </label>
                        <label class="checkbox-field">
                            <input type="checkbox" id="taxDrip" checked> DRIP
                        </label>
                        <button type="button" class="tool-button" id="taxBtn">Compare Accounts</button>
                    </div>
                    <div class="chart-wrap chart-wrap-sm"><canvas id="taxChart"></canvas></div>
                    <div id="taxTable"></div>
                </div>
            </div>

            <div class="quotes-container">${quotesHtml}</div>
        </div>`;
}

mountLayout('calculator.html');
document.getElementById('app').innerHTML = renderCalculatorPage();

document.getElementById('calculateBtn').addEventListener('click', calculateReturns);
document.getElementById('compareBtn').addEventListener('click', runComparison);
document.getElementById('luckBtn').addEventListener('click', runLuckSimulator);
document.getElementById('retireBtn').addEventListener('click', runRetirementProjector);
document.getElementById('portBtn').addEventListener('click', runPortfolioBuilder);
document.getElementById('taxBtn').addEventListener('click', runTaxComparison);

document.getElementById('mode').addEventListener('change', (e) => {
    document.getElementById('amountLabel').textContent = e.target.value === 'dca'
        ? 'Monthly Contribution ($):'
        : 'Investment Amount ($):';
});

document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const preset = SCENARIO_PRESETS[Number(btn.dataset.presetIndex)];
        document.getElementById('stock').value = preset.stock;
        document.getElementById('mode').value = preset.mode;
        document.getElementById('mode').dispatchEvent(new Event('change'));
        document.getElementById('amount').value = preset.amount;
        document.getElementById('startDate').value = preset.startDate;
        document.getElementById('endDate').value = preset.endDate;
        document.getElementById('drip').checked = preset.drip;
        document.getElementById('adjustInflation').checked = preset.adjustInflation;
        document.getElementById('expenseRatio').value = preset.expenseRatio;
        calculateReturns();
        document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// Sensible defaults so the compare/luck-simulator tools work without extra typing.
document.getElementById('compareSymbol1').value = 'SPY';
document.getElementById('compareSymbol2').value = 'QQQ';
document.getElementById('compareSymbol3').value = 'CASH';
document.getElementById('compareStartDate').value = '2018-01-02';
document.getElementById('compareEndDate').value = new Date().toISOString().slice(0, 10);

document.getElementById('portSymbol1').value = 'SPY';
document.getElementById('portSymbol2').value = 'QQQ';
document.getElementById('portSymbol3').value = 'BND';
document.getElementById('portStartDate').value = '2015-01-02';
document.getElementById('portEndDate').value = new Date().toISOString().slice(0, 10);

document.getElementById('taxStartDate').value = '2015-01-02';
document.getElementById('taxEndDate').value = new Date().toISOString().slice(0, 10);

// Restore a shared calculator state from the URL (?ticker=SPY&amount=10000&start=...&end=...),
// and auto-run it so a pasted link reproduces the exact result that was shared.
const urlParams = new URLSearchParams(window.location.search);
const requestedStock = urlParams.get('ticker') || urlParams.get('stock');
if (requestedStock) {
    const stockSelect = document.getElementById('stock');
    if (stockSelect.querySelector(`option[value="${requestedStock}"]`)) {
        stockSelect.value = requestedStock;
    }
}
if (urlParams.get('mode') === 'dca' || urlParams.get('mode') === 'lump') {
    const modeSelect = document.getElementById('mode');
    modeSelect.value = urlParams.get('mode');
    modeSelect.dispatchEvent(new Event('change'));
}
if (urlParams.has('amount')) document.getElementById('amount').value = urlParams.get('amount');
if (urlParams.has('start')) document.getElementById('startDate').value = urlParams.get('start');
if (urlParams.has('end')) document.getElementById('endDate').value = urlParams.get('end');
if (urlParams.has('drip')) document.getElementById('drip').checked = urlParams.get('drip') !== '0';
if (urlParams.has('inflation')) document.getElementById('adjustInflation').checked = urlParams.get('inflation') === '1';
if (urlParams.has('fee')) document.getElementById('expenseRatio').value = urlParams.get('fee');

if (urlParams.has('amount') && urlParams.has('start') && urlParams.has('end')) {
    calculateReturns();
}
