/**
 * useGoogleMap.js
 * React hook for Google Maps integration with directions, routes, and animations
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  loadGoogleMapsScript,
  calculateDistance,
  calculateETA,
  createMarkerConfig,
  fitMapBounds,
  createPolyline,
  isGoogleMapsAvailable,
} from '../lib/googleMapsConfig';

/**
 * Hook for initializing and managing Google Maps
 * 
 * @param {string} containerId - ID of DOM element for map
 * @param {object} initialOptions - Initial map options
 * @returns {object} - Map instance and utilities
 */
export function useGoogleMap(containerId, initialOptions = {}) {
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const polylinesRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Initialize Google Maps
  useEffect(() => {
    const initMap = async () => {
      try {
        if (!process.env.REACT_APP_GOOGLE_MAPS_API_KEY) {
          throw new Error('Google Maps API key not found in environment variables');
        }

        // Load Google Maps script
        await loadGoogleMapsScript(process.env.REACT_APP_GOOGLE_MAPS_API_KEY);

        const container = document.getElementById(containerId);
        if (!container) {
          throw new Error(`Map container with ID "${containerId}" not found`);
        }

        // Create map instance
        mapRef.current = new window.google.maps.Map(container, {
          center: initialOptions.center || { lat: 28.6139, lng: 77.2090 },
          zoom: initialOptions.zoom || 15,
          ...initialOptions.mapOptions,
        });

        setMapLoaded(true);
        setError(null);
      } catch (err) {
        console.error('Error initializing Google Maps:', err);
        setError(err.message);
      }
    };

    initMap();

    return () => {
      // Cleanup markers
      Object.values(markersRef.current).forEach((marker) => {
        if (marker) marker.setMap(null);
      });
      markersRef.current = {};

      // Cleanup polylines
      polylinesRef.current.forEach((polyline) => {
        if (polyline) polyline.setMap(null);
      });
      polylinesRef.current = [];
    };
  }, [containerId, initialOptions]);

  /**
   * Add or update marker on map
   */
  const addMarker = useCallback(
    (markerId, position, type, title, infoWindowContent = null) => {
      if (!mapRef.current) {
        console.warn('Map not initialized');
        return null;
      }

      // Remove existing marker if present
      if (markersRef.current[markerId]) {
        markersRef.current[markerId].setMap(null);
      }

      // Create new marker
      const config = createMarkerConfig(position, type, title);
      const marker = new window.google.maps.Marker({
        ...config,
        map: mapRef.current,
      });

      // Add info window if content provided
      if (infoWindowContent) {
        const infoWindow = new window.google.maps.InfoWindow({
          content: infoWindowContent,
        });

        marker.addListener('click', () => {
          infoWindow.open({
            anchor: marker,
            map: mapRef.current,
          });
        });
      }

      markersRef.current[markerId] = marker;
      return marker;
    },
    []
  );

  /**
   * Update marker position with smooth animation
   */
  const updateMarkerPosition = useCallback(
    (markerId, newPosition, animate = true) => {
      const marker = markersRef.current[markerId];
      if (!marker) {
        console.warn(`Marker ${markerId} not found`);
        return;
      }

      if (animate) {
        // Smooth animation between old and new position
        const oldPosition = marker.getPosition();
        let step = 0;
        const steps = 30; // Animation frames
        
        const animateStep = () => {
          step++;
          const progress = step / steps;
          
          const interpolated = {
            lat: oldPosition.lat() + (newPosition.lat - oldPosition.lat()) * progress,
            lng: oldPosition.lng() + (newPosition.lng - oldPosition.lng()) * progress,
          };
          
          marker.setPosition(interpolated);
          
          if (step < steps) {
            requestAnimationFrame(animateStep);
          }
        };
        
        animateStep();
      } else {
        marker.setPosition(newPosition);
      }
    },
    []
  );

  /**
   * Remove marker from map
   */
  const removeMarker = useCallback((markerId) => {
    const marker = markersRef.current[markerId];
    if (marker) {
      marker.setMap(null);
      delete markersRef.current[markerId];
    }
  }, []);

  /**
   * Add polyline (route) to map
   */
  const addPolyline = useCallback(
    (path, options = {}) => {
      if (!mapRef.current) return null;

      const defaultOptions = {
        path,
        geodesic: true,
        strokeColor: '#4285F4',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        clickable: false,
        map: mapRef.current,
      };

      const polyline = new window.google.maps.Polyline({
        ...defaultOptions,
        ...options,
      });

      polylinesRef.current.push(polyline);
      return polyline;
    },
    []
  );

  /**
   * Clear all polylines from map
   */
  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach((polyline) => {
      if (polyline) polyline.setMap(null);
    });
    polylinesRef.current = [];
  }, []);

  /**
   * Fit map to show all markers
   */
  const fitToMarkers = useCallback(() => {
    if (!mapRef.current) return;

    const markers = Object.values(markersRef.current).filter((m) => m);
    if (markers.length === 0) return;

    fitMapBounds(mapRef.current, markers, 50);
  }, []);

  /**
   * Set map center
   */
  const setCenter = useCallback((lat, lng, zoom = null) => {
    if (!mapRef.current) return;

    mapRef.current.setCenter({ lat, lng });
    if (zoom !== null) {
      mapRef.current.setZoom(zoom);
    }
  }, []);

  /**
   * Pan to location
   */
  const panTo = useCallback((lat, lng) => {
    if (!mapRef.current) return;
    mapRef.current.panTo({ lat, lng });
  }, []);

  /**
   * Get all markers
   */
  const getMarkers = useCallback(() => {
    return markersRef.current;
  }, []);

  /**
   * Clear all markers
   */
  const clearMarkers = useCallback(() => {
    Object.values(markersRef.current).forEach((marker) => {
      if (marker) marker.setMap(null);
    });
    markersRef.current = {};
  }, []);

  return {
    map: mapRef.current,
    mapLoaded,
    error,
    addMarker,
    updateMarkerPosition,
    removeMarker,
    addPolyline,
    clearPolylines,
    fitToMarkers,
    setCenter,
    panTo,
    getMarkers,
    clearMarkers,
  };
}

/**
 * Hook for handling Google Maps Directions API
 * 
 * @param {string} apiKey - Google Maps API key
 * @returns {object} - Directions service and utilities
 */
export function useDirectionsService(apiKey) {
  const directionsServiceRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize directions service
  useEffect(() => {
    const initService = async () => {
      try {
        await loadGoogleMapsScript(apiKey);
        directionsServiceRef.current = new window.google.maps.DirectionsService();
      } catch (err) {
        console.error('Error initializing Directions Service:', err);
        setError(err.message);
      }
    };

    initService();
  }, [apiKey]);

  /**
   * Get directions between two points
   */
  const getDirections = useCallback(
    async (origin, destination, travelMode = 'DRIVING') => {
      if (!directionsServiceRef.current) {
        setError('Directions service not initialized');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await new Promise((resolve, reject) => {
          directionsServiceRef.current.route(
            {
              origin,
              destination,
              travelMode: window.google.maps.TravelMode[travelMode],
              alternatives: true,
            },
            (result, status) => {
              if (status === 'OK') {
                resolve(result);
              } else {
                reject(new Error(`Directions request failed: ${status}`));
              }
            }
          );
        });

        // Extract route information
        const route = result.routes[0];
        const leg = route.legs[0];

        const routeData = {
          distance: leg.distance.value / 1000, // Convert to km
          duration: leg.duration.value / 60, // Convert to minutes
          distanceText: leg.distance.text,
          durationText: leg.duration.text,
          path: [],
          polylinePoints: route.overview_polyline.points,
          steps: leg.steps,
        };

        // Decode polyline points to path
        routeData.path = decodePolyline(route.overview_polyline.points);

        setLoading(false);
        return routeData;
      } catch (err) {
        console.error('Error getting directions:', err);
        setError(err.message);
        setLoading(false);
        return null;
      }
    },
    []
  );

  return {
    getDirections,
    loading,
    error,
  };
}

/**
 * Decode polyline points from Google Maps API
 * @param {string} polyline - Encoded polyline string
 * @returns {array} - Array of {lat, lng} coordinates
 */
export function decodePolyline(polyline) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < polyline.length) {
    let result = 0;
    let shift = 0;
    let b;

    do {
      b = polyline.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;

    do {
      b = polyline.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

/**
 * Hook for live location tracking on map with smooth updates
 */
export function useMapLocationTracking(map) {
  const updateIntervalRef = useRef(null);
  const lastUpdateRef = useRef(0);

  /**
   * Smoothly update marker location with animation
   */
  const updateLiveLocation = useCallback(
    (marker, newLocation, options = {}) => {
      const { animate = true, duration = 500 } = options;

      if (!marker || !newLocation) return;

      if (animate) {
        const oldPosition = marker.getPosition();
        const startTime = Date.now();

        const animateFrame = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);

          const currentLat = oldPosition.lat() + (newLocation.lat - oldPosition.lat()) * progress;
          const currentLng = oldPosition.lng() + (newLocation.lng - oldPosition.lng()) * progress;

          marker.setPosition({ lat: currentLat, lng: currentLng });

          if (progress < 1) {
            requestAnimationFrame(animateFrame);
          }
        };

        animateFrame();
      } else {
        marker.setPosition(newLocation);
      }

      // Pan map to follow marker
      if (map) {
        map.panTo(newLocation);
      }
    },
    []
  );

  /**
   * Start continuous location updates
   */
  const startTracking = useCallback((callback, interval = 5000) => {
    updateIntervalRef.current = setInterval(callback, interval);
  }, []);

  /**
   * Stop continuous location updates
   */
  const stopTracking = useCallback(() => {
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    updateLiveLocation,
    startTracking,
    stopTracking,
  };
}
