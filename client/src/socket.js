// client/src/socket.js
import { io } from "socket.io-client";

let socket;

export function getSocket() {
  if (!socket) {
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";

    socket = io(SERVER_URL, {
      transports: ["websocket"],
    });
  }
  return socket;
}
