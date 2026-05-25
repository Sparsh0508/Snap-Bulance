/**
 * useTripSocket.js
 * Hook to manage Socket.IO events for real-time trip tracking
 */

import { useEffect, useCallback, useRef } from 'react';
import { socket } from '../services/socketClient';
import { useTripTrackingStore } from '../store/useTripTrackingStore';

/**
 * Hook for managing Socket.IO events for trip tracking
 * 
 * @param {string} tripId - The trip ID to track
 * @param {Object} options - Configuration options
 * @returns {Object} - Socket event handlers and status
 */
export function useTripSocket(tripId, options = {}) {
    const {
        onLocationUpdate,
        onStatusChange,
        onError,
        autoConnect = true,
    } = options;

    const socketConnectedRef = useRef(false);
    const tripTrackingStore = useTripTrackingStore();

    /**
     * Register socket event listeners
     */
    useEffect(() => {
        if (!tripId) return;

        const handleConnect = () => {
            socketConnectedRef.current = true;
            console.log('[TripSocket] Connected to server');
            
            // Start tracking this trip
            socket.emit('startTripTracking', { tripId });
        };

        const handleDisconnect = () => {
            socketConnectedRef.current = false;
            console.log('[TripSocket] Disconnected from server');
            tripTrackingStore.setError('Connection lost. Attempting to reconnect...');
        };

        const handleDriverLocationUpdated = (data) => {
            console.log('[TripSocket] Driver location updated:', data);
            
            tripTrackingStore.updateDriverLocation({
                lat: data.lat,
                lng: data.lng,
                distanceToPatient: data.distanceToPatient,
                distanceToHospital: data.distanceToHospital,
                etaToPatientSeconds: data.etaToPatientSeconds,
                etaToHospitalSeconds: data.etaToHospitalSeconds,
                updatedAt: data.updatedAt,
            });

            tripTrackingStore.addLocationToHistory({
                lat: data.lat,
                lng: data.lng,
                timestamp: data.updatedAt,
            });

            // Call external callback
            if (onLocationUpdate) {
                onLocationUpdate(data);
            }
        };

        const handleTripStatusChanged = (data) => {
            console.log('[TripSocket] Trip status changed:', data);
            
            if (onStatusChange) {
                onStatusChange(data);
            }
        };

        const handleLocationUpdateError = (data) => {
            console.error('[TripSocket] Location update error:', data);
            
            if (onError) {
                onError(data);
            }
        };

        const handleTrackingStarted = (data) => {
            console.log('[TripSocket] Tracking started:', data);
            tripTrackingStore.setIsTracking(true);
            tripTrackingStore.clearError();
        };

        const handleTrackingError = (data) => {
            console.error('[TripSocket] Tracking error:', data);
            tripTrackingStore.setError(data.message || 'Tracking error');
        };

        /**
         * Register all event listeners
         */
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('driverLocationUpdated', handleDriverLocationUpdated);
        socket.on('tripStatusChanged', handleTripStatusChanged);
        socket.on('locationUpdateError', handleLocationUpdateError);
        socket.on('trackingStarted', handleTrackingStarted);
        socket.on('trackingError', handleTrackingError);

        // Auto-connect if enabled
        if (autoConnect && !socket.connected) {
            socket.connect();
        } else if (socket.connected && !socketConnectedRef.current) {
            handleConnect();
        }

        /**
         * Cleanup: Remove listeners on unmount
         */
        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('driverLocationUpdated', handleDriverLocationUpdated);
            socket.off('tripStatusChanged', handleTripStatusChanged);
            socket.off('locationUpdateError', handleLocationUpdateError);
            socket.off('trackingStarted', handleTrackingStarted);
            socket.off('trackingError', handleTrackingError);
        };
    }, [tripId, onLocationUpdate, onStatusChange, onError, autoConnect, tripTrackingStore]);

    /**
     * Send driver location update via socket
     */
    const sendLocationUpdate = useCallback(
        (lat, lng) => {
            if (!socketConnectedRef.current) {
                console.warn('[TripSocket] Socket not connected, cannot send location');
                return false;
            }

            socket.emit('updateDriverLocation', {
                tripId,
                lat,
                lng,
            });

            return true;
        },
        [tripId]
    );

    /**
     * Stop tracking and leave trip room
     */
    const stopTracking = useCallback(() => {
        if (socketConnectedRef.current) {
            socket.emit('stopTripTracking', { tripId });
        }
    }, [tripId]);

    return {
        isConnected: socketConnectedRef.current,
        sendLocationUpdate,
        stopTracking,
    };
}

/**
 * Hook for hospital/admin dashboard to track all ambulances
 */
export function useHospitalDashboardSocket(hospitalId, options = {}) {
    const { onAmbulanceUpdate, onError } = options;
    const socketConnectedRef = useRef(false);

    useEffect(() => {
        if (!hospitalId) return;

        const handleConnect = () => {
            socketConnectedRef.current = true;
            socket.emit('joinHospitalDashboard', { hospitalId });
        };

        const handleDisconnect = () => {
            socketConnectedRef.current = false;
        };

        const handleActiveAmbulanceUpdated = (data) => {
            console.log('[HospitalDashboard] Ambulance updated:', data);
            
            if (onAmbulanceUpdate) {
                onAmbulanceUpdate(data);
            }
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('activeAmbulanceUpdated', handleActiveAmbulanceUpdated);

        if (!socket.connected) {
            socket.connect();
        } else {
            handleConnect();
        }

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('activeAmbulanceUpdated', handleActiveAmbulanceUpdated);
            
            if (socketConnectedRef.current) {
                socket.emit('leaveHospitalDashboard', { hospitalId });
            }
        };
    }, [hospitalId, onAmbulanceUpdate]);

    return {
        isConnected: socketConnectedRef.current,
    };
}
