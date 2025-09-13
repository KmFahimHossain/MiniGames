// client/src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
import TicTacToe from "./pages/TicTacToe";
import Nim from "./pages/Nim";
import HotPotato from "./pages/HotPotato";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Header />
        <main className="simulation-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tictactoe" element={<TicTacToe />} />
            <Route path="/nim" element={<Nim />} />
            <Route path="/hotpotato" element={<HotPotato />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
