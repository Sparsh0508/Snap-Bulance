/**
 * googleMapsService.js
 * Service for Google Maps API calls including Directions and Geocoding
 * Handles route calculation, ETA estimation, and place searches
 */

import { GOOGLE_MAPS_API_KEY } from '../lib/googleMapsConfig';

/**
 * Get directions between two points
 * @param {number} originLat - Origin latitude
 * @param {number} originLng - Origin longitude
 * @param {number} destLat - Destination latitude
 * @param {number} destLng - Destination longitude
 * @param {Object} options - Additional options (waypoints, mode, etc.)
 * @returns {Promise<Object>} - Route data with polyline, distance, duration
 */
export async function getDirections(originLat, originLng, destLat, destLng, options = {}) {
    const mode = options.mode || 'driving';
    const waypoints = options.waypoints || [];
    
    try {
        // Build waypoints string
        const waypointString = waypoints.length > 0
            ? waypoints.map(w => `${w.lat},${w.lng}`).join('|')
            : '';

        const params = new URLSearchParams({
            origin: `${originLat},${originLng}`,
            destination: `${destLat},${destLng}`,
            mode,
            key: GOOGLE_MAPS_API_KEY,
            alternatives: true,
        });

        if (waypointString) {
            params.append('waypoints', waypointString);
        }

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?${params}`
        );

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== 'OK') {
            throw new Error(`Directions API Error: ${data.status}`);
        }

        const route = data.routes[0];
        if (!route) {
            throw new Error('No routes found');
        }

        return {
            success: true,
            polyline: route.overview_polyline.points,
            distance: route.legs[0].distance.value, // in meters
            duration: route.legs[0].duration.value, // in seconds
            durationInTraffic: route.legs[0].duration_in_traffic?.value || route.legs[0].duration.value,
            steps: route.legs[0].steps,
            waypoints: route.waypoint_order || [],
            bounds: route.bounds,
            alternativeRoutes: data.routes.slice(1).map(r => ({
                polyline: r.overview_polyline.points,
                distance: r.legs[0].distance.value,
                duration: r.legs[0].duration.value,
            })),
        };
    } catch (error) {
        console.error('Directions API Error:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Decode polyline (Google's encoded polyline format)
 * @param {string} polyline - Encoded polyline
 * @returns {Array<{lat, lng}>} - Array of coordinates
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
 * Encode polyline (Google's encoded polyline format)
 * @param {Array<{lat, lng}>} points - Array of coordinates
 * @returns {string} - Encoded polyline
 */
export function encodePolyline(points) {
    let polyline = '';
    let prevLat = 0;
    let prevLng = 0;

    for (const point of points) {
        const lat = Math.round(point.lat * 1e5);
        const lng = Math.round(point.lng * 1e5);

        polyline += encodeValue(lat - prevLat);
        polyline += encodeValue(lng - prevLng);

        prevLat = lat;
        prevLng = lng;
    }

    return polyline;
}

/**
 * Encode a single value for polyline encoding
 */
function encodeValue(value) {
    value = value << 1;
    if (value < 0) {
        value = ~value;
    }

    let polyline = '';
    while (value >= 0x20) {
        polyline += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
    }
    polyline += String.fromCharCode(value + 63);

    return polyline;
}

/**
 * Get nearby places of specific type
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} type - Place type (hospital, police, etc.)
 * @param {number} radius - Search radius in meters (default: 5000)
 * @returns {Promise<Object>} - Nearby places
 */
export async function getNearbyPlaces(lat, lng, type, radius = 5000) {
    try {
        const params = new URLSearchParams({
            location: `${lat},${lng}`,
            radius,
            type,
            key: GOOGLE_MAPS_API_KEY,
        });

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
        );

        const data = await response.json();

        if (data.status !== 'OK') {
            throw new Error(`Nearby Search API Error: ${data.status}`);
        }

        return {
            success: true,
            places: data.results.map(place => ({
                id: place.place_id,
                name: place.name,
                address: place.vicinity,
                lat: place.geometry.location.lat,
                lng: place.geometry.location.lng,
                distance: calculateDistance(lat, lng, place.geometry.location.lat, place.geometry.location.lng),
            })),
        };
    } catch (error) {
        console.error('Nearby Places API Error:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Get place details
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object>} - Place details
 */
export async function getPlaceDetails(placeId) {
    try {
        const params = new URLSearchParams({
            place_id: placeId,
            fields: 'name,formatted_address,geometry,formatted_phone_number,website,opening_hours',
            key: GOOGLE_MAPS_API_KEY,
        });

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?${params}`
        );

        const data = await response.json();

        if (data.status !== 'OK') {
            throw new Error(`Place Details API Error: ${data.status}`);
        }

        const result = data.result;
        return {
            success: true,
            place: {
                name: result.name,
                address: result.formatted_address,
                lat: result.geometry.location.lat,
                lng: result.geometry.location.lng,
                phone: result.formatted_phone_number,
                website: result.website,
                hours: result.opening_hours,
            },
        };
    } catch (error) {
        console.error('Place Details API Error:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Calculate distance between two points (Haversine formula)
 * @param {number} lat1 - First latitude
 * @param {number} lng1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lng2 - Second longitude
 * @returns {number} - Distance in kilometers
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radius of Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Format duration in seconds to readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
export function formatDuration(seconds) {
    if (!seconds) return '...';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Format distance in meters to readable string
 * @param {number} meters - Distance in meters
 * @returns {string} - Formatted distance
 */
export function formatDistance(meters) {
    if (!meters) return '...';
    
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Check if Google Maps is loaded
 * @returns {boolean}
 */
export function isGoogleMapsLoaded() {
    return typeof window !== 'undefined' && window.google && window.google.maps;
}

/**
 * Calculate bearing between two points
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} - Bearing in degrees
 */
export function calculateBearing(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

/**
 * Get ETA considering traffic
 * @param {number} distanceMeters - Distance in meters
 * @param {number} durationSeconds - Duration in seconds from Directions API
 * @returns {Object} - ETA data
 */
export function getETAWithTraffic(distanceMeters, durationSeconds) {
    const distanceKm = distanceMeters / 1000;
    const trafficFactor = durationSeconds / (distanceKm / 40 * 3600); // 40 km/h baseline
    
    return {
        distanceKm: parseFloat(distanceKm.toFixed(2)),
        durationSeconds: durationSeconds,
        formattedDuration: formatDuration(durationSeconds),
        formattedDistance: formatDistance(distanceMeters),
        estimatedSpeed: parseFloat((distanceKm / (durationSeconds / 3600)).toFixed(1)),
        trafficFactor: parseFloat(trafficFactor.toFixed(2)),
    };
}
