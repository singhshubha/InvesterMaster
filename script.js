// Example: Fetch stock data using an API key

const STOCK_API_KEY = 'd0ip4c1r01qusbepvh6gd0ip4c1r01qusbepvh70'; // Your Alpha Vantage API key
const symbol = 'AAPL'; // Example stock symbol

async function fetchStockData(symbol) {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${STOCK_API_KEY}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        console.log(data);
        // Process your data here
    } catch (error) {
        console.error('Error fetching stock data:', error);
    }
}

fetchStockData(symbol);


async function calculateReturns() {
    try {
        const stock = document.getElementById("stock").value;
        const amount = parseFloat(document.getElementById("amount").value);
        const years = parseFloat(document.getElementById("years").value);

        if (!stock || isNaN(amount) || isNaN(years) || amount <= 0 || years <= 0) {
            showError("Please enter valid values");
            return;
        }

        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = '<div class="loading">Calculating...</div>';
        resultDiv.style.display = "block";

        const response = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock, amount, years })
        });
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            showError("Server returned invalid response.");
            return;
        }
        if (!response.ok) {
            showError(data.error || "Calculation failed.");
            return;
        }
        displayResults(data);
    } catch (error) {
        showError("Calculation failed: " + error.message);
    }
}

function displayResults(result) {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = `
        <div class="result-content">
            <h3>Investment Results</h3>
            <table class="result-table">
                <tr><td>Initial Investment:</td><td>$${result.initial_investment}</td></tr>
                <tr><td>Investment Period:</td><td>${result.years} years</td></tr>
                <tr><td>Future Value:</td><td>$${result.future_value}</td></tr>
                <tr><td>Total Return:</td><td>$${result.total_return}</td></tr>
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
});

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
        const response = await fetch('https://newsapi.org/v2/everything?q=stocks+finance&apiKey=43b766e2a83f4ecaa59b82db1751d737&pageSize=10');
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

