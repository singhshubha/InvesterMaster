// Stripped-down calculator meant to be <iframe>'d on other sites. Reuses the same
// calculateReturns()/displayResults() from shared.js so results (incl. the chart) match
// the full site exactly — this file only builds the minimal form and reads URL params.

const EMBED_STOCK_OPTIONS = [
    { value: 'AAPL', label: 'Apple (AAPL)' },
    { value: 'MSFT', label: 'Microsoft (MSFT)' },
    { value: 'GOOGL', label: 'Alphabet (GOOGL)' },
    { value: 'AMZN', label: 'Amazon (AMZN)' },
    { value: 'SPY', label: 'SPDR S&P 500 ETF (SPY)' },
    { value: 'QQQ', label: 'Invesco QQQ Trust (QQQ)' }
];

function renderEmbedPage() {
    const optionsHtml = EMBED_STOCK_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    return `
        <div class="embed-container">
            <div class="embed-header"><i class="fas fa-calculator"></i> What if I invested...</div>

            <table class="calculator-table">
                <tr>
                    <th>Stock</th>
                    <td><select id="stock">${optionsHtml}</select></td>
                </tr>
                <tr>
                    <th>Amount ($)</th>
                    <td><input type="number" id="amount" value="10000"></td>
                </tr>
                <tr>
                    <th>Start Date</th>
                    <td><input type="date" id="startDate"></td>
                </tr>
                <tr>
                    <th>End Date</th>
                    <td><input type="date" id="endDate"></td>
                </tr>
                <tr>
                    <th>Reinvest Dividends</th>
                    <td><input type="checkbox" id="drip" checked></td>
                </tr>
            </table>

            <input type="hidden" id="mode" value="lump">
            <input type="checkbox" id="adjustInflation" style="display:none">
            <input type="number" id="expenseRatio" value="0" style="display:none">

            <button type="button" class="calculator-button" id="calculateBtn">Calculate</button>
            <div id="result" class="result" style="display:none;"></div>

            <a class="embed-branding" href="${window.location.origin}/calculator.html" target="_blank" rel="noopener">
                Powered by InvesterMaster
            </a>
        </div>`;
}

document.getElementById('app').innerHTML = renderEmbedPage();
document.getElementById('calculateBtn').addEventListener('click', calculateReturns);

const params = new URLSearchParams(window.location.search);
const requestedStock = params.get('ticker') || params.get('stock');
if (requestedStock) {
    const stockSelect = document.getElementById('stock');
    if (stockSelect.querySelector(`option[value="${requestedStock}"]`)) {
        stockSelect.value = requestedStock;
    }
}
if (params.has('amount')) document.getElementById('amount').value = params.get('amount');
if (params.has('start')) document.getElementById('startDate').value = params.get('start');
if (params.has('end')) document.getElementById('endDate').value = params.get('end');
if (params.has('drip')) document.getElementById('drip').checked = params.get('drip') !== '0';

if (params.has('amount') && params.has('start') && params.has('end')) {
    calculateReturns();
}
