import { ChatMessageModel } from '../models/chat-message.js';
import { DriverProfileModel } from '../models/driver-profile.js';
import { TripModel } from '../models/trip.js';
import { normalizeDocument } from '../utils/normalize.js';
export function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);
        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
        socket.on('pingServer', (payload) => {
            console.log(`Received ping from ${socket.id}`, payload);
            socket.emit('pongClient', { message: 'Hello from Express!' });
        });
        socket.on('joinTrip', (tripId) => {
            socket.join(tripId);
        });
        socket.on('sendChat', async (payload) => {
            const savedMessage = await ChatMessageModel.create({
                tripId: payload.tripId,
                senderId: payload.senderId,
                senderName: payload.senderName,
                message: payload.message,
            });
            const normalized = normalizeDocument(savedMessage);
            io.to(payload.tripId).emit('receiveChat', {
                senderName: normalized.senderName,
                senderId: normalized.senderId,
                message: normalized.message,
                timestamp: new Date(normalized.timestamp).toISOString(),
            });
        });
        socket.on('acceptTrip', async (payload) => {
            const driverProfile = await DriverProfileModel.findOne({ userId: payload.driverId });
            if (!driverProfile) {
                console.error(`No driver profile found for user ${payload.driverId}`);
                return;
            }
            await Promise.all([
                TripModel.findByIdAndUpdate(payload.tripId, {
                    status: 'ASSIGNED',
                    driverId: driverProfile.id,
                    acceptedAt: new Date(),
                }),
                DriverProfileModel.findByIdAndUpdate(driverProfile.id, {
                    status: 'BUSY',
                }),
            ]);
            io.to(payload.tripId).emit('tripAccepted', {
                driverId: driverProfile.id,
                message: 'Ambulance is en route!',
                acceptedAt: new Date().toISOString(),
            });
            io.to(payload.tripId).emit('tripStatusChanged', {
                tripId: payload.tripId,
                status: 'ASSIGNED',
                message: 'Ambulance is en route!',
            });
        });
        socket.on('updateTripStatus', (payload) => {
            io.to(payload.tripId).emit('tripStatusChanged', payload);
        });
        socket.on('driverLocationUpdate', async (payload) => {
            const trip = await TripModel.findById(payload.tripId);
            if (trip?.driverId) {
                await DriverProfileModel.findByIdAndUpdate(trip.driverId, {
                    currentLat: payload.lat,
                    currentLng: payload.lng,
                    lastLocationUpdate: new Date(),
                });
            }
            io.to(payload.tripId).emit('driverLocationUpdated', {
                lat: payload.lat,
                lng: payload.lng,
            });
        });
        socket.on('cfrResponding', (payload) => {
            io.to(payload.tripId).emit('cfrAlert', {
                message: `Community First Responder ${payload.cfrName} is nearby and on foot to assist you before the ambulance arrives.`,
                cfrName: payload.cfrName,
            });
        });
    });
}
