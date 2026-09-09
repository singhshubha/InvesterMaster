// Builds the calculator page markup (form + quotes sidebar)
// and mounts it into '#app'.

// Curated ticker list backing the searchable stock inputs (see STOCK_DATALIST_ID below).
// The backend fetches prices for *any* valid ticker via yfinance, so this list only drives
// autocomplete suggestions — it doesn't restrict what can be typed and submitted.
const STOCK_OPTIONS = [
    // Tech
    { value: 'AAPL', label: 'Apple Inc. (AAPL)' },
    { value: 'MSFT', label: 'Microsoft Corp. (MSFT)' },
    { value: 'GOOGL', label: 'Alphabet Inc. Class A (GOOGL)' },
    { value: 'GOOG', label: 'Alphabet Inc. Class C (GOOG)' },
    { value: 'AMZN', label: 'Amazon.com Inc. (AMZN)' },
    { value: 'META', label: 'Meta Platforms Inc. (META)' },
    { value: 'NVDA', label: 'NVIDIA Corp. (NVDA)' },
    { value: 'TSLA', label: 'Tesla Inc. (TSLA)' },
    { value: 'AVGO', label: 'Broadcom Inc. (AVGO)' },
    { value: 'ORCL', label: 'Oracle Corp. (ORCL)' },
    { value: 'ADBE', label: 'Adobe Inc. (ADBE)' },
    { value: 'CRM', label: 'Salesforce Inc. (CRM)' },
    { value: 'INTC', label: 'Intel Corp. (INTC)' },
    { value: 'AMD', label: 'Advanced Micro Devices Inc. (AMD)' },
    { value: 'CSCO', label: 'Cisco Systems Inc. (CSCO)' },
    { value: 'IBM', label: 'International Business Machines (IBM)' },
    { value: 'QCOM', label: 'Qualcomm Inc. (QCOM)' },
    { value: 'TXN', label: 'Texas Instruments Inc. (TXN)' },
    { value: 'NOW', label: 'ServiceNow Inc. (NOW)' },
    { value: 'INTU', label: 'Intuit Inc. (INTU)' },
    { value: 'AMAT', label: 'Applied Materials Inc. (AMAT)' },
    { value: 'MU', label: 'Micron Technology Inc. (MU)' },
    { value: 'PANW', label: 'Palo Alto Networks Inc. (PANW)' },
    { value: 'SNPS', label: 'Synopsys Inc. (SNPS)' },
    { value: 'CDNS', label: 'Cadence Design Systems Inc. (CDNS)' },
    { value: 'ADI', label: 'Analog Devices Inc. (ADI)' },
    { value: 'LRCX', label: 'Lam Research Corp. (LRCX)' },
    { value: 'KLAC', label: 'KLA Corp. (KLAC)' },
    { value: 'PYPL', label: 'PayPal Holdings Inc. (PYPL)' },
    { value: 'SHOP', label: 'Shopify Inc. (SHOP)' },
    { value: 'UBER', label: 'Uber Technologies Inc. (UBER)' },
    { value: 'ABNB', label: 'Airbnb Inc. (ABNB)' },
    { value: 'NFLX', label: 'Netflix Inc. (NFLX)' },
    { value: 'DIS', label: 'Walt Disney Co. (DIS)' },
    { value: 'CMCSA', label: 'Comcast Corp. (CMCSA)' },
    { value: 'T', label: 'AT&T Inc. (T)' },
    { value: 'VZ', label: 'Verizon Communications Inc. (VZ)' },
    { value: 'TMUS', label: 'T-Mobile US Inc. (TMUS)' },
    { value: 'COIN', label: 'Coinbase Global Inc. (COIN)' },
    { value: 'PLTR', label: 'Palantir Technologies Inc. (PLTR)' },
    { value: 'SQ', label: 'Block Inc. (SQ)' },
    { value: 'SNOW', label: 'Snowflake Inc. (SNOW)' },
    { value: 'ZM', label: 'Zoom Video Communications Inc. (ZM)' },
    { value: 'ROKU', label: 'Roku Inc. (ROKU)' },
    { value: 'BABA', label: 'Alibaba Group Holding Ltd. (BABA)' },
    { value: 'TSM', label: 'Taiwan Semiconductor Mfg. (TSM)' },

    // Finance
    { value: 'JPM', label: 'JPMorgan Chase & Co. (JPM)' },
    { value: 'BAC', label: 'Bank of America Corp. (BAC)' },
    { value: 'WFC', label: 'Wells Fargo & Co. (WFC)' },
    { value: 'GS', label: 'Goldman Sachs Group Inc. (GS)' },
    { value: 'MS', label: 'Morgan Stanley (MS)' },
    { value: 'C', label: 'Citigroup Inc. (C)' },
    { value: 'V', label: 'Visa Inc. (V)' },
    { value: 'MA', label: 'Mastercard Inc. (MA)' },
    { value: 'AXP', label: 'American Express Co. (AXP)' },
    { value: 'BLK', label: 'BlackRock Inc. (BLK)' },
    { value: 'SCHW', label: 'Charles Schwab Corp. (SCHW)' },
    { value: 'SPGI', label: 'S&P Global Inc. (SPGI)' },

    // Healthcare
    { value: 'JNJ', label: 'Johnson & Johnson (JNJ)' },
    { value: 'UNH', label: 'UnitedHealth Group Inc. (UNH)' },
    { value: 'PFE', label: 'Pfizer Inc. (PFE)' },
    { value: 'LLY', label: 'Eli Lilly and Co. (LLY)' },
    { value: 'ABBV', label: 'AbbVie Inc. (ABBV)' },
    { value: 'MRK', label: 'Merck & Co. Inc. (MRK)' },
    { value: 'TMO', label: 'Thermo Fisher Scientific Inc. (TMO)' },
    { value: 'ABT', label: 'Abbott Laboratories (ABT)' },
    { value: 'DHR', label: 'Danaher Corp. (DHR)' },
    { value: 'BMY', label: 'Bristol-Myers Squibb Co. (BMY)' },
    { value: 'AMGN', label: 'Amgen Inc. (AMGN)' },
    { value: 'GILD', label: 'Gilead Sciences Inc. (GILD)' },
    { value: 'CVS', label: 'CVS Health Corp. (CVS)' },
    { value: 'MDT', label: 'Medtronic plc (MDT)' },
    { value: 'ISRG', label: 'Intuitive Surgical Inc. (ISRG)' },

    // Consumer
    { value: 'WMT', label: 'Walmart Inc. (WMT)' },
    { value: 'PG', label: 'Procter & Gamble Co. (PG)' },
    { value: 'KO', label: 'Coca-Cola Co. (KO)' },
    { value: 'PEP', label: 'PepsiCo Inc. (PEP)' },
    { value: 'COST', label: 'Costco Wholesale Corp. (COST)' },
    { value: 'MCD', label: "McDonald's Corp. (MCD)" },
    { value: 'NKE', label: 'Nike Inc. (NKE)' },
    { value: 'SBUX', label: 'Starbucks Corp. (SBUX)' },
    { value: 'HD', label: 'Home Depot Inc. (HD)' },
    { value: 'LOW', label: "Lowe's Companies Inc. (LOW)" },
    { value: 'TGT', label: 'Target Corp. (TGT)' },
    { value: 'EL', label: 'Estée Lauder Companies Inc. (EL)' },
    { value: 'CL', label: 'Colgate-Palmolive Co. (CL)' },
    { value: 'MDLZ', label: 'Mondelez International Inc. (MDLZ)' },

    // Energy
    { value: 'XOM', label: 'Exxon Mobil Corp. (XOM)' },
    { value: 'CVX', label: 'Chevron Corp. (CVX)' },
    { value: 'COP', label: 'ConocoPhillips (COP)' },
    { value: 'SLB', label: 'Schlumberger Ltd. (SLB)' },

    // Industrial
    { value: 'BA', label: 'Boeing Co. (BA)' },
    { value: 'CAT', label: 'Caterpillar Inc. (CAT)' },
    { value: 'GE', label: 'General Electric Co. (GE)' },
    { value: 'HON', label: 'Honeywell International Inc. (HON)' },
    { value: 'UPS', label: 'United Parcel Service Inc. (UPS)' },
    { value: 'LMT', label: 'Lockheed Martin Corp. (LMT)' },
    { value: 'RTX', label: 'RTX Corp. (RTX)' },
    { value: 'DE', label: 'Deere & Co. (DE)' },
    { value: 'MMM', label: '3M Co. (MMM)' },
    { value: 'F', label: 'Ford Motor Co. (F)' },
    { value: 'GM', label: 'General Motors Co. (GM)' },
    { value: 'RIVN', label: 'Rivian Automotive Inc. (RIVN)' },
    { value: 'LCID', label: 'Lucid Group Inc. (LCID)' },

    // ETFs / funds
    { value: 'SPY', label: 'SPDR S&P 500 ETF (SPY)' },
    { value: 'QQQ', label: 'Invesco QQQ Trust (QQQ)' },
    { value: 'VOO', label: 'Vanguard S&P 500 ETF (VOO)' },
    { value: 'VTI', label: 'Vanguard Total Stock Market ETF (VTI)' },
    { value: 'IWM', label: 'iShares Russell 2000 ETF (IWM)' },
    { value: 'DIA', label: 'SPDR Dow Jones Industrial Average ETF (DIA)' },
    { value: 'GLD', label: 'SPDR Gold Shares (GLD)' },
    { value: 'SLV', label: 'iShares Silver Trust (SLV)' },
    { value: 'BND', label: 'Vanguard Total Bond Market ETF (BND)' },
    { value: 'AGG', label: 'iShares Core U.S. Aggregate Bond ETF (AGG)' },
    { value: 'ARKK', label: 'ARK Innovation ETF (ARKK)' }
];

// Datalist ids: 'stockDatalist' backs every plain stock picker (also covers GLD/BND
// since they're ETFs in the list above); 'compareDatalist' adds the synthetic CASH option.
const STOCK_DATALIST_ID = 'stockDatalist';
const COMPARE_OPTIONS = [
    ...STOCK_OPTIONS,
    { value: 'CASH', label: 'Savings Account (~4% APY) (CASH)' }
];
const COMPARE_DATALIST_ID = 'compareDatalist';

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

// Author initials for the little avatar badge next to each quote, e.g. "Peter Lynch" -> "PL".
function initials(name) {
    return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Fisher-Yates shuffle so the sidebar opens on a different quote (and order) each visit
// instead of always starting the same way.
function shuffled(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// The calculator page's six tools, one per tab. `id` matches each section's
// data-tab-panel attribute below.
const CALC_TABS = [
    { id: 'calc', icon: 'fa-calculator', label: 'Calculator' },
    { id: 'compare', icon: 'fa-code-compare', label: 'Compare Assets' },
    { id: 'luck', icon: 'fa-dice', label: 'Start Date Luck' },
    { id: 'retire', icon: 'fa-hourglass-half', label: 'Retirement Projector' },
    { id: 'portfolio', icon: 'fa-layer-group', label: 'Portfolio Builder' },
    { id: 'tax', icon: 'fa-file-invoice-dollar', label: 'Tax Comparison' }
];

// Renders a searchable "type a ticker or company name" input backed by a <datalist>,
// e.g. stockInput('luckStock', STOCK_DATALIST_ID).
function stockInput(id, datalistId, placeholder) {
    return `<input type="text" id="${id}" list="${datalistId}" autocomplete="off" spellcheck="false" placeholder="${placeholder || 'Type a ticker or company…'}">`;
}

function renderCalculatorPage() {
    const stockDatalistHtml = STOCK_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const compareDatalistHtml = COMPARE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    const datalistsHtml = `
        <datalist id="${STOCK_DATALIST_ID}">${stockDatalistHtml}</datalist>
        <datalist id="${COMPARE_DATALIST_ID}">${compareDatalistHtml}</datalist>`;
    const shuffledQuotes = shuffled(QUOTES);
    const quotesHtml = shuffledQuotes.map(q => `
        <div class="quote-slide">
            <i class="fas fa-quote-left quote-icon"></i>
            <div class="quote-text">${q.text}</div>
            <div class="quote-author-row">
                <span class="quote-avatar">${initials(q.author)}</span>
                <span class="quote-author">${q.author}</span>
            </div>
        </div>`).join('');
    const quoteDotsHtml = shuffledQuotes.map((_, i) => `
        <button type="button" class="quote-dot${i === 0 ? ' active' : ''}" data-quote-index="${i}" aria-label="Show quote ${i + 1}"></button>`).join('');
    const presetButtonsHtml = SCENARIO_PRESETS.map((p, i) => `
        <button type="button" class="preset-btn" data-preset-index="${i}">${p.label}</button>`).join('');

    const tabsHtml = CALC_TABS.map((t, i) => `
        <button type="button" class="calc-tab${i === 0 ? ' active' : ''}" role="tab" aria-selected="${i === 0}" data-tab="${t.id}">
            <i class="fas ${t.icon}"></i> ${t.label}
        </button>`).join('');

    return `
        <div class="calculator-page">
            ${datalistsHtml}
            <div class="calculator-stack">
                <div class="calc-tabs" role="tablist">${tabsHtml}</div>

                <div class="calc-tab-panel" data-tab-panel="calc">
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
                                    <td>${stockInput('stock', STOCK_DATALIST_ID)}</td>
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
                </div>

                <div class="calc-tab-panel" data-tab-panel="compare" hidden>
                    <div class="tool-card">
                        <h3>Compare Assets</h3>
                        <p class="tool-desc">Put the same amount into up to three assets on the same start date and see how they'd have diverged.</p>
                        <div class="inline-form">
                            <label>Asset 1
                                ${stockInput('compareSymbol1', COMPARE_DATALIST_ID)}
                            </label>
                            <label>Asset 2
                                ${stockInput('compareSymbol2', COMPARE_DATALIST_ID, 'Leave blank for none')}
                            </label>
                            <label>Asset 3
                                ${stockInput('compareSymbol3', COMPARE_DATALIST_ID, 'Leave blank for none')}
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
                </div>

                <div class="calc-tab-panel" data-tab-panel="luck" hidden>
                    <div class="tool-card">
                        <h3>"Start Date Luck" Simulator</h3>
                        <p class="tool-desc">Same amount, same holding period — only the start year changes. See how much market timing luck matters versus time in the market.</p>
                        <div class="inline-form">
                            <label>Stock
                                ${stockInput('luckStock', STOCK_DATALIST_ID)}
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

                <div class="calc-tab-panel" data-tab-panel="retire" hidden>
                    <div class="tool-card">
                        <h3>Retirement Projector</h3>
                        <p class="tool-desc">Monte Carlo bootstraps thousands of random future paths from a stock's historical daily returns. Historical Rolling instead walks every real historical window of that length — no randomness, just "what actually happened starting on every possible date." Both are probability cones, not predictions.</p>
                        <div class="inline-form">
                            <label>Stock
                                ${stockInput('retireStock', STOCK_DATALIST_ID)}
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
                </div>

                <div class="calc-tab-panel" data-tab-panel="portfolio" hidden>
                    <div class="tool-card">
                        <h3>Portfolio Builder</h3>
                        <p class="tool-desc">Mix up to 4 assets by weight and see the combined historical performance, volatility, and Sharpe ratio — with none/annual/quarterly rebalancing compared side by side, including the tax cost of rebalancing in a taxable account.</p>
                        <div class="inline-form">
                            <label>Asset 1
                                ${stockInput('portSymbol1', STOCK_DATALIST_ID)}
                            </label>
                            <label>Weight (%)
                                <input type="number" id="portWeight1" value="60" min="0" max="100">
                            </label>
                            <label>Asset 2
                                ${stockInput('portSymbol2', STOCK_DATALIST_ID)}
                            </label>
                            <label>Weight (%)
                                <input type="number" id="portWeight2" value="20" min="0" max="100">
                            </label>
                            <label>Asset 3
                                ${stockInput('portSymbol3', STOCK_DATALIST_ID)}
                            </label>
                            <label>Weight (%)
                                <input type="number" id="portWeight3" value="20" min="0" max="100">
                            </label>
                            <label>Asset 4
                                ${stockInput('portSymbol4', STOCK_DATALIST_ID, 'Leave blank for unused')}
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
                </div>

                <div class="calc-tab-panel" data-tab-panel="tax" hidden>
                    <div class="tool-card">
                        <h3>Tax-Aware: Account Type Comparison</h3>
                        <p class="tool-desc">The same real growth path, taxed three ways: Taxable (capital gains at sale), Traditional (withdrawals taxed as ordinary income), Roth (tax-free withdrawals). Simplified for illustration — it doesn't model Traditional's upfront tax deduction, contribution limits, or state taxes, so treat it as educational, not tax advice.</p>
                        <div class="inline-form">
                            <label>Stock
                                ${stockInput('taxStock', STOCK_DATALIST_ID)}
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
            </div>

            <div class="quotes-container">
                ${quotesHtml}
                <div class="quote-dots">${quoteDotsHtml}</div>
            </div>
        </div>`;
}

mountLayout('calculator.html');
document.getElementById('app').innerHTML = renderCalculatorPage();

function activateCalcTab(tabId) {
    document.querySelectorAll('.calc-tab').forEach((btn) => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.calc-tab-panel').forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== tabId;
    });
}

document.querySelectorAll('.calc-tab').forEach((btn) => {
    btn.addEventListener('click', () => activateCalcTab(btn.dataset.tab));
});

document.getElementById('calculateBtn').addEventListener('click', calculateReturns);
document.getElementById('compareBtn').addEventListener('click', runComparison);
document.getElementById('luckBtn').addEventListener('click', runLuckSimulator);
document.getElementById('retireBtn').addEventListener('click', runRetirementProjector);
document.getElementById('portBtn').addEventListener('click', runPortfolioBuilder);
document.getElementById('taxBtn').addEventListener('click', runTaxComparison);

// Tickers are matched case-sensitively against the datalist and by the backend, so
// normalize whatever the user typed (free text, not just a chosen suggestion) on blur.
const TICKER_INPUT_IDS = [
    'stock', 'compareSymbol1', 'compareSymbol2', 'compareSymbol3',
    'luckStock', 'retireStock', 'portSymbol1', 'portSymbol2', 'portSymbol3', 'portSymbol4', 'taxStock'
];
TICKER_INPUT_IDS.forEach((id) => {
    document.getElementById(id).addEventListener('blur', (e) => {
        e.target.value = e.target.value.trim().toUpperCase();
    });
});

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
    // Free text is allowed now (the backend resolves any valid ticker via yfinance),
    // so set it directly rather than requiring it to be in the suggestion list.
    document.getElementById('stock').value = requestedStock.trim().toUpperCase();
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
