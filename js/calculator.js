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
    const quotesHtml = QUOTES.map(q => `
        <div class="quote-slide">
            <div class="quote-text">"${q.text}"</div>
            <div class="quote-author">— ${q.author}</div>
        </div>`).join('');

    return `
        <div class="calculator-page">
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

                <div id="result" class="result" style="display: none;"></div>
            </div>

            <div class="quotes-container">${quotesHtml}</div>
        </div>`;
}

mountLayout('calculator.html');
document.getElementById('app').innerHTML = renderCalculatorPage();

document.getElementById('calculateBtn').addEventListener('click', calculateReturns);

document.getElementById('mode').addEventListener('change', (e) => {
    document.getElementById('amountLabel').textContent = e.target.value === 'dca'
        ? 'Monthly Contribution ($):'
        : 'Investment Amount ($):';
});

const requestedStock = new URLSearchParams(window.location.search).get('stock');
if (requestedStock) {
    const stockSelect = document.getElementById('stock');
    if (stockSelect.querySelector(`option[value="${requestedStock}"]`)) {
        stockSelect.value = requestedStock;
    }
}
