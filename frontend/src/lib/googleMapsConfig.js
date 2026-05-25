/**
 * googleMapsConfig.js
 * Google Maps API configuration and utility functions
 */

// Get API key from environment variables
export const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

// Map configuration constants
export const MAP_CONFIG = {
  // Default center (Delhi, India)
  defaultCenter: {
    lat: 28.6139,
    lng: 77.2090,
  },
  
  // Default zoom level
  defaultZoom: 15,
  
  // Zoom levels
  zoomLevels: {
    WORLD: 1,
    CONTINENT: 4,
    COUNTRY: 6,
    CITY: 10,
    STREET: 15,
    BUILDING: 20,
  },
  
  // Map styling options
  mapOptions: {
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: true,
    scaleControl: true,
    streetViewControl: true,
    rotateControl: true,
    fullscreenControl: true,
  },
  
  // Marker animation options
  markerAnimation: {
    BOUNCE: 1, // Google Maps constant
    DROP: 2,   // Google Maps constant
    NONE: null,
  },
};

/**
 * Load Google Maps script dynamically
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise} - Resolves when maps library is loaded
 */
export function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry,places,directions&language=en`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps failed to load'));
      }
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load Google Maps script'));
    };
    
    document.head.appendChild(script);
  });
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Start latitude
 * @param {number} lng1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lng2 - End longitude
 * @returns {number} - Distance in kilometers
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

/**
 * Calculate ETA based on distance and speed
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} speedKmh - Average speed in km/h (default: 40 for ambulance)
 * @returns {object} - { minutes, seconds, formatted }
 */
export function calculateETA(distanceKm, speedKmh = 40) {
  if (!distanceKm || distanceKm <= 0) {
    return {
      minutes: 0,
      seconds: 0,
      formatted: 'Calculating...',
    };
  }
  
  const totalSeconds = (distanceKm / speedKmh) * 3600;
  const minutes = Math.ceil(totalSeconds / 60);
  
  return {
    minutes,
    seconds: Math.round(totalSeconds),
    formatted: minutes < 1 ? 'Arriving now' : `${minutes} min`,
  };
}

/**
 * Get marker icon for different types
 * @param {string} type - 'ambulance' | 'patient' | 'hospital'
 * @returns {object} - Marker icon configuration
 */
export function getMarkerIcon(type) {
  const baseUrl = 'https://maps.google.com/mapfiles/ms/icons/';
  
  const icons = {
    ambulance: {
      url: baseUrl + 'red-dot.png',
      scaledSize: { width: 40, height: 40 },
      anchor: { x: 20, y: 40 },
    },
    patient: {
      url: baseUrl + 'blue-dot.png',
      scaledSize: { width: 40, height: 40 },
      anchor: { x: 20, y: 40 },
    },
    hospital: {
      url: baseUrl + 'yellow-dot.png',
      scaledSize: { width: 40, height: 40 },
      anchor: { x: 20, y: 40 },
    },
  };
  
  return icons[type] || icons.ambulance;
}

/**
 * Format location coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} - Formatted coordinates
 */
export function formatCoordinates(lat, lng) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Check if Google Maps API is available
 * @returns {boolean}
 */
export function isGoogleMapsAvailable() {
  return !!(window.google && window.google.maps);
}

/**
 * Validate coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean}
 */
export function validateCoordinates(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Create Google Maps marker configuration
 * @param {object} position - { lat, lng }
 * @param {string} type - 'ambulance' | 'patient' | 'hospital'
 * @param {string} title - Marker title
 * @returns {object} - Marker options
 */
export function createMarkerConfig(position, type, title = '') {
  return {
    position,
    icon: getMarkerIcon(type),
    title,
    optimized: true,
    animation: MAP_CONFIG.markerAnimation.DROP,
  };
}

/**
 * Animate marker along path
 * @param {object} marker - Google Maps marker
 * @param {array} path - Array of {lat, lng} coordinates
 * @param {number} duration - Animation duration in milliseconds
 * @param {Function} onComplete - Callback when animation completes
 */
export function animateMarkerAlongPath(marker, path, duration, onComplete) {
  if (!path || path.length === 0) return;
  
  let currentStep = 0;
  const step = (1000 / duration) * 60; // 60fps
  
  const animate = () => {
    currentStep += step;
    
    if (currentStep >= path.length) {
      marker.setPosition(path[path.length - 1]);
      if (onComplete) onComplete();
      return;
    }
    
    const idx = Math.floor(currentStep);
    marker.setPosition(path[idx]);
    requestAnimationFrame(animate);
  };
  
  animate();
}

/**
 * Fit map bounds to include all markers
 * @param {object} map - Google Maps instance
 * @param {array} markers - Array of markers
 * @param {number} padding - Padding in pixels (default: 50)
 */
export function fitMapBounds(map, markers, padding = 50) {
  if (!markers || markers.length === 0) return;
  
  const bounds = new window.google.maps.LatLngBounds();
  
  markers.forEach((marker) => {
    if (marker && marker.getPosition) {
      bounds.extend(marker.getPosition());
    }
  });
  
  map.fitBounds(bounds, padding);
}

/**
 * Create polyline on map for route visualization
 * @param {object} map - Google Maps instance
 * @param {array} path - Array of {lat, lng} coordinates
 * @param {object} options - Polyline options
 * @returns {object} - Polyline instance
 */
export function createPolyline(map, path, options = {}) {
  const defaultOptions = {
    path,
    geodesic: true,
    strokeColor: '#4285F4',
    strokeOpacity: 0.8,
    strokeWeight: 3,
    clickable: false,
    map,
  };
  
  return new window.google.maps.Polyline({
    ...defaultOptions,
    ...options,
  });
}

/**
 * Get map center between two points
 * @param {object} point1 - { lat, lng }
 * @param {object} point2 - { lat, lng }
 * @returns {object} - Center point { lat, lng }
 */
export function getMapCenter(point1, point2) {
  return {
    lat: (point1.lat + point2.lat) / 2,
    lng: (point1.lng + point2.lng) / 2,
  };
}
