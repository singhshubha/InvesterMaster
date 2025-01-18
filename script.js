async function calculateReturns() {
    const stock = document.getElementById("stock").value;
    const amount = parseFloat(document.getElementById("amount").value);
    const years = parseInt(document.getElementById("years").value);

    // Add validation
    if (!stock || !amount || !years) {
        alert("Please fill in all fields");
        return;
    }

    const resultDiv = document.getElementById("result");
    resultDiv.style.display = "block";
    resultDiv.innerHTML = '<div class="loading">Calculating...</div>';

    try {
        console.log('Sending request with:', { stock, amount, years }); // Debug log
        
        const response = await fetch('http://localhost:5000/calculate', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ stock, amount, years })
        });

        console.log('Response status:', response.status); // Debug log

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Response error:', errorText); // Debug log
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Received result:', result); // Debug log
        
        if (result.error) {
            throw new Error(result.error);
        }

        resultDiv.innerHTML = `
            <div class="result-box">
                <h3>Investment Summary</h3>
                <table class="result-table">
                    <tr><td>Initial Investment:</td><td>${result.initial_investment}</td></tr>
                    <tr><td>Investment Period:</td><td>${result.years} years</td></tr>
                    <tr><td>Future Value:</td><td>${result.future_value}</td></tr>
                    <tr><td>Total Return:</td><td>${result.total_return}</td></tr>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Full error:', error); // More detailed error logging
        resultDiv.innerHTML = `
            <div class="error-box">
                <h3>Error</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}