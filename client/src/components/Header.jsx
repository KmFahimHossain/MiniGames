// src/components/Header.jsx
function Header() {
  return (
    <header className="appbar">
      <div className="brand" onClick={() => (window.location.href = "/")}>
        <img src="/logo.png" alt="KhelaHobe Logo" className="brand-logo" />
        <h1 className="brand-title">Khela Hobe</h1>
      </div>
    </header>
  );
}
export default Header;
