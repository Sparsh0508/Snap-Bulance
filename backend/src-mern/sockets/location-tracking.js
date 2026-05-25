import { TripModel } from '../models/trip.js';
import { DriverProfileModel } from '../models/driver-profile.js';
import { getDistanceFromLatLonInKm } from '../utils/distance.js';
import { isProduction } from '../config.js';

/**
 * Calculate ETA in seconds between two coordinates using straight-line distance
 * This is a simplified calculation; in production, use Google Maps/Mapbox API
 * Average ambulance speed: ~40 km/h in urban areas
 */
export function calculateETA(startLat, startLng, endLat, endLng) {
    const distanceKm = getDistanceFromLatLonInKm(startLat, startLng, endLat, endLng);
    const avgSpeedKmh = 40; // ambulance average speed
    const timeHours = distanceKm / avgSpeedKmh;
    const timeSeconds = timeHours * 3600;
    return Math.round(timeSeconds);
}

/**
 * Calculate ETA with traffic factor for more accurate estimates
 * Adjusts based on time of day and typical traffic patterns
 */
export function calculateETAWithTraffic(distanceKm, hour = new Date().getHours()) {
    let avgSpeedKmh = 40;
    
    // Adjust speed based on time of day (peak hours: 8-10am, 5-8pm)
    if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
        avgSpeedKmh = 25; // Lower speed during peak traffic
    } else if (hour >= 0 && hour < 6) {
        avgSpeedKmh = 50; // Higher speed during night
    }
    
    const timeHours = distanceKm / avgSpeedKmh;
    const timeSeconds = timeHours * 3600;
    return Math.round(timeSeconds);
}

/**
 * Register location tracking socket handlers
 */
export function registerLocationTracking(io) {
    io.on('connection', (socket) => {
        /**
         * Handle driver location updates
         * Emits: driverLocationUpdated to trip room, activeAmbulanceUpdated to hospital room
         */
        socket.on('updateDriverLocation', async (payload) => {
            try {
                const { tripId, lat, lng, driverId } = payload;
                
                if (!tripId || lat === undefined || lng === undefined) {
                    if (!isProduction) console.error('Invalid location update payload:', payload);
                    return;
                }

                const trip = await TripModel.findById(tripId);
                if (!trip) {
                    if (!isProduction) console.warn(`Trip ${tripId} not found for location update`);
                    return;
                }

                // Calculate distances
                const distanceToPatient = getDistanceFromLatLonInKm(
                    lat, lng,
                    trip.pickupLat, trip.pickupLng
                );
                
                const distanceToHospital = trip.destLat && trip.destLng
                    ? getDistanceFromLatLonInKm(lat, lng, trip.destLat, trip.destLng)
                    : null;

                // Calculate ETAs
                const etaToPatient = calculateETA(
                    lat, lng,
                    trip.pickupLat, trip.pickupLng
                );
                
                const etaToHospital = trip.destLat && trip.destLng
                    ? calculateETA(lat, lng, trip.destLat, trip.destLng)
                    : null;

                // Update trip with latest location data
                const updatedTrip = await TripModel.findByIdAndUpdate(
                    tripId,
                    {
                        currentDriverLat: lat,
                        currentDriverLng: lng,
                        currentDistanceToPatient: parseFloat(distanceToPatient.toFixed(2)),
                        currentDistanceToHospital: distanceToHospital ? parseFloat(distanceToHospital.toFixed(2)) : null,
                        estimatedArrivalToPatientTime: etaToPatient,
                        estimatedArrivalToHospitalTime: etaToHospital,
                        lastLocationUpdate: new Date(),
                        $push: {
                            locationHistory: {
                                lat,
                                lng,
                                timestamp: new Date(),
                            },
                        },
                    },
                    { new: true }
                );

                // Update driver profile location
                if (driverId) {
                    await DriverProfileModel.findByIdAndUpdate(driverId, {
                        currentLat: lat,
                        currentLng: lng,
                        lastLocationUpdate: new Date(),
                    });
                }

                // Emit to trip room (patient, driver, hospital staff watching this trip)
                io.to(tripId).emit('driverLocationUpdated', {
                    tripId,
                    lat,
                    lng,
                    distanceToPatient: updatedTrip.currentDistanceToPatient,
                    distanceToHospital: updatedTrip.currentDistanceToHospital,
                    etaToPatientSeconds: etaToPatient,
                    etaToHospitalSeconds: etaToHospital,
                    updatedAt: new Date().toISOString(),
                });

                // Emit to hospital room (for dashboard viewing all ambulances)
                if (trip.hospitalId) {
                    io.to(`hospital_${trip.hospitalId}`).emit('activeAmbulanceUpdated', {
                        tripId,
                        driverId: trip.driverId,
                        lat,
                        lng,
                        status: trip.status,
                        distanceToHospital: updatedTrip.currentDistanceToHospital,
                        etaToHospitalSeconds: etaToHospital,
                        patientName: 'Patient', // Will be populated with actual name
                        updatedAt: new Date().toISOString(),
                    });
                }
            } catch (error) {
                console.error('Error updating driver location:', error);
                socket.emit('locationUpdateError', {
                    message: 'Failed to update location',
                    error: error.message,
                });
            }
        });

        /**
         * Request to start real-time tracking for a trip
         */
        socket.on('startTripTracking', async (payload) => {
            try {
                const { tripId } = payload;
                const trip = await TripModel.findById(tripId);
                
                if (!trip) {
                    socket.emit('trackingError', { message: 'Trip not found' });
                    return;
                }

                socket.join(tripId);
                
                // Send current trip state
                socket.emit('trackingStarted', {
                    tripId,
                    status: trip.status,
                    driverLat: trip.currentDriverLat,
                    driverLng: trip.currentDriverLng,
                    pickupLat: trip.pickupLat,
                    pickupLng: trip.pickupLng,
                    destLat: trip.destLat,
                    destLng: trip.destLng,
                    distanceToPatient: trip.currentDistanceToPatient,
                    etaToPatientSeconds: trip.estimatedArrivalToPatientTime,
                    updatedAt: trip.lastLocationUpdate?.toISOString(),
                });
                
                if (!isProduction) console.log(`Client ${socket.id} started tracking trip ${tripId}`);
            } catch (error) {
                console.error('Error starting trip tracking:', error);
                socket.emit('trackingError', { message: 'Failed to start tracking' });
            }
        });

        /**
         * Stop tracking trip
         */
        socket.on('stopTripTracking', (payload) => {
            const { tripId } = payload;
            socket.leave(tripId);
            if (!isProduction) console.log(`Client ${socket.id} stopped tracking trip ${tripId}`);
        });

        /**
         * Hospital/Admin joins ambulance dashboard
         */
        socket.on('joinHospitalDashboard', (payload) => {
            const { hospitalId } = payload;
            socket.join(`hospital_${hospitalId}`);
            if (!isProduction) console.log(`Client ${socket.id} joined hospital dashboard ${hospitalId}`);
        });

        socket.on('leaveHospitalDashboard', (payload) => {
            const { hospitalId } = payload;
            socket.leave(`hospital_${hospitalId}`);
        });
    });
}

/**
 * Utility: Get active trips for a hospital
 */
export async function getActiveTripsForHospital(hospitalId) {
    return await TripModel.find({
        hospitalId,
        status: { $in: ['ASSIGNED', 'ARRIVED', 'ON_BOARD'] },
    }).select('_id status driverId currentDriverLat currentDriverLng currentDistanceToHospital estimatedArrivalToHospitalTime');
}

/**
 * Utility: Get active trips for a driver
 */
export async function getActiveTripsForDriver(driverId) {
    return await TripModel.find({
        driverId,
        status: { $in: ['ASSIGNED', 'ARRIVED', 'ON_BOARD'] },
    }).select('_id status pickupLat pickupLng destLat destLng currentDistanceToPatient estimatedArrivalToPatientTime');
}
