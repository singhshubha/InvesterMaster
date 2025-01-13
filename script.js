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
    const amount = parseFloat(document.getElementById("amount").value);
    const years = parseInt(document.getElementById("years").value);

    if (!amount || !years) {
        alert("Please enter valid amount and years.");
        return;
    }

    try {
        // Fetch data from all three files
        const responses = await Promise.all([
            fetch(''),
            fetch('/data/index2.json'), 
            fetch('/data/index3.json')
        ]);
        
        const data = await Promise.all(responses.map(r => r.json()));
        
        // Calculate average annual return across all indexes
        let totalReturn = 0;
        let validYears = 0;
        
        for (let year = 0; year < years; year++) {
            let yearReturn = 0;
            let validIndexes = 0;
            
            data.forEach(index => {
                if (index.returns && index.returns[year] !== undefined) {
                    yearReturn += index.returns[year];
                    validIndexes++;
                }
            });
            
            if (validIndexes === 3) { // Only use years where all indexes have data
                totalReturn += yearReturn / 3;
                validYears++;
            }
        }
        
        const averageAnnualReturn = validYears > 0 ? totalReturn / validYears : 0;
        const futureValue = amount * Math.pow(1 + averageAnnualReturn, years);
        
        // Show result in div and as a popup
        document.getElementById("result").innerHTML = `
            <p>Investment with an average annual return of ${(averageAnnualReturn * 100).toFixed(2)}%:</p>
            <p>After ${years} years, $${amount.toLocaleString()} will grow to <strong>$${futureValue.toFixed(2).toLocaleString()}</strong>.</p>
        `;
        document.getElementById("result").style.display = "block";

        alert(`Your investment of $${amount.toLocaleString()} will grow to $${futureValue.toFixed(2).toLocaleString()} after ${years} years.`);
    } catch (error) {
        alert("Error calculating returns. Please try again.");
        console.error(error);
    }
}
