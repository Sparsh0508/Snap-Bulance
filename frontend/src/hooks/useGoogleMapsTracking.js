/**
 * useGoogleMapsTracking.js
 * Complete hook for real-time live tracking on Google Maps
 * Handles marker animation, route polylines, and real-time updates
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { decodePolyline } from '../services/googleMapsService';
import { animateMarkerToLocation, getEasingFunction } from './useMarkerAnimation';

/**
 * Hook for initializing and managing tracking map
 */
export function useGoogleMapsTracking(mapContainerRef, mapOptions = {}) {
    const [map, setMap] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const markersRef = useRef({});
    const polylinesRef = useRef({});
    const windowsRef = useRef({});

    const defaultOptions = {
        zoom: 15,
        mapTypeControl: true,
        zoomControl: true,
        scaleControl: true,
        streetViewControl: false,
        fullscreenControl: true,
    };

    useEffect(() => {
        if (!mapContainerRef.current) return;

        try {
            if (!window.google?.maps) {
                throw new Error('Google Maps API not loaded');
            }

            const newMap = new window.google.maps.Map(
                mapContainerRef.current,
                {
                    ...defaultOptions,
                    ...mapOptions,
                }
            );

            setMap(newMap);
            setIsReady(true);
        } catch (err) {
            console.error('Error initializing Google Maps:', err);
            setError(err.message);
        }

        return () => {
            // Cleanup
            if (map) {
                map = null;
            }
        };
    }, [mapContainerRef, mapOptions]);

    /**
     * Add or update a marker
     */
    const addMarker = useCallback(
        (id, location, options = {}) => {
            if (!map) return null;

            const {
                title = 'Marker',
                icon = null,
                animation = null,
                clickable = true,
            } = options;

            if (markersRef.current[id]) {
                // Update existing marker
                markersRef.current[id].setPosition(location);
                if (animation) {
                    markersRef.current[id].setAnimation(animation);
                }
                return markersRef.current[id];
            }

            // Create new marker
            const marker = new window.google.maps.Marker({
                map,
                position: location,
                title,
                icon,
                animation,
                clickable,
            });

            markersRef.current[id] = marker;
            return marker;
        },
        [map]
    );

    /**
     * Remove a marker
     */
    const removeMarker = useCallback((id) => {
        if (markersRef.current[id]) {
            markersRef.current[id].setMap(null);
            delete markersRef.current[id];
        }
    }, []);

    /**
     * Animate marker to new location
     */
    const animateMarker = useCallback(
        (id, endLocation, options = {}) => {
            const marker = markersRef.current[id];
            if (!marker) return;

            const startLocation = marker.getPosition();
            return animateMarkerToLocation(marker, startLocation, endLocation, options);
        },
        []
    );

    /**
     * Add or update polyline (route)
     */
    const addPolyline = useCallback(
        (id, polylineOrCoordinates, options = {}) => {
            if (!map) return null;

            const {
                color = '#FF0000',
                weight = 3,
                opacity = 0.8,
                geodesic = true,
            } = options;

            // Decode polyline if string, otherwise use coordinates directly
            let coordinates = polylineOrCoordinates;
            if (typeof polylineOrCoordinates === 'string') {
                coordinates = decodePolyline(polylineOrCoordinates);
            }

            if (polylinesRef.current[id]) {
                // Update existing polyline
                polylinesRef.current[id].setPath(coordinates);
                return polylinesRef.current[id];
            }

            // Create new polyline
            const polyline = new window.google.maps.Polyline({
                path: coordinates,
                map,
                color,
                weight,
                opacity,
                geodesic,
            });

            polylinesRef.current[id] = polyline;
            return polyline;
        },
        [map]
    );

    /**
     * Remove polyline
     */
    const removePolyline = useCallback((id) => {
        if (polylinesRef.current[id]) {
            polylinesRef.current[id].setMap(null);
            delete polylinesRef.current[id];
        }
    }, []);

    /**
     * Add info window
     */
    const addInfoWindow = useCallback(
        (id, marker, content, options = {}) => {
            if (!map || !marker) return null;

            const infoWindow = new window.google.maps.InfoWindow({
                content,
                ...options,
            });

            if (windowsRef.current[id]) {
                windowsRef.current[id].close();
            }

            infoWindow.open(map, marker);
            windowsRef.current[id] = infoWindow;
            return infoWindow;
        },
        [map]
    );

    /**
     * Remove info window
     */
    const removeInfoWindow = useCallback((id) => {
        if (windowsRef.current[id]) {
            windowsRef.current[id].close();
            delete windowsRef.current[id];
        }
    }, []);

    /**
     * Fit map to bounds containing all markers
     */
    const fitToBounds = useCallback(
        (markerIds = null) => {
            if (!map) return;

            const bounds = new window.google.maps.LatLngBounds();
            const ids = markerIds || Object.keys(markersRef.current);

            ids.forEach((id) => {
                const marker = markersRef.current[id];
                if (marker) {
                    bounds.extend(marker.getPosition());
                }
            });

            if (!bounds.isEmpty()) {
                map.fitBounds(bounds);
                // Add padding
                const listener = map.addListener('idle', () => {
                    if (map.getZoom() > 18) {
                        map.setZoom(18);
                    }
                    window.google.maps.event.removeListener(listener);
                });
            }
        },
        [map]
    );

    /**
     * Clear all markers
     */
    const clearMarkers = useCallback(() => {
        Object.keys(markersRef.current).forEach((id) => {
            removeMarker(id);
        });
    }, [removeMarker]);

    /**
     * Clear all polylines
     */
    const clearPolylines = useCallback(() => {
        Object.keys(polylinesRef.current).forEach((id) => {
            removePolyline(id);
        });
    }, [removePolyline]);

    /**
     * Set map center
     */
    const setCenter = useCallback(
        (location) => {
            if (map) {
                map.setCenter(location);
            }
        },
        [map]
    );

    /**
     * Get map center
     */
    const getCenter = useCallback(() => {
        if (map) {
            return map.getCenter();
        }
        return null;
    }, [map]);

    /**
     * Set zoom level
     */
    const setZoom = useCallback(
        (zoomLevel) => {
            if (map) {
                map.setZoom(zoomLevel);
            }
        },
        [map]
    );

    return {
        map,
        isReady,
        error,
        markers: markersRef.current,
        polylines: polylinesRef.current,
        // Methods
        addMarker,
        removeMarker,
        clearMarkers,
        animateMarker,
        addPolyline,
        removePolyline,
        clearPolylines,
        addInfoWindow,
        removeInfoWindow,
        fitToBounds,
        setCenter,
        getCenter,
        setZoom,
    };
}

/**
 * Hook for smoothly updating driver location on map
 */
export function useDriverLocationUpdate(
    mapTracking,
    driverId,
    currentLocation,
    previousLocationRef
) {
    useEffect(() => {
        if (!mapTracking.isReady || !currentLocation || !driverId) return;

        const markerId = `driver_${driverId}`;
        const previousLocation = previousLocationRef.current;

        // Add or update marker
        mapTracking.addMarker(markerId, currentLocation, {
            title: 'Driver',
            icon: {
                path: window.google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW,
                scale: 6,
                fillColor: '#FF5722',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
            },
        });

        // Animate from previous location if available
        if (previousLocation) {
            mapTracking.animateMarker(markerId, currentLocation, {
                duration: 2000,
                easing: 'easeInOutQuad',
            });
        }

        previousLocationRef.current = currentLocation;
    }, [mapTracking, driverId, currentLocation]);
}

/**
 * Hook for updating route polyline
 */
export function useRoutePolyline(
    mapTracking,
    tripId,
    polylineData,
    options = {}
) {
    useEffect(() => {
        if (!mapTracking.isReady || !polylineData || !tripId) return;

        const polylineId = `route_${tripId}`;
        const {
            color = '#4285F4',
            weight = 4,
            opacity = 0.8,
        } = options;

        mapTracking.addPolyline(polylineId, polylineData, {
            color,
            weight,
            opacity,
        });

        return () => {
            mapTracking.removePolyline(polylineId);
        };
    }, [mapTracking, tripId, polylineData, options]);
}

/**
 * Hook for displaying tracking info panel
 */
export function useTrackingInfoPanel(
    mapTracking,
    tripId,
    location,
    trackingInfo
) {
    useEffect(() => {
        if (!mapTracking.isReady || !location) return;

        const marker = mapTracking.markers[`driver_${tripId}`];
        if (!marker) return;

        const content = `
            <div style="padding: 10px; font-size: 12px;">
                <div><strong>ETA:</strong> ${trackingInfo?.etaMinutes || 'Calculating...'}</div>
                <div><strong>Distance:</strong> ${trackingInfo?.distance || '...'} km</div>
                <div><strong>Speed:</strong> ${trackingInfo?.speed || '...'} km/h</div>
            </div>
        `;

        mapTracking.addInfoWindow(`info_${tripId}`, marker, content);
    }, [mapTracking, tripId, location, trackingInfo]);
}
