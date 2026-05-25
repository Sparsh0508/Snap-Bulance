import { apiClient } from "./apiClient";

export const authApi = {
  getSession: () => apiClient.get("/auth"),
  login: (payload) => apiClient.post("/auth/login", payload),
  signup: (payload) => apiClient.post("/auth/signup", payload),
  logout: () => apiClient.post("/auth/logout"),
};

export const userApi = {
  getProfile: () => apiClient.get("/users/profile"),
  updateProfile: (payload) => apiClient.put("/users/profile", payload),
  getActiveTrip: () => apiClient.get("/users/active-trip"),
  bookTrip: (payload) => apiClient.post("/users/book-trip", payload),
  getNearbyAmbulances: (lat, lng, limit = 8) =>
    apiClient.get(`/users/nearby-ambulances?lat=${lat}&lng=${lng}&limit=${limit}`),
  getTrip: (tripId) => apiClient.get(`/users/trip/${tripId}`),
  getTripChat: (tripId) => apiClient.get(`/users/trip/${tripId}/chat`),
  getTripHistory: () => apiClient.get("/users/trips/history"),
};

export const driverApi = {
  getDashboardSummary: () => apiClient.get("/drivers/dashboard-summary"),
  updateStatus: (payload) => apiClient.put("/drivers/status", payload),
  updateLocation: (payload) => apiClient.put("/drivers/location", payload),
  getPendingRequests: () => apiClient.get("/drivers/pending-requests"),
  getActiveTrip: () => apiClient.get("/drivers/active-trip"),
  getTripHistory: () => apiClient.get("/trips/driver/history"),
  getTrip: (tripId) => apiClient.get(`/trips/driver/trip/${tripId}`),
};

export const tripApi = {
  cancel: (tripId) => apiClient.post(`/trips/${tripId}/cancel`),
  arriveToPatient: (tripId) => apiClient.post(`/trips/${tripId}/arrive-to-patient`),
  arriveAtHospital: (tripId) => apiClient.post(`/trips/${tripId}/arrive-at-hospital`),
  complete: (tripId, payload) => apiClient.post(`/trips/${tripId}/complete`, payload),
};

export const cfrApi = {
  getNearby: (lat, lng) => apiClient.get(`/cfr/nearby?lat=${lat}&lng=${lng}`),
  respond: (tripId) => apiClient.post(`/cfr/respond/${tripId}`),
};

export const hospitalApi = {
  getDashboard: () => apiClient.get("/hospitals/dashboard"),
  getProfile: () => apiClient.get("/hospitals/profile"),
  updateProfile: (payload) => apiClient.put("/hospitals/profile", payload),
  getTrip: (tripId) => apiClient.get(`/hospitals/trip/${tripId}`),
};
