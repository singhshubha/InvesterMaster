const API_KEY = 'xsPF8aXsUpC0Ri1ALx4zgpZBDgw6G9y2';

async function calculateReturns() {
    try {
        const stock = document.getElementById("stock").value;
        const amount = parseFloat(document.getElementById("amount").value);
        const years = parseFloat(document.getElementById("years").value);

        // Validation
        if (!stock || isNaN(amount) || isNaN(years) || amount <= 0 || years <= 0) {
            throw new Error("Please enter valid values");
        }

        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = '<div class="loading">Calculating...</div>';
        resultDiv.style.display = "block";

        const response = await fetch('http://localhost:5001/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            mode: 'cors',
            body: JSON.stringify({
                stock: stock,
                amount: amount,
                years: years
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error);
        }

        displayResults(result);
    } catch (error) {
        console.error('Calculation error:', error);
        showError(`Calculation failed: ${error.message}`);
    }
}

function displayResults(result) {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = `
        <div class="result-content">
            <h3>Investment Results</h3>
            <table class="result-table">
                <tr><td>Initial Investment:</td><td>${result.initial_investment}</td></tr>
                <tr><td>Investment Period:</td><td>${result.years} years</td></tr>
                <tr><td>Future Value:</td><td>${result.future_value}</td></tr>
                <tr><td>Total Return:</td><td>${result.total_return}</td></tr>
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
