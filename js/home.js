// Builds the home page markup (hero, feature cards, news section)
// and mounts it into '#app'.

const FEATURE_CARDS = [
    {
        action: 'calculator',
        icon: 'fa-calculator',
        title: 'Investment Calculator',
        description: 'Calculate potential returns based on historical data'
    },
    {
        action: 'portfolio',
        icon: 'fa-chart-line',
        title: 'Portfo Tracker',
        description: 'Monitor and analyze your investments in real-time'
    },
    {
        action: 'market',
        icon: 'fa-magnifying-glass-chart',
        title: 'Market Analysis',
        description: 'Get insights into market trends and opportunities'
    }
];

function renderHome() {
    const cardsHtml = FEATURE_CARDS.map(card => `
        <div class="card" data-action="${card.action}">
            <div class="icon-badge"><i class="fas ${card.icon}"></i></div>
            <h2>${card.title}</h2>
            <p>${card.description}</p>
        </div>`).join('');

    return `
        <header class="hero">
            <h1><i class="fas fa-coins"></i>Invester Master</h1>
            <p>Make data-driven investment decisions with our advanced portfolio tools</p>
        </header>

        <div class="container">${cardsHtml}</div>

        <div class="news-title-section">
            <h2>This Week in History</h2>
        </div>

        <section class="news-section">
            <div class="news-container">
                <div id="historyContainer">
                    <div class="news-slide active">
                        <div class="news-title">Crunching the numbers...</div>
                        <div class="news-content">Please wait while we look up what real historical investments would be worth today.</div>
                    </div>
                </div>
            </div>
        </section>

        <div class="news-title-section">
            <h2>What's on the News?</h2>
        </div>

        <section class="news-section">
            <div class="news-container">
                <div id="newsContainer">
                    <div class="news-slide active">
                        <div class="news-title">Loading market news...</div>
                        <div class="news-content">Please wait while we fetch the latest updates.</div>
                    </div>
                </div>
            </div>
        </section>`;
}

function openCalculator(stock) {
    window.location.href = `calculator.html?stock=${stock}`;
}

function openPortfolio() {
    window.location.href = 'portfolio.html';
}

function openMarketAnalysis() {
    window.location.href = 'market.html';
}

const CARD_ACTIONS = {
    calculator: () => openCalculator('SPY'),
    portfolio: openPortfolio,
    market: openMarketAnalysis
};

mountLayout('index.html');
document.getElementById('app').innerHTML = renderHome();

document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => CARD_ACTIONS[card.dataset.action]());
});
