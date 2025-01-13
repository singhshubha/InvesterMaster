// Execute calculateReturns when Enter key is pressed
document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("calculatorForm").addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            calculateReturns();
        }
    });
});

async function calculateReturns() {
    const stock = document.getElementById("stock").value;
    const amount = parseFloat(document.getElementById("amount").value);
    const years = parseInt(document.getElementById("years").value);

    if (!amount || !years) {
        alert("Please enter valid amount and years.");
        return;
    }

    try {
        const response = await fetch(`/getAnnualReturn?stock=${stock}`);
        const data = await response.json();
        const annualReturn = data.annualReturn;

        const futureValue = amount * Math.pow(1 + annualReturn, years);
        
        // Show result in div and as a popup
        document.getElementById("result").innerHTML = `
            <p>Investment in ${stock} with an annual return of ${(annualReturn * 100).toFixed(2)}%:</p>
            <p>After ${years} years, $${amount.toLocaleString()} will grow to <strong>$${futureValue.toFixed(2).toLocaleString()}</strong>.</p>
        `;
        document.getElementById("result").style.display = "block";

        alert(`Your investment of $${amount.toLocaleString()} in ${stock} will grow to $${futureValue.toFixed(2).toLocaleString()} after ${years} years.`);
    } catch (error) {
        alert("Error calculating returns. Please try again.");
    }
}
