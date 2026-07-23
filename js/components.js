// Shared markup builders — navbar and footer are rendered from JS
// and injected into the '#navbar-root' / '#footer-root' containers
// present in every page shell.

const NAV_LINKS = [
    { href: 'index.html', label: 'Home', icon: 'fa-home' },
    { href: 'calculator.html', label: 'Calculator', icon: 'fa-calculator' },
    { href: 'portfolio.html', label: 'Portfolio', icon: 'fa-folder' },
    { href: 'market.html', label: 'Market Analysis', icon: 'fa-chart-bar' }
];

const FOOTER_LINKS = [
    { href: 'about.html', label: 'About' },
    { href: 'contact.html', label: 'Contact' },
    { href: 'privacy.html', label: 'Privacy Policy' },
    { href: 'terms.html', label: 'Terms of Service' }
];

const SOCIAL_LINKS = [
    { href: 'https://x.com/ShubhaSingh14', icon: 'fa-twitter' },
    { href: 'https://www.instagram.com/singhsshubha/', icon: 'fa-instagram' },
    { href: 'https://www.linkedin.com/in/shubhassingh/', icon: 'fa-linkedin' },
    { href: 'https://github.com/singhshubha', icon: 'fa-github' }
];

function renderNavbar(activeHref) {
    const linksHtml = NAV_LINKS.map(link => `
        <a href="${link.href}"${link.href === activeHref ? ' class="active"' : ''}>
            <i class="fas ${link.icon}"></i> ${link.label}
        </a>`).join('');

    return `
        <nav class="nav-bar">
            <div class="nav-container">
                <a href="index.html" class="nav-logo">
                    <i class="fas fa-chart-line"></i> InvesterMaster
                </a>
                <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation">
                    <span></span><span></span><span></span>
                </button>
                <div class="nav-links" id="navLinks">${linksHtml}</div>
            </div>
        </nav>`;
}

function renderFooter() {
    const footerLinksHtml = FOOTER_LINKS.map(link => `<a href="${link.href}">${link.label}</a>`).join('');
    const socialLinksHtml = SOCIAL_LINKS.map(link => `<a href="${link.href}"><i class="fab ${link.icon}"></i></a>`).join('');

    return `
        <footer class="footer">
            <div style="text-align: center;">
                <p>&copy; 2025 Invester Master. All Rights Reserved.</p>
            </div>
            <div class="footer-content">
                <div class="footer-links">${footerLinksHtml}</div>
                <div class="social-links">${socialLinksHtml}</div>
            </div>
        </footer>`;
}

function mountLayout(activeHref) {
    const navRoot = document.getElementById('navbar-root');
    const footerRoot = document.getElementById('footer-root');
    if (navRoot) navRoot.innerHTML = renderNavbar(activeHref);
    if (footerRoot) footerRoot.innerHTML = renderFooter();
}
