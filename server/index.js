// server/index.js
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";




const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(cors());
app.get("/", (req, res) => res.send("KhelaHobe Server ✅"));
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});


const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 5000;
const rooms = {};

function makeId() {
  return Math.random().toString(36).substring(2, 8);
}

function safeHotPotatoRoom(room) {
  if (!room) return null;
  return {
    game: room.game,
    current: room.current,
    status: room.status,
    winner: room.winner,
    explodesAt: room.explodesAt,
    showTimer: room.showTimer,
    playersCount: room.players.length,
  };
}

// returns { player: 'X'|'O'|'draw', line: [a,b,c] | null } or null if game continues
function getTicWinnerWithLine(board) {
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
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { player: board[a], line: [a, b, c] };
    }
  }
  if (!board.includes(null)) return { player: "draw", line: null };
  return null;
}

function checkNimFinished(piles) {
  return piles.every((p) => p === 0);
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // ---------------- TTT ----------------
  socket.on("ttt:createRoom", (maybeCb) => {
    const cb = typeof maybeCb === "function" ? maybeCb : undefined;
    const roomId = makeId();
    rooms[roomId] = {
      game: "tictactoe",
      board: Array(9).fill(null),
      players: [],
      turn: "X",
      status: "waiting",
      winner: null,
      winningLine: null,
      // match-level
      scores: { X: 0, O: 0, draw: 0 },
      currentGame: 1,
      totalGames: 6,
      firstPlayer: "X",
      lastRoundWinner: null,
    };
    if (cb) cb({ roomId });
    io.to(roomId).emit("ttt:update", {
      ...rooms[roomId],
      playersCount: rooms[roomId].players.length,
    });
  });

  socket.on("ttt:joinRoom", (dataOrCb, maybeCb) => {
    let roomId;
    let cb;
    if (typeof dataOrCb === "function") {
      cb = dataOrCb;
    } else if (typeof maybeCb === "function") {
      cb = maybeCb;
      roomId = dataOrCb?.roomId ?? dataOrCb;
    } else {
      roomId = dataOrCb?.roomId ?? dataOrCb;
    }

    if (!roomId) {
      if (cb) cb({ error: "RoomId required" });
      return;
    }
    const room = rooms[roomId];
    if (!room || room.game !== "tictactoe") {
      if (cb) cb({ error: "Room not found" });
      return;
    }
    if (room.players.length >= 2) {
      if (cb) cb({ error: "Room full" });
      return;
    }

    room.players.push(socket.id);
    socket.join(roomId);
    if (room.players.length === 2) room.status = "playing";

    const index = room.players.length - 1;
    const symbol = index === 0 ? "X" : "O";

    if (cb) {
      cb({
        symbol,
        room: {
          board: room.board,
          turn: room.turn,
          status: room.status,
          winner: room.winner,
          players: room.players,
        },
      });
    }

    // send direct roomJoined to this socket (client expects this)
    socket.emit("ttt:roomJoined", {
      roomId,
      index,
      players: room.players.length,
    });

    // broadcast players and full update
    io.to(roomId).emit("ttt:players", { players: room.players.length });
    io.to(roomId).emit("ttt:update", {
      ...room,
      playersCount: room.players.length,
    });
  });

  socket.on("ttt:move", (data = {}, cb) => {
    const roomId = data.roomId;
    const index = data.index;
    if (!roomId) {
      if (cb) cb({ error: "RoomId required" });
      return;
    }
    const room = rooms[roomId];
    if (!room || room.game !== "tictactoe") {
      if (cb) cb({ error: "Room not found" });
      return;
    }
    if (room.status !== "playing") {
      if (cb) cb({ error: "Room not playing" });
      return;
    }
    const playerIndex = room.players.indexOf(socket.id);
    if (playerIndex === -1) {
      if (cb) cb({ error: "Not in room" });
      return;
    }
    const symbol = playerIndex === 0 ? "X" : "O";
    if (room.turn !== symbol) {
      if (cb) cb({ error: "Not your turn" });
      return;
    }
    if (typeof index !== "number" || index < 0 || index > 8) {
      if (cb) cb({ error: "Invalid index" });
      return;
    }
    if (room.board[index]) {
      if (cb) cb({ error: "Cell already taken" });
      return;
    }

    room.board[index] = symbol;

    const winRes = getTicWinnerWithLine(room.board);
    if (winRes) {
      room.status = "finished";
      room.winner = winRes.player; // 'X'|'O'|'draw'
      room.winningLine = winRes.line || null;
      room.lastRoundWinner = winRes.player;
      if (winRes.player === "X" || winRes.player === "O") {
        room.scores[winRes.player] = (room.scores[winRes.player] || 0) + 1;
      } else if (winRes.player === "draw") {
        room.scores.draw = (room.scores.draw || 0) + 1;
      }
    } else {
      room.turn = room.turn === "X" ? "O" : "X";
      room.winningLine = null;
      room.winner = null;
    }

    // emit immediate update (includes winningLine if present)
    io.to(roomId).emit("ttt:update", {
      ...room,
      playersCount: room.players.length,
    });

    if (winRes) {
      // emit roundFinished with winningLine so clients can show banner + highlight
      io.to(roomId).emit("ttt:roundFinished", {
        winner: room.winner,
        winningLine: room.winningLine,
      });

      // after a short delay advance match or finish
      setTimeout(() => {
        if (room.currentGame < (room.totalGames || 6)) {
          room.currentGame = (room.currentGame || 1) + 1;
          room.firstPlayer = room.firstPlayer === "X" ? "O" : "X";
          room.board = Array(9).fill(null);
          room.turn = room.firstPlayer;
          room.status = room.players.length === 2 ? "playing" : "waiting";
          room.winner = null;
          room.winningLine = null;
          room.lastRoundWinner = null;
          io.to(roomId).emit("ttt:update", {
            ...room,
            playersCount: room.players.length,
          });
        } else {
          // match finished
          room.status = "finished";
          // clients can compute match winner from room.scores; include update
          io.to(roomId).emit("ttt:update", {
            ...room,
            playersCount: room.players.length,
          });
        }
      }, 1800);
    }

    if (cb) cb({ ok: true });
  });

  socket.on("ttt:roundFinished", (payload = {}) => {
    const roomId = payload.roomId;
    const winner = payload.winner;
    const winningLine = payload.winningLine || null;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room || room.game !== "tictactoe") return;
    // broadcast what the client asked - idempotent
    io.to(roomId).emit("ttt:roundFinished", { winner, winningLine });
  });

  socket.on("ttt:requestReset", ({ roomId } = {}) => {
    const room = rooms[roomId];
    if (!room || room.game !== "tictactoe") return;
    room.board = Array(9).fill(null);
    room.turn = room.firstPlayer || "X";
    room.status = room.players.length === 2 ? "playing" : "waiting";
    room.winner = null;
    room.winningLine = null;
    room.lastRoundWinner = null;
    io.to(roomId).emit("ttt:update", {
      ...room,
      playersCount: room.players.length,
    });
  });

  socket.on("ttt:resetMatch", ({ roomId } = {}) => {
    const room = rooms[roomId];
    if (!room || room.game !== "tictactoe") return;
    room.board = Array(9).fill(null);
    room.turn = "X";
    room.status = room.players.length === 2 ? "playing" : "waiting";
    room.winner = null;
    room.winningLine = null;
    room.scores = { X: 0, O: 0, draw: 0 };
    room.currentGame = 1;
    room.firstPlayer = "X";
    room.lastRoundWinner = null;
    io.to(roomId).emit("ttt:update", {
      ...room,
      playersCount: room.players.length,
    });
  });

  socket.on("ttt:leaveRoom", ({ roomId } = {}) => {
    const room = rooms[roomId];
    if (!room) return;
    room.players = room.players.filter((id) => id !== socket.id);
    room.status = "waiting";
    socket.leave(roomId);
    io.to(roomId).emit("ttt:update", {
      ...room,
      playersCount: room.players.length,
    });
    io.to(roomId).emit("ttt:players", { players: room.players.length });
  });

  // ---------------- Nim (fixed) ----------------
  socket.on("nim:createRoom", ({ piles } = {}, cb) => {
    const roomId = makeId();

    const initialPiles =
      Array.isArray(piles) && piles.length > 0
        ? piles.map((n) => Number(n))
        : [3, 4, 5];

    rooms[roomId] = {
      game: "nim",
      piles: initialPiles.slice(),
      initialPiles: initialPiles.slice(),
      players: [],
      turn: "X",
      status: "waiting",
      winner: null,
      // match-level
      scores: { X: 0, O: 0, draw: 0 },
      currentGame: 1,
      totalGames: 6,
      firstPlayer: "X",
      lastRoundWinner: null,
      lastAction: null,
    };

    if (typeof cb === "function") {
      cb({ roomId });
    }

    io.to(roomId).emit("nim:update", {
      ...rooms[roomId],
      playersCount: rooms[roomId].players.length,
    });
  });

  socket.on("nim:joinRoom", ({ roomId } = {}, cb) => {
    const room = rooms[roomId];
    if (!room || room.game !== "nim") {
      if (cb) cb({ error: "Room not found" });
      return;
    }
    if (room.players.length >= 2) {
      if (cb) cb({ error: "Room full" });
      return;
    }

    room.players.push(socket.id);
    socket.join(roomId);
    if (room.players.length === 2) room.status = "playing";

    const index = room.players.indexOf(socket.id);
    const symbol = index === 0 ? "X" : "O";

    if (typeof cb === "function") {
      cb({
        symbol,
        room: {
          piles: room.piles,
          turn: room.turn,
          status: room.status,
          winner: room.winner,
          players: room.players,
          scores: room.scores,
          currentGame: room.currentGame,
          totalGames: room.totalGames,
          firstPlayer: room.firstPlayer,
        },
      });
    }

    io.to(roomId).emit("nim:update", {
      ...room,
      playersCount: room.players.length,
    });
  });

  socket.on("nim:move", ({ roomId, pileIndex, count } = {}, cb) => {
    const room = rooms[roomId];
    if (!room || room.game !== "nim") {
      if (cb) cb({ error: "Room not found" });
      return;
    }
    if (room.status !== "playing") {
      if (cb) cb({ error: "Room not playing" });
      return;
    }

    const playerIndex = room.players.indexOf(socket.id);
    if (playerIndex === -1) {
      if (cb) cb({ error: "Not in room" });
      return;
    }
    const symbol = playerIndex === 0 ? "X" : "O";
    if (room.turn !== symbol) {
      if (cb) cb({ error: "Not your turn" });
      return;
    }

    if (
      typeof pileIndex !== "number" ||
      pileIndex < 0 ||
      pileIndex >= room.piles.length ||
      typeof count !== "number" ||
      count < 1 ||
      room.piles[pileIndex] < count
    ) {
      if (cb) cb({ error: "Invalid move" });
      return;
    }

    room.piles[pileIndex] -= count;
    room.lastAction = `${symbol} took ${count} from pile ${String.fromCharCode(
      65 + pileIndex
    )}`;

    // Check winner (last to take wins)
    if (checkNimFinished(room.piles)) {
      room.status = "finished";
      room.winner = symbol;
      room.lastRoundWinner = symbol;
      room.scores[symbol] = (room.scores[symbol] || 0) + 1;

      io.to(roomId).emit("nim:update", {
        ...room,
        playersCount: room.players.length,
      });

      // broadcast round finished so clients show banner
      // broadcast round finished so clients show banner
      io.to(roomId).emit("nim:roundFinished", { winner: room.winner });

      // don’t auto-advance; wait for players to request rematch

      if (cb) cb({ ok: true });
      return;
    }

    // continue the round
    room.turn = room.turn === "X" ? "O" : "X";

    io.to(roomId).emit("nim:update", {
      ...room,
      playersCount: room.players.length,
    });

    if (cb) cb({ ok: true });
  });

  socket.on("nim:rematch", ({ roomId } = {}, cb) => {
    const room = rooms[roomId];
    if (!room || room.game !== "nim") {
      if (cb) cb({ error: "Room not found" });
      return;
    }

    const initialPiles =
      Array.isArray(room.initialPiles) && room.initialPiles.length > 0
        ? room.initialPiles.slice()
        : [3, 4, 5];

    room.piles = initialPiles.slice();
    room.turn = "X";
    room.status = room.players.length === 2 ? "playing" : "waiting";
    room.winner = null;
    room.scores = { X: 0, O: 0, draw: 0 };
    room.currentGame = 1;
    room.firstPlayer = "X";
    room.lastRoundWinner = null;
    room.lastAction = null;

    if (typeof cb === "function") {
      cb({ ok: true, room });
    }

    io.to(roomId).emit("nim:update", {
      ...room,
      playersCount: room.players.length,
    });
  });

  // ---------------- HotPotato (fixed) ----------------
  socket.on("hotpotato:createRoom", ({ showTimer = false } = {}, cb) => {
    const roomId = makeId();
    rooms[roomId] = {
      game: "hotpotato",
      players: [],
      current: 0,
      status: "waiting",
      winner: null,
      explodesAt: null,
      timer: null, // internal, not sent to client
      showTimer,
    };
    if (typeof cb === "function") cb({ roomId });

    io.to(roomId).emit("hotpotato:update", safeHotPotatoRoom(rooms[roomId]));
  });

  socket.on("hotpotato:joinRoom", ({ roomId } = {}, cb) => {
    const room = rooms[roomId];
    if (!room || room.game !== "hotpotato") {
      if (cb) cb({ error: "Room not found" });
      return;
    }
    if (room.players.length >= 2) {
      if (cb) cb({ error: "Room full" });
      return;
    }

    room.players.push(socket.id);
    socket.join(roomId);

    // When second player joins → start countdown
    if (room.players.length === 2) {
      room.status = "playing";

      const duration = 10000 + Math.floor(Math.random() * 10000); // 10–20s (adjust if needed)
      room.explodesAt = Date.now() + duration;

      if (room.timer) clearTimeout(room.timer);
      room.timer = setTimeout(() => {
        if (!room || room.status !== "playing") return;
        room.status = "finished";
        room.winner = room.current === 0 ? 1 : 0;
        io.to(roomId).emit("hotpotato:update", safeHotPotatoRoom(room));
      }, duration);
    }

    if (cb) {
      cb({
        index: room.players.length - 1,
        room: safeHotPotatoRoom(room),
      });
    }

    io.to(roomId).emit("hotpotato:update", safeHotPotatoRoom(room));
  });

  // handle pass event
  socket.on("hotpotato:pass", ({ roomId } = {}) => {
    const room = rooms[roomId];
    if (!room || room.game !== "hotpotato") return;
    if (room.status !== "playing") return;

    const playerIndex = room.players.indexOf(socket.id);
    if (playerIndex === -1) return;

    // only the current holder can pass
    if (room.current !== playerIndex) return;

    // toggle potato holder
    room.current = room.current === 0 ? 1 : 0;

    io.to(roomId).emit("hotpotato:update", safeHotPotatoRoom(room));
  });

  // restart hotpotato game in the same room
  socket.on("hotpotato:restartRoom", ({ roomId } = {}, cb) => {
    console.log("hotpotato:restartRoom called for", roomId, "by", socket.id);

    const room = rooms[roomId];
    if (!room || room.game !== "hotpotato") {
      if (typeof cb === "function") cb({ error: "Room not found" });
      return;
    }

    // reset state
    room.current = 0;
    room.status = room.players.length === 2 ? "playing" : "waiting";
    room.winner = null;

    // use 10-70s random duration to match client randSeconds
    const duration = 10000 + Math.floor(Math.random() * 60000); // 10–70s
    room.explodesAt = Date.now() + duration;

    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      if (!room || room.status !== "playing") return;
      room.status = "finished";
      room.winner = room.current === 0 ? 1 : 0;
      io.to(roomId).emit("hotpotato:update", safeHotPotatoRoom(room));
    }, duration);

    // send immediate update and acknowledge the caller
    io.to(roomId).emit("hotpotato:update", safeHotPotatoRoom(room));
    if (typeof cb === "function")
      cb({ ok: true, room: safeHotPotatoRoom(room) });
  });

  // ---------------- disconnect cleanup ----------------
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
    for (const [roomId, room] of Object.entries(rooms)) {
      if (!room.players) continue;
      if (room.players.includes(socket.id)) {
        room.players = room.players.filter((id) => id !== socket.id);
        room.status = "waiting";
        const eventName =
          room.game === "nim"
            ? "nim:update"
            : room.game === "hotpotato"
            ? "hotpotato:update"
            : room.game === "pong"
            ? "pong:update"
            : "ttt:update";
        io.to(roomId).emit(eventName, {
          ...room,
          playersCount: room.players.length,
        });
        if (room.game === "tictactoe") {
          io.to(roomId).emit("ttt:players", { players: room.players.length });
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
