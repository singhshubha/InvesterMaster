// Base URL of the Flask API (server/app.py). Adjust if you deploy the backend elsewhere.
const API_BASE_URL = 'http://localhost:5001';

let resultChart = null;
let compareChart = null;
let luckChart = null;

// Shades chart backgrounds gray during US recessions. Opt-in per chart via
// `options.plugins.recessionShading.enabled` since it assumes category-scale
// labels are 'YYYY-MM-DD' date strings, which isn't true for every chart on the page.
const recessionShadingPlugin = {
    id: 'recessionShading',
    beforeDatasetsDraw(chart, args, opts) {
        if (!opts || !opts.enabled || typeof US_RECESSIONS === 'undefined') return;
        const labels = chart.data.labels;
        if (!labels || !labels.length) return;

        const xScale = chart.scales.x;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.fillStyle = 'rgba(120, 120, 120, 0.16)';
        US_RECESSIONS.forEach((r) => {
            const startIdx = labels.findIndex(d => d >= r.start);
            let endIdx = -1;
            for (let i = labels.length - 1; i >= 0; i--) {
                if (labels[i] <= r.end) { endIdx = i; break; }
            }
            if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return;
            const xStart = xScale.getPixelForValue(startIdx);
            const xEnd = xScale.getPixelForValue(endIdx);
            ctx.fillRect(xStart, chartArea.top, Math.max(xEnd - xStart, 1), chartArea.bottom - chartArea.top);
        });
        ctx.restore();
    }
};
if (typeof Chart !== 'undefined') {
    Chart.register(recessionShadingPlugin);
}

async function calculateReturns() {
    try {
        const stock = document.getElementById("stock").value;
        const mode = document.getElementById("mode").value;
        const amount = parseFloat(document.getElementById("amount").value);
        const startDate = document.getElementById("startDate").value;
        const endDate = document.getElementById("endDate").value;
        const drip = document.getElementById("drip").checked;
        const adjustInflation = document.getElementById("adjustInflation").checked;
        const expenseRatio = parseFloat(document.getElementById("expenseRatio").value) || 0;

        if (!stock || isNaN(amount) || amount <= 0 || !startDate || !endDate || startDate >= endDate) {
            showError("Please enter a stock, a positive amount, and a start date before the end date.");
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: stock,
                mode: mode,
                amount: amount,
                start_date: startDate,
                end_date: endDate,
                drip: drip,
                adjust_inflation: adjustInflation,
                expense_ratio_pct: expenseRatio
            })
        });

        const result = await response.json();
        if (!response.ok) {
            showError(result.error || "Calculation failed.");
            return;
        }

        displayResults(result);
    } catch (error) {
        showError("Calculation failed: " + error.message);
    }
}

function displayResults(result) {
    const resultDiv = document.getElementById("result");
    const returnClass = result.total_return >= 0 ? 'positive' : 'negative';
    const investedLabel = result.mode === 'dca' ? glossTerm('Total Invested', 'dca') : 'Initial Investment';

    const extraRows = [];
    if (result.expense_ratio_pct > 0 && result.final_value_fee_adjusted != null) {
        extraRows.push(`<tr><th>Final Value (After ${glossTerm(result.expense_ratio_pct + '% ' + 'Fees', 'expense-ratio')})</th><td>$${result.final_value_fee_adjusted.toFixed(2)}</td></tr>`);
    }
    if (result.adjust_inflation && result.final_value_real != null) {
        extraRows.push(`<tr><th>${glossTerm('Final Value (Inflation-Adjusted)', 'inflation-adjusted')}</th><td>$${result.final_value_real.toFixed(2)}</td></tr>`);
    }

    resultDiv.innerHTML = `
        <div class="result-content">
            <h3>Investment Results</h3>
            <table class="result-table">
                <tr><th>Symbol</th><td>${result.symbol} ${result.drip ? glossTerm('(DRIP)', 'drip') : ''}</td></tr>
                <tr><th>Period</th><td>${result.start_date} to ${result.end_date}</td></tr>
                <tr><th>${investedLabel}</th><td>$${result.initial_investment.toFixed(2)}</td></tr>
                <tr><th>Final Value</th><td>$${result.final_value.toFixed(2)}</td></tr>
                <tr><th>${glossTerm('Total Return', 'total-return')}</th><td class="${returnClass}">$${result.total_return.toFixed(2)} (${result.total_return_pct.toFixed(2)}%)</td></tr>
                <tr><th>${glossTerm('Max Drawdown', 'max-drawdown')}</th><td class="negative">${result.max_drawdown_pct.toFixed(2)}% (on ${result.max_drawdown_date})</td></tr>
                ${extraRows.join('')}
            </table>
            <div class="chart-wrap"><canvas id="resultChart"></canvas></div>
        </div>`;
    resultDiv.style.display = "block";

    renderResultChart(result);
}

function renderResultChart(result) {
    const canvas = document.getElementById('resultChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = result.series.map(p => p.date);
    const datasets = [{
        label: 'Nominal Value',
        data: result.series.map(p => p.nominal),
        borderColor: '#2454ff',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }];

    if (result.series.some(p => p.real !== null)) {
        datasets.push({
            label: 'Inflation-Adjusted',
            data: result.series.map(p => p.real),
            borderColor: '#b3261e',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            tension: 0.1
        });
    }

    if (result.series.some(p => p.fee_adjusted !== null)) {
        datasets.push({
            label: 'After Fees',
            data: result.series.map(p => p.fee_adjusted),
            borderColor: '#8a8f98',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [2, 3],
            pointRadius: 0,
            tension: 0.1
        });
    }

    datasets.push({
        label: 'Drawdown %',
        data: result.series.map(p => p.drawdown_pct),
        borderColor: 'rgba(179, 38, 30, 0.6)',
        backgroundColor: 'rgba(179, 38, 30, 0.12)',
        borderWidth: 1,
        pointRadius: 0,
        fill: true,
        tension: 0.1,
        yAxisID: 'y1'
    });

    if (resultChart) {
        resultChart.destroy();
    }

    resultChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { maxTicksLimit: 10 } },
                y: { ticks: { callback: value => '$' + value.toLocaleString() } },
                y1: {
                    position: 'right',
                    suggestedMax: 0,
                    suggestedMin: -100,
                    grid: { drawOnChartArea: false },
                    ticks: { callback: value => value + '%' }
                }
            },
            plugins: {
                legend: { position: 'bottom' },
                recessionShading: { enabled: true }
            }
        }
    });
}

const COMPARE_COLORS = ['#2454ff', '#e07b00', '#1a7f37'];

async function runComparison() {
    const legendDiv = document.getElementById('compareLegend');
    try {
        const symbols = ['compareSymbol1', 'compareSymbol2', 'compareSymbol3']
            .map(id => document.getElementById(id).value)
            .filter(v => v);
        const amount = parseFloat(document.getElementById('compareAmount').value);
        const startDate = document.getElementById('compareStartDate').value;
        const endDate = document.getElementById('compareEndDate').value;
        const drip = document.getElementById('compareDrip').checked;

        if (symbols.length < 1 || isNaN(amount) || amount <= 0 || !startDate || !endDate || startDate >= endDate) {
            legendDiv.innerHTML = `<div class="error">Pick at least one asset, a positive amount, and a start date before the end date.</div>`;
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/compare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols, amount, start_date: startDate, end_date: endDate, drip })
        });
        const result = await response.json();
        if (!response.ok) {
            legendDiv.innerHTML = `<div class="error">${result.error || 'Comparison failed.'}</div>`;
            return;
        }

        renderCompareChart(result);

        legendDiv.innerHTML = result.assets.map((asset, i) => `
            <span class="legend-item">
                <span class="legend-swatch" style="background:${COMPARE_COLORS[i]}"></span>
                ${asset.label}: ${asset.total_return_pct.toFixed(2)}% (max drawdown ${asset.max_drawdown_pct.toFixed(2)}%)
            </span>`).join('');
    } catch (error) {
        legendDiv.innerHTML = `<div class="error">Comparison failed: ${error.message}</div>`;
    }
}

function renderCompareChart(result) {
    const canvas = document.getElementById('compareChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = result.assets[0].series.map(p => p.date);
    const datasets = result.assets.map((asset, i) => ({
        label: asset.label,
        data: asset.series.map(p => p.pct_return),
        borderColor: COMPARE_COLORS[i],
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1
    }));

    if (compareChart) compareChart.destroy();

    compareChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { maxTicksLimit: 10 } },
                y: { ticks: { callback: value => value + '%' } }
            },
            plugins: {
                legend: { position: 'bottom' },
                recessionShading: { enabled: true }
            }
        }
    });
}

async function runLuckSimulator() {
    const runsDiv = document.getElementById('luckRuns');
    try {
        const symbol = document.getElementById('luckStock').value;
        const amount = parseFloat(document.getElementById('luckAmount').value);
        const durationYears = parseInt(document.getElementById('luckDuration').value, 10);
        const firstStartDate = document.getElementById('luckFirstStart').value;
        const count = parseInt(document.getElementById('luckCount').value, 10);
        const drip = document.getElementById('luckDrip').checked;

        if (!symbol || isNaN(amount) || amount <= 0 || !firstStartDate || isNaN(durationYears) || isNaN(count)) {
            runsDiv.innerHTML = `<div class="error">Fill in stock, amount, hold length, start date, and number of runs.</div>`;
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/luck-simulator`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol, amount, duration_years: durationYears,
                first_start_date: firstStartDate, count, drip
            })
        });
        const result = await response.json();
        if (!response.ok) {
            runsDiv.innerHTML = `<div class="error">${result.error || 'Simulation failed.'}</div>`;
            return;
        }

        renderLuckChart(result);

        runsDiv.innerHTML = result.runs.map(r => {
            if (r.final_value == null) {
                return `<div class="luck-run-card"><div class="luck-run-start">${r.start_date}</div>No data</div>`;
            }
            const cls = r.total_return_pct >= 0 ? 'positive' : 'negative';
            return `
                <div class="luck-run-card">
                    <div class="luck-run-start">${r.start_date} → ${r.end_date}</div>
                    <div class="luck-run-return ${cls}">${r.total_return_pct.toFixed(1)}%</div>
                </div>`;
        }).join('');
    } catch (error) {
        runsDiv.innerHTML = `<div class="error">Simulation failed: ${error.message}</div>`;
    }
}

function renderLuckChart(result) {
    const canvas = document.getElementById('luckChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = result.runs.map(r => r.start_date);
    const values = result.runs.map(r => r.total_return_pct);

    if (luckChart) luckChart.destroy();

    luckChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: `${result.duration_years}-Year Return by Start Date`,
                data: values,
                backgroundColor: values.map(v => v == null ? '#c8ccd8' : (v >= 0 ? 'rgba(26,127,55,0.7)' : 'rgba(179,38,30,0.7)'))
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { ticks: { callback: value => value + '%' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function showError(message) {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = `<div class="error">${message}</div>`;
    resultDiv.style.display = "block";
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.quote-slide')) {
        startQuoteSlideShow();
    }
    if (document.getElementById('newsContainer')) {
        fetchNews();
    }
    setupNavToggle();
    setupScrollReveal();
});

function setupNavToggle() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
        toggle.classList.toggle('open');
        links.classList.toggle('open');
    });

    links.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            toggle.classList.remove('open');
            links.classList.remove('open');
        });
    });
}

function setupScrollReveal() {
    const cards = document.querySelectorAll('.card');
    if (!cards.length) return;

    if (!('IntersectionObserver' in window)) {
        cards.forEach(card => card.classList.add('in-view'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('in-view'), index * 100);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });

    cards.forEach(card => observer.observe(card));
}

function startQuoteSlideShow() {
    let currentSlide = 0;
    const slides = document.querySelectorAll('.quote-slide');
    slides[currentSlide].classList.add('active');

    setInterval(() => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }, 5000);
}

async function fetchNews() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/news`);
        const data = await response.json();
        if (data.articles && data.articles.length > 0) {
            displayNews(data.articles);
        }
    } catch (error) {
        console.error('Failed to fetch news:', error);
        const newsContainer = document.getElementById('newsContainer');
        if (newsContainer) {
            newsContainer.innerHTML = `
                <div class="news-slide active">
                    <div class="news-title">Error loading news</div>
                    <div class="news-content">Unable to fetch the latest updates.</div>
                </div>`;
        }
    }
}

function displayNews(articles) {
    const newsContainer = document.getElementById('newsContainer');
    if (!newsContainer) return;

    newsContainer.innerHTML = '';

    const firstArticle = articles[0];
    const newsSlide = document.createElement('div');
    newsSlide.className = 'news-slide';
    newsSlide.innerHTML = `
        <div class="news-title">${firstArticle.title}</div>
        <div class="news-content">${firstArticle.description || 'No description available'}</div>
    `;
    newsContainer.appendChild(newsSlide);

    void newsSlide.offsetWidth;
    newsSlide.classList.add('active');

    window.newsArticles = articles;
    window.currentArticleIndex = 0;

    if (articles.length > 1) {
        rotateNews();
    }
}

function rotateNews() {
    if (!window.newsArticles || window.newsArticles.length < 2) return;

    setInterval(() => {
        const newsContainer = document.getElementById('newsContainer');
        const currentSlide = newsContainer.querySelector('.news-slide');

        currentSlide.classList.remove('active');

        window.currentArticleIndex = (window.currentArticleIndex + 1) % window.newsArticles.length;
        const nextArticle = window.newsArticles[window.currentArticleIndex];

        setTimeout(() => {
            const newSlide = document.createElement('div');
            newSlide.className = 'news-slide';
            newSlide.innerHTML = `
                <div class="news-title">${nextArticle.title}</div>
                <div class="news-content">${nextArticle.description || 'No description available'}</div>
            `;

            newsContainer.innerHTML = '';
            newsContainer.appendChild(newSlide);

            void newSlide.offsetWidth;

            newSlide.classList.add('active');
        }, 500);
    }, 5000);
}
