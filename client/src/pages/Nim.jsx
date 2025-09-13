// client/src/pages/Nim.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import { getSocket } from "../socket";

export default function Nim() {
  const [mode, setMode] = useState(null);

  // emoji options
  const emojiOptions = [
    { id: "log", label: "Log", emoji: "🪵" },
    { id: "match", label: "Match", emoji: "🕯️" },
    { id: "stick", label: "Stick", emoji: "🪄" },
    { id: "star", label: "Star", emoji: "⭐" },
    { id: "fire", label: "Fire", emoji: "🔥" },
  ];
  const [emojiChoice, setEmojiChoice] = useState(emojiOptions[0].emoji);

  const [difficulty, setDifficulty] = useState("hard");

  // choice page: piles
  const [pileCount, setPileCount] = useState(3);
  const [customPiles, setCustomPiles] = useState([3, 4, 5]);

  // runtime game state
  const [piles, setPiles] = useState([3, 4, 5]);
  const [turn, setTurn] = useState("X");
  const [status, setStatus] = useState("playing");
  const [winner, setWinner] = useState(null);
  const [actionLog, setActionLog] = useState([]);
  const [showWinBanner, setShowWinBanner] = useState(false);

  // friend mode state
  const socketRef = useRef(null);
  const [roomId, setRoomId] = useState(null);
  const [mySymbol, setMySymbol] = useState(null);
  const [playersCount, setPlayersCount] = useState(0);
  const [firstPlayer, setFirstPlayer] = useState("X");

  const [currentGame, setCurrentGame] = useState(1);
  const totalGames = 6;
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [showRoundBanner, setShowRoundBanner] = useState(false);
  const [showFinalBanner, setShowFinalBanner] = useState(false);
  const [lastRoundWinner, setLastRoundWinner] = useState(null);

  /* ---------- socket helpers ---------- */
  function ensureSocket() {
    if (!socketRef.current) socketRef.current = getSocket();
    return socketRef.current;
  }

  function attachUpdateListener(socket) {
    socket.off("nim:update");
    socket.on("nim:update", (room) => {
      if (!room) return;
      if (Array.isArray(room.piles)) setPiles(room.piles);
      if (room.turn) setTurn(room.turn);
      if (room.status) setStatus(room.status);
      if (typeof room.winner !== "undefined") setWinner(room.winner);
      if (room.scores) setScores(room.scores);
      if (typeof room.currentGame === "number")
        setCurrentGame(room.currentGame);
      if (typeof room.firstPlayer === "string")
        setFirstPlayer(room.firstPlayer);
      setPlayersCount(room.players?.length ?? room.playersCount ?? 0);
      if (room.lastAction) {
        setActionLog((log) => [room.lastAction, ...log]);
      }
      // Show final banner when the match is finished
      if (
        room.status === "finished" &&
        room.currentGame >= (room.totalGames || 6)
      ) {
        setShowFinalBanner(true);
      } else {
        setShowFinalBanner(false);
      }
    });

    socket.off("nim:roundFinished");
    socket.on("nim:roundFinished", ({ winner: w } = {}) => {
      setLastRoundWinner(w || null);
      setShowRoundBanner(true);
      setTimeout(() => setShowRoundBanner(false), 1800);
    });
  }

  function detachUpdateListener() {
    const s = socketRef.current;
    if (s) {
      s.off("nim:update");
      s.off("nim:roundFinished");
    }
  }

  useEffect(() => {
    return () => {
      detachUpdateListener();
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch {}
        socketRef.current = null;
      }
    };
  }, []);

  /* ---------- AI logic ---------- */
  function aiMoveEasy(pilesArr) {
    const nonEmpty = pilesArr
      .map((p, i) => (p > 0 ? i : -1))
      .filter((i) => i !== -1);
    if (!nonEmpty.length) return null;
    const pile = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
    const count = 1 + Math.floor(Math.random() * pilesArr[pile]);
    return [pile, count];
  }
  function aiMoveHard(pilesArr) {
    let xor = pilesArr.reduce((a, b) => a ^ b, 0);
    if (xor === 0) return aiMoveEasy(pilesArr);
    for (let i = 0; i < pilesArr.length; i++) {
      let target = pilesArr[i] ^ xor;
      if (target < pilesArr[i]) return [i, pilesArr[i] - target];
    }
    return aiMoveEasy(pilesArr);
  }
  useEffect(() => {
    if (mode !== "computer" || status !== "playing" || turn !== "O") return;
    const move = difficulty === "easy" ? aiMoveEasy(piles) : aiMoveHard(piles);
    if (!move) return;
    const [pileIdx, cnt] = move;
    const t = setTimeout(() => {
      makeLocalMove(pileIdx, cnt, "O");
    }, 500);
    return () => clearTimeout(t);
  }, [turn, mode, status, piles, difficulty]);

  /* ---------- Moves ---------- */
  function makeLocalMove(pileIndex, count, player) {
    if (count < 1 || piles[pileIndex] < count) return;
    const newPiles = [...piles];
    newPiles[pileIndex] -= count;
    setPiles(newPiles);

    const pileLetter = String.fromCharCode(65 + pileIndex);
    const msg =
      mode === "computer"
        ? player === "X"
          ? `You took ${count} from pile ${pileLetter}`
          : `Computer took ${count} from pile ${pileLetter}`
        : player === mySymbol
        ? `You took ${count} from pile ${pileLetter}`
        : `Player ${player} took ${count} from pile ${pileLetter}`;
    setActionLog((log) => [msg, ...log]);

    if (newPiles.every((p) => p === 0)) {
      setWinner(player);
      setStatus("finished");
      setShowWinBanner(true);
      setTimeout(() => setShowWinBanner(false), 2000);
    } else {
      setTurn(player === "X" ? "O" : "X");
    }
  }

  function makeMoveSocket(pile, count) {
    if (!roomId) return;
    const s = ensureSocket();
    s.emit("nim:move", { roomId, pileIndex: pile, count });
  }

  /* ---------- Create / Join / Rematch / Leave ---------- */
  function createRoom() {
    const s = ensureSocket();
    if (!s.connected) s.connect();
    attachUpdateListener(s);

    // ask server to create a room with our custom piles
    s.emit("nim:createRoom", { piles: customPiles }, ({ roomId } = {}) => {
      if (!roomId) return alert("Failed to create room");
      setRoomId(roomId);
      setPlayersCount(1);
      setMySymbol("X");
      // auto join as host
      s.emit("nim:joinRoom", { roomId }, (res) => {
        // join callback handled in joinRoom below, but keep local defaults
        if (res && res.error) {
          console.warn("join error", res.error);
        }
      });

      // copy room link to clipboard (friendly UX)
      const url = `${roomId}`;
      try {
        navigator.clipboard.writeText(url);
      } catch {}
      alert("Room created and Room ID copied. Share it:\n" + url);
    });
  }

  function joinRoom(id) {
    const s = ensureSocket();
    if (!s.connected) s.connect();
    attachUpdateListener(s);

    s.emit("nim:joinRoom", { roomId: id }, (res) => {
      if (res && res.error) {
        alert(res.error);
        return;
      }
      const { symbol, room } = res || {};
      setRoomId(id);
      setMySymbol(symbol);
      if (room) {
        setPiles(room.piles ?? customPiles);
        setTurn(room.turn ?? "X");
        setStatus(room.status ?? "playing");
        setWinner(room.winner ?? null);
        if (room.scores) setScores(room.scores);
        if (typeof room.currentGame === "number")
          setCurrentGame(room.currentGame);
        if (room.firstPlayer) setFirstPlayer(room.firstPlayer);
        setPlayersCount(room.players?.length ?? 1);
      }
    });
  }

  function requestRematch() {
    if (!roomId) return;
    const s = ensureSocket();
    s.emit("nim:rematch", { roomId }, (res) => {
      if (res && res.error) {
        alert(res.error);
        return;
      }
      // server will emit an update; clear some local UI
      setWinner(null);
      setStatus("playing");
      setPiles(customPiles);
      setTurn(firstPlayer);
      setActionLog([]);
      setShowFinalBanner(false);
    });
  }

  function leaveRoom() {
    setRoomId(null);
    setMySymbol(null);
    setPiles(customPiles);
    setTurn("X");
    setStatus("playing");
    setWinner(null);
    setPlayersCount(0);
    detachUpdateListener();
    if (socketRef.current) {
      try {
        socketRef.current.disconnect();
      } catch {}
      socketRef.current = null;
    }
    setMode(null);
  }

  /* ---------- Winner text ---------- */
  const winnerMessage = useMemo(() => {
    if (!winner) return null;
    if (mode === "computer")
      return winner === "X" ? "You win!" : "Computer wins!";
    if (mode === "friend")
      return winner === mySymbol ? "You win!" : "Opponent wins!";
    return winner;
  }, [winner, mode, mySymbol]);

  /* ---------- Render helpers ---------- */
  function renderPile(count, idx) {
    if (count === 0) return <div className="muted">— empty —</div>;
    return (
      <div>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} style={{ margin: 3, fontSize: 22 }}>
            {emojiChoice}
          </span>
        ))}
      </div>
    );
  }

  /* ---------- Choice page ---------- */
  if (!mode) {
    return (
      <div className="page-center">
        <div className="card-card-lg">
          <h1 className="card-title">🪵 Nim — Take the Last Stick</h1>
          <div
            style={{
              border: "1px solid #d99b4a",
              borderRadius: "8px",
              padding: "14px 18px",
              marginTop: "16px",
              background: "linear-gradient(180deg,#fff7ed,#fff3e0)", // soft blue background
            }}
          >
            <h3 style={{ marginBottom: "10px" }}>Game Rules</h3>
            <ol style={{ marginLeft: "20px", lineHeight: "1.7" }}>
              <li>The game starts with several piles of objects.</li>
              <li>
                Players take turns. On each turn, choose{" "}
                <strong>one pile</strong> and remove{" "}
                <strong>one or more objects</strong> from it.
              </li>
              <li>
                The player who takes the <strong>last object</strong> wins the
                game.
              </li>
            </ol>
          </div>

          {/* number of piles */}
          <div style={{ marginTop: 14 }}>
            <label className="muted" style={{ marginRight: 8 }}>
              Number of piles
            </label>
            <select
              className="select"
              value={pileCount}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setPileCount(n);
                setCustomPiles((prev) => {
                  const copy = prev.slice(0, n);
                  while (copy.length < n) copy.push(3);
                  return copy;
                });
              }}
            >
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>

          {/* objects per pile */}
          <div style={{ marginTop: 14 }}>
            <label className="muted">Objects in each pile</label>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              {Array.from({ length: pileCount }, (_, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <div className="muted">
                    Pile {String.fromCharCode(65 + idx)}
                  </div>
                  <select
                    className="select"
                    style={{ marginTop: 6 }}
                    value={customPiles[idx] ?? 3}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setCustomPiles((prev) => {
                        const cp = prev.slice();
                        cp[idx] = v;
                        return cp;
                      });
                    }}
                  >
                    {Array.from({ length: 30 }, (_, j) => (
                      <option key={j + 1} value={j + 1}>
                        {j + 1}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* emoji choice */}
          <div style={{ marginTop: 14 }}>
            <label className="muted">Choose object emoji</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {emojiOptions.map((opt) => (
                <button
                  key={opt.id}
                  className={`btn ${
                    emojiChoice === opt.emoji ? "btn-primary" : "btn-outline"
                  }`}
                  onClick={() => setEmojiChoice(opt.emoji)}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* mode selection */}
          <div style={{ marginTop: 14 }}>
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMode("computer");
                  setPiles(customPiles.slice());
                  setTurn("X");
                  setStatus("playing");
                  setWinner(null);
                  setActionLog([]);
                }}
              >
                Play vs Computer
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setMode("friend")}
              >
                Play vs Friend
              </button>
            </div>
          </div>

          {/* difficulty */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "18px",
            }}
          >
            <label className="muted">AI difficulty</label>
            <select
              className="select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Computer mode ---------- */
  if (mode === "computer") {
    return (
      <div className="page-center">
        <div className="card-card-lg">
          <div className="row-between" style={{ alignItems: "center" }}>
            <h2 className="card-title">Nim — vs Computer</h2>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setMode(null)}
            >
              Leave
            </button>
          </div>

          {piles.map((p, i) => (
            <div key={i} className="row-between" style={{ marginTop: 10 }}>
              <div>Pile {String.fromCharCode(65 + i)}</div>
              {renderPile(p, i)}
              {status === "playing" && turn === "X" && p > 0 && (
                <>
                  <select id={`sel-comp-${i}`} className="select">
                    {Array.from({ length: p }, (_, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {idx + 1}
                      </option>
                    ))}
                  </select>
                  <input
                    id={`inp-comp-${i}`}
                    type="number"
                    min="1"
                    max={p}
                    className="input"
                    style={{ width: 60 }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      const sel = parseInt(
                        document.getElementById(`sel-comp-${i}`).value,
                        10
                      );
                      const inp = parseInt(
                        document.getElementById(`inp-comp-${i}`).value,
                        10
                      );
                      const val = inp || sel || 1;
                      makeLocalMove(i, val, "X");
                    }}
                  >
                    Take
                  </button>
                </>
              )}
            </div>
          ))}
          <div style={{ marginTop: 10 }} className="muted">
            {status === "finished"
              ? winnerMessage
              : turn === "X"
              ? "Your turn"
              : "Computer’s turn"}
          </div>
          <div style={{ marginTop: 16 }}>
            <h4>Actions</h4>
            <ul>
              {actionLog.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
          {showWinBanner && (
            <div className="banner banner-round">{winnerMessage}</div>
          )}

          {status === "finished" && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPiles(customPiles.slice());
                  setTurn("X");
                  setStatus("playing");
                  setWinner(null);
                  setActionLog([]);
                }}
              >
                Restart
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------- Friend mode ---------- */
  return (
    <div className="page-center">
      <div className="card-card-lg ttt-start-card">
        {!roomId ? (
          <>
            {/* Lobby (Create / Join Room) */}
            <h2 className="card-title">Nim — VS Friend</h2>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={createRoom}>
                Create Room
              </button>
              <input
                id="nim-room"
                placeholder="Room ID"
                className="input"
                style={{
                  border: "1px solid #999",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  minWidth: "120px",
                }}
              />

              <button
                className="btn btn-outline"
                onClick={() =>
                  joinRoom(document.getElementById("nim-room").value)
                }
              >
                Join
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="row-between" style={{ alignItems: "center" }}>
              <h2 className="card-title">Nim — Friend Match</h2>
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <div
                  className="small-pill"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigator.clipboard.writeText(roomId)}
                  title="Click to copy"
                >
                  Room: {roomId} ({playersCount}/2)
                </div>
                <button className="btn btn-outline btn-sm" onClick={leaveRoom}>
                  Leave
                </button>
              </div>
            </div>

            {/* Piles */}
            <div style={{ marginTop: 16 }}>
              {piles.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 180px",
                    alignItems: "center",
                    marginTop: 10,
                    columnGap: 10,
                  }}
                >
                  {/* Left column */}
                  <div>Pile {String.fromCharCode(65 + i)}</div>

                  {/* Middle column */}
                  <div>{renderPile(p, i)}</div>

                  {/* Right column */}
                  <div style={{ textAlign: "right" }}>
                    {status === "playing" && mySymbol === turn && p > 0 ? (
                      <>
                        <select id={`sel-${i}`} className="select">
                          {Array.from({ length: p }, (_, idx) => (
                            <option key={idx + 1} value={idx + 1}>
                              {idx + 1}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-primary"
                          style={{ marginLeft: 6 }}
                          onClick={() => {
                            const sel = parseInt(
                              document.getElementById(`sel-${i}`).value,
                              10
                            );
                            makeMoveSocket(i, sel);
                          }}
                        >
                          Take
                        </button>
                      </>
                    ) : (
                      <div style={{ height: 36 }} /> // keeps right column stable
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Status */}
            <div style={{ marginTop: 10 }} className="muted">
              {status === "finished"
                ? winnerMessage
                : mySymbol === turn
                ? "Your turn"
                : "Opponent’s turn"}
            </div>

            {/* Action log */}
            <div style={{ marginTop: 16 }}>
              <h4>Actions</h4>
              <ul>
                {actionLog.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>

            {/* Rematch / Leave */}
            {status === "finished" && (
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={requestRematch}>
                  Rematch
                </button>
                <button className="btn btn-outline" onClick={leaveRoom}>
                  Leave
                </button>
              </div>
            )}

            {/* Round banner */}
            {showRoundBanner && (
              <div className="banner banner-round">
                {lastRoundWinner === "draw"
                  ? "Round Draw"
                  : `Round Winner: ${lastRoundWinner}`}
              </div>
            )}

            {/* Final banner */}
            {showFinalBanner && (
              <div className="banner banner-final">
                {scores.X > scores.O
                  ? "Match Winner: X"
                  : scores.O > scores.X
                  ? "Match Winner: O"
                  : "Match Draw"}
                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      const s = ensureSocket();
                      if (s && s.connected && roomId) {
                        s.emit("nim:rematch", { roomId });
                      }
                      // reset local UI and go back to modes
                      setMode(null);
                      setShowFinalBanner(false);
                    }}
                  >
                    Play Again
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
