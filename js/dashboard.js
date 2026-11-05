// Market Dashboard (dashboard.html).
// Four tabs over data/stocks.db: Performance & Risk, Inflation & Real Returns, Scenarios,
// Methodology & Data. Numbers come from /api/dashboard/* (server/dashboard_logic.py) and the
// existing /api/retirement-projector, so they match the rest of the app and the Power BI export.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Each ticker keeps one color everywhere on the page (color follows the entity, never its rank).
// Order and hexes are a CVD-validated categorical palette (adjacent-pair checks pass on white).
const TICKER_ORDER = ['SPY', 'QQQ', 'BND', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'];
const TICKER_COLORS = {
    SPY: '#2a78d6', QQQ: '#eb6834', BND: '#1baf7a', AAPL: '#eda100',
    MSFT: '#e87ba4', GOOGL: '#008300', AMZN: '#6250d6'
};
const TICKER_NAMES = {
    SPY: 'S&P 500 ETF', QQQ: 'Nasdaq-100 ETF', BND: 'Total Bond Market ETF', AAPL: 'Apple',
    MSFT: 'Microsoft', GOOGL: 'Alphabet', AMZN: 'Amazon'
};
const C = {
    blend: '#0b1a4d', ink: '#101425', muted: '#5b6178', grid: '#eceef6', axis: '#d5d9ea',
    pos: '#2a78d6', neg: '#e34948', cpi: '#52514e', fanOuter: '#dbe8fb', fanInner: '#a9cbf5',
    fanMid: '#1c5cab', contrib: '#898781', target: '#b38600', frontier: '#a3abc9',
    up: '#1a7f37', down: '#b3261e'
};

const DASH_TABS = [
    { id: 'performance', label: 'Performance & Risk', icon: 'fa-chart-line' },
    { id: 'inflation', label: 'Inflation & Real Returns', icon: 'fa-scale-balanced' },
    { id: 'scenarios', label: 'Scenarios', icon: 'fa-sliders' },
    { id: 'methodology', label: 'Methodology & Data', icon: 'fa-clipboard-check' }
];
const RANGE_PRESETS = [['1Y', 1], ['3Y', 3], ['5Y', 5], ['10Y', 10], ['20Y', 20], ['Max', null]];
const ALLOC_PRESETS = [['5Y', 5], ['10Y', 10], ['15Y', 15], ['Max', null]];
const LUCK_HORIZONS = [1, 5, 10, 20];
const MC_SEED = 42;

const state = {
    tab: 'performance',
    symbols: ['SPY', 'QQQ', 'BND'],
    range: '10Y',
    start: null,
    end: null,
    amount: 10000,
    rf: 2,
    focus: 'SPY',
    log: { growth: false, realGrowth: false },
    alloc: { equity: 'SPY', bond: 'BND', weight: 60, rebalance: 'quarterly', range: 'Max' },
    mc: { symbol: 'SPY', initial: 10000, monthly: 500, years: 30, target: 1000000, method: 'monte_carlo' },
    luck: { horizon: 10 }
};

let meta = null;
let perfData = null;
const charts = {};
const tableSpecs = {};
const requestIds = {};
const loadedTabs = new Set();

// ---------------------------------------------------------------------------
// Formatting & DOM helpers
// ---------------------------------------------------------------------------

const MINUS = '−';

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const fmt = {
    money(v) {
        if (v == null) return '–';
        const s = '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
        return v < 0 ? MINUS + s : s;
    },
    moneyShort(v) {
        if (v == null) return '–';
        const a = Math.abs(v);
        let s;
        if (a >= 1e9) s = (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
        else if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
        else if (a >= 1e3) s = (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
        else s = a.toFixed(0);
        return (v < 0 ? MINUS : '') + '$' + s;
    },
    pct(v, digits = 1, signed = false) {
        if (v == null) return '–';
        const sign = v < 0 ? MINUS : (signed && v > 0 ? '+' : '');
        return sign + Math.abs(v).toFixed(digits) + '%';
    },
    num(v, digits = 2) {
        if (v == null) return '–';
        return (v < 0 ? MINUS : '') + Math.abs(v).toFixed(digits);
    },
    date(iso) {
        if (!iso) return '–';
        return new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US',
            { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    },
    month(ym) {
        if (!ym) return '–';
        return new Date(ym.slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-US',
            { month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
};

function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

function shiftYears(iso, years) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.toISOString().slice(0, 10);
}

function colorFor(symbol) {
    return TICKER_COLORS[symbol] || C.muted;
}

function orderedSymbols(list) {
    return [...list].sort((a, b) => {
        const ia = TICKER_ORDER.indexOf(a), ib = TICKER_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
}

function availableSymbols() {
    return orderedSymbols((meta?.tickers || []).map(t => t.symbol));
}

function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function api(path, options) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, options);
    } catch (e) {
        throw new Error(`Can't reach the API at ${API_BASE_URL}. Start it with: python server/app.py`);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
}

// Drops responses that arrive after a newer request for the same key was sent.
async function latest(key, promiseFactory) {
    const id = (requestIds[key] || 0) + 1;
    requestIds[key] = id;
    const result = await promiseFactory();
    if (requestIds[key] !== id) throw new DOMException('stale', 'AbortError');
    return result;
}

function setLoading(scope, on) {
    document.querySelectorAll(`[data-loading-scope="${scope}"]`).forEach(el => el.classList.toggle('is-loading', on));
}

function showError(scope, message) {
    const box = document.getElementById(`error-${scope}`);
    if (!box) return;
    box.hidden = !message;
    box.querySelector('span').textContent = message || '';
}

// ---------------------------------------------------------------------------
// Markup builders
// ---------------------------------------------------------------------------

function errorBox(scope) {
    return `<div class="dash-error" id="error-${scope}" role="alert" hidden><i class="fas fa-circle-exclamation"></i><span></span></div>`;
}

function segmented(id, options, active, label) {
    return `<div class="dash-seg" id="${id}" role="group" aria-label="${esc(label)}">${options.map(([text, value]) => `
        <button type="button" data-value="${esc(value ?? text)}" aria-pressed="${String(text) === String(active)}">${esc(text)}</button>`).join('')}
    </div>`;
}

function chartBlock(id, title, desc, { log = false, tall = false } = {}) {
    return `
        <div class="dash-chart-block">
            <div class="dash-card-head">
                <div>
                    <h3 id="title-${id}">${title}</h3>
                    ${desc ? `<p id="desc-${id}">${desc}</p>` : ''}
                </div>
                <div class="dash-card-actions">
                    ${log ? `<button type="button" class="dash-ghost-btn" data-log-toggle="${id}" aria-pressed="false">Log scale</button>` : ''}
                    <button type="button" class="dash-ghost-btn" data-table-toggle="${id}" aria-expanded="false" aria-controls="table-${id}">
                        <i class="fas fa-table"></i> View data
                    </button>
                </div>
            </div>
            <div class="dash-chart${tall ? ' dash-chart-tall' : ''}"><canvas id="chart-${id}" role="img" aria-label="${esc(title)}"></canvas></div>
            <div class="dash-table-view" id="table-${id}" hidden></div>
        </div>`;
}

function chartCard(id, title, desc, opts) {
    return `<div class="dash-card" data-loading-scope="${opts.scope}">${chartBlock(id, title, desc, opts)}</div>`;
}

function tile(label, value, sub = '', tone = '') {
    return `
        <div class="dash-tile${tone ? ' dash-tile-' + tone : ''}">
            <span class="dash-tile-label">${label}</span>
            <span class="dash-tile-value">${value}</span>
            ${sub ? `<span class="dash-tile-sub">${sub}</span>` : ''}
        </div>`;
}

function delta(value, unit, betterWhenHigher = true, digits = 1) {
    if (value == null) return '';
    const good = betterWhenHigher ? value >= 0 : value <= 0;
    const icon = value === 0 ? 'fa-minus' : (value > 0 ? 'fa-arrow-up' : 'fa-arrow-down');
    const text = (value < 0 ? MINUS : value > 0 ? '+' : '') + Math.abs(value).toFixed(digits) + unit;
    return `<span class="dash-delta ${good ? 'is-good' : 'is-bad'}"><i class="fas ${icon}"></i> ${text}</span>`;
}

function insight(icon, label, html) {
    return `<div class="dash-insight"><i class="fas ${icon}"></i><div><span class="dash-insight-label">${label}</span><p>${html}</p></div></div>`;
}

function renderPage() {
    const tabsHtml = DASH_TABS.map(t => `
        <button type="button" class="dash-tab${t.id === state.tab ? ' active' : ''}" role="tab" id="tab-${t.id}"
                aria-selected="${t.id === state.tab}" aria-controls="panel-${t.id}" data-tab="${t.id}">
            <i class="fas ${t.icon}"></i> ${t.label}
        </button>`).join('');

    return `
    <div class="dash-page">
        <header class="dash-hero">
            <div class="dash-hero-inner">
                <div class="dash-hero-text">
                    <span class="dash-eyebrow"><i class="fas fa-chart-pie"></i> Market Dashboard</span>
                    <h1>Risk, return and what-if scenarios</h1>
                    <p>How stocks, ETFs and bonds actually behaved: growth, drawdowns, inflation drag, and how allocation and timing change the outcome.</p>
                </div>
                <div class="dash-hero-meta" id="heroMeta">
                    <span class="dash-pill"><i class="fas fa-circle-notch fa-spin"></i> Loading data status</span>
                </div>
            </div>
        </header>

        <div class="dash-shell">
            <div class="dash-tabs" role="tablist" aria-label="Dashboard sections">${tabsHtml}</div>

            <div class="dash-filters" id="globalFilters" aria-label="Filters for Performance and Inflation tabs">
                <div class="dash-filter-group dash-filter-wide">
                    <span class="dash-filter-label">Tickers</span>
                    <div class="dash-chips" id="tickerChips"></div>
                </div>
                <div class="dash-filter-group">
                    <span class="dash-filter-label">Period</span>
                    ${segmented('rangeSeg', RANGE_PRESETS, state.range, 'Period presets')}
                </div>
                <div class="dash-filter-group">
                    <span class="dash-filter-label">Custom dates</span>
                    <div class="dash-dates">
                        <input type="date" id="startDate" aria-label="Start date">
                        <span>to</span>
                        <input type="date" id="endDate" aria-label="End date">
                    </div>
                </div>
                <div class="dash-filter-group">
                    <label class="dash-filter-label" for="amountInput">Start amount</label>
                    <input type="number" id="amountInput" min="1" step="1000" value="${state.amount}">
                </div>
                <div class="dash-filter-group">
                    <label class="dash-filter-label" for="rfInput">Risk-free %</label>
                    <input type="number" id="rfInput" min="0" max="20" step="0.25" value="${state.rf}">
                </div>
                <p class="dash-window-note" id="windowNote"></p>
            </div>

            <section class="dash-panel" id="panel-performance" role="tabpanel" aria-labelledby="tab-performance" data-panel="performance">
                ${errorBox('perf')}
                <div class="dash-insights" id="perfInsights" data-loading-scope="perf"></div>
                <div class="dash-card" data-loading-scope="perf">
                    <div class="dash-card-head">
                        <div>
                            <h3>KPI scorecard</h3>
                            <p>Dividends reinvested. <span class="dash-best-key"></span> marks the best value in each column.</p>
                        </div>
                    </div>
                    <div class="dash-table-scroll" id="scorecard"></div>
                </div>
                ${chartCard('growth', 'Growth of $10,000', 'Value of the starting amount, month-end closes. Shaded bands are US recessions.', { scope: 'perf', log: true, tall: true })}
                ${chartCard('drawdown', 'Drawdown from peak', 'How far each ticker sat below its previous high. Worst daily close in each month.', { scope: 'perf' })}
            </section>

            <section class="dash-panel" id="panel-inflation" role="tabpanel" aria-labelledby="tab-inflation" data-panel="inflation" hidden>
                ${errorBox('infl')}
                <div class="dash-insights" id="inflInsights" data-loading-scope="perf"></div>
                <div class="dash-card" data-loading-scope="perf">
                    <div class="dash-card-head">
                        <div>
                            <h3>Nominal vs real returns</h3>
                            <p>Real values are restated in start-date dollars using CPI-U.</p>
                        </div>
                    </div>
                    <div class="dash-table-scroll" id="realScorecard"></div>
                </div>
                ${chartCard('realGrowth', 'Growth of $10,000 in start-date dollars', 'Purchasing power of the starting amount after inflation.', { scope: 'perf', log: true, tall: true })}
                <div class="dash-subfilters">
                    <label class="dash-filter-label" for="focusSelect">Calendar-year returns for</label>
                    <select id="focusSelect"></select>
                </div>
                <div class="dash-grid-2">
                    ${chartCard('annual', 'Calendar-year real return', 'Blue years beat inflation, red years lost purchasing power. * marks a partial year.', { scope: 'perf' })}
                    ${chartCard('cpi', 'CPI inflation, year over year', 'Consumer Price Index (CPI-U, FRED CPIAUCSL).', { scope: 'perf' })}
                </div>
                ${chartCard('rollingVol', 'Rolling 12-month volatility', 'Annualized volatility of the trailing 252 trading days.', { scope: 'perf' })}
            </section>

            <section class="dash-panel" id="panel-scenarios" role="tabpanel" aria-labelledby="tab-scenarios" data-panel="scenarios" hidden>
                <div class="dash-section-title">
                    <span>Scenario 1</span>
                    <h2>Stock / bond allocation what-if</h2>
                    <p>Drag the slider to change the mix. The portfolio is rebalanced back to target on the schedule you pick.</p>
                </div>
                <div class="dash-card" data-loading-scope="alloc">
                    <div class="dash-controls">
                        <label>Growth asset<select id="allocEquity"></select></label>
                        <label>Defensive asset<select id="allocBond"></select></label>
                        <label class="dash-slider">
                            <span>Mix <output id="allocWeightOut"></output></span>
                            <input type="range" id="allocWeight" min="0" max="100" step="5" value="${state.alloc.weight}">
                        </label>
                        <label>Rebalance
                            <select id="allocRebalance">
                                <option value="quarterly">Quarterly</option>
                                <option value="annual">Annually</option>
                                <option value="none">Never</option>
                            </select>
                        </label>
                        <div class="dash-control-group">
                            <span>Period</span>
                            ${segmented('allocRangeSeg', ALLOC_PRESETS, state.alloc.range, 'Allocation period')}
                        </div>
                    </div>
                    ${errorBox('alloc')}
                    <p class="dash-window-note" id="allocNote"></p>
                    <div class="dash-tiles" id="allocTiles"></div>
                    <div class="dash-grid-2-1">
                        ${chartBlock('alloc', 'Growth of $10,000', 'Your mix against holding either asset alone.')}
                        ${chartBlock('frontier', 'Risk vs return by mix', 'Each dot is a mix in 10% steps. The ringed dot is your mix.')}
                    </div>
                </div>

                <div class="dash-section-title">
                    <span>Scenario 2</span>
                    <h2>Monte Carlo retirement projection</h2>
                    <p>1,000 simulated futures built by resampling real historical daily returns. Seeded, so the same inputs always give the same answer.</p>
                </div>
                <div class="dash-card" data-loading-scope="mc">
                    <div class="dash-controls">
                        <label>Invest in<select id="mcSymbol"></select></label>
                        <label>Start with<input type="number" id="mcInitial" min="1" step="1000" value="${state.mc.initial}"></label>
                        <label>Add monthly<input type="number" id="mcMonthly" min="0" step="100" value="${state.mc.monthly}"></label>
                        <label>Years
                            <select id="mcYears">${[10, 15, 20, 25, 30].map(y => `<option value="${y}"${y === state.mc.years ? ' selected' : ''}>${y}</option>`).join('')}</select>
                        </label>
                        <label>Target<input type="number" id="mcTarget" min="1" step="50000" value="${state.mc.target}"></label>
                        <label>Method
                            <select id="mcMethod">
                                <option value="monte_carlo">Random resampling</option>
                                <option value="historical_rolling">Historical sequences</option>
                            </select>
                        </label>
                    </div>
                    ${errorBox('mc')}
                    <div class="dash-tiles" id="mcTiles"></div>
                    ${chartBlock('mc', 'Range of outcomes', 'Bands show where the middle 50% and 80% of simulated paths ended up each year.', { tall: true })}
                </div>

                <div class="dash-section-title">
                    <span>Scenario 3</span>
                    <h2>Start-date luck</h2>
                    <p>Every possible start month for the S&amp;P 500 since 1927. How much does timing matter, and how does holding longer narrow the range?</p>
                </div>
                <div class="dash-card" data-loading-scope="luck">
                    <div class="dash-controls">
                        <div class="dash-control-group">
                            <span>Holding period</span>
                            ${segmented('luckSeg', LUCK_HORIZONS.map(h => [`${h} yr`, h]), `${state.luck.horizon} yr`, 'Holding period')}
                        </div>
                    </div>
                    ${errorBox('luck')}
                    <div class="dash-tiles" id="luckTiles"></div>
                    ${chartBlock('luck', 'Distribution of annualized returns', 'Count of start months by annualized price return. Price index only, so dividends are excluded.')}
                </div>
            </section>

            <section class="dash-panel" id="panel-methodology" role="tabpanel" aria-labelledby="tab-methodology" data-panel="methodology" hidden>
                <div class="dash-grid-2">
                    <div class="dash-card" id="reconCard"></div>
                    <div class="dash-card">
                        <div class="dash-card-head"><div><h3>Data coverage</h3><p>Daily prices by ticker, from Yahoo Finance.</p></div></div>
                        <div class="dash-table-scroll" id="coverageTable"></div>
                    </div>
                </div>
                <div class="dash-card">
                    <div class="dash-card-head"><div><h3>Data quality checks</h3><p>Run live against the database every time this page loads.</p></div></div>
                    <div class="dash-table-scroll" id="dqTable"></div>
                </div>
                <div class="dash-card">
                    <div class="dash-card-head"><div><h3>KPI definitions</h3><p>One definition per KPI, shared by this dashboard, the API and the Power BI export.</p></div></div>
                    <div class="dash-table-scroll" id="kpiTable"></div>
                </div>
                <div class="dash-card">
                    <div class="dash-card-head"><div><h3>Reproduce these numbers</h3><p>Everything here is rebuilt from <code>data/stocks.db</code> with three commands.</p></div></div>
                    <ol class="dash-steps">
                        <li><code>python server/app.py</code> serves this dashboard's API.</li>
                        <li><code>python scripts/export_powerbi.py</code> writes the CSV snapshot in <code>powerbi_export/</code> for Power BI or Excel.</li>
                        <li><code>python scripts/reconcile_kpis.py</code> checks the KPI math against the original calculator and portfolio engines.</li>
                    </ol>
                </div>
            </section>
        </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

const crosshairPlugin = {
    id: 'dashCrosshair',
    afterDatasetsDraw(chart, args, opts) {
        if (!opts || !opts.enabled) return;
        const active = chart.tooltip && chart.tooltip.getActiveElements();
        if (!active || !active.length) return;
        const x = active[0].element.x;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.strokeStyle = 'rgba(16, 20, 37, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
    }
};

function setupChartDefaults() {
    Chart.register(crosshairPlugin);
    Chart.defaults.font.family = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = C.muted;
    Chart.defaults.animation.duration = 350;
}

function tooltipStyle() {
    return {
        backgroundColor: '#ffffff',
        titleColor: C.ink,
        bodyColor: C.ink,
        footerColor: C.muted,
        borderColor: 'rgba(11, 26, 77, 0.14)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        boxPadding: 6,
        usePointStyle: true,
        titleFont: { weight: '600' },
        bodyFont: { weight: '500' }
    };
}

function axisStyle(extra = {}) {
    return {
        grid: { color: C.grid, drawTicks: false },
        border: { color: C.axis },
        ticks: { padding: 8, color: C.muted, ...(extra.ticks || {}) },
        ...extra
    };
}

function lineDataset(label, data, color, extra = {}) {
    return {
        label, data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHitRadius: 12,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        pointStyle: 'line',
        tension: 0,
        spanGaps: true,
        ...extra
    };
}

function timeLineOptions({ yTick, tooltipValue, log = false, recession = true, legend = true, yMax, yMin }) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
            x: axisStyle({ ticks: { autoSkip: false, maxRotation: 0, callback: timeTick } }),
            y: axisStyle({ type: log ? 'logarithmic' : 'linear', max: yMax, min: yMin, ticks: { callback: yTick, maxTicksLimit: 7 } })
        },
        plugins: {
            legend: { display: legend, position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 24, padding: 16, color: C.ink } },
            tooltip: {
                ...tooltipStyle(),
                callbacks: {
                    title: items => fmt.date(items[0].label),
                    label: item => ` ${tooltipValue(item.parsed.y)}  ${item.dataset.label}`
                },
                itemSort: (a, b) => (b.parsed.y ?? -Infinity) - (a.parsed.y ?? -Infinity)
            },
            recessionShading: { enabled: recession },
            dashCrosshair: { enabled: true }
        }
    };
}

// Evenly spaced x ticks for date labels: one tick per year boundary (every Nth year on long
// ranges), or per month boundary on short ranges. Null hides the tick and its gridline.
function timeTick(value, index) {
    const labels = this.chart.data.labels;
    const label = labels[index];
    if (!label || index === 0) return null;
    const span = (new Date(labels[labels.length - 1]) - new Date(labels[0])) / (365.25 * 86400000);
    const prev = labels[index - 1];
    if (span < 3) {
        if (prev.slice(0, 7) === label.slice(0, 7)) return null;
        const step = span < 1.5 ? 2 : 4;
        return (parseInt(label.slice(5, 7), 10) - 1) % step === 0 ? fmt.month(label) : null;
    }
    if (prev.slice(0, 4) === label.slice(0, 4)) return null;
    const step = Math.max(1, Math.ceil(span / 8));
    return parseInt(label.slice(0, 4), 10) % step === 0 ? label.slice(0, 4) : null;
}

function upsertChart(id, config) {
    const canvas = document.getElementById(`chart-${id}`);
    if (!canvas) return;
    const existing = charts[id];
    if (existing && existing.config.type === config.type) {
        existing.data = config.data;
        existing.options = config.options;
        existing.update();
        return;
    }
    if (existing) existing.destroy();
    charts[id] = new Chart(canvas.getContext('2d'), config);
}

// --- Table views (every chart has one, so no value is only reachable by hover) ---

function setTable(id, headers, rows) {
    tableSpecs[id] = { headers, rows };
    const box = document.getElementById(`table-${id}`);
    if (box && !box.hidden) renderTable(id);
}

function renderTable(id) {
    const box = document.getElementById(`table-${id}`);
    const spec = tableSpecs[id];
    if (!box || !spec) return;
    const table = document.createElement('table');
    table.className = 'dash-table dash-table-compact';
    const thead = table.createTHead().insertRow();
    spec.headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        thead.appendChild(th);
    });
    const tbody = table.createTBody();
    spec.rows.forEach(r => {
        const tr = tbody.insertRow();
        r.forEach(cell => { tr.insertCell().textContent = cell; });
    });
    box.replaceChildren(table);
}

function seriesTable(id, dates, seriesByLabel, format, dateFormat = fmt.date) {
    const labels = Object.keys(seriesByLabel);
    setTable(id, ['Date', ...labels], dates.map((d, i) => [dateFormat(d), ...labels.map(l => format(seriesByLabel[l][i]))]));
}

// ---------------------------------------------------------------------------
// Meta, hero and methodology
// ---------------------------------------------------------------------------

async function loadMeta() {
    meta = await api('/api/dashboard/meta');
    const available = availableSymbols();
    state.symbols = state.symbols.filter(s => available.includes(s));
    if (!state.symbols.length) state.symbols = available.slice(0, 3);
    renderHeroMeta();
    renderChips();
    renderScenarioSelects();
    renderMethodology();
}

function renderHeroMeta() {
    const dq = meta.data_quality;
    const passed = dq.filter(c => c.status === 'pass').length;
    const notes = dq.length - passed;
    const recon = meta.reconciliation;
    document.getElementById('heroMeta').innerHTML = `
        <span class="dash-pill"><i class="fas fa-calendar-check"></i> Data through ${fmt.date(meta.as_of)}</span>
        <span class="dash-pill"><i class="fas fa-database"></i> ${meta.daily_rows.toLocaleString('en-US')} daily prices, ${meta.tickers.length} tickers</span>
        <button type="button" class="dash-pill dash-pill-btn" data-goto-tab="methodology">
            <i class="fas fa-shield-halved"></i> ${passed} checks passed, ${notes} documented note${notes === 1 ? '' : 's'}
        </button>
        ${recon ? `<button type="button" class="dash-pill dash-pill-btn" data-goto-tab="methodology">
            <i class="fas fa-scale-balanced"></i> ${recon.comparisons} KPIs reconciled, max diff ${fmt.num(recon.max_diff_bps, 2)} bps
        </button>` : ''}`;
}

function renderChips() {
    const box = document.getElementById('tickerChips');
    box.innerHTML = availableSymbols().map(s => `
        <button type="button" class="dash-chip" data-symbol="${esc(s)}" aria-pressed="${state.symbols.includes(s)}"
                style="--chip-color: ${colorFor(s)}" title="${esc(TICKER_NAMES[s] || s)}">
            <span class="dash-swatch"></span>${esc(s)}
        </button>`).join('');
}

function optionsHtml(symbols, selected) {
    return symbols.map(s => `<option value="${esc(s)}"${s === selected ? ' selected' : ''}>${esc(s)}${TICKER_NAMES[s] ? ' · ' + esc(TICKER_NAMES[s]) : ''}</option>`).join('');
}

function renderScenarioSelects() {
    const all = availableSymbols();
    document.getElementById('allocEquity').innerHTML = optionsHtml(all, state.alloc.equity);
    document.getElementById('allocBond').innerHTML = optionsHtml(all, state.alloc.bond);
    document.getElementById('allocRebalance').value = state.alloc.rebalance;
    document.getElementById('mcSymbol').innerHTML = optionsHtml(all, state.mc.symbol);
    document.getElementById('mcMethod').value = state.mc.method;
}

function renderMethodology() {
    const recon = meta.reconciliation;
    document.getElementById('reconCard').innerHTML = `
        <div class="dash-card-head"><div><h3>Reconciliation</h3><p>Dashboard math checked against the app's original engines.</p></div></div>
        ${recon ? `
        <div class="dash-tiles dash-tiles-2">
            ${tile('KPI comparisons', recon.comparisons.toLocaleString('en-US'), `${recon.cases} test cases`)}
            ${tile('Largest difference', `${fmt.num(recon.max_diff_bps, 2)} bps`, 'at 2-decimal reporting precision', recon.max_diff_bps <= 1 ? 'good' : 'bad')}
        </div>
        <p class="dash-muted">Compared against ${recon.engines.map(e => `<code>${esc(e)}</code>`).join(' and ')}: total return, CAGR, volatility, Sharpe and max drawdown, across single tickers and rebalanced two-asset portfolios. Details in <code>powerbi_export/reconciliation.csv</code>.</p>`
        : '<p class="dash-muted">Run <code>python scripts/reconcile_kpis.py</code> to generate the reconciliation report.</p>'}
        <div class="dash-sources">
            <h4>Sources</h4>
            <ul>
                <li><strong>Prices:</strong> Yahoo Finance daily OHLCV and adjusted close, via yfinance.</li>
                <li><strong>Inflation:</strong> CPI-U (FRED CPIAUCSL), monthly, through ${fmt.month(meta.cpi_as_of)}.</li>
                <li><strong>Long history:</strong> S&amp;P 500 price index from 1927, extended with ^GSPC.</li>
                <li><strong>News archive:</strong> ${meta.news_headlines_stored.toLocaleString('en-US')} headlines stored from /api/news.</li>
            </ul>
        </div>`;

    const coverage = orderedSymbols(meta.tickers.map(t => t.symbol)).map(s => meta.tickers.find(t => t.symbol === s));
    document.getElementById('coverageTable').innerHTML = `
        <table class="dash-table">
            <thead><tr><th>Ticker</th><th>Type</th><th class="num">First date</th><th class="num">Last date</th><th class="num">Trading days</th></tr></thead>
            <tbody>${coverage.map(t => `
                <tr><td><span class="dash-ticker"><span class="dash-swatch" style="--chip-color:${colorFor(t.symbol)}"></span>${esc(t.symbol)}</span></td>
                    <td class="dash-nowrap">${esc(t.asset_class)}</td><td class="num">${fmt.date(t.first_date)}</td><td class="num">${fmt.date(t.last_date)}</td>
                    <td class="num">${Number(t.trading_days).toLocaleString('en-US')}</td></tr>`).join('')}
            </tbody>
        </table>`;

    document.getElementById('dqTable').innerHTML = `
        <table class="dash-table">
            <thead><tr><th>Status</th><th>Check</th><th class="num">Rows</th><th>Note</th></tr></thead>
            <tbody>${meta.data_quality.map(c => `
                <tr><td><span class="dash-status dash-status-${c.status}"><i class="fas ${c.status === 'pass' ? 'fa-circle-check' : 'fa-circle-info'}"></i> ${c.status === 'pass' ? 'Pass' : 'Note'}</span></td>
                    <td>${esc(c.check)}</td><td class="num">${Number(c.rows_affected).toLocaleString('en-US')}</td><td class="dash-muted">${esc(c.note)}</td></tr>`).join('')}
            </tbody>
        </table>`;

    document.getElementById('kpiTable').innerHTML = `
        <table class="dash-table">
            <thead><tr><th>KPI</th><th>Definition</th><th>Consistent with</th></tr></thead>
            <tbody>${meta.kpi_definitions.map(k => `
                <tr><td><strong>${esc(k.kpi)}</strong></td><td>${esc(k.definition)}</td><td class="dash-muted">${esc(k.consistency)}</td></tr>`).join('')}
            </tbody>
        </table>`;
}

// ---------------------------------------------------------------------------
// Performance + Inflation (one request feeds both tabs)
// ---------------------------------------------------------------------------

function perfWindow() {
    if (state.range === 'custom') return { start: state.start, end: state.end };
    const preset = RANGE_PRESETS.find(([label]) => label === state.range);
    const years = preset ? preset[1] : null;
    return { start: years ? shiftYears(meta.as_of, years) : null, end: null };
}

async function loadPerformance() {
    if (!meta) return;
    const { start, end } = perfWindow();
    const params = new URLSearchParams({ symbols: orderedSymbols(state.symbols).join(','), amount: state.amount, rf: state.rf });
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    setLoading('perf', true);
    try {
        perfData = await latest('perf', () => api(`/api/dashboard/performance?${params}`));
        showError('perf', '');
        showError('infl', '');
        renderPerformance(perfData);
        renderInflation(perfData);
    } catch (e) {
        if (e.name === 'AbortError') return;
        showError('perf', e.message);
        showError('infl', e.message);
    } finally {
        setLoading('perf', false);
    }
    syncUrl();
}

function renderWindowNote(win) {
    const years = daysBetween(win.start, win.end) / 365.25;
    let text = `Showing ${fmt.date(win.start)} to ${fmt.date(win.end)} (${years.toFixed(1)} years, ${win.trading_days.toLocaleString('en-US')} trading days).`;
    if (win.clipped_by) text += ` Starts when ${win.clipped_by} data begins, so every ticker covers the same dates.`;
    document.getElementById('windowNote').textContent = text;
    document.getElementById('startDate').value = win.start;
    document.getElementById('endDate').value = win.end;
    document.getElementById('startDate').min = document.getElementById('endDate').min = '1980-01-01';
    document.getElementById('startDate').max = document.getElementById('endDate').max = meta.as_of;
}

function bestBy(kpis, key, higher = true) {
    const vals = kpis.filter(k => k[key] != null);
    if (!vals.length) return null;
    return vals.reduce((best, k) => (higher ? k[key] > best[key] : k[key] < best[key]) ? k : best);
}

function tickerLabel(symbol) {
    return `<span class="dash-ticker"><span class="dash-swatch" style="--chip-color:${colorFor(symbol)}"></span><strong>${esc(symbol)}</strong></span>`;
}

function renderPerformance(data) {
    const { kpis, series, window: win, amount } = data;
    renderWindowNote(win);
    const amountText = fmt.money(amount);

    // Insights
    const n = kpis.length;
    const top = bestBy(kpis, 'final_value');
    const sharpe = bestBy(kpis, 'sharpe');
    const deepest = bestBy(kpis, 'max_drawdown_pct', false);
    const insights = [];
    insights.push(insight('fa-trophy', n > 1 ? 'Highest growth' : 'Growth',
        `${tickerLabel(top.symbol)} turned ${amountText} into <strong>${fmt.money(top.final_value)}</strong>${n > 1 ? `, the most of the ${n} tickers` : ''}: ${fmt.pct(top.cagr_pct, 1)} a year.`));
    if (n > 1) {
        const others = kpis.filter(k => k !== sharpe && k.sharpe != null).sort((a, b) => b.sharpe - a.sharpe);
        insights.push(insight('fa-scale-balanced', 'Best risk-adjusted',
            `${tickerLabel(sharpe.symbol)} earned the most per unit of risk: Sharpe <strong>${fmt.num(sharpe.sharpe)}</strong>${others.length ? ` vs ${others.slice(0, 2).map(k => `${esc(k.symbol)} ${fmt.num(k.sharpe)}`).join(', ')}` : ''}.`));
    } else {
        insights.push(insight('fa-calendar', 'Best and worst year',
            `Best: <strong>${top.best_year ? `${top.best_year[0]} ${fmt.pct(top.best_year[1], 1, true)}` : '–'}</strong>. Worst: <strong>${top.worst_year ? `${top.worst_year[0]} ${fmt.pct(top.worst_year[1], 1, true)}` : '–'}</strong>.`));
    }
    const underwater = deepest.recovery_date ? Math.round(daysBetween(deepest.drawdown_peak_date, deepest.recovery_date) / 30.44) : null;
    insights.push(insight('fa-arrow-trend-down', n > 1 ? 'Deepest fall' : 'Worst fall',
        `${tickerLabel(deepest.symbol)} fell <strong>${fmt.pct(deepest.max_drawdown_pct, 1)}</strong> from its peak by ${fmt.date(deepest.max_drawdown_date)}${deepest.recovery_date ? ` and took ${underwater} months to get back to that peak` : ', and has not recovered that peak yet'}.`));
    document.getElementById('perfInsights').innerHTML = insights.join('');

    // Scorecard
    const best = {
        final_value: bestBy(kpis, 'final_value'), cagr_pct: bestBy(kpis, 'cagr_pct'),
        volatility_pct: bestBy(kpis, 'volatility_pct', false), sharpe: bestBy(kpis, 'sharpe'),
        max_drawdown_pct: bestBy(kpis, 'max_drawdown_pct')
    };
    const mark = (k, key, html) => (n > 1 && best[key] === k) ? `<span class="dash-best">${html}</span>` : html;
    document.getElementById('scorecard').innerHTML = `
        <table class="dash-table">
            <thead><tr>
                <th>Ticker</th><th class="num">Final value</th><th class="num">Total return</th><th class="num">CAGR</th>
                <th class="num">Volatility</th><th class="num">Sharpe</th><th class="num">Max drawdown</th><th class="num">Back to peak</th>
            </tr></thead>
            <tbody>${kpis.map(k => `
                <tr>
                    <td>${tickerLabel(k.symbol)}<span class="dash-ticker-name">${esc(TICKER_NAMES[k.symbol] || '')}</span></td>
                    <td class="num">${mark(k, 'final_value', fmt.money(k.final_value))}</td>
                    <td class="num">${fmt.pct(k.total_return_pct, 1, true)}</td>
                    <td class="num">${mark(k, 'cagr_pct', fmt.pct(k.cagr_pct, 2))}</td>
                    <td class="num">${mark(k, 'volatility_pct', fmt.pct(k.volatility_pct, 1))}</td>
                    <td class="num">${mark(k, 'sharpe', fmt.num(k.sharpe))}</td>
                    <td class="num">${mark(k, 'max_drawdown_pct', fmt.pct(k.max_drawdown_pct, 1))}<span class="dash-cell-sub">${fmt.date(k.max_drawdown_date)}</span></td>
                    <td class="num">${k.recovery_date ? fmt.date(k.recovery_date) : '<span class="dash-muted">Not yet</span>'}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;

    // Growth chart
    document.getElementById('title-growth').textContent = `Growth of ${amountText}`;
    const growthDatasets = data.symbols.map(s => lineDataset(s, series.growth[s], colorFor(s)));
    upsertChart('growth', {
        type: 'line',
        data: { labels: series.dates, datasets: growthDatasets },
        options: timeLineOptions({ yTick: v => fmt.moneyShort(v), tooltipValue: fmt.money, log: state.log.growth, legend: n > 1 })
    });
    seriesTable('growth', series.dates, series.growth, fmt.money);

    // Drawdown chart
    const ddDatasets = data.symbols.map(s => lineDataset(s, series.drawdown[s], colorFor(s), n === 1
        ? { fill: 'origin', backgroundColor: hexA(colorFor(s), 0.14) } : {}));
    upsertChart('drawdown', {
        type: 'line',
        data: { labels: series.dates, datasets: ddDatasets },
        options: timeLineOptions({ yTick: v => fmt.pct(v, 0), tooltipValue: v => fmt.pct(v, 1), legend: n > 1, yMax: 0 })
    });
    seriesTable('drawdown', series.dates, series.drawdown, v => fmt.pct(v, 1));
}

function hexA(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function renderInflation(data) {
    const { kpis, series, inflation, amount } = data;
    const amountText = fmt.money(amount);
    const n = kpis.length;

    // Insights
    const drag = kpis.map(k => ({ ...k, drag: k.cagr_pct != null && k.real_cagr_pct != null ? k.cagr_pct - k.real_cagr_pct : null }));
    const ref = drag[0];
    const losers = drag.filter(k => k.real_cagr_pct != null && k.real_cagr_pct < 0);
    const bestReal = bestBy(drag, 'real_cagr_pct');
    const insights = [
        insight('fa-fire-flame-curved', 'Inflation drag',
            `Inflation cost about <strong>${fmt.num(ref.drag, 1)} points a year</strong>: ${tickerLabel(ref.symbol)} returned ${fmt.pct(ref.cagr_pct, 1)} nominal but ${fmt.pct(ref.real_cagr_pct, 1)} after inflation.`),
        insight('fa-coins', 'Purchasing power',
            `In start-date dollars, ${tickerLabel(bestReal.symbol)} turned ${amountText} into <strong>${fmt.money(bestReal.final_value_real)}</strong> of real buying power${n > 1 ? ', the most of the group' : ''}.`)
    ];
    insights.push(losers.length
        ? insight('fa-triangle-exclamation', 'Lost to inflation',
            `${losers.map(k => tickerLabel(k.symbol)).join(', ')} had a <strong>negative real return</strong> (${losers.map(k => fmt.pct(k.real_cagr_pct, 1)).join(', ')} a year): ${losers.length === 1 ? 'it' : 'they'} grew in dollars but bought less.`)
        : insight('fa-circle-check', 'Beat inflation', 'Every selected ticker grew faster than prices over this window.'));
    document.getElementById('inflInsights').innerHTML = insights.join('');

    document.getElementById('realScorecard').innerHTML = `
        <table class="dash-table">
            <thead><tr><th>Ticker</th><th class="num">Nominal CAGR</th><th class="num">Real CAGR</th><th class="num">Inflation drag</th>
                <th class="num">Final value</th><th class="num">Final value, start-date $</th></tr></thead>
            <tbody>${drag.map(k => `
                <tr><td>${tickerLabel(k.symbol)}</td><td class="num">${fmt.pct(k.cagr_pct, 2)}</td><td class="num">${fmt.pct(k.real_cagr_pct, 2)}</td>
                    <td class="num">${k.drag == null ? '–' : fmt.num(k.drag, 2) + ' pts/yr'}</td>
                    <td class="num">${fmt.money(k.final_value)}</td><td class="num">${fmt.money(k.final_value_real)}</td></tr>`).join('')}
            </tbody>
        </table>`;

    // Real growth
    document.getElementById('title-realGrowth').textContent = `Growth of ${amountText} in start-date dollars`;
    upsertChart('realGrowth', {
        type: 'line',
        data: { labels: series.dates, datasets: data.symbols.map(s => lineDataset(s, series.growth_real[s], colorFor(s))) },
        options: timeLineOptions({ yTick: v => fmt.moneyShort(v), tooltipValue: fmt.money, log: state.log.realGrowth, legend: n > 1 })
    });
    seriesTable('realGrowth', series.dates, series.growth_real, fmt.money);

    // Focus selector + calendar-year real returns
    if (!data.symbols.includes(state.focus)) state.focus = data.symbols[0];
    document.getElementById('focusSelect').innerHTML = optionsHtml(data.symbols, state.focus);
    renderAnnual();

    // CPI YoY
    upsertChart('cpi', {
        type: 'line',
        data: { labels: inflation.dates, datasets: [lineDataset('CPI year over year', inflation.yoy_pct, C.cpi, { fill: 'origin', backgroundColor: hexA(C.cpi, 0.08) })] },
        options: timeLineOptions({ yTick: v => fmt.pct(v, 0), tooltipValue: v => fmt.pct(v, 1), legend: false })
    });
    seriesTable('cpi', inflation.dates, { 'CPI YoY': inflation.yoy_pct }, v => fmt.pct(v, 2), fmt.month);

    // Rolling volatility
    upsertChart('rollingVol', {
        type: 'line',
        data: { labels: series.dates, datasets: data.symbols.map(s => lineDataset(s, series.rolling_vol[s], colorFor(s))) },
        options: timeLineOptions({ yTick: v => fmt.pct(v, 0), tooltipValue: v => fmt.pct(v, 1), legend: n > 1, yMin: 0 })
    });
    seriesTable('rollingVol', series.dates, series.rolling_vol, v => fmt.pct(v, 1));
}

function renderAnnual() {
    if (!perfData) return;
    const { annual } = perfData;
    const s = state.focus;
    const real = annual.real[s], nominal = annual.nominal[s];
    const labels = annual.years.map((y, i) => annual.partial[i] ? `${y}*` : y);
    document.getElementById('title-annual').textContent = `Calendar-year real return: ${s}`;
    upsertChart('annual', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: `${s} real return`,
                data: real,
                backgroundColor: real.map(v => v < 0 ? C.neg : C.pos),
                hoverBackgroundColor: real.map(v => hexA(v < 0 ? C.neg : C.pos, 0.8)),
                borderRadius: 4,
                borderSkipped: 'start',
                categoryPercentage: 0.9,
                barPercentage: 0.9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: axisStyle({ grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 10 } }),
                y: axisStyle({ ticks: { callback: v => fmt.pct(v, 0), maxTicksLimit: 7 } })
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...tooltipStyle(),
                    usePointStyle: false,
                    callbacks: {
                        title: items => `${annual.years[items[0].dataIndex]}${annual.partial[items[0].dataIndex] ? ' (partial year)' : ''}`,
                        label: item => ` Real ${fmt.pct(item.parsed.y, 1, true)}`,
                        afterLabel: item => ` Nominal ${fmt.pct(nominal[item.dataIndex], 1, true)}`
                    }
                }
            }
        }
    });
    setTable('annual', ['Year', 'Nominal return', 'Real return', 'Partial year'],
        annual.years.map((y, i) => [y, fmt.pct(nominal[i], 2, true), fmt.pct(real[i], 2, true), annual.partial[i] ? 'Yes' : 'No']));
}

// ---------------------------------------------------------------------------
// Scenario 1: allocation
// ---------------------------------------------------------------------------

function allocWindowStart() {
    const preset = ALLOC_PRESETS.find(([label]) => label === state.alloc.range);
    return preset && preset[1] ? shiftYears(meta.as_of, preset[1]) : null;
}

function updateWeightLabel() {
    const a = state.alloc;
    document.getElementById('allocWeightOut').textContent = `${a.weight}% ${a.equity} / ${100 - a.weight}% ${a.bond}`;
    const slider = document.getElementById('allocWeight');
    slider.style.setProperty('--fill', `${a.weight}%`);
}

async function loadAllocation() {
    if (!meta) return;
    const a = state.alloc;
    updateWeightLabel();
    const params = new URLSearchParams({ equity: a.equity, bond: a.bond, weight: a.weight, rebalance: a.rebalance, amount: state.amount, rf: state.rf });
    const start = allocWindowStart();
    if (start) params.set('start', start);
    setLoading('alloc', true);
    try {
        const data = await latest('alloc', () => api(`/api/dashboard/allocation?${params}`));
        showError('alloc', '');
        renderAllocation(data);
    } catch (e) {
        if (e.name === 'AbortError') return;
        showError('alloc', e.message);
    } finally {
        setLoading('alloc', false);
    }
    syncUrl();
}

function renderAllocation(data) {
    const { kpis, series, equity, bond, weight_pct: w, frontier, window: win } = data;
    const blend = kpis.blend, eq = kpis.equity;
    const mixLabel = `${w}% ${equity} / ${100 - w}% ${bond}`;
    const rebalanceText = { quarterly: 'rebalanced quarterly', annual: 'rebalanced annually', none: 'never rebalanced' }[data.rebalance];
    let note = `${fmt.date(win.start)} to ${fmt.date(win.end)}, ${rebalanceText}, no taxes or fees.`;
    if (win.clipped_by) note += ` Starts when ${win.clipped_by} data begins.`;
    document.getElementById('allocNote').textContent = note;

    const vs = `vs 100% ${esc(equity)}`;
    document.getElementById('allocTiles').innerHTML = [
        tile('Final value', fmt.money(blend.final_value), `${delta((blend.final_value / eq.final_value - 1) * 100, '%', true)} ${vs}`),
        tile(glossTerm('CAGR', 'cagr'), fmt.pct(blend.cagr_pct, 2), `${delta(blend.cagr_pct - eq.cagr_pct, ' pts', true, 2)} ${vs}`),
        tile(glossTerm('Volatility', 'volatility'), fmt.pct(blend.volatility_pct, 1), `${delta(blend.volatility_pct - eq.volatility_pct, ' pts', false)} ${vs}`),
        tile(glossTerm('Max drawdown', 'max-drawdown'), fmt.pct(blend.max_drawdown_pct, 1), `${delta(blend.max_drawdown_pct - eq.max_drawdown_pct, ' pts', true)} ${vs}`),
        tile(glossTerm('Sharpe', 'sharpe'), fmt.num(blend.sharpe), `${delta(blend.sharpe - eq.sharpe, '', true, 2)} ${vs}`)
    ].join('');

    document.getElementById('title-alloc').textContent = `Growth of ${fmt.money(data.amount)}`;
    upsertChart('alloc', {
        type: 'line',
        data: {
            labels: series.dates,
            datasets: [
                lineDataset(mixLabel, series.blend, C.blend, { borderWidth: 3, order: 0 }),
                lineDataset(`100% ${equity}`, series.equity, colorFor(equity), { order: 1 }),
                lineDataset(`100% ${bond}`, series.bond, colorFor(bond), { order: 2 })
            ]
        },
        options: timeLineOptions({ yTick: v => fmt.moneyShort(v), tooltipValue: fmt.money })
    });
    seriesTable('alloc', series.dates, { [mixLabel]: series.blend, [`100% ${equity}`]: series.equity, [`100% ${bond}`]: series.bond }, fmt.money);

    const current = { weight_pct: w, cagr_pct: blend.cagr_pct, volatility_pct: blend.volatility_pct, max_drawdown_pct: blend.max_drawdown_pct, sharpe: blend.sharpe };
    const point = f => ({ x: f.volatility_pct, y: f.cagr_pct, f });
    upsertChart('frontier', {
        type: 'scatter',
        data: {
            datasets: [
                { label: 'Your mix', data: [point(current)], backgroundColor: C.blend, borderColor: '#ffffff', borderWidth: 3, pointRadius: 9, pointHoverRadius: 10, order: 0 },
                { label: 'Other mixes (10% steps)', data: frontier.map(point), showLine: true, borderColor: C.frontier, backgroundColor: C.frontier, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointHitRadius: 12, order: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: axisStyle({ title: { display: true, text: 'Volatility (annualized)', color: C.muted }, ticks: { callback: v => fmt.pct(v, 0) } }),
                y: axisStyle({ title: { display: true, text: 'CAGR', color: C.muted }, ticks: { callback: v => fmt.pct(v, 0) } })
            },
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 10, padding: 14, color: C.ink } },
                tooltip: {
                    ...tooltipStyle(),
                    callbacks: {
                        title: items => {
                            const f = items[0].raw.f;
                            return `${f.weight_pct}% ${equity} / ${100 - f.weight_pct}% ${bond}`;
                        },
                        label: item => ` CAGR ${fmt.pct(item.raw.f.cagr_pct, 2)}, volatility ${fmt.pct(item.raw.f.volatility_pct, 1)}`,
                        afterLabel: item => ` Max drawdown ${fmt.pct(item.raw.f.max_drawdown_pct, 1)}, Sharpe ${fmt.num(item.raw.f.sharpe)}`
                    }
                }
            }
        }
    });
    setTable('frontier', [`% ${equity}`, 'CAGR', 'Volatility', 'Max drawdown', 'Sharpe'],
        frontier.map(f => [`${f.weight_pct}%`, fmt.pct(f.cagr_pct, 2), fmt.pct(f.volatility_pct, 2), fmt.pct(f.max_drawdown_pct, 1), fmt.num(f.sharpe)]));
}

// ---------------------------------------------------------------------------
// Scenario 2: Monte Carlo (existing /api/retirement-projector)
// ---------------------------------------------------------------------------

async function loadMonteCarlo() {
    const m = state.mc;
    setLoading('mc', true);
    try {
        const data = await latest('mc', () => api('/api/retirement-projector', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: m.symbol, initial_amount: m.initial, monthly_contribution: m.monthly, years: m.years,
                target_amount: m.target, method: m.method, num_simulations: 1000, drip: true, seed: MC_SEED
            })
        }));
        showError('mc', '');
        renderMonteCarlo(data);
    } catch (e) {
        if (e.name === 'AbortError') return;
        showError('mc', e.message);
    } finally {
        setLoading('mc', false);
    }
    syncUrl();
}

function renderMonteCarlo(data) {
    const last = data.months.length - 1;
    const contributed = data.contributed || data.months.map(mo => data.initial_amount + data.monthly_contribution * mo);
    const cov = meta?.tickers.find(t => t.symbol === data.symbol);
    const success = data.success_rate_pct;
    const successTone = success == null ? '' : success >= 80 ? 'good' : success >= 50 ? 'warn' : 'bad';
    const successIcon = success == null ? '' : success >= 80 ? 'fa-circle-check' : success >= 50 ? 'fa-circle-exclamation' : 'fa-circle-xmark';
    const methodText = data.method === 'monte_carlo' ? `${data.num_paths.toLocaleString('en-US')} resampled paths` : `${data.num_paths.toLocaleString('en-US')} real historical sequences`;

    document.getElementById('mcTiles').innerHTML = [
        tile(`Chance of reaching ${fmt.moneyShort(data.target_amount)}`,
            success == null ? '–' : `<i class="fas ${successIcon}"></i> ${fmt.pct(success, 0)}`, methodText, successTone),
        tile('Median outcome', fmt.moneyShort(data.p50[last]), `after ${data.years} years`),
        tile('Bad case (10th percentile)', fmt.moneyShort(data.p10[last]), '9 in 10 paths did better'),
        tile('Good case (90th percentile)', fmt.moneyShort(data.p90[last]), '1 in 10 paths did better'),
        tile('Total contributed', fmt.moneyShort(contributed[last]), cov ? `${esc(data.symbol)} history since ${fmt.month(cov.first_date)}` : '')
    ].join('');

    const band = (label, values, extra) => ({
        label, data: values, borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, pointHitRadius: 8, tension: 0, ...extra
    });
    // Lower `order` draws on top: lines (0) over the inner band (1) over the outer band (2).
    const datasets = [
        band('90th percentile', data.p90, { fill: false, borderColor: 'transparent', hideInLegend: true, order: 2 }),
        band('10th to 90th percentile', data.p10, { fill: '-1', backgroundColor: C.fanOuter, borderColor: C.fanOuter, tip: '10th percentile', order: 2 }),
        band('75th percentile', data.p75, { fill: false, borderColor: 'transparent', hideInLegend: true, order: 1 }),
        band('25th to 75th percentile', data.p25, { fill: '-1', backgroundColor: C.fanInner, borderColor: C.fanInner, tip: '25th percentile', order: 1 }),
        lineDataset('Median', data.p50, C.fanMid, { borderWidth: 2.5, order: 0 }),
        lineDataset('Total contributed', contributed, C.contrib, { borderWidth: 1.5, order: 0 })
    ];
    if (data.target_amount) {
        datasets.push(lineDataset('Target', data.months.map(() => data.target_amount), C.target, { borderWidth: 1.5, borderDash: [6, 4], pointHoverRadius: 0, order: 0 }));
    }
    const yearTicks = data.months.map(mo => `Year ${Math.round(mo / 12)}`);

    upsertChart('mc', {
        type: 'line',
        data: { labels: yearTicks, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: axisStyle({ ticks: { maxRotation: 0, autoSkip: false, callback(value, index) {
                    const mo = data.months[index];
                    const step = data.years > 20 ? 60 : 24;
                    return mo % step === 0 ? `Year ${mo / 12}` : null;
                } } }),
                y: axisStyle({ ticks: { callback: v => fmt.moneyShort(v), maxTicksLimit: 7 } })
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        filter: (item, chartData) => !chartData.datasets[item.datasetIndex].hideInLegend,
                        usePointStyle: true, boxWidth: 24, padding: 16, color: C.ink,
                        generateLabels(chart) {
                            return Chart.defaults.plugins.legend.labels.generateLabels(chart).map(l => {
                                const ds = chart.data.datasets[l.datasetIndex];
                                const isBand = ds.fill === '-1';
                                return { ...l, pointStyle: isBand ? 'rect' : 'line', fillStyle: isBand ? ds.backgroundColor : ds.borderColor, strokeStyle: isBand ? ds.backgroundColor : ds.borderColor, lineWidth: isBand ? 0 : 2 };
                            });
                        }
                    }
                },
                tooltip: {
                    ...tooltipStyle(),
                    usePointStyle: false,
                    callbacks: {
                        title: items => {
                            const mo = data.months[items[0].dataIndex];
                            return `Year ${Math.floor(mo / 12)}, month ${mo % 12}`;
                        },
                        label: item => ` ${fmt.money(item.parsed.y)}  ${item.dataset.tip || item.dataset.label}`
                    },
                    itemSort: (a, b) => b.parsed.y - a.parsed.y
                },
                dashCrosshair: { enabled: true }
            }
        }
    });
    const yearly = data.months.map((mo, i) => [mo, i]).filter(([mo]) => mo % 12 === 0);
    setTable('mc', ['Year', '10th pct', '25th pct', 'Median', '75th pct', '90th pct', 'Contributed'],
        yearly.map(([mo, i]) => [String(mo / 12), fmt.money(data.p10[i]), fmt.money(data.p25[i]), fmt.money(data.p50[i]), fmt.money(data.p75[i]), fmt.money(data.p90[i]), fmt.money(contributed[i])]));
}

// ---------------------------------------------------------------------------
// Scenario 3: start-date luck
// ---------------------------------------------------------------------------

async function loadLuck() {
    setLoading('luck', true);
    try {
        const data = await latest('luck', () => api(`/api/dashboard/rolling-windows?horizon=${state.luck.horizon}`));
        showError('luck', '');
        renderLuck(data);
    } catch (e) {
        if (e.name === 'AbortError') return;
        showError('luck', e.message);
    } finally {
        setLoading('luck', false);
    }
    syncUrl();
}

function renderLuck(data) {
    const h = data.horizon_years;
    const span = `${fmt.month(data.best.start_month)} to ${fmt.month(data.best.end_month)}`;
    const worstSpan = `${fmt.month(data.worst.start_month)} to ${fmt.month(data.worst.end_month)}`;
    document.getElementById('luckTiles').innerHTML = [
        tile(`${h}-year windows that lost money`, fmt.pct(data.pct_negative, 1), `of ${data.windows.toLocaleString('en-US')} start months`, data.pct_negative > 20 ? 'bad' : ''),
        tile('Median annual return', fmt.pct(data.median_cagr_pct, 1), `middle 80%: ${fmt.pct(data.p10_cagr_pct, 1)} to ${fmt.pct(data.p90_cagr_pct, 1)}`),
        tile('Unluckiest start', fmt.pct(data.worst.cagr_pct, 1) + '/yr', worstSpan),
        tile('Luckiest start', fmt.pct(data.best.cagr_pct, 1) + '/yr', span)
    ].join('');

    const labels = data.bins.map(b => `${fmt.pct(b.from_pct, 0)} to ${fmt.pct(b.to_pct, 0)}`);
    const colors = data.bins.map(b => b.to_pct <= 0 ? C.neg : C.pos);
    upsertChart('luck', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Start months',
                data: data.bins.map(b => b.count),
                backgroundColor: colors,
                hoverBackgroundColor: colors.map(c => hexA(c, 0.8)),
                borderRadius: 4,
                borderSkipped: 'start',
                categoryPercentage: 1,
                barPercentage: 0.9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: axisStyle({ grid: { display: false }, title: { display: true, text: `Annualized price return over ${h} year${h === 1 ? '' : 's'}`, color: C.muted },
                    ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 12, callback(value) { return fmt.pct(data.bins[value].from_pct, 0); } } }),
                y: axisStyle({ title: { display: true, text: 'Start months', color: C.muted }, ticks: { precision: 0 } })
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...tooltipStyle(),
                    usePointStyle: false,
                    callbacks: {
                        title: items => `${labels[items[0].dataIndex]} a year`,
                        label: item => ` ${item.parsed.y} start months (${fmt.pct(item.parsed.y / data.windows * 100, 1)} of all)`
                    }
                }
            }
        }
    });
    setTable('luck', ['Annualized return', 'Start months', 'Share'],
        data.bins.map((b, i) => [labels[i], String(b.count), fmt.pct(b.count / data.windows * 100, 1)]));
}

// ---------------------------------------------------------------------------
// Tabs, URL state and events
// ---------------------------------------------------------------------------

function activateTab(tabId, { push = true } = {}) {
    state.tab = tabId;
    document.querySelectorAll('.dash-tab').forEach(btn => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.dash-panel').forEach(panel => { panel.hidden = panel.dataset.panel !== tabId; });
    document.getElementById('globalFilters').hidden = !['performance', 'inflation'].includes(tabId);

    if (tabId === 'scenarios' && !loadedTabs.has('scenarios') && meta) {
        loadedTabs.add('scenarios');
        loadAllocation();
        loadMonteCarlo();
        loadLuck();
    }
    requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
    if (push) syncUrl();
}

function syncUrl() {
    const p = new URLSearchParams();
    p.set('tab', state.tab);
    p.set('symbols', orderedSymbols(state.symbols).join(','));
    p.set('range', state.range);
    if (state.range === 'custom') {
        if (state.start) p.set('start', state.start);
        if (state.end) p.set('end', state.end);
    }
    if (state.amount !== 10000) p.set('amount', state.amount);
    if (state.rf !== 2) p.set('rf', state.rf);
    if (loadedTabs.has('scenarios')) {
        const a = state.alloc;
        p.set('mix', `${a.equity}-${a.bond}-${a.weight}-${a.rebalance}-${a.range}`);
        p.set('horizon', state.luck.horizon);
    }
    history.replaceState(null, '', `${location.pathname}?${p}`);
}

function readUrl() {
    const p = new URLSearchParams(location.search);
    if (DASH_TABS.some(t => t.id === p.get('tab'))) state.tab = p.get('tab');
    if (p.get('symbols')) state.symbols = p.get('symbols').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 7);
    const range = p.get('range');
    if (range === 'custom' || RANGE_PRESETS.some(([l]) => l === range)) state.range = range;
    if (state.range === 'custom') {
        state.start = p.get('start');
        state.end = p.get('end');
    }
    const amount = parseFloat(p.get('amount'));
    if (amount > 0) state.amount = amount;
    const rf = parseFloat(p.get('rf'));
    if (rf >= 0 && rf <= 20) state.rf = rf;
    const mix = (p.get('mix') || '').split('-');
    if (mix.length === 5) {
        const w = parseInt(mix[2], 10);
        Object.assign(state.alloc, {
            equity: mix[0], bond: mix[1], weight: Number.isFinite(w) ? Math.min(100, Math.max(0, w)) : 60,
            rebalance: ['quarterly', 'annual', 'none'].includes(mix[3]) ? mix[3] : 'quarterly',
            range: ALLOC_PRESETS.some(([l]) => l === mix[4]) ? mix[4] : 'Max'
        });
    }
    const horizon = parseInt(p.get('horizon'), 10);
    if (LUCK_HORIZONS.includes(horizon)) state.luck.horizon = horizon;
}

function setSegmented(id, activeValue) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(activeValue))));
}

function bindEvents() {
    document.querySelectorAll('.dash-tab').forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
    document.addEventListener('click', e => {
        const goto = e.target.closest('[data-goto-tab]');
        if (goto) activateTab(goto.dataset.gotoTab);

        const toggle = e.target.closest('[data-table-toggle]');
        if (toggle) {
            const id = toggle.dataset.tableToggle;
            const box = document.getElementById(`table-${id}`);
            box.hidden = !box.hidden;
            toggle.setAttribute('aria-expanded', String(!box.hidden));
            toggle.innerHTML = box.hidden ? '<i class="fas fa-table"></i> View data' : '<i class="fas fa-chart-line"></i> Hide data';
            if (!box.hidden) renderTable(id);
        }

        const logBtn = e.target.closest('[data-log-toggle]');
        if (logBtn) {
            const id = logBtn.dataset.logToggle;
            state.log[id] = !state.log[id];
            logBtn.setAttribute('aria-pressed', String(state.log[id]));
            const chart = charts[id];
            if (chart) {
                chart.options.scales.y.type = state.log[id] ? 'logarithmic' : 'linear';
                chart.update();
            }
        }
    });

    document.getElementById('tickerChips').addEventListener('click', e => {
        const chip = e.target.closest('.dash-chip');
        if (!chip) return;
        const s = chip.dataset.symbol;
        if (state.symbols.includes(s)) {
            if (state.symbols.length === 1) return; // keep at least one ticker selected
            state.symbols = state.symbols.filter(x => x !== s);
        } else {
            state.symbols = [...state.symbols, s];
        }
        chip.setAttribute('aria-pressed', String(state.symbols.includes(s)));
        loadPerformance();
    });

    document.getElementById('rangeSeg').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        state.range = btn.dataset.value;
        setSegmented('rangeSeg', state.range);
        loadPerformance();
    });

    const onCustomDate = () => {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;
        if (!start || !end || start >= end) return;
        state.range = 'custom';
        state.start = start;
        state.end = end;
        setSegmented('rangeSeg', null);
        loadPerformance();
    };
    document.getElementById('startDate').addEventListener('change', onCustomDate);
    document.getElementById('endDate').addEventListener('change', onCustomDate);

    const reloadAll = debounce(() => {
        loadPerformance();
        if (loadedTabs.has('scenarios')) loadAllocation();
    }, 400);
    document.getElementById('amountInput').addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (v > 0) { state.amount = v; reloadAll(); }
    });
    document.getElementById('rfInput').addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (v >= 0 && v <= 20) { state.rf = v; reloadAll(); }
    });

    document.getElementById('focusSelect').addEventListener('change', e => {
        state.focus = e.target.value;
        renderAnnual();
    });

    // Allocation
    const reloadAlloc = debounce(loadAllocation, 150);
    document.getElementById('allocWeight').addEventListener('input', e => {
        state.alloc.weight = parseInt(e.target.value, 10);
        updateWeightLabel();
        reloadAlloc();
    });
    ['allocEquity', 'allocBond', 'allocRebalance'].forEach(id => document.getElementById(id).addEventListener('change', e => {
        const key = { allocEquity: 'equity', allocBond: 'bond', allocRebalance: 'rebalance' }[id];
        state.alloc[key] = e.target.value;
        loadAllocation();
    }));
    document.getElementById('allocRangeSeg').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        state.alloc.range = btn.dataset.value;
        setSegmented('allocRangeSeg', state.alloc.range);
        loadAllocation();
    });

    // Monte Carlo
    const reloadMc = debounce(loadMonteCarlo, 450);
    [['mcSymbol', 'symbol', String], ['mcMethod', 'method', String], ['mcYears', 'years', Number],
     ['mcInitial', 'initial', Number], ['mcMonthly', 'monthly', Number], ['mcTarget', 'target', Number]].forEach(([id, key, cast]) => {
        const el = document.getElementById(id);
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
            const v = cast(el.value);
            if (cast === Number && !(v >= (key === 'monthly' ? 0 : 1))) return;
            state.mc[key] = v;
            reloadMc();
        });
    });

    // Luck
    document.getElementById('luckSeg').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        state.luck.horizon = parseInt(btn.dataset.value, 10);
        setSegmented('luckSeg', state.luck.horizon);
        loadLuck();
    });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function initDashboard() {
    readUrl();
    mountLayout('dashboard.html');
    document.getElementById('app').innerHTML = renderPage();
    setupChartDefaults();
    if (state.range === 'custom') setSegmented('rangeSeg', null);
    setSegmented('luckSeg', state.luck.horizon);
    setSegmented('allocRangeSeg', state.alloc.range);
    document.getElementById('allocWeight').value = state.alloc.weight;
    bindEvents();
    activateTab(state.tab, { push: false });

    try {
        await loadMeta();
    } catch (e) {
        document.getElementById('heroMeta').innerHTML =
            `<span class="dash-pill dash-pill-error"><i class="fas fa-plug-circle-xmark"></i> ${esc(e.message)}</span>`;
        showError('perf', e.message);
        return;
    }
    await loadPerformance();
    if (state.tab === 'scenarios') activateTab('scenarios', { push: false });
}

initDashboard();
