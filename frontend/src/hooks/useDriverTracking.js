/**
 * useDriverTracking.js
 * Hook for drivers to continuously track and send GPS location
 * Includes battery optimization and automatic stop on trip completion
 */

import { useEffect, useRef, useCallback } from 'react';
import { useGeolocation } from '../lib/useGeolocation';
import { socket } from '../services/socketClient';

/**
 * Hook for driver GPS tracking
 * Automatically sends location updates to backend at specified intervals
 * 
 * @param {string} tripId - The active trip ID
 * @param {Object} options - Configuration options
 * @returns {Object} - Tracking state and control methods
 */
export function useDriverTracking(tripId, options = {}) {
    const {
        driverId = null,
        updateIntervalMs = 10000, // Send location every 10 seconds
        enableHighAccuracy = false,
        onError = null,
    } = options;

    const intervalRef = useRef(null);
    const lastSentRef = useRef(0);

    /**
     * Handle location update - send to backend
     */
    const handleLocationUpdate = useCallback(
        (location) => {
            const now = Date.now();
            
            // Throttle: Only send if interval has passed
            if (now - lastSentRef.current < updateIntervalMs) {
                return;
            }
            
            lastSentRef.current = now;

            if (!socket.connected) {
                console.warn('[DriverTracking] Socket not connected, buffering location');
                return;
            }

            // Send location to backend via socket
            socket.emit('updateDriverLocation', {
                tripId,
                lat: location.latitude,
                lng: location.longitude,
                accuracy: location.accuracy,
                driverId,
                timestamp: location.timestamp?.toISOString(),
            });

            console.log('[DriverTracking] Location sent:', {
                lat: location.latitude,
                lng: location.longitude,
                accuracy: location.accuracy,
            });
        },
        [tripId, driverId, updateIntervalMs]
    );

    /**
     * Start tracking driver location
     */
    const { location, error, isTracking, startTracking, stopTracking } = useGeolocation(
        handleLocationUpdate,
        !!tripId, // Enable when tripId exists
        updateIntervalMs
    );

    /**
     * Initialize socket connection and emit trip tracking start
     */
    useEffect(() => {
        if (!tripId) return;

        // Ensure socket is connected
        if (!socket.connected) {
            socket.connect();
        }

        // Notify backend that driver is starting trip tracking
        socket.emit('startTripTracking', { tripId });

        console.log('[DriverTracking] Started tracking for trip:', tripId);

        return () => {
            if (tripId) {
                socket.emit('stopTripTracking', { tripId });
            }
        };
    }, [tripId]);

    /**
     * Handle GPS errors
     */
    useEffect(() => {
        if (error) {
            console.error('[DriverTracking] GPS Error:', error);
            if (onError) {
                onError(error);
            }
        }
    }, [error, onError]);

    return {
        location,
        error,
        isTracking,
        startTracking,
        stopTracking,
    };
}

/**
 * Hook to send manual location updates (useful for testing)
 */
export function useSendLocationUpdate(tripId, driverId) {
    return useCallback(
        (lat, lng) => {
            if (!socket.connected) {
                console.warn('Socket not connected');
                return false;
            }

            socket.emit('updateDriverLocation', {
                tripId,
                lat,
                lng,
                driverId,
                timestamp: new Date().toISOString(),
            });

            return true;
        },
        [tripId, driverId]
    );
}
