import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { AmbulanceModel } from '../models/ambulance.js';
import { ChatMessageModel } from '../models/chat-message.js';
import { DriverProfileModel } from '../models/driver-profile.js';
import { TripModel } from '../models/trip.js';
import { UserModel } from '../models/user.js';
import { asyncHandler } from '../utils/async-handler.js';
import { getDistanceFromLatLonInKm } from '../utils/distance.js';
import { HttpError } from '../utils/http-error.js';
import { buildLocation } from '../utils/location.js';
import { normalizeDocument } from '../utils/normalize.js';
import { hydrateTrip } from '../utils/presenters.js';
export const usersRouter = Router();
usersRouter.get('/profile', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const user = await UserModel.findById(userId).select('email phone fullName bloodType allergies emergencyContact role');
    if (!user) {
        throw new HttpError(404, 'User profile not found');
    }
    res.json(normalizeDocument(user));
}));
usersRouter.put('/profile', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const updatedUser = await UserModel.findByIdAndUpdate(userId, {
        fullName: req.body.fullName,
        email: req.body.email,
        phone: req.body.phone,
        bloodType: req.body.bloodType,
        allergies: req.body.allergies,
        emergencyContact: req.body.emergencyContact,
    }, {
        new: true,
        runValidators: true,
    }).select('email phone fullName bloodType allergies emergencyContact');
    if (!updatedUser) {
        throw new HttpError(404, 'User profile not found');
    }
    res.json(normalizeDocument(updatedUser));
}));
usersRouter.post('/book-trip', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { lat, lng, destinationAddress = null, destinationLat = null, destinationLng = null } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        throw new HttpError(400, 'lat and lng are required');
    }
    const hasDestinationCoords = destinationLat !== null || destinationLng !== null;
    if (hasDestinationCoords && (typeof destinationLat !== 'number' || typeof destinationLng !== 'number')) {
        throw new HttpError(400, 'destinationLat and destinationLng must be valid numbers together');
    }
    const trip = await TripModel.create({
        passengerId: userId,
        pickupLat: lat,
        pickupLng: lng,
        pickupAddress: "User's Live Location",
        destAddress: typeof destinationAddress === 'string' && destinationAddress.trim() ? destinationAddress.trim() : null,
        destLat: hasDestinationCoords ? destinationLat : null,
        destLng: hasDestinationCoords ? destinationLng : null,
    });
    res.json(normalizeDocument(trip));
}));
usersRouter.get('/active-trip', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const trip = await TripModel.findOne({
        passengerId: userId,
        status: { $nin: ['COMPLETED', 'CANCELLED'] },
    });
    res.json(trip ? normalizeDocument(trip) : null);
}));
usersRouter.get('/nearby-ambulances', requireAuth, asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        throw new HttpError(400, 'lat and lng query params are required');
    }

    const availableDrivers = await DriverProfileModel.find({
        status: 'AVAILABLE',
        currentLat: { $ne: null },
        currentLng: { $ne: null },
    }).sort({ lastLocationUpdate: -1 }).limit(limit);

    const ambulances = await Promise.all(availableDrivers.map(async (driverDoc) => {
        const driver = normalizeDocument(driverDoc);
        const [driverUser, ambulance] = await Promise.all([
            driver.userId ? UserModel.findById(driver.userId).select('fullName phone') : null,
            driver.ambulanceId ? AmbulanceModel.findById(driver.ambulanceId) : null,
        ]);
        const distanceKm = getDistanceFromLatLonInKm(lat, lng, driver.currentLat, driver.currentLng);
        const estimatedArrivalMinutes = Math.max(1, Math.ceil((distanceKm / 35) * 60));
        return {
            ...driver,
            user: driverUser ? normalizeDocument(driverUser) : null,
            ambulance: ambulance ? normalizeDocument(ambulance) : null,
            distanceKm: Number(distanceKm.toFixed(2)),
            estimatedArrivalMinutes,
            location: buildLocation(driver.currentLat, driver.currentLng, {
                updatedAt: driver.lastLocationUpdate,
            }),
        };
    }));

    ambulances.sort((left, right) => left.distanceKm - right.distanceKm);
    res.json(ambulances);
}));
usersRouter.get('/trip/:id/chat', requireAuth, asyncHandler(async (req, res) => {
    const messages = await ChatMessageModel.find({ tripId: req.params.id }).sort({ timestamp: 1 });
    res.json(normalizeDocument(messages));
}));
usersRouter.get('/trips/history', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const trips = await TripModel.find({ passengerId: userId }).sort({ requestedAt: -1 });
    const history = await Promise.all(trips.map(async (tripDoc) => {
        const trip = normalizeDocument(tripDoc);
        const hydrated = await hydrateTrip(tripDoc);
        return {
            id: trip.id,
            requestedAt: trip.requestedAt,
            pickupAddress: trip.pickupAddress,
            destAddress: trip.destAddress,
            status: trip.status,
            hospital: hydrated?.hospital ? { name: hydrated.hospital.name } : null,
        };
    }));
    res.json(history);
}));
usersRouter.get('/trip/:id', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const trip = await TripModel.findOne({
        _id: req.params.id,
        passengerId: userId,
    });
    if (!trip) {
        throw new HttpError(404, 'Trip not found or unauthorized');
    }
    res.json(await hydrateTrip(trip));
}));
