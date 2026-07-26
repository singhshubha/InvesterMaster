const GLOSSARY = {
    'total-return': "The dollar and percentage gain (or loss) versus what you put in.",
    'drip': "Dividend Reinvestment Plan — automatically using cash dividends to buy more shares instead of taking them as cash. Historically responsible for a large share of long-run stock market returns.",
    'expense-ratio': "A fund's annual operating cost, taken as a percentage of your investment regardless of performance. Even 1%/year quietly compounds into a large chunk of your gains over decades.",
    'inflation-adjusted': "Your portfolio's value restated in start-date dollars, so you see real purchasing power instead of just a bigger nominal number.",
    'max-drawdown': "The largest peak-to-trough decline your portfolio would have experienced — a measure of how much pain you'd have had to sit through to get the final result.",
    'dca': "Dollar-Cost Averaging — investing a fixed amount on a regular schedule (e.g. monthly) instead of all at once, which smooths out the price you pay over time."
};

function glossTerm(label, key) {
    const def = GLOSSARY[key] || '';
    return `<span class="gloss-term" tabindex="0">${label}<span class="gloss-tip">${def}</span></span>`;
}

document.addEventListener('click', (event) => {
    const term = event.target.closest('.gloss-term');
    document.querySelectorAll('.gloss-term.open').forEach((el) => {
        if (el !== term) el.classList.remove('open');
    });
    if (term) term.classList.toggle('open');
});
