// client/src/pages/HotPotato.jsx
import React, { useEffect, useRef, useState } from "react";
import { getSocket } from "../socket";

function randSeconds(min = 10, max = 50) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function HotPotato() {
  const [mode, setMode] = useState(null);

  const [showWinBanner, setShowWinBanner] = useState(false);

  const [players, setPlayers] = useState(2);
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState("waiting");
  const [winner, setWinner] = useState(null);

  const [explodesAt, setExplodesAt] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [showTimer, setShowTimer] = useState(false);

  const socketRef = useRef(null);
  const [roomId, setRoomId] = useState(null);
  const [myIndex, setMyIndex] = useState(null);
  const [playersCount, setPlayersCount] = useState(0);

  function ensureSocket() {
    if (!socketRef.current) socketRef.current = getSocket();
    return socketRef.current;
  }

  function restartRoom() {
    if (mode === "computer") {
      // local restart
      startComputerGame({ showTimerByDefault: showTimer });
      return;
    }

    // friend mode: emit restart to server (ensure connected first)
    if (mode === "friend" && roomId) {
      const socket = ensureSocket();
      // make sure socket is connected before emitting
      if (!socket.connected) {
        try {
          socket.connect();
        } catch (e) {
          console.warn("socket.connect() failed:", e);
        }
      }

      // optimistic UI change (hide banner while new round starts)
      setShowWinBanner(false);

      // use acknowledgement callback so we can debug or show errors
      socket.emit("hotpotato:restartRoom", { roomId }, (res) => {
        console.log("hotpotato:restartRoom ack:", res);
        if (res && res.error) {
          // show banner again on error and notify
          setShowWinBanner(true);
          alert("Restart failed: " + res.error);
        } else {
          // server will broadcast hotpotato:update; no further client action needed
        }
      });
    }
  }

  function attachHotPotatoUpdateListener(socket) {
    socket.off("hotpotato:update");
    socket.on("hotpotato:update", (room) => {
      if (!room) return;
      if (typeof room.current !== "undefined") setCurrent(room.current);
      if (typeof room.status !== "undefined") setStatus(room.status);
      if (typeof room.winner !== "undefined") setWinner(room.winner);
      if (room.status === "finished") {
        setShowWinBanner(true);
      } else {
        setShowWinBanner(false);
      }

      if (typeof room.playersCount !== "undefined") {
        setPlayers(room.playersCount);
        setPlayersCount(room.playersCount);
      } else if (Array.isArray(room.players)) {
        setPlayers(room.players.length);
        setPlayersCount(room.players.length);
      }
      if (typeof room.explodesAt !== "undefined") {
        setExplodesAt(room.explodesAt);
      }
      if (typeof room.showTimer !== "undefined") {
        setShowTimer(room.showTimer);
      }
    });
  }

  function detachHotPotatoUpdateListener() {
    const s = socketRef.current;
    if (s) s.off("hotpotato:update");
  }

  useEffect(() => {
    if (!explodesAt) {
      setRemaining(null);
      return;
    }
    const id = setInterval(() => {
      const secs = Math.max(0, Math.ceil((explodesAt - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(id);
        setStatus((prev) => (prev === "playing" ? "finished" : prev));
        if (mode === "computer") {
          setWinner(current === 0 ? "Computer" : "You");
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [explodesAt, mode, current]);

  useEffect(() => {
    if (mode !== "computer" || status !== "playing") return;
    if (current === 1) {
      const t = setTimeout(() => {
        setCurrent((prev) => (prev + 1) % players);
      }, 700 + Math.floor(Math.random() * 700));
      return () => clearTimeout(t);
    }
  }, [mode, status, current, players]);

  function startComputerGame({ showTimerByDefault = false } = {}) {
    setMode("computer");
    setPlayers(2);
    setPlayersCount(2);
    setCurrent(0);
    setStatus("playing");
    setWinner(null);
    setShowTimer(showTimerByDefault);

    const secs = randSeconds(10, 70);
    setExplodesAt(Date.now() + secs * 1000);
  }

  function passLocal() {
    if (status !== "playing") return;
    if (mode === "computer") {
      if (current !== 0) return;
      setCurrent((prev) => (prev + 1) % players);
    } else {
      passSocket(1);
    }
  }

  function createRoom() {
    const socket = ensureSocket();
    if (!socket.connected) socket.connect();

    attachHotPotatoUpdateListener(socket);

    const previewSecs = randSeconds(10, 70);
    const previewAt = Date.now() + previewSecs * 1000;

    socket.emit("hotpotato:createRoom", { showTimer }, ({ roomId } = {}) => {
      if (!roomId) {
        alert("Could not create room");
        return;
      }
      setRoomId(roomId);
      const url = `${roomId}`;
      try {
        navigator.clipboard.writeText(url);
      } catch (e) {}
      alert("Room created and Room ID copied. Share it:\n" + url);

      socket.emit(
        "hotpotato:joinRoom",
        { roomId },
        ({ index, room, error } = {}) => {
          if (error) {
            alert("Join error: " + error);
            return;
          }
          setMyIndex(index);
          if (room) {
            setCurrent(room.current ?? 0);
            setStatus(room.status ?? "waiting");
            setWinner(room.winner ?? null);
            setPlayersCount(room.playersCount ?? 1);
            setExplodesAt(room.explodesAt ?? previewAt);
            setShowTimer(room.showTimer ?? false);
          } else {
            setExplodesAt(previewAt);
          }
        }
      );
    });

    setMode("friend");
    setStatus("waiting");
    setPlayers(2);
  }

  function joinRoom(id) {
    const socket = ensureSocket();
    if (!socket.connected) socket.connect();

    attachHotPotatoUpdateListener(socket);

    socket.emit(
      "hotpotato:joinRoom",
      { roomId: id },
      ({ index, room, error } = {}) => {
        if (error) {
          console.warn("join hotpotato error", error);
          alert("Join error: " + error);
          return;
        }
        if (typeof index !== "undefined") setMyIndex(index);
        if (room) {
          if (typeof room.current !== "undefined") setCurrent(room.current);
          if (typeof room.status !== "undefined") setStatus(room.status);
          if (typeof room.winner !== "undefined") setWinner(room.winner);
          if (typeof room.playersCount !== "undefined") {
            setPlayers(room.playersCount);
            setPlayersCount(room.playersCount);
          } else if (room.players) {
            setPlayers(room.players.length);
            setPlayersCount(room.players.length);
          }
          if (typeof room.explodesAt !== "undefined")
            setExplodesAt(room.explodesAt);
          if (typeof room.showTimer !== "undefined")
            setShowTimer(room.showTimer);
        }
        setRoomId(id);
        setMode("friend");
      }
    );
  }

  function passSocket(dir) {
    const socket = ensureSocket();
    if (!socket.connected) socket.connect();
    if (!roomId) return;
    socket.emit("hotpotato:pass", { roomId, dir });
  }

  function leaveRoom() {
    detachHotPotatoUpdateListener();
    try {
      if (socketRef.current) socketRef.current.disconnect();
    } catch (e) {}
    socketRef.current = null;

    setRoomId(null);
    setMyIndex(null);
    setPlayersCount(0);
    setStatus("waiting");
    setWinner(null);
    setMode(null);
    setExplodesAt(null);
    setRemaining(null);
    setShowWinBanner(false);
  }

  useEffect(() => {
    return () => {
      detachHotPotatoUpdateListener();
      try {
        if (socketRef.current) socketRef.current.disconnect();
      } catch (e) {}
      socketRef.current = null;
    };
  }, []);

  const winnerMessage = (() => {
    if (winner === null) return "";
    if (mode === "computer") return `${winner} wins!`;
    if (winner === myIndex) return "You win!";
    return "Opponent wins!";
  })();

  function WinBanner() {
    if (!showWinBanner) return null;
    return (
      <div
        style={{
          marginTop: 16,
          padding: "12px 16px",
          background: "#fff3e0",
          border: "1px solid #d99b4a",
          borderRadius: 8,
          textAlign: "center",
        }}
      >
        <strong>{winnerMessage}</strong>
        <div style={{ marginTop: 10 }} className="btn-row">
          {mode === "computer" ? (
            <button
              className="btn btn-primary"
              onClick={() =>
                startComputerGame({ showTimerByDefault: showTimer })
              }
            >
              Rematch
            </button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={restartRoom}>
                Restart
              </button>
              <button className="btn btn-outline" onClick={leaveRoom}>
                Leave
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function potatoLeftPercent(holder) {
    return holder === 0 ? 12 : 88;
  }

  function Avatar({ idx, isYou, isActive, label }) {
    const imgSrc = idx === 0 ? "/1.png" : "/2.png";
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={imgSrc}
            alt={`Player ${idx}`}
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              boxShadow: isActive ? "0 6px 18px rgba(255,165,0,0.24)" : "none",
            }}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: 14 }}>
          {label}
          {isActive && (
            <span className="muted" style={{ marginLeft: 6 }}>
              •
            </span>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- Main render ---------------- */
  if (!mode) {
    return (
      <div className="page-center">
        <div className="card-card-lg" style={{ maxWidth: 720 }}>
          <h1 className="card-title">🥔 Hot Potato — Don’t get burned!</h1>

          <div
            style={{
              border: "1px solid #d99b4a",
              borderRadius: 8,
              padding: "12px 16px",
              marginTop: 12,
              background: "linear-gradient(180deg,#fff7ed,#fff3e0)",
            }}
          >
            <h3 style={{ marginBottom: 8 }}>How to play</h3>
            <ol style={{ marginLeft: 18, lineHeight: 1.7 }}>
              <li>Two players pass the potato to each other.</li>
              <li>The potato will explode after a random time (10–70s).</li>
              <li>If you hold the potato when it explodes, you lose.</li>
            </ol>
            <div style={{ marginTop: 10 }}>
              <label className="muted" style={{ marginRight: 8 }}>
                Show countdown
              </label>
              <input
                type="checkbox"
                checked={showTimer}
                onChange={(e) => setShowTimer(e.target.checked)}
              />{" "}
              <span className="muted" style={{ marginLeft: 10 }}>
                (Uncheck to make it a surprise)
              </span>
            </div>
          </div>

          <div
            style={{ display: "flex", justifyContent: "center", marginTop: 18 }}
          >
            <div
              style={{
                fontSize: 48,
                transform: "translateY(-2px)",
                animation: "hp-bob 1300ms ease-in-out infinite",
              }}
            >
              🥔
            </div>
          </div>

          <div style={{ marginTop: 18 }} className="btn-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                startComputerGame({ showTimerByDefault: showTimer })
              }
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

          <style>
            {`@keyframes hp-bob { 0% { transform: translateY(0);} 50% { transform: translateY(-6px);} 100% { transform: translateY(0);} }`}
          </style>
        </div>
      </div>
    );
  }

  if (mode === "computer") {
    return (
      <div className="page-center">
        <div className="card-card-lg" style={{ width: 720, maxWidth: "95vw" }}>
          <div className="row-between" style={{ alignItems: "center" }}>
            <h2 className="card-title">Hot Potato — VS Computer</h2>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setMode(null);
                setExplodesAt(null);
                setRemaining(null);
                setWinner(null);
                setStatus("waiting");
                setShowWinBanner(false);
              }}
            >
              Leave
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ position: "relative", height: 140, marginTop: 6 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  height: "100%",
                }}
              >
                <div style={{ width: 160 }}>
                  <Avatar
                    idx={0}
                    isYou={true}
                    isActive={current === 0}
                    label={current === 0 ? "You • holding" : "You"}
                  />
                </div>

                <div style={{ width: 160, textAlign: "right" }}>
                  <Avatar
                    idx={1}
                    isYou={false}
                    isActive={current === 1}
                    label={current === 1 ? "Computer • holding" : "Computer"}
                  />
                </div>
              </div>

              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 48,
                  left: `${potatoLeftPercent(current)}%`,
                  transform: "translate(-50%, -50%)",
                  transition:
                    "left 450ms cubic-bezier(.22,.9,.1,1), transform 120ms",
                  fontSize: 55,
                  pointerEvents: "none",
                }}
              >
                {status === "finished" ? "💥" : "🥔"}
              </div>
            </div>

            <div style={{ marginTop: 12 }} className="muted">
              {status === "finished" ? (
                <strong>{winner} wins!</strong>
              ) : showTimer && remaining !== null ? (
                `Explodes in: ${remaining}s`
              ) : null}
            </div>

            {status === "playing" && current === 0 && (
              <div style={{ marginTop: 14 }} className="btn-row">
                <button className="btn btn-primary" onClick={passLocal}>
                  Pass
                </button>
              </div>
            )}

            {status === "finished" && <WinBanner />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-center">
      <div className="card-card-lg" style={{ width: 720, maxWidth: "95vw" }}>
        {!roomId ? (
          <>
            <h2 className="card-title">Hot Potato — VS Friend</h2>
            <div style={{ marginTop: 10 }} className="btn-row">
              <button className="btn btn-primary" onClick={createRoom}>
                Create Room
              </button>
              <input
                id="hp-room"
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
                  joinRoom(document.getElementById("hp-room").value)
                }
              >
                Join
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="row-between" style={{ alignItems: "center" }}>
              <h2 className="card-title">Hot Potato — Room</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

            <div style={{ marginTop: 12 }}>
              <div style={{ position: "relative", height: 140 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    height: "100%",
                  }}
                >
                  <div style={{ width: 160 }}>
                    <Avatar
                      idx={0}
                      isYou={myIndex === 0}
                      isActive={current === 0}
                      label={
                        myIndex === 0
                          ? current === 0
                            ? "You • holding"
                            : "You"
                          : "Player 0"
                      }
                    />
                  </div>

                  <div style={{ width: 160, textAlign: "right" }}>
                    <Avatar
                      idx={1}
                      isYou={myIndex === 1}
                      isActive={current === 1}
                      label={
                        myIndex === 1
                          ? current === 1
                            ? "You • holding"
                            : "You"
                          : "Player 1"
                      }
                    />
                  </div>
                </div>

                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 48,
                    left: `${potatoLeftPercent(current)}%`,
                    transform: "translate(-50%, -50%)",
                    transition:
                      "left 450ms cubic-bezier(.22,.9,.1,1), transform 120ms",
                    fontSize: 40,
                    pointerEvents: "none",
                  }}
                >
                  {status === "finished" ? "💥" : "🥔"}
                </div>
              </div>

              <div style={{ marginTop: 10 }} className="muted">
                {status === "finished" ? (
                  <strong>Winner: Player {winner}</strong>
                ) : showTimer && remaining !== null ? (
                  `Explodes in: ${remaining}s`
                ) : status === "waiting" ? (
                  "Waiting for players..."
                ) : null}
              </div>

              {status === "playing" && myIndex === current && (
                <div style={{ marginTop: 14 }} className="btn-row">
                  <button
                    className="btn btn-primary"
                    onClick={() => passSocket(1)}
                  >
                    Pass
                  </button>
                </div>
              )}

              {status === "finished" && <WinBanner />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
