// Base URL of the Flask API (server/app.py). Adjust if you deploy the backend elsewhere.
const API_BASE_URL = 'http://localhost:5001';

async function calculateReturns() {
    try {
        const stock = document.getElementById("stock").value;
        const amount = parseFloat(document.getElementById("amount").value);
        const startDate = document.getElementById("startDate").value;
        const endDate = document.getElementById("endDate").value;

        if (!stock || isNaN(amount) || amount <= 0 || !startDate || !endDate || startDate >= endDate) {
            showError("Please enter a stock, a positive amount, and a start date before the end date.");
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: stock,
                initial_amount: amount,
                start_date: startDate,
                end_date: endDate
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
    resultDiv.innerHTML = `
        <div class="result-content">
            <h3>Investment Results</h3>
            <table class="result-table">
                <tr><th>Symbol</th><td>${result.symbol}</td></tr>
                <tr><th>Period</th><td>${result.start_date} to ${result.end_date}</td></tr>
                <tr><th>Initial Investment</th><td>$${result.initial_investment.toFixed(2)}</td></tr>
                <tr><th>Final Value</th><td>$${result.final_value.toFixed(2)}</td></tr>
                <tr><th>Total Return</th><td class="${returnClass}">$${result.total_return.toFixed(2)} (${result.total_return_pct.toFixed(2)}%)</td></tr>
            </table>
        </div>`;
    resultDiv.style.display = "block";
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
