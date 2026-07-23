const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/calculate', (req, res) => {
    const { stock, amount, years } = req.body;
    // Your logic to calculate returns
    const result = {
        initial_investment: amount,
        years: years,
        future_value: amount * 1.1, // Example calculation
        total_return: amount * 0.1  // Example calculation
    };
    res.json(result);
});

const PORT = 5001; // Change the port number here
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});