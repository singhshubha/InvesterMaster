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

document.addEventListener('DOMContentLoaded', () => {
    startQuoteSlideShow();
    fetchNews();
    startNewsSlideShow();
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
        if (data.articles) {
            displayNews(data.articles);
        }
    } catch (error) {
        console.error('Failed to fetch news:', error);
    }
}

function displayNews(articles) {
    const newsGrid = document.querySelector('.news-grid');
    if (!newsGrid) return;

    newsGrid.innerHTML = articles
        .slice(0, 3) // Show only 3 news items
        .map(article => `
            <div class="news-slide">
                <div class="news-title">${article.title}</div>
                <div class="news-content">${article.description || 'No description available'}</div>
            </div>
        `).join('');

    // Animate news items with stagger
    const newsItems = document.querySelectorAll('.news-slide');
    newsItems.forEach((item, index) => {
        setTimeout(() => {
            item.classList.add('active');
        }, index * 150);
    });

    // Start rotation after initial display
    setTimeout(rotateNews, 5000);
}

function rotateNews() {
    const slides = document.querySelectorAll('.news-slide');
    if (slides.length < 2) return;

    let currentSlide = 0;
    slides[currentSlide].classList.add('active');

    setInterval(() => {
        // First, remove active class from current slide
        slides[currentSlide].classList.remove('active');
        
        // Wait for fade out transition (400ms)
        setTimeout(() => {
            // Update to next slide index
            currentSlide = (currentSlide + 1) % slides.length;
            // Add active class to new slide
            slides[currentSlide].classList.add('active');
        }, 500); // Wait for 0.5 seconds before showing the next slide
        
    }, 5000); // Total time between rotations
}

// Initialize news feed on home page load
if (window.location.pathname.includes('index.html')) {
    fetchNews();
}