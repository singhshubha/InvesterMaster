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
            </div>

            <div class="quotes-container">${quotesHtml}</div>
        </div>`;
}

mountLayout('calculator.html');
document.getElementById('app').innerHTML = renderCalculatorPage();

document.getElementById('calculateBtn').addEventListener('click', calculateReturns);
document.getElementById('compareBtn').addEventListener('click', runComparison);
document.getElementById('luckBtn').addEventListener('click', runLuckSimulator);

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

const requestedStock = new URLSearchParams(window.location.search).get('stock');
if (requestedStock) {
    const stockSelect = document.getElementById('stock');
    if (stockSelect.querySelector(`option[value="${requestedStock}"]`)) {
        stockSelect.value = requestedStock;
    }
}
