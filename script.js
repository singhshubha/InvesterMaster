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
