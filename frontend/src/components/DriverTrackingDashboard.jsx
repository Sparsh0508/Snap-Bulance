/**
 * DriverTrackingDashboard.jsx
 * Real-time dashboard for drivers showing route, patient location, and navigation
 */

import React, { useState, useEffect, useRef } from 'react';
import { useDriverTracking } from '../hooks/useDriverTracking';
import { useTripTrackingStore } from '../store/useTripTrackingStore';
import { useTripSocket } from '../hooks/useTripSocket';
import { useGoogleMapsTracking } from '../hooks/useGoogleMapsTracking';
import { getDirections, formatDuration, formatDistance, calculateBearing } from '../services/googleMapsService';
import { EnhancedLiveTrackerMap, StatusFlow } from './ui/EnhancedLiveTrackerMap';
import '../styles/tracker.css';

export function DriverTrackingDashboard({ tripId, driverId, onStatusChange = null }) {
    const mapContainerRef = useRef(null);
    const [navMode, setNavMode] = useState('navigation'); // navigation, tracking
    const [voiceGuidance, setVoiceGuidance] = useState(true);
    const [speedLimit, setSpeedLimit] = useState(null);
    const [speedData, setSpeedData] = useState({ current: 0, average: 0, max: 0 });

    const { currentTrip, driverLocation, distanceToPatient, etaMinutesToPatient } = useTripTrackingStore();
    const { socket } = useTripSocket(tripId);
    
    // Start driver GPS tracking
    useDriverTracking(tripId, {
        driverId,
        updateIntervalMs: 10000,
        enableHighAccuracy: true,
    });

    /**
     * Handle status updates
     */
    const handleStatusUpdate = (newStatus) => {
        socket?.emit('updateTripStatus', {
            tripId,
            status: newStatus,
            location: driverLocation,
        });

        if (onStatusChange) {
            onStatusChange(newStatus);
        }
    };

    /**
     * Button handlers for different trip statuses
     */
    const handleArriveAtPatient = () => {
        handleStatusUpdate('ARRIVED');
    };

    const handlePatientPickup = () => {
        handleStatusUpdate('ON_BOARD');
    };

    const handleReachedHospital = () => {
        handleStatusUpdate('COMPLETED');
    };

    /**
     * Speed warning system
     */
    useEffect(() => {
        if (driverLocation?.speed) {
            setSpeedData(prev => ({
                current: Math.round(driverLocation.speed * 3.6), // Convert m/s to km/h
                average: prev.average ? (prev.average + driverLocation.speed * 3.6) / 2 : driverLocation.speed * 3.6,
                max: Math.max(prev.max, driverLocation.speed * 3.6),
            }));
        }
    }, [driverLocation?.speed]);

    /**
     * Determine next action button
     */
    const getActionButton = () => {
        const status = currentTrip?.status;
        
        if (status === 'ASSIGNED') {
            return {
                label: '✓ Arrived at Patient',
                action: handleArriveAtPatient,
                disabled: distanceToPatient > 0.2, // More than 200m away
            };
        } else if (status === 'ARRIVED') {
            return {
                label: '👤 Patient Picked Up',
                action: handlePatientPickup,
                disabled: false,
            };
        } else if (status === 'ON_BOARD') {
            return {
                label: '🏥 Reached Hospital',
                action: handleReachedHospital,
                disabled: false,
            };
        }
        
        return null;
    };

    const actionButton = getActionButton();

    return (
        <div className="driver-tracking-dashboard">
            {/* Header with Navigation Mode */}
            <div className="tracking-header driver-header">
                <h1>🚗 Driver Navigation</h1>
                <div className="nav-mode-selector">
                    <button 
                        className={`mode-btn ${navMode === 'navigation' ? 'active' : ''}`}
                        onClick={() => setNavMode('navigation')}
                    >
                        🗺️ Navigation
                    </button>
                    <button 
                        className={`mode-btn ${navMode === 'tracking' ? 'active' : ''}`}
                        onClick={() => setNavMode('tracking')}
                    >
                        📍 Tracking
                    </button>
                </div>
            </div>

            {/* Trip Status Flow */}
            <StatusFlow status={currentTrip?.status} />

            {/* Live Navigation Map */}
            <div className="live-map-wrapper full-height">
                <EnhancedLiveTrackerMap 
                    tripId={tripId}
                    showControls={true}
                    autoFit={true}
                    height="600px"
                />
            </div>

            {/* Navigation Info Panel */}
            <div className="navigation-panel driver-nav-panel">
                {/* Navigation Stats */}
                <div className="nav-stats">
                    <div className="stat-item primary">
                        <div className="stat-icon">⏱️</div>
                        <div className="stat-content">
                            <div className="stat-label">ETA</div>
                            <div className="stat-value">{formatDuration(etaMinutesToPatient * 60 || 0)}</div>
                        </div>
                    </div>

                    <div className="stat-item">
                        <div className="stat-icon">📍</div>
                        <div className="stat-content">
                            <div className="stat-label">Distance</div>
                            <div className="stat-value">{formatDistance((distanceToPatient || 0) * 1000)}</div>
                        </div>
                    </div>

                    <div className="stat-item">
                        <div className="stat-icon">🚗</div>
                        <div className="stat-content">
                            <div className="stat-label">Speed</div>
                            <div className="stat-value">{Math.round(speedData.current)} km/h</div>
                        </div>
                    </div>
                </div>

                {/* Speed Warning */}
                {speedData.current > 60 && (
                    <div className="speed-warning">
                        ⚠️ Slow down! Current speed: {Math.round(speedData.current)} km/h
                    </div>
                )}

                {/* Trip Details */}
                <div className="trip-info-card">
                    <div className="trip-info-item">
                        <span className="label">Patient:</span>
                        <span className="value">{currentTrip?.passenger?.fullName}</span>
                    </div>
                    <div className="trip-info-item">
                        <span className="label">Location:</span>
                        <span className="value">{currentTrip?.pickupAddress}</span>
                    </div>
                    <div className="trip-info-item">
                        <span className="label">Hospital:</span>
                        <span className="value">{currentTrip?.hospital?.name}</span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="trip-actions">
                    {actionButton && (
                        <button 
                            className="btn btn-primary btn-lg btn-action"
                            onClick={actionButton.action}
                            disabled={actionButton.disabled}
                        >
                            {actionButton.label}
                        </button>
                    )}
                    
                    <button 
                        className={`btn btn-secondary btn-action ${voiceGuidance ? 'active' : ''}`}
                        onClick={() => setVoiceGuidance(!voiceGuidance)}
                    >
                        🔊 Voice Guidance: {voiceGuidance ? 'ON' : 'OFF'}
                    </button>
                </div>

                {/* Performance Metrics */}
                <div className="performance-metrics">
                    <div className="metric">
                        <span className="label">Average Speed:</span>
                        <span className="value">{Math.round(speedData.average)} km/h</span>
                    </div>
                    <div className="metric">
                        <span className="label">Max Speed:</span>
                        <span className="value">{Math.round(speedData.max)} km/h</span>
                    </div>
                </div>
            </div>

            {/* Voice Guidance Indicator */}
            {voiceGuidance && (
                <div className="voice-guidance-indicator">
                    🎙️ Voice guidance active
                </div>
            )}

            {/* Emergency SOS for Driver */}
            <div className="driver-emergency">
                <button className="btn btn-danger">
                    🆘 SOS
                </button>
            </div>
        </div>
    );
}

export default DriverTrackingDashboard;
