// src/utils/api.js
import axios from "axios";
import { useAuthStore } from '../store/useAuthStore';
const API_BASE = import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV
        ? (import.meta.env.VITE_API_URL_LOCAL || "http://localhost:3000")
        : (import.meta.env.VITE_API_URL_PROD || "https://snap-bulance-backend.onrender.com"));
export const api = axios.create({
    baseURL: API_BASE, // Backend API URL
    withCredentials: true, // CRITICAL: This tells the browser to send the HTTP-only cookie
});
// Response Interceptor
api.interceptors.response.use((response) => {
    // Any status code that lies within the range of 2xx causes this function to trigger
    return response;
}, (error) => {
    // Any status codes that fall outside the range of 2xx cause this function to trigger
    if (error.response?.status === 401) {
        console.warn('Session expired or unauthorized. Logging out...');
        // Directly trigger the Zustand action to clear state
        // This will instantly update the UI and push the user to /login via the ProtectedRoute
        useAuthStore.getState().handleSessionExpired();
    }
    return Promise.reject(error);
});
