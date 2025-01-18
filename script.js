

// Event listeners for keyboard navigation and calculator form
document.addEventListener('DOMContentLoaded', () => {
    // Card navigation
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.click();
            }
        });
        card.setAttribute('tabindex', '0');
    });

    // Calculator form handling
    const calculatorForm = document.getElementById("calculatorForm");
    if (calculatorForm) {
        calculatorForm.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                calculateReturns();
            }
        });
    }
});

async function calculateReturns() {
    const stock = document.getElementById("stock").value;
    const amount = parseFloat(document.getElementById("amount").value);
    const years = parseInt(document.getElementById("years").value);

    try {
        const response = await fetch('/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                stock: stock,
                amount: amount,
                years: years
            })
        });

        const result = await response.json();
        
        // Display results
        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = `
            <h3>Investment Summary</h3>
            <p>Initial Investment: ${result.initial_investment}</p>
            <p>Future Value: ${result.future_value}</p>
            <p>Total Return: ${result.total_return}</p>
            <p>Return Percentage: ${result.return_percentage}%</p>
            <p>Risk-Adjusted Return: ${result.risk_adjusted_return}</p>
            <p>Annual Return Rate: ${result.annual_return_rate}%</p>
        `;
        resultDiv.style.display = "block";
    } catch (error) {
        console.error('Error:', error);
        alert('Error calculating returns');
    }
}
