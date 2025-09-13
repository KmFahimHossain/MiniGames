// src/components/Footer.jsx
function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        {/* Row 1 */}
        <div className="footer-row">
          © {new Date().getFullYear()} Khela Hobe
        </div>

        {/* Row 2 - Icons */}
        <div className="footer-row">
          {/* GitHub Icon */}
          <a
            href="https://github.com/KmFahimHossain"
            target="_blank"
            rel="noopener noreferrer"
            className="icon-link"
            aria-label="GitHub"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 .297a12 12 0 00-3.79 23.418c.6.11.82-.258.82-.577v-2.17c-3.338.727-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.744.082-.729.082-.729 1.205.085 1.84 1.238 1.84 1.238 1.07 1.834 2.807 1.303 3.492.997.107-.775.418-1.303.76-1.603-2.665-.305-5.466-1.334-5.466-5.933 0-1.31.467-2.382 1.235-3.222-.124-.304-.536-1.527.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 016.004 0c2.293-1.552 3.3-1.23 3.3-1.23.654 1.649.242 2.872.118 3.176.77.84 1.235 1.912 1.235 3.222 0 4.61-2.804 5.625-5.475 5.922.43.37.823 1.102.823 2.222v3.293c0 .32.22.694.825.576A12 12 0 0012 .297z" />
            </svg>
          </a>

          {/* Gmail Icon */}
          <a
            href="mailto:kmfahim317@gmail.com"
            className="icon-link"
            aria-label="Email"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M20 4H4c-1.1 0-1.99.89-1.99 2L2 18c0 
                1.1.89 2 2 2h16c1.1 0 2-.9 
                2-2V6c0-1.11-.9-2-2-2zm0 
                4l-8 5-8-5V6l8 5 8-5v2z"
              />
            </svg>
          </a>
        </div>

        {/* Row 3 */}
        <div className="footer-row">Author: K M Fahim Hossain</div>

        {/* Row 4 */}
        <div className="footer-row">Created on: September 12-13, 2025</div>
      </div>
    </footer>
  );
}

export default Footer;
