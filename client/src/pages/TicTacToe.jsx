// client/src/pages/TicTacToe.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Board from "../components/Board";
import { getSocket } from "../socket";

/* easy: random empty cell */
function aiEasy(board) {
  const empties = board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
  if (!empties.length) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

/* medium: win if possible, block if necessary, else random */
function aiMedium(board, me = "O", opp = "X") {
  // try win
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      const b = [...board];
      b[i] = me;
      if (calcWinner(b)) return i;
    }
  }
  // try block
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      const b = [...board];
      b[i] = opp;
      if (calcWinner(b)) return i;
    }
  }
  return aiEasy(board);
}

/* hard: simple minimax for perfect play */
function aiHard(board, me = "O", opp = "X") {
  const best = minimax(board, me, opp, true);
  return best.index;
}

function minimax(board, player, opponent, maximizing = true) {
  const win = calcWinner(board);
  if (win === player) return { score: 10 };
  if (win === opponent) return { score: -10 };
  if (!board.includes(null)) return { score: 0 };

  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const newBoard = [...board];
      newBoard[i] = maximizing ? player : opponent;
      const result = minimax(newBoard, player, opponent, !maximizing);
      moves.push({ index: i, score: result.score });
    }
  }

  if (maximizing) {
    let best = { score: -Infinity, index: null };
    for (const m of moves) if (m.score > best.score) best = m;
    return best;
  } else {
    let best = { score: Infinity, index: null };
    for (const m of moves) if (m.score < best.score) best = m;
    return best;
  }
}

function calcWinner(squares) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c])
      return squares[a];
  }
  return null;
}

/* ---------- Main TicTacToe page ---------- */
export default function TicTacToe() {
  const [mode, setMode] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");

  const [currentGame, setCurrentGame] = useState(1);
  const totalGames = 4;
  const [firstPlayer, setFirstPlayer] = useState("X");
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });

  // per-game board state
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState("X");
  const [status, setStatus] = useState("playing");
  const [winningLine, setWinningLine] = useState(null);
  const [lastRoundWinner, setLastRoundWinner] = useState(null);

  // UI banners
  const [showRoundBanner, setShowRoundBanner] = useState(false);
  const [showFinalBanner, setShowFinalBanner] = useState(false);

  // Friend (socket) related
  const socketRef = useRef(null);
  const [roomId, setRoomId] = useState(null);
  const [playersCount, setPlayersCount] = useState(0);
  const [myIndex, setMyIndex] = useState(null);
  const [isHost, setIsHost] = useState(false);

  // animations / small timers
  const bannerTimerRef = useRef(null);

  useEffect(() => {
    // cleanup timers on unmount
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  /* ---------------- initialize per-round ---------------- */
  function startRound(newFirst = firstPlayer) {
    setBoard(Array(9).fill(null));
    setTurn(newFirst);
    setStatus("playing");
    setWinningLine(null);
    setLastRoundWinner(null);
    setShowRoundBanner(false);
  }

  /* ---------------- handle end of round ---------------- */
  function finishRound(winner, line = null) {
    setStatus("finished");
    setWinningLine(line || null);

    // update scores
    if (winner === "X" || winner === "O") {
      setScores((s) => ({ ...s, [winner]: s[winner] + 1 }));
      setLastRoundWinner(winner);
    } else {
      setScores((s) => ({ ...s, draw: s.draw + 1 }));
      setLastRoundWinner("draw");
    }

    // show round banner
    setShowRoundBanner(true);
    // banner for 2s then proceed
    bannerTimerRef.current = setTimeout(() => {
      setShowRoundBanner(false);
      // next game or final
      if (currentGame < totalGames) {
        setCurrentGame((g) => g + 1);
        const nextFirst = firstPlayer === "X" ? "O" : "X";
        setFirstPlayer(nextFirst);
        startRound(nextFirst);
      } else {
        // finished match
        setShowFinalBanner(true);
      }
      // If friend (multiplayer), emit match progress to server
      if (
        mode === "friend" &&
        socketRef.current &&
        socketRef.current.connected &&
        roomId
      ) {
        socketRef.current.emit("ttt:roundFinished", {
          roomId,
          winner: winner || "draw",
          winningLine: line || null,
        });
      }
    }, 1800);
  }

  /* ---------------- make move (local or emit to server) ---------------- */
  function makeMove(index) {
    if (status !== "playing") return;
    if (board[index]) return;

    // friend mode: only allow when it's your turn
    if (mode === "friend") {
      if (myIndex === null) return;
      // my symbol depends on index: player0 -> X, player1 -> O
      const mySymbol = myIndex === 0 ? "X" : "O";
      if (turn !== mySymbol) return; // not your turn
      // emit to server
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("ttt:move", { roomId, index });
        // server will broadcast update; we don't apply locally here
        return;
      }
    }

    // local (computer) or fallback: apply move locally
    applyLocalMove(index, turn);
  }

  /* ---------------- local move application ---------------- */
  function applyLocalMove(index, symbol) {
    setBoard((prev) => {
      const nb = [...prev];
      nb[index] = symbol;
      return nb;
    });

    // Run checks *after* board state updates
    setTimeout(() => {
      setBoard((prev) => {
        const win = calcWinnerWithLine(prev);
        if (win) {
          finishRound(win.player, win.line);
        } else if (!prev.includes(null)) {
          finishRound("draw", null);
        } else {
          setTurn(symbol === "X" ? "O" : "X");
        }
        return prev;
      });
    }, 0);
  }

  /* ---------------- calc winner with line helper ---------------- */
  function calcWinnerWithLine(squares) {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (const [a, b, c] of lines) {
      if (
        squares[a] &&
        squares[a] === squares[b] &&
        squares[a] === squares[c]
      ) {
        return { player: squares[a], line: [a, b, c] };
      }
    }
    return null;
  }

  /* ---------------- AI automation (computer mode) ---------------- */
  useEffect(() => {
    if (mode !== "computer") return;
    if (status !== "playing") return;
    if (turn === "O") {
      // AI plays as O
      const timer = setTimeout(
        () => {
          let move = null;
          if (difficulty === "easy") move = aiEasy(board);
          else if (difficulty === "medium") move = aiMedium(board);
          else move = aiHard(board);
          if (move !== null) applyLocalMove(move, "O");
        },
        difficulty === "hard" ? 350 : difficulty === "medium" ? 550 : 300
      );
      return () => clearTimeout(timer);
    }
  }, [turn, board, difficulty, mode, status]);

  /* ---------------- friend (socket) logic ---------------- */
  function ensureSocket() {
    if (!socketRef.current) socketRef.current = getSocket();
    return socketRef.current;
  }

  useEffect(() => {
    // attach socket listeners (once)
    const s = ensureSocket();
    if (!s) return;
    // ttt:update - server sends new board, turn, status, winningLine
    s.off("ttt:update");
    s.on(
      "ttt:update",
      ({
        board: newBoard,
        turn: newTurn,
        winningLine: winLine,
        status: st,
      }) => {
        setBoard(newBoard);
        setTurn(newTurn);
        setWinningLine(winLine || null);
        setStatus(st || "playing");
      }
    );

    // ttt:roomJoined => set my index, players count, room id
    s.off("ttt:roomJoined");
    s.on("ttt:roomJoined", ({ roomId: r, index, players }) => {
      setRoomId(r);
      setMyIndex(index);
      setPlayersCount(players || 1);
      setIsHost(index === 0);
      // set firstPlayer and start round using server decided starter (server should send if it chooses)
      startRound(firstPlayer);
    });

    // ttt:players => update players count
    s.off("ttt:players");
    s.on("ttt:players", ({ players }) => {
      setPlayersCount(players);
    });

    // ttt:roundFinished (server broadcast)
    s.off("ttt:roundFinished");
    s.on("ttt:roundFinished", ({ winner, winningLine }) => {
      setLastRoundWinner(winner === "draw" ? "draw" : winner);
      setWinningLine(winningLine || null);
      setShowRoundBanner(true);
      setTimeout(() => {
        setShowRoundBanner(false);
        setWinningLine(null);
      }, 1500);
    });

    return () => {
      // keep socket alive for other pages; do not disconnect here
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- create / join room UI actions ---------------- */
  function createRoom() {
    const s = ensureSocket();
    if (!s.connected) s.connect();

    // attach update listener (so you always get full state from server)
    s.off("ttt:update");
    s.on("ttt:update", (room) => {
      setBoard(room.board);
      setTurn(room.turn);
      setScores(room.scores || { X: 0, O: 0, draw: 0 });
      setCurrentGame(room.currentGame || 1);
      setFirstPlayer(room.firstPlayer || "X");
      setShowFinalBanner(
        room.status === "finished" && room.currentGame >= (room.totalGames || 6)
      );
    });

    // request server to create room
    s.emit("ttt:createRoom", ({ roomId }) => {
      if (!roomId) return alert("Failed to create room");

      setRoomId(roomId);
      setIsHost(true);
      setMyIndex(0);
      setPlayersCount(1);

      // auto join as host
      s.emit("ttt:joinRoom", { roomId });

      // copy room link to clipboard
      const url = `${roomId}`;
      try {
        navigator.clipboard.writeText(url);
      } catch {}
      alert("Room created. Link copied:\n" + url);
    });
  }

  function joinRoom(id) {
    const s = ensureSocket();
    if (!s.connected) s.connect();

    // attach update listener
    s.off("ttt:update");
    s.on("ttt:update", (room) => {
      setBoard(room.board);
      setTurn(room.turn);
      setScores(room.scores || { X: 0, O: 0, draw: 0 });
      setCurrentGame(room.currentGame || 1);
      setFirstPlayer(room.firstPlayer || "X");
      // ✅ Show final banner only when last game is done
      setShowFinalBanner(
        room.status === "finished" && room.currentGame >= (room.totalGames || 6)
      );
    });

    // join existing room
    s.emit("ttt:joinRoom", { roomId: id }, (res) => {
      if (res && res.error) {
        alert(res.error);
        return;
      }
      setRoomId(id);
    });
  }

  function copyRoomLink() {
    const url = `${window.location.origin}/tictactoe?room=${roomId}`;
    navigator.clipboard?.writeText(url).then(() => alert("Link copied"));
  }

  /* ---------------- UI helpers ---------------- */
  const mySymbol =
    mode === "friend" && myIndex !== null ? (myIndex === 0 ? "X" : "O") : null;
  const isMyTurn = mode === "friend" ? mySymbol === turn : true;

  /* ---------------- reset match locally (computer mode) ---------------- */
  function resetMatchLocal() {
    setCurrentGame(1);
    setFirstPlayer("X");
    setScores({ X: 0, O: 0, draw: 0 });
    startRound("X");
    setShowFinalBanner(false);
    setShowRoundBanner(false);
  }

  /* ---------------- decide final winner message ---------------- */
  const finalWinner = useMemo(() => {
    if (scores.X > scores.O) return "X";
    if (scores.O > scores.X) return "O";
    return "draw";
  }, [scores]);

  // choose mode screen
  if (!mode) {
    return (
      <div className="page-center">
        <div className="card-card-lg ttt-start-card">
          <h1 className="card-title">✖️ TicTacToe - The DUEL⭕</h1>
          <p className="card-sub">
            The legendary X and O duel! Outsmart your opponent by aligning three
            symbols in a row, column, or diagonal. Winner selected based on
            total 4 games.
          </p>

          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={() => {
                setMode("computer");
                resetMatchLocal();
                startRound(firstPlayer);
              }}
            >
              Play vs Computer
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setMode("friend");
                startRound(firstPlayer);
              }}
            >
              Play vs Friend
            </button>
          </div>

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
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="select"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  // friend mode lobby / game
  if (mode === "friend") {
    return (
      <div className="page-center">
        <div className="card-card-lg ttt-start-card">
          <div className="row-between">
            <h2 className="card-title">TicTacToe — VS Friend</h2>
            <div className="small-pill">
              Game {currentGame}/{totalGames}
            </div>
          </div>

          {!roomId && (
            <>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={createRoom}>
                  Create Room
                </button>
                <input
                  id="ttt-room"
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
                    joinRoom(document.getElementById("ttt-room").value)
                  }
                >
                  Join
                </button>
              </div>
            </>
          )}

          {roomId && (
            <>
              <div className="row-between" style={{ marginTop: 12 }}>
                <div>
                  Room: <strong>{roomId}</strong> ({playersCount}/2)
                </div>
                <div>
                  {isHost && (
                    <button className="btn btn-small" onClick={copyRoomLink}>
                      Copy Link
                    </button>
                  )}
                </div>
              </div>

              <div className="scoreboard" style={{ marginTop: 12 }}>
                <div>X: {scores.X}</div>
                <div>O: {scores.O}</div>
                <div>Draws: {scores.draw}</div>
              </div>

              <div style={{ marginTop: 16 }}>
                <Board
                  board={board}
                  onCellClick={(i) => makeMove(i)}
                  disabled={status !== "playing" || !isMyTurn}
                  winningLine={winningLine}
                />
              </div>

              <div style={{ marginTop: 12 }} className="muted">
                {playersCount < 2
                  ? "Waiting for opponent to join..."
                  : isMyTurn
                  ? "Your turn"
                  : "Opponent's turn"}
              </div>
            </>
          )}

          {/* round banner */}
          {showRoundBanner && (
            <div className="banner banner-round">
              {lastRoundWinner === "draw"
                ? "Round Draw"
                : `Round Winner: ${lastRoundWinner}`}
            </div>
          )}

          {/* final banner */}
          {showFinalBanner && (
            <div className="banner banner-final">
              {finalWinner === "draw"
                ? "Match Draw"
                : `Match Winner: ${finalWinner}`}
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (socketRef.current)
                      socketRef.current.emit("ttt:resetMatch", { roomId });
                    resetMatchLocal();
                    setMode(null);
                  }}
                >
                  Play Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // computer mode UI
  return (
    <div className="page-center">
      <div className="card-card-lg ttt-start-card">
        <div className="row-between">
          <h2 className="card-title">TicTacToe — vs Computer</h2>
          <div className="small-pill">
            Game {currentGame}/{totalGames}
          </div>
        </div>

        <div className="scoreboard" style={{ marginTop: 10 }}>
          <div>X: {scores.X}</div>
          <div>O: {scores.O}</div>
          <div>Draws: {scores.draw}</div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Board
            board={board}
            onCellClick={(i) => {
              // local: human is always X, AI is O
              if (turn !== "X" || status !== "playing") return;
              applyLocalMove(i, "X");
            }}
            disabled={status !== "playing"}
            winningLine={winningLine}
          />
        </div>

        <div style={{ marginTop: 12 }} className="muted small">
          Turn: {turn} {turn === "X" ? "(You)" : "(Computer)"}
        </div>

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button
            className="btn btn-outline"
            onClick={() => {
              setMode(null);
              resetMatchLocal();
            }}
          >
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              resetMatchLocal();
            }}
          >
            Reset Match
          </button>
        </div>

        {/* round banner */}
        {showRoundBanner && (
          <div className="banner banner-round">
            {lastRoundWinner === "draw"
              ? "Round Draw"
              : `Round Winner: ${lastRoundWinner}`}
          </div>
        )}

        {/* final banner */}
        {showFinalBanner && (
          <div className="banner banner-final">
            {finalWinner === "draw"
              ? "Match Draw"
              : `Match Winner: ${finalWinner}`}
            <div style={{ marginTop: 10 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  resetMatchLocal();
                  setMode(null);
                }}
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
