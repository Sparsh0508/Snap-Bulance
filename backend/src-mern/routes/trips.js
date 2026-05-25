import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { DriverProfileModel } from '../models/driver-profile.js';
import { HospitalModel } from '../models/hospital.js';
import { MedicalReportModel } from '../models/medical-report.js';
import { TripModel } from '../models/trip.js';
import { UserModel } from '../models/user.js';
import { asyncHandler } from '../utils/async-handler.js';
import { getDistanceFromLatLonInKm } from '../utils/distance.js';
import { getHospitalsWithCache } from '../utils/hospital-cache.js';
import { HttpError } from '../utils/http-error.js';
import { hydrateTrip } from '../utils/presenters.js';
import { normalizeDocument } from '../utils/normalize.js';
import { calculateTripEarnings } from '../utils/trip-metrics.js';
import { getActiveTripsForHospital, getActiveTripsForDriver, calculateETA } from '../sockets/location-tracking.js';

export const tripsRouter = Router();
tripsRouter.get('/driver/history', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const driverProfile = await DriverProfileModel.findOne({ userId });
    if (!driverProfile) {
        throw new HttpError(404, 'Driver profile not found for this user.');
    }
    const trips = await TripModel.find({ driverId: driverProfile.id }).sort({ requestedAt: -1 });
    const history = await Promise.all(trips.map(async (tripDoc) => {
        const hydrated = (await hydrateTrip(tripDoc));
        return {
            id: hydrated?.id,
            requestedAt: hydrated?.requestedAt,
            pickupAddress: hydrated?.pickupAddress,
            destAddress: hydrated?.destAddress,
            status: hydrated?.status,
            hospital: hydrated?.hospital ? { name: hydrated.hospital.name } : null,
            passenger: hydrated?.passenger
                ? {
                    fullName: hydrated.passenger.fullName,
                    phone: hydrated.passenger.phone,
                }
                : null,
        };
    }));
    res.json(history);
}));
tripsRouter.post('/:tripId/arrive-to-patient', asyncHandler(async (req, res) => {
    const trip = await TripModel.findById(req.params.tripId);
    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }
    const hospitals = (await getHospitalsWithCache());
    if (hospitals.length === 0) {
        throw new HttpError(500, 'No hospitals seeded');
    }
    let closestHospital = null;
    let minDistance = Infinity;
    for (const hospital of hospitals) {
        const distance = getDistanceFromLatLonInKm(trip.pickupLat, trip.pickupLng, hospital.latitude, hospital.longitude);
        if (distance < minDistance) {
            minDistance = distance;
            closestHospital = hospital;
        }
    }
    if (!closestHospital) {
        throw new HttpError(500, 'Could not determine closest hospital');
    }
    const updatedTrip = await TripModel.findByIdAndUpdate(req.params.tripId, {
        status: 'ARRIVED',
        pickedUpAt: new Date(),
        hospitalId: closestHospital._id,
        destAddress: closestHospital.address,
        destLat: closestHospital.latitude,
        destLng: closestHospital.longitude,
        distanceKm: Number(minDistance.toFixed(2)),
    }, { new: true });
    const hospital = await HospitalModel.findById(closestHospital._id);
    res.json({
        success: true,
        updatedTrip: {
            ...normalizeDocument(updatedTrip),
            hospital: normalizeDocument(hospital),
        },
    });
}));
tripsRouter.post('/:tripId/arrive-at-hospital', asyncHandler(async (req, res) => {
    const updatedTrip = await TripModel.findByIdAndUpdate(req.params.tripId, { status: 'ON_BOARD' }, { new: true });
    res.json({
        success: true,
        updatedTrip: normalizeDocument(updatedTrip),
    });
}));
tripsRouter.post('/:tripId/complete', asyncHandler(async (req, res) => {
    const trip = await TripModel.findById(req.params.tripId);
    if (!trip) {
        throw new HttpError(404, `Trip with ID ${req.params.tripId} not found`);
    }
    const earningsAmount = calculateTripEarnings(trip.distanceKm);
    await TripModel.findByIdAndUpdate(req.params.tripId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        earningsAmount,
    });
    if (trip.driverId) {
        await DriverProfileModel.findByIdAndUpdate(trip.driverId, {
            status: 'AVAILABLE',
        });
    }
    await MedicalReportModel.findOneAndUpdate({ tripId: req.params.tripId }, {
        tripId: req.params.tripId,
        severity: req.body.severity || 'MODERATE',
        suspectedCondition: req.body.suspectedCondition,
        vitalsCheck: req.body.vitalsCheck,
        paramedicNotes: req.body.paramedicNotes,
    }, { upsert: true, new: true });
    res.json({
        success: true,
        earningsAmount,
        message: 'Handover complete. Trip ended, driver available, and medical report saved.',
    });
}));
tripsRouter.get('/driver/trip/:tripId', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const driverProfile = await DriverProfileModel.findOne({ userId });
    if (!driverProfile) {
        throw new HttpError(404, 'Driver profile not found.');
    }
    const trip = await TripModel.findOne({
        _id: req.params.tripId,
        driverId: driverProfile.id,
    });
    if (!trip) {
        throw new HttpError(404, 'Trip not found or unauthorized');
    }
    res.json(await hydrateTrip(trip));
}));
tripsRouter.post('/:tripId/cancel', asyncHandler(async (req, res) => {
    const trip = await TripModel.findById(req.params.tripId);
    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }
    const updatedTrip = await TripModel.findByIdAndUpdate(req.params.tripId, { status: 'CANCELLED' }, { new: true });
    if (trip.driverId) {
        await DriverProfileModel.findByIdAndUpdate(trip.driverId, {
            status: 'AVAILABLE',
        });
    }
    res.json({
        success: true,
        message: 'Trip cancelled successfully.',
        updatedTrip: normalizeDocument(updatedTrip),
    });
}));

/**
 * GET /trips/:tripId/live
 * Get real-time tracking data for a trip
 * Used by patients, drivers, and hospital staff to view live location
 */
tripsRouter.get('/:tripId/live', asyncHandler(async (req, res) => {
    const trip = await TripModel.findById(req.params.tripId);
    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }

    const driver = trip.driverId ? await DriverProfileModel.findById(trip.driverId) : null;
    const driverUser = driver?.userId ? await UserModel.findById(driver.userId) : null;

    res.json({
        tripId: normalizeDocument(trip).id,
        status: trip.status,
        driverLocation: {
            lat: trip.currentDriverLat,
            lng: trip.currentDriverLng,
            updatedAt: trip.lastLocationUpdate?.toISOString(),
        },
        pickupLocation: {
            lat: trip.pickupLat,
            lng: trip.pickupLng,
            address: trip.pickupAddress,
        },
        destinationLocation: trip.destLat ? {
            lat: trip.destLat,
            lng: trip.destLng,
            address: trip.destAddress,
        } : null,
        tracking: {
            distanceToPatient: trip.currentDistanceToPatient,
            distanceToHospital: trip.currentDistanceToHospital,
            etaToPatientSeconds: trip.estimatedArrivalToPatientTime,
            etaToHospitalSeconds: trip.estimatedArrivalToHospitalTime,
        },
        driver: driver ? {
            id: driver.id,
            name: driverUser?.fullName || 'Driver',
            phone: driverUser?.phone,
            vehicleType: driver.vehicleType,
            vehicleNumber: driver.vehicleNumber,
        } : null,
    });
}));

/**
 * GET /trips/patient/active
 * Get active trip for the logged-in patient
 */
tripsRouter.get('/patient/active', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const activeTrip = await TripModel.findOne({
        passengerId: userId,
        status: { $in: ['SEARCHING', 'ASSIGNED', 'ARRIVED', 'ON_BOARD'] },
    });

    if (!activeTrip) {
        return res.json({ activeTrip: null });
    }

    const hydratedTrip = await hydrateTrip(activeTrip);
    res.json({
        activeTrip: {
            id: hydratedTrip.id,
            status: activeTrip.status,
            driverLocation: {
                lat: activeTrip.currentDriverLat,
                lng: activeTrip.currentDriverLng,
            },
            pickupLocation: {
                lat: activeTrip.pickupLat,
                lng: activeTrip.pickupLng,
            },
            tracking: {
                distanceToPatient: activeTrip.currentDistanceToPatient,
                etaToPatientSeconds: activeTrip.estimatedArrivalToPatientTime,
            },
            driver: hydratedTrip.driver,
        },
    });
}));

/**
 * GET /trips/driver/active
 * Get active trips for the logged-in driver
 */
tripsRouter.get('/driver/active', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const driverProfile = await DriverProfileModel.findOne({ userId });
    
    if (!driverProfile) {
        throw new HttpError(404, 'Driver profile not found');
    }

    const activeTrips = await getActiveTripsForDriver(driverProfile.id);
    res.json({ activeTrips });
}));

/**
 * GET /trips/hospital/:hospitalId/active-ambulances
 * Get all active ambulances for a hospital dashboard
 */
tripsRouter.get('/hospital/:hospitalId/active-ambulances', requireAuth, asyncHandler(async (req, res) => {
    const hospitalId = req.params.hospitalId;
    const activeTrips = await getActiveTripsForHospital(hospitalId);

    const ambulances = await Promise.all(activeTrips.map(async (trip) => {
        const driver = trip.driverId ? await DriverProfileModel.findById(trip.driverId) : null;
        const passenger = trip.passengerId ? await UserModel.findById(trip.passengerId) : null;

        return {
            tripId: trip._id,
            status: trip.status,
            driverLocation: {
                lat: trip.currentDriverLat,
                lng: trip.currentDriverLng,
            },
            destinationLocation: {
                lat: trip.destLat,
                lng: trip.destLng,
            },
            distanceToHospital: trip.currentDistanceToHospital,
            etaToHospitalSeconds: trip.estimatedArrivalToHospitalTime,
            driver: driver ? {
                id: driver.id,
                name: (await UserModel.findById(driver.userId))?.fullName || 'Driver',
            } : null,
            patient: passenger ? {
                name: passenger.fullName,
                phone: passenger.phone,
            } : null,
        };
    }));

    res.json({ ambulances });
}));

/**
 * GET /trips/nearby-hospitals
 * Get hospitals near patient location
 */
tripsRouter.get('/nearby-hospitals', asyncHandler(async (req, res) => {
    const { lat, lng, radiusKm = 50 } = req.query;

    if (lat === undefined || lng === undefined) {
        throw new HttpError(400, 'Latitude and longitude are required');
    }

    const hospitals = await getHospitalsWithCache();
    const nearby = hospitals.filter((hospital) => {
        const distance = getDistanceFromLatLonInKm(
            parseFloat(lat),
            parseFloat(lng),
            hospital.latitude,
            hospital.longitude
        );
        return distance <= parseFloat(radiusKm);
    })
    .sort((a, b) => {
        const distA = getDistanceFromLatLonInKm(parseFloat(lat), parseFloat(lng), a.latitude, a.longitude);
        const distB = getDistanceFromLatLonInKm(parseFloat(lat), parseFloat(lng), b.latitude, b.longitude);
        return distA - distB;
    })
    .slice(0, 10);

    res.json({
        nearby: nearby.map((h) => ({
            id: h._id,
            name: h.name,
            address: h.address,
            lat: h.latitude,
            lng: h.longitude,
            distance: parseFloat(
                getDistanceFromLatLonInKm(
                    parseFloat(lat),
                    parseFloat(lng),
                    h.latitude,
                    h.longitude
                ).toFixed(2)
            ),
        })),
    });
}));

/**
 * POST /trips/:tripId/start-tracking
 * Initialize live tracking for a trip (called when trip is accepted)
 */
tripsRouter.post('/:tripId/start-tracking', asyncHandler(async (req, res) => {
    const trip = await TripModel.findByIdAndUpdate(
        req.params.tripId,
        {
            lastLocationUpdate: new Date(),
        },
        { new: true }
    );

    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }

    res.json({
        success: true,
        message: 'Live tracking started',
        trip: {
            id: trip._id,
            status: trip.status,
        },
    });
}));

/**
 * POST /trips/:tripId/update-route
 * Update route polyline and route info for a trip
 * Called when directions API provides route data
 */
tripsRouter.post('/:tripId/update-route', asyncHandler(async (req, res) => {
    const { polyline, distance, duration, waypoints } = req.body;
    
    if (!polyline) {
        throw new HttpError(400, 'Polyline is required');
    }

    const trip = await TripModel.findByIdAndUpdate(
        req.params.tripId,
        {
            routePolyline: polyline,
            'routeInfo.polyline': polyline,
            'routeInfo.distance': distance,
            'routeInfo.duration': duration,
            'routeInfo.waypoints': waypoints || [],
            'routeInfo.updatedAt': new Date(),
        },
        { new: true }
    );

    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }

    res.json({
        success: true,
        message: 'Route updated successfully',
        trip: {
            id: trip._id,
            routeInfo: trip.routeInfo,
        },
    });
}));

/**
 * GET /trips/:tripId/tracking-data
 * Get comprehensive tracking data for a trip
 * Includes location history, route info, and status timeline
 */
tripsRouter.get('/:tripId/tracking-data', asyncHandler(async (req, res) => {
    const trip = await TripModel.findById(req.params.tripId);
    
    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }

    res.json({
        tripId: trip._id,
        status: trip.status,
        currentLocation: {
            lat: trip.currentDriverLat,
            lng: trip.currentDriverLng,
            updatedAt: trip.lastLocationUpdate?.toISOString(),
        },
        route: {
            polyline: trip.routePolyline,
            distance: trip.routeInfo?.distance,
            duration: trip.routeInfo?.duration,
            waypoints: trip.routeInfo?.waypoints,
        },
        tracking: {
            distanceToPatient: trip.currentDistanceToPatient,
            distanceToHospital: trip.currentDistanceToHospital,
            etaToPatientSeconds: trip.estimatedArrivalToPatientTime,
            etaToHospitalSeconds: trip.estimatedArrivalToHospitalTime,
        },
        locationHistory: trip.locationHistory.slice(-50), // Last 50 locations
        statusTimeline: trip.statusTimeline || [],
        trackingMetrics: trip.trackingMetrics,
    });
}));

/**
 * POST /trips/:tripId/status-update
 * Update trip status and log status timeline
 */
tripsRouter.post('/:tripId/status-update', asyncHandler(async (req, res) => {
    const { status, location, notes } = req.body;
    
    if (!status) {
        throw new HttpError(400, 'Status is required');
    }

    const trip = await TripModel.findByIdAndUpdate(
        req.params.tripId,
        {
            status,
            $push: {
                statusTimeline: {
                    status,
                    timestamp: new Date(),
                    location: location || { lat: null, lng: null },
                    notes: notes || '',
                },
            },
        },
        { new: true }
    );

    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }

    res.json({
        success: true,
        message: `Trip status updated to ${status}`,
        trip: {
            id: trip._id,
            status: trip.status,
        },
    });
}));

/**
 * GET /trips/:tripId/route-polyline
 * Get just the route polyline for a trip
 * Lightweight endpoint for map rendering
 */
tripsRouter.get('/:tripId/route-polyline', asyncHandler(async (req, res) => {
    const trip = await TripModel.findById(req.params.tripId).select('routePolyline routeInfo');
    
    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }

    res.json({
        tripId: trip._id,
        polyline: trip.routePolyline,
        routeInfo: trip.routeInfo,
    });
}));

/**
 * POST /trips/:tripId/estimate-eta
 * Recalculate ETA for a trip based on current location
 */
tripsRouter.post('/:tripId/estimate-eta', asyncHandler(async (req, res) => {
    const { currentLat, currentLng } = req.body;
    
    if (currentLat === undefined || currentLng === undefined) {
        throw new HttpError(400, 'Current location (lat, lng) is required');
    }

    const trip = await TripModel.findById(req.params.tripId);
    
    if (!trip) {
        throw new HttpError(404, 'Trip not found');
    }

    const etaToPatient = calculateETA(currentLat, currentLng, trip.pickupLat, trip.pickupLng);
    const etaToHospital = trip.destLat && trip.destLng
        ? calculateETA(currentLat, currentLng, trip.destLat, trip.destLng)
        : null;

    const distanceToPatient = getDistanceFromLatLonInKm(currentLat, currentLng, trip.pickupLat, trip.pickupLng);
    const distanceToHospital = trip.destLat && trip.destLng
        ? getDistanceFromLatLonInKm(currentLat, currentLng, trip.destLat, trip.destLng)
        : null;

    res.json({
        tripId: trip._id,
        etaToPatientSeconds: etaToPatient,
        etaToHospitalSeconds: etaToHospital,
        distanceToPatient: parseFloat(distanceToPatient.toFixed(2)),
        distanceToHospital: distanceToHospital ? parseFloat(distanceToHospital.toFixed(2)) : null,
    });
}));


