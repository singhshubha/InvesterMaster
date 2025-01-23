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

        // Use port 5001 instead of 5000
        const response = await fetch('http://localhost:5001/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
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

// Update DOMContentLoaded event listener
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
    }, 5000); // Change slide every 5 seconds
}

// Add news-related functions
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

    // Clear any existing content
    newsContainer.innerHTML = '';
    
    // Create and display first article
    const firstArticle = articles[0];
    const newsSlide = document.createElement('div');
    newsSlide.className = 'news-slide';
    newsSlide.innerHTML = `
        <div class="news-title">${firstArticle.title}</div>
        <div class="news-content">${firstArticle.description || 'No description available'}</div>
    `;
    newsContainer.appendChild(newsSlide);
    
    // Force reflow before adding active class
    void newsSlide.offsetWidth;
    newsSlide.classList.add('active');

    // Store articles for rotation
    window.newsArticles = articles;
    window.currentArticleIndex = 0;

    // Start rotation
    if (articles.length > 1) {
        rotateNews();
    }
}

function rotateNews() {
    if (!window.newsArticles || window.newsArticles.length < 2) return;

    setInterval(() => {
        const newsContainer = document.getElementById('newsContainer');
        const currentSlide = newsContainer.querySelector('.news-slide');
        
        // Fade out current slide
        currentSlide.classList.remove('active');
        
        // Update index for next article
        window.currentArticleIndex = (window.currentArticleIndex + 1) % window.newsArticles.length;
        const nextArticle = window.newsArticles[window.currentArticleIndex];

        // After fade out, update content
        setTimeout(() => {
            const newSlide = document.createElement('div');
            newSlide.className = 'news-slide';
            newSlide.innerHTML = `
                <div class="news-title">${nextArticle.title}</div>
                <div class="news-content">${nextArticle.description || 'No description available'}</div>
            `;
            
            // Replace old slide with new one
            newsContainer.innerHTML = '';
            newsContainer.appendChild(newSlide);
            
            // Force reflow
            void newSlide.offsetWidth;
            
            // Fade in new slide
            newSlide.classList.add('active');
        }, 500);
    }, 5000);
}
