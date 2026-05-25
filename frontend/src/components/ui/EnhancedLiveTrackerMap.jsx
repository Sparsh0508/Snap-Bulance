/**
 * EnhancedLiveTrackerMap.jsx
 * Complete real-time live tracking map component
 * Displays driver location, route, ETA, distance, and smooth animations
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGoogleMapsTracking, useDriverLocationUpdate, useRoutePolyline } from '../hooks/useGoogleMapsTracking';
import { useTripSocket } from '../hooks/useTripSocket';
import { useTripTrackingStore } from '../store/useTripTrackingStore';
import { getDirections, formatDuration, formatDistance } from '../services/googleMapsService';
import '../styles/tracker.css';

/**
 * Enhanced live tracker component
 */
export function EnhancedLiveTrackerMap({
    tripId,
    onStatusChange = null,
    showControls = true,
    autoFit = true,
    height = '600px',
}) {
    const mapContainerRef = useRef(null);
    const previousLocationRef = useRef(null);
    const [routeData, setRouteData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const { currentTrip, driverLocation, etaMinutesToPatient, distanceToPatient } = useTripTrackingStore();
    const { socket } = useTripSocket(tripId);
    const mapTracking = useGoogleMapsTracking(mapContainerRef, {
        zoom: 16,
        center: { lat: 28.6139, lng: 77.2090 }, // Delhi default
    });

    /**
     * Fetch route data from Directions API
     */
    const fetchRoute = useCallback(async () => {
        if (!currentTrip || !driverLocation) return;

        setIsLoading(true);
        try {
            const result = await getDirections(
                driverLocation.lat,
                driverLocation.lng,
                currentTrip.pickupLat,
                currentTrip.pickupLng
            );

            if (result.success) {
                setRouteData(result);
            }
        } catch (error) {
            console.error('Error fetching route:', error);
        } finally {
            setIsLoading(false);
        }
    }, [currentTrip, driverLocation]);

    /**
     * Initialize map with markers and route
     */
    useEffect(() => {
        if (!mapTracking.isReady) return;

        // Add driver marker
        if (driverLocation) {
            mapTracking.addMarker(`driver_marker_${tripId}`, driverLocation, {
                title: 'Ambulance',
                icon: {
                    path: 'M0,-28 C-7.72,-28 -14,-22.04 -14,-14.4 C0,0 14,15.96 14,15.96 C14,15.96 0,32 0,32 C0,32 -14,15.96 -14,15.96 C-14,15.96 0,0 0,-14.4 C0,-22.04 -7.72,-28 0,-28 Z',
                    fillColor: '#FF5722',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                    scale: 0.7,
                },
            });
        }

        // Add patient marker
        if (currentTrip) {
            mapTracking.addMarker(`patient_marker_${tripId}`, {
                lat: currentTrip.pickupLat,
                lng: currentTrip.pickupLng,
            }, {
                title: 'Patient Location',
                icon: {
                    path: 'M0,-28 C-7.72,-28 -14,-22.04 -14,-14.4 C0,0 14,15.96 14,15.96 C14,15.96 0,32 0,32 C0,32 -14,15.96 -14,15.96 C-14,15.96 0,0 0,-14.4 C0,-22.04 -7.72,-28 0,-28 Z',
                    fillColor: '#4285F4',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                    scale: 0.7,
                },
            });
        }

        // Add hospital marker if available
        if (currentTrip?.destLat && currentTrip?.destLng) {
            mapTracking.addMarker(`hospital_marker_${tripId}`, {
                lat: currentTrip.destLat,
                lng: currentTrip.destLng,
            }, {
                title: 'Hospital Destination',
                icon: {
                    path: 'M0,-28 C-7.72,-28 -14,-22.04 -14,-14.4 C0,0 14,15.96 14,15.96 C14,15.96 0,32 0,32 C0,32 -14,15.96 -14,15.96 C-14,15.96 0,0 0,-14.4 C0,-22.04 -7.72,-28 0,-28 Z',
                    fillColor: '#34A853',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2,
                    scale: 0.7,
                },
            });
        }

        // Fit bounds to include all markers
        if (autoFit) {
            mapTracking.fitToBounds();
        }
    }, [mapTracking.isReady, driverLocation, currentTrip, tripId, autoFit]);

    /**
     * Add/update route polyline
     */
    useEffect(() => {
        if (!mapTracking.isReady || !routeData?.polyline) return;

        mapTracking.addPolyline(`route_${tripId}`, routeData.polyline, {
            color: '#4285F4',
            weight: 4,
            opacity: 0.7,
        });
    }, [mapTracking.isReady, routeData, tripId]);

    /**
     * Animate driver marker smoothly
     */
    useEffect(() => {
        if (!mapTracking.isReady || !driverLocation) return;

        const markerId = `driver_marker_${tripId}`;
        const previousLocation = previousLocationRef.current;

        if (previousLocation) {
            mapTracking.animateMarker(markerId, driverLocation, {
                duration: 2000,
                easing: 'easeInOutQuad',
            });
        }

        previousLocationRef.current = driverLocation;
    }, [mapTracking.isReady, driverLocation, tripId]);

    /**
     * Fetch route data periodically
     */
    useEffect(() => {
        fetchRoute();
        const interval = setInterval(fetchRoute, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, [fetchRoute]);

    /**
     * Update map when trip status changes
     */
    useEffect(() => {
        if (onStatusChange && currentTrip) {
            onStatusChange(currentTrip.status);
        }
    }, [currentTrip?.status]);

    return (
        <div className="enhanced-tracker-container">
            <div 
                ref={mapContainerRef} 
                className="tracker-map"
                style={{ height, borderRadius: '12px' }}
            />

            {/* Tracking Info Panel */}
            <div className="tracking-info-panel">
                <div className="info-card">
                    <div className="info-header">
                        <h3>Live Tracking</h3>
                        <span className={`status-badge status-${currentTrip?.status.toLowerCase()}`}>
                            {currentTrip?.status.replace(/_/g, ' ')}
                        </span>
                    </div>

                    <div className="info-grid">
                        <div className="info-item">
                            <span className="label">ETA to Patient</span>
                            <span className="value">{formatDuration(etaMinutesToPatient * 60 || 0)}</span>
                        </div>
                        <div className="info-item">
                            <span className="label">Distance</span>
                            <span className="value">{formatDistance((distanceToPatient || 0) * 1000)}</span>
                        </div>
                        {routeData && (
                            <>
                                <div className="info-item">
                                    <span className="label">Route Distance</span>
                                    <span className="value">{formatDistance(routeData.distance)}</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Route Duration</span>
                                    <span className="value">{formatDuration(routeData.duration)}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Map Controls */}
                {showControls && (
                    <div className="map-controls">
                        <button 
                            className="control-btn"
                            onClick={() => mapTracking.fitToBounds()}
                            title="Fit to view"
                        >
                            📍 Fit View
                        </button>
                        <button 
                            className="control-btn"
                            onClick={() => {
                                if (driverLocation) {
                                    mapTracking.setCenter(driverLocation);
                                }
                            }}
                            title="Center on driver"
                        >
                            🎯 Center
                        </button>
                        <button 
                            className="control-btn"
                            onClick={fetchRoute}
                            disabled={isLoading}
                            title="Refresh route"
                        >
                            {isLoading ? '⏳ Loading...' : '🔄 Refresh'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Status Flow Component
 */
export function StatusFlow({ status = 'SEARCHING' }) {
    const statusSequence = [
        { key: 'SEARCHING', label: 'Finding Ambulance', icon: '🔍' },
        { key: 'ASSIGNED', label: 'On The Way', icon: '🚑' },
        { key: 'ARRIVED', label: 'Arrived', icon: '📍' },
        { key: 'ON_BOARD', label: 'Patient Picked Up', icon: '👤' },
        { key: 'COMPLETED', label: 'Reached Hospital', icon: '🏥' },
    ];

    const currentIndex = statusSequence.findIndex(s => s.key === status);

    return (
        <div className="status-flow">
            {statusSequence.map((s, index) => (
                <React.Fragment key={s.key}>
                    <div className={`status-step ${index <= currentIndex ? 'active' : ''}`}>
                        <div className="status-icon">{s.icon}</div>
                        <div className="status-label">{s.label}</div>
                    </div>
                    {index < statusSequence.length - 1 && (
                        <div className={`status-connector ${index < currentIndex ? 'active' : ''}`} />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

export default EnhancedLiveTrackerMap;
