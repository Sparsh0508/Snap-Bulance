/**
 * AmbulanceTrackerMap.jsx
 * Real-time map component for tracking ambulance movement
 * Uses Leaflet and React-Leaflet for map visualization
 */

import React, { useEffect, useRef } from 'react';
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    Circle,
    useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { AlertCircle, MapPin, Navigation } from 'lucide-react';

/**
 * Custom icons for markers
 */
const createAmbulanceIcon = () => {
    return L.divIcon({
        html: `
            <div class="ambulance-marker">
                <div class="ambulance-pulse"></div>
                <div class="ambulance-icon">🚑</div>
            </div>
        `,
        className: 'custom-ambulance-icon',
        iconSize: [50, 50],
        iconAnchor: [25, 25],
        popupAnchor: [0, -25],
    });
};

const createPatientIcon = () => {
    return L.divIcon({
        html: `<div class="patient-marker">📍</div>`,
        className: 'custom-patient-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40],
    });
};

const createHospitalIcon = () => {
    return L.divIcon({
        html: `<div class="hospital-marker">🏥</div>`,
        className: 'custom-hospital-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40],
    });
};

/**
 * Helper component to animate map to include all markers
 */
function MapAutoFit({ locations }) {
    const map = useMap();

    useEffect(() => {
        if (!locations || locations.length === 0) return;

        const group = L.featureGroup(
            locations.map((loc) => L.marker([loc.lat, loc.lng]))
        );

        setTimeout(() => {
            map.fitBounds(group.getBounds(), { padding: [50, 50] });
        }, 100);
    }, [locations, map]);

    return null;
}

/**
 * Main AmbulanceTrackerMap Component
 * 
 * @param {Object} props - Component props
 * @param {Object} props.driverLocation - Current driver location {lat, lng}
 * @param {Object} props.patientLocation - Patient pickup location {lat, lng}
 * @param {Object} props.hospitalLocation - Hospital destination {lat, lng}
 * @param {Array} props.route - Array of location coordinates forming the route
 * @param {string} props.tripStatus - Current trip status
 * @param {number} props.etaMinutes - Estimated time to patient
 * @param {number} props.distanceKm - Distance to patient
 * @param {boolean} props.showRoute - Whether to show route polyline
 * @returns {JSX.Element}
 */
export function AmbulanceTrackerMap({
    driverLocation = null,
    patientLocation = null,
    hospitalLocation = null,
    route = [],
    tripStatus = 'SEARCHING',
    etaMinutes = null,
    distanceKm = null,
    showRoute = true,
}) {
    // Determine center and zoom
    const center = driverLocation || patientLocation || [28.6139, 77.2090]; // Default to Delhi
    const zoom = 15;

    // Collect all locations for auto-fit
    const allLocations = [];
    if (driverLocation) allLocations.push({ lat: driverLocation.lat, lng: driverLocation.lng });
    if (patientLocation) allLocations.push({ lat: patientLocation.lat, lng: patientLocation.lng });
    if (hospitalLocation) allLocations.push({ lat: hospitalLocation.lat, lng: hospitalLocation.lng });

    // Create route coordinates
    const routeCoordinates = route.length > 0
        ? route.map((loc) => [loc.lat, loc.lng])
        : driverLocation && patientLocation
        ? [[driverLocation.lat, driverLocation.lng], [patientLocation.lat, patientLocation.lng]]
        : [];

    const statusColors = {
        'SEARCHING': '#FFA500',
        'ASSIGNED': '#2196F3',
        'ARRIVED': '#4CAF50',
        'ON_BOARD': '#FF9800',
        'COMPLETED': '#4CAF50',
    };

    const statusColor = statusColors[tripStatus] || '#666';

    return (
        <div className="relative w-full h-full rounded-lg overflow-hidden shadow-lg border border-gray-200">
            <MapContainer
                center={Array.isArray(center) ? center : [center.lat, center.lng]}
                zoom={zoom}
                className="w-full h-full"
                style={{ zIndex: 0 }}
            >
                {/* Map tiles */}
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Auto-fit map to show all markers */}
                <MapAutoFit locations={allLocations} />

                {/* Driver location marker */}
                {driverLocation && (
                    <Marker
                        position={[driverLocation.lat, driverLocation.lng]}
                        icon={createAmbulanceIcon()}
                    >
                        <Popup className="ambulance-popup">
                            <div className="p-2 text-sm">
                                <div className="font-semibold flex items-center gap-2">
                                    <span>🚑 Ambulance</span>
                                </div>
                                <div className="text-gray-600 mt-1">
                                    {etaMinutes && (
                                        <div>ETA: {etaMinutes} min</div>
                                    )}
                                    {distanceKm && (
                                        <div>Distance: {distanceKm} km</div>
                                    )}
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                )}

                {/* Patient location marker */}
                {patientLocation && (
                    <Marker
                        position={[patientLocation.lat, patientLocation.lng]}
                        icon={createPatientIcon()}
                    >
                        <Popup>
                            <div className="p-2 text-sm">
                                <div className="font-semibold">📍 Pickup Location</div>
                                <div className="text-gray-600 mt-1">
                                    <div>Lat: {patientLocation.lat.toFixed(4)}</div>
                                    <div>Lng: {patientLocation.lng.toFixed(4)}</div>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                )}

                {/* Hospital location marker */}
                {hospitalLocation && (
                    <Marker
                        position={[hospitalLocation.lat, hospitalLocation.lng]}
                        icon={createHospitalIcon()}
                    >
                        <Popup>
                            <div className="p-2 text-sm">
                                <div className="font-semibold">🏥 Hospital</div>
                                <div className="text-gray-600 mt-1">
                                    <div>Lat: {hospitalLocation.lat.toFixed(4)}</div>
                                    <div>Lng: {hospitalLocation.lng.toFixed(4)}</div>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                )}

                {/* Route polyline */}
                {showRoute && routeCoordinates.length > 1 && (
                    <Polyline
                        positions={routeCoordinates}
                        color={statusColor}
                        weight={3}
                        opacity={0.7}
                        lineCap="round"
                        lineJoin="round"
                    />
                )}

                {/* Accuracy circle around driver */}
                {driverLocation && driverLocation.accuracy && (
                    <Circle
                        center={[driverLocation.lat, driverLocation.lng]}
                        radius={driverLocation.accuracy}
                        color="rgba(33, 150, 243, 0.3)"
                        fillColor="rgba(33, 150, 243, 0.1)"
                        weight={1}
                    />
                )}
            </MapContainer>

            {/* Loading indicator */}
            {!driverLocation && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded-lg z-10">
                    <div className="bg-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                        <span className="text-sm font-medium text-gray-700">
                            Loading map...
                        </span>
                    </div>
                </div>
            )}

            {/* Styles for custom markers */}
            <style>{`
                .custom-ambulance-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .ambulance-marker {
                    position: relative;
                    width: 50px;
                    height: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 32px;
                }

                .ambulance-pulse {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: rgba(33, 150, 243, 0.3);
                    animation: pulse 2s infinite;
                }

                @keyframes pulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7);
                    }
                    50% {
                        box-shadow: 0 0 0 10px rgba(33, 150, 243, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(33, 150, 243, 0);
                    }
                }

                .ambulance-icon {
                    position: relative;
                    z-index: 1;
                    animation: bounce 2s infinite;
                }

                @keyframes bounce {
                    0%, 100% {
                        transform: translateY(0);
                    }
                    50% {
                        transform: translateY(-5px);
                    }
                }

                .custom-patient-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .patient-marker {
                    font-size: 28px;
                    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
                }

                .custom-hospital-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .hospital-marker {
                    font-size: 28px;
                    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
                }

                .ambulance-popup .leaflet-popup-content {
                    margin: 0;
                }
            `}</style>
        </div>
    );
}

export default AmbulanceTrackerMap;
