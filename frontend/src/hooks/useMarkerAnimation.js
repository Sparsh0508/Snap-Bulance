/**
 * useMarkerAnimation.js
 * Hook for smooth marker animations between locations on Google Maps
 * Provides smooth movement animation, rotation, and bounce effects
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Animate marker movement between two points
 * @param {google.maps.Marker} marker - The marker to animate
 * @param {Object} startLocation - Start coordinates {lat, lng}
 * @param {Object} endLocation - End coordinates {lat, lng}
 * @param {Object} options - Animation options
 */
export function animateMarkerToLocation(marker, startLocation, endLocation, options = {}) {
    const {
        duration = 2000, // milliseconds
        easing = 'easeInOutQuad',
        onProgress = null,
    } = options;

    const startTime = Date.now();
    let animationFrame;

    const easeFunction = getEasingFunction(easing);

    const animate = () => {
        const currentTime = Date.now();
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const easedProgress = easeFunction(progress);

        const newLat = startLocation.lat + (endLocation.lat - startLocation.lat) * easedProgress;
        const newLng = startLocation.lng + (endLocation.lng - startLocation.lng) * easedProgress;

        marker.setPosition({ lat: newLat, lng: newLng });

        if (onProgress) {
            onProgress(progress);
        }

        if (progress < 1) {
            animationFrame = requestAnimationFrame(animate);
        }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
    };
}

/**
 * Get easing function for animations
 */
function getEasingFunction(easing) {
    const easingFunctions = {
        linear: (t) => t,
        easeInQuad: (t) => t * t,
        easeOutQuad: (t) => t * (2 - t),
        easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        easeInCubic: (t) => t * t * t,
        easeOutCubic: (t) => (--t) * t * t + 1,
        easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * (t - 2)) * (2 * (t - 2)) + 1,
    };

    return easingFunctions[easing] || easingFunctions.linear;
}

/**
 * Hook for tracking and animating marker movement
 * @param {React.MutableRefObject<google.maps.Marker>} markerRef - Reference to marker
 * @param {Object} currentLocation - Current location
 * @param {number} updateIntervalMs - How often to update animation
 * @returns {Object} - Animation control methods
 */
export function useMarkerAnimation(markerRef, currentLocation, updateIntervalMs = 1000) {
    const [isAnimating, setIsAnimating] = useState(false);
    const previousLocationRef = useRef(currentLocation);
    const cancelAnimationRef = useRef(null);

    const animate = useCallback(() => {
        if (!markerRef.current || !currentLocation) return;

        const startLoc = previousLocationRef.current || currentLocation;

        const cancelFn = animateMarkerToLocation(
            markerRef.current,
            startLoc,
            currentLocation,
            {
                duration: updateIntervalMs,
                easing: 'easeInOutQuad',
            }
        );

        cancelAnimationRef.current = cancelFn;
        previousLocationRef.current = currentLocation;
    }, [markerRef, currentLocation, updateIntervalMs]);

    useEffect(() => {
        animate();
        return () => {
            if (cancelAnimationRef.current) {
                cancelAnimationRef.current();
            }
        };
    }, [animate]);

    return {
        isAnimating,
        cancel: () => {
            if (cancelAnimationRef.current) {
                cancelAnimationRef.current();
            }
        },
    };
}

/**
 * Hook for bounce animation (arrival at destination)
 */
export function useMarkerBounce(markerRef, trigger = false) {
    useEffect(() => {
        if (!markerRef.current || !trigger) return;

        markerRef.current.setAnimation(window.google?.maps?.Animation?.BOUNCE);

        const timeout = setTimeout(() => {
            if (markerRef.current) {
                markerRef.current.setAnimation(null);
            }
        }, 750);

        return () => clearTimeout(timeout);
    }, [markerRef, trigger]);
}

/**
 * Hook for pulsing marker effect
 */
export function useMarkerPulse(markerRef, isActive = true) {
    const intervalRef = useRef(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        if (!isActive || !markerRef.current) return;

        let direction = 1;
        intervalRef.current = setInterval(() => {
            setScale(prevScale => {
                let newScale = prevScale + (0.1 * direction);
                if (newScale >= 1.3 || newScale <= 1) {
                    direction *= -1;
                }
                return Math.max(1, Math.min(1.3, newScale));
            });
        }, 50);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [markerRef, isActive]);

    return { scale };
}

/**
 * Hook for marker rotation (heading indicator)
 */
export function useMarkerRotation(markerRef, bearing = 0) {
    useEffect(() => {
        if (!markerRef.current) return;

        // Update marker icon rotation
        const icon = markerRef.current.getIcon();
        if (icon && typeof icon === 'object') {
            icon.rotation = bearing;
            markerRef.current.setIcon(icon);
        }
    }, [markerRef, bearing]);
}

/**
 * Calculate progress percentage between two timestamps
 */
export function getProgressPercentage(startTime, endTime, currentTime = Date.now()) {
    if (startTime >= endTime) return 0;
    if (currentTime <= startTime) return 0;
    if (currentTime >= endTime) return 100;

    return ((currentTime - startTime) / (endTime - startTime)) * 100;
}

/**
 * Hook to manage multiple markers with animations
 */
export function useMarkerAnimationManager(mapRef, markers = []) {
    const animationRefsRef = useRef({});

    const animateMarkers = useCallback(() => {
        markers.forEach((markerData) => {
            if (!markerData.marker || !markerData.nextLocation) return;

            const cancelFn = animateMarkerToLocation(
                markerData.marker,
                markerData.currentLocation || markerData.nextLocation,
                markerData.nextLocation,
                {
                    duration: markerData.duration || 1000,
                    easing: markerData.easing || 'easeInOutQuad',
                }
            );

            animationRefsRef.current[markerData.id] = cancelFn;
        });
    }, [markers]);

    const cancelAllAnimations = useCallback(() => {
        Object.values(animationRefsRef.current).forEach((cancelFn) => {
            if (cancelFn) cancelFn();
        });
        animationRefsRef.current = {};
    }, []);

    useEffect(() => {
        animateMarkers();
        return cancelAllAnimations;
    }, [animateMarkers, cancelAllAnimations]);

    return {
        animateMarkers,
        cancelAllAnimations,
    };
}
