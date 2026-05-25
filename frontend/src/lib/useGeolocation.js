/**
 * useGeolocation.js
 * React Hook for continuous GPS location tracking with battery optimization
 * Includes fallback to IP-based geolocation when GPS is unavailable
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Configuration for geolocation tracking
 */
const GEOLOCATION_CONFIG = {
    enableHighAccuracy: false, // false to save battery
    timeout: 5000,
    maximumAge: 0,
};

/**
 * Get location from IP address (fallback)
 */
async function getLocationFromIP() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        return {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: 5000, // 5km accuracy for IP-based location
            altitude: null,
            heading: null,
            speed: null,
            timestamp: new Date(),
            source: 'IP',
        };
    } catch (error) {
        console.error('IP geolocation failed:', error);
        return null;
    }
}

/**
 * useGeolocation Hook
 * Provides real-time GPS coordinates with automatic permission handling
 * Falls back to IP-based location if GPS is unavailable
 * 
 * @param {Function} onLocationUpdate - Callback when location updates
 * @param {boolean} enabled - Enable/disable tracking
 * @param {number} updateIntervalMs - Minimum interval between updates (default: 5000ms)
 * @returns {Object} - { location, error, isTracking, startTracking, stopTracking }
 */
export function useGeolocation(
    onLocationUpdate,
    enabled = true,
    updateIntervalMs = 5000
) {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);
    const [isTracking, setIsTracking] = useState(false);
    const [usesFallback, setUsesFallback] = useState(false);
    
    const watchIdRef = useRef(null);
    const lastUpdateRef = useRef(0);
    const permissionDeniedRef = useRef(false);
    const fallbackIntervalRef = useRef(null);

    /**
     * Handle successful location retrieval
     */
    const handleLocationSuccess = useCallback(
        (position) => {
            const now = Date.now();
            
            // Only update if minimum interval has passed (battery optimization)
            if (now - lastUpdateRef.current < updateIntervalMs) {
                return;
            }
            
            lastUpdateRef.current = now;
            
            const newLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude,
                heading: position.coords.heading,
                speed: position.coords.speed,
                timestamp: new Date(position.timestamp),
                source: 'GPS',
            };

            setLocation(newLocation);
            setError(null);
            setUsesFallback(false);
            
            // Call external callback
            if (onLocationUpdate) {
                onLocationUpdate(newLocation);
            }
        },
        [onLocationUpdate, updateIntervalMs]
    );

    /**
     * Handle location error with fallback to IP-based geolocation
     */
    const handleLocationError = useCallback(async (err) => {
        let errorMessage = '';
        
        if (err.code === err.PERMISSION_DENIED) {
            permissionDeniedRef.current = true;
            errorMessage = 'Location permission denied. Attempting IP-based location...';
        } else if (err.code === err.TIMEOUT) {
            errorMessage = 'Location request timed out. Attempting fallback...';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorMessage = 'Location is unavailable. Using IP-based location...';
        } else {
            errorMessage = err.message || 'Unknown location error. Using fallback...';
        }

        // Try IP-based fallback
        try {
            const ipLocation = await getLocationFromIP();
            if (ipLocation) {
                setLocation(ipLocation);
                setError({
                    code: 'FALLBACK_ACTIVE',
                    message: errorMessage,
                });
                setUsesFallback(true);
                
                if (onLocationUpdate) {
                    onLocationUpdate(ipLocation);
                }
                return;
            }
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
        }

        // If both GPS and IP fallback fail
        setError({
            code: err.code === err.PERMISSION_DENIED ? 'PERMISSION_DENIED' : 'FALLBACK_FAILED',
            message: errorMessage,
        });
    }, [onLocationUpdate]);

    /**
     * Start IP-based location tracking (fallback)
     */
    const startFallbackTracking = useCallback(async () => {
        const ipLocation = await getLocationFromIP();
        if (ipLocation) {
            setLocation(ipLocation);
            setUsesFallback(true);
            
            if (onLocationUpdate) {
                onLocationUpdate(ipLocation);
            }

            // Update every 30 seconds for IP-based tracking
            fallbackIntervalRef.current = setInterval(async () => {
                const newLocation = await getLocationFromIP();
                if (newLocation) {
                    setLocation(newLocation);
                    if (onLocationUpdate) {
                        onLocationUpdate(newLocation);
                    }
                }
            }, 30000);

            setIsTracking(true);
        }
    }, [onLocationUpdate]);

    /**
     * Start tracking location
     */
    const startTracking = useCallback(() => {
        if (!navigator.geolocation) {
            setError({
                code: 'NOT_SUPPORTED',
                message: 'Geolocation is not supported by this browser. Using IP-based location...',
            });
            startFallbackTracking();
            return false;
        }

        if (isTracking) return true;

        try {
            watchIdRef.current = navigator.geolocation.watchPosition(
                handleLocationSuccess,
                handleLocationError,
                GEOLOCATION_CONFIG
            );
            setIsTracking(true);
            return true;
        } catch (err) {
            setError({
                code: 'ERROR',
                message: 'Failed to start location tracking. Attempting fallback...',
            });
            startFallbackTracking();
            return false;
        }
    }, [isTracking, handleLocationSuccess, handleLocationError, startFallbackTracking]);

    /**
     * Stop tracking location
     */
    const stopTracking = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        
        if (fallbackIntervalRef.current) {
            clearInterval(fallbackIntervalRef.current);
            fallbackIntervalRef.current = null;
        }
        
        setIsTracking(false);
    }, []);

    /**
     * Effect to manage tracking based on enabled prop
     */
    useEffect(() => {
        if (enabled && !isTracking && !permissionDeniedRef.current) {
            startTracking();
        } else if (!enabled && isTracking) {
            stopTracking();
        }

        return () => {
            // Cleanup on unmount
            if (isTracking) {
                stopTracking();
            }
        };
    }, [enabled, isTracking, startTracking, stopTracking]);

    return {
        location,
        error,
        isTracking,
        usesFallback,
        startTracking,
        stopTracking,
    };
}

    /**
     * Start tracking location
     */
    const startTracking = useCallback(() => {
        if (!navigator.geolocation) {
            setError({
                code: 'NOT_SUPPORTED',
                message: 'Geolocation is not supported by this browser',
            });
            return false;
        }

        if (isTracking) return true;

        try {
            watchIdRef.current = navigator.geolocation.watchPosition(
                handleLocationSuccess,
                handleLocationError,
                GEOLOCATION_CONFIG
            );
            setIsTracking(true);
            return true;
        } catch (err) {
            setError({
                code: 'ERROR',
                message: 'Failed to start location tracking',
            });
            return false;
        }
    }, [isTracking, handleLocationSuccess, handleLocationError]);

    /**
     * Stop tracking location
     */
    const stopTracking = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setIsTracking(false);
    }, []);

    /**
     * Effect to manage tracking based on enabled prop
     */
    useEffect(() => {
        if (enabled && !isTracking && !permissionDeniedRef.current) {
            startTracking();
        } else if (!enabled && isTracking) {
            stopTracking();
        }

        return () => {
            // Cleanup on unmount
            if (isTracking) {
                stopTracking();
            }
        };
    }, [enabled, isTracking, startTracking, stopTracking]);

    return {
        location,
        error,
        isTracking,
        startTracking,
        stopTracking,
    };
}

/**
 * Utility function to format location for display
 */
export function formatLocation(location) {
    if (!location) return 'Unknown location';
    
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

/**
 * Utility function to calculate distance between two coordinates (Haversine formula)
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

/**
 * Utility function to get cardinal direction from heading
 */
export function getCardinalDirection(heading) {
    if (heading === null || heading === undefined) return 'N';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((heading % 360) / 45)) % 8;
    return directions[index];
}
