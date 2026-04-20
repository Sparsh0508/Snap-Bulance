import { io } from "socket.io-client";
// socket url == backend url
const SOCKET_URL = import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV
        ? (import.meta.env.VITE_API_URL_LOCAL || "http://localhost:3000")
        : (import.meta.env.VITE_API_URL_PROD || "https://snap-bulance-backend.onrender.com"));
// export initialized socket object to easily use it everywhere
export const socket = io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true
});
