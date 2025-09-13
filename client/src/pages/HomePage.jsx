import { Link } from "react-router-dom";

const games = [
  {
    slug: "tictactoe",
    title: "Tic Tac Toe",
    desc: "The legendary X and O duel! Outsmart your opponent by aligning three symbols in a row, column, or diagonal.",
    icon: (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontSize: "2.5rem",
        }}
      >
        <span style={{ color: "#6A5ACD" }}>✖️</span>
        <span style={{ color: "#FF1493" }}>⭕</span>
      </div>
    ),
  },
  {
    slug: "nim",
    title: "Nim",
    desc: "A centuries-old matchstick strategy game. Players take turns removing 1 or more sticks from a pile. The one who takes the last stick wins. Plan carefully and set traps to defeat your opponent.",
    icon: (
      <div style={{ fontSize: "2.5rem", lineHeight: "1" }}>
        <span role="img" aria-label="matchstick">
          🪵
        </span>
      </div>
    ),
  },
  {
    slug: "hotpotato",
    title: "Hot Potato",
    desc: "Pass the potato quickly before it explodes! Every second counts as the timer ticks down. Will you risk holding it or pass it fast enough to survive? A game of suspense and lightning reflexes.",
    icon: <span style={{ fontSize: "2.5rem" }}>🥔</span>,
  },
];

export default function HomePage() {
  return (
    <main className="home-wrapper">
      <h2 className="home-title">Khela Hobe</h2>
      <div className="home-subtitle">
        Pick a game, invite a friend, and let the fun begin
      </div>

      {/* Grid: 2 per row */}
      <div className="game-grid">
        {games.map((g) => (
          <Link key={g.slug} to={`/${g.slug}`} className="game-card">
            <div className="game-icon">{g.icon}</div>
            <div className="game-info">
              <h3>{g.title}</h3>
              <p>{g.desc}</p>
            </div>
            <button className="play-btn">Play</button>
          </Link>
        ))}
      </div>
    </main>
  );
}
