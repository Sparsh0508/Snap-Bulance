/**
 * GoogleMapsLiveTracker.jsx
 * Advanced real-time ambulance tracking component with Google Maps
 * Shows driver location, patient location, route, ETA, and distance
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useGoogleMap, useDirectionsService, useMapLocationTracking } from '../../hooks/useGoogleMap';
import { calculateDistance, calculateETA } from '../../lib/googleMapsConfig';
import { AlertCircle, Clock, MapPin, Navigation, Phone, MessageSquare } from 'lucide-react';

/**
 * Status Flow Tracker Component
 */
function StatusFlow({ currentStatus }) {
  const statuses = [
    { id: 'ASSIGNED', label: 'Driver Assigned', icon: '📍' },
    { id: 'ON_THE_WAY', label: 'On The Way', icon: '🚑' },
    { id: 'REACHED_PATIENT', label: 'Reached Patient', icon: '✓' },
    { id: 'PATIENT_PICKED', label: 'Patient Picked Up', icon: '📤' },
    { id: 'REACHED_HOSPITAL', label: 'Reached Hospital', icon: '🏥' },
  ];

  const currentIndex = statuses.findIndex((s) => s.id === currentStatus);

  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
      {statuses.map((status, index) => (
        <div key={status.id} className="flex flex-col items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
              index <= currentIndex
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {status.icon}
          </div>
          <p
            className={`text-xs mt-2 text-center ${
              index <= currentIndex ? 'text-blue-600 font-semibold' : 'text-gray-500'
            }`}
          >
            {status.label}
          </p>
          {index < statuses.length - 1 && (
            <div
              className={`w-8 h-1 mt-2 ${
                index < currentIndex ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Live Tracking Info Panel
 */
function LiveTrackingInfoPanel({
  driverInfo,
  distance,
  eta,
  status,
  onCall,
  onChat,
}) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-4">
      {/* Status */}
      <div className="pb-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Trip Status</h3>
        <p className="text-2xl font-bold text-blue-600">{status}</p>
      </div>

      {/* ETA & Distance */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <Clock className="h-8 w-8 text-blue-600" />
          <div>
            <p className="text-sm text-gray-600">ETA</p>
            <p className="text-2xl font-bold text-gray-900">{eta.formatted}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Navigation className="h-8 w-8 text-orange-600" />
          <div>
            <p className="text-sm text-gray-600">Distance</p>
            <p className="text-2xl font-bold text-gray-900">{distance.toFixed(1)} km</p>
          </div>
        </div>
      </div>

      {/* Driver Info */}
      {driverInfo && (
        <div className="pb-4 border-t border-gray-200 pt-4">
          <h4 className="font-semibold text-gray-900 mb-3">Driver Details</h4>
          <div className="space-y-2">
            <p className="text-gray-700">
              <span className="font-medium">Name:</span> {driverInfo.name}
            </p>
            <p className="text-gray-700">
              <span className="font-medium">Vehicle:</span> {driverInfo.vehicleNumber}
            </p>
            <p className="text-gray-700">
              <span className="font-medium">Rating:</span> ⭐ {driverInfo.rating || 'N/A'}
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={onCall}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
              >
                <Phone className="h-4 w-4" />
                Call
              </button>
              <button
                onClick={onChat}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
              >
                <MessageSquare className="h-4 w-4" />
                Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="text-sm text-green-600 flex items-center gap-2">
        <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
        Live tracking active
      </div>
    </div>
  );
}

/**
 * Main Google Maps Live Tracker Component
 */
export default function GoogleMapsLiveTracker({
  containerId = 'google-map-tracker',
  driverLocation = null,
  patientLocation = null,
  hospitalLocation = null,
  driverInfo = null,
  tripStatus = 'ASSIGNED',
  onLocationUpdate = null,
  onError = null,
  showStatusFlow = true,
  showInfoPanel = true,
}) {
  // State
  const [distance, setDistance] = useState(0);
  const [eta, setEta] = useState({ minutes: 0, seconds: 0, formatted: 'Calculating...' });
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState(null);

  // Hooks
  const {
    map,
    mapLoaded,
    error: mapInitError,
    addMarker,
    updateMarkerPosition,
    addPolyline,
    clearPolylines,
    fitToMarkers,
    setCenter,
  } = useGoogleMap(containerId, {
    center: driverLocation || patientLocation || { lat: 28.6139, lng: 77.2090 },
    zoom: 15,
  });

  const { getDirections, loading: directionsLoading } = useDirectionsService(
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY
  );

  const { updateLiveLocation } = useMapLocationTracking(map);

  // Handle map initialization error
  useEffect(() => {
    if (mapInitError) {
      setMapError(mapInitError);
      if (onError) onError(mapInitError);
    }
  }, [mapInitError, onError]);

  // Add/Update markers and get route
  useEffect(() => {
    if (!mapLoaded) return;

    const initializeMap = async () => {
      try {
        setLoading(true);

        // Add driver marker
        if (driverLocation) {
          addMarker('driver', driverLocation, 'ambulance', 'Ambulance', '<div>🚑 Ambulance</div>');
        }

        // Add patient marker
        if (patientLocation) {
          addMarker('patient', patientLocation, 'patient', 'Patient Location', '<div>📍 Patient</div>');
        }

        // Add hospital marker
        if (hospitalLocation) {
          addMarker('hospital', hospitalLocation, 'hospital', 'Hospital', '<div>🏥 Hospital</div>');
        }

        // Get route from driver to patient if both locations exist
        if (driverLocation && patientLocation) {
          const directions = await getDirections(driverLocation, patientLocation);

          if (directions) {
            setRoute(directions);

            // Add polyline for route
            clearPolylines();
            addPolyline(directions.path, {
              strokeColor: '#4285F4',
              strokeWeight: 4,
              strokeOpacity: 0.8,
            });

            // Update distance and ETA
            const dist = directions.distance;
            setDistance(dist);
            setEta(calculateETA(dist));

            if (onLocationUpdate) {
              onLocationUpdate({
                distance: dist,
                eta: calculateETA(dist),
                route: directions,
              });
            }
          }
        } else if (driverLocation && patientLocation) {
          // Fallback to haversine calculation if directions API fails
          const dist = calculateDistance(
            driverLocation.lat,
            driverLocation.lng,
            patientLocation.lat,
            patientLocation.lng
          );
          setDistance(dist);
          setEta(calculateETA(dist));
        }

        // Fit map to show all markers
        fitToMarkers();
        setLoading(false);
      } catch (err) {
        console.error('Error initializing map:', err);
        setMapError(err.message);
        setLoading(false);
      }
    };

    initializeMap();
  }, [mapLoaded, driverLocation, patientLocation, hospitalLocation]);

  // Update driver marker position
  useEffect(() => {
    if (!map || !driverLocation) return;

    const marker = document.querySelector('[data-marker-id="driver"]');
    if (marker) {
      updateLiveLocation(marker, driverLocation, { animate: true, duration: 500 });

      // Recalculate ETA with new location
      if (patientLocation) {
        const dist = calculateDistance(
          driverLocation.lat,
          driverLocation.lng,
          patientLocation.lat,
          patientLocation.lng
        );
        setDistance(dist);
        setEta(calculateETA(dist));
      }
    }
  }, [driverLocation, patientLocation, map, updateLiveLocation]);

  if (mapInitError) {
    return (
      <div className="flex items-center justify-center h-96 bg-red-50 rounded-lg border-2 border-red-200">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-900">Map Error</h3>
          <p className="text-sm text-red-700 mt-2">{mapInitError}</p>
          <p className="text-xs text-red-600 mt-2">
            Make sure your Google Maps API key is valid and has the required permissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Status Flow */}
      {showStatusFlow && <StatusFlow currentStatus={tripStatus} />}

      {/* Map Container */}
      <div className="flex-1 rounded-lg overflow-hidden shadow-lg relative bg-gray-100">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p className="text-gray-700">Loading map...</p>
            </div>
          </div>
        )}
        <div id={containerId} className="w-full h-full" />
      </div>

      {/* Info Panel */}
      {showInfoPanel && (
        <LiveTrackingInfoPanel
          driverInfo={driverInfo}
          distance={distance}
          eta={eta}
          status={tripStatus}
          onCall={() => {
            if (driverInfo?.phone) {
              window.location.href = `tel:${driverInfo.phone}`;
            }
          }}
          onChat={() => {
            // Implement chat functionality
            console.log('Chat clicked');
          }}
        />
      )}
    </div>
  );
}

export { StatusFlow, LiveTrackingInfoPanel };
