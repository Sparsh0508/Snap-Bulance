/**
 * PatientTrackingDashboard.jsx
 * Real-time ambulance tracking dashboard for patients
 * Shows driver location, ETA, distance, and emergency controls
 */

import React, { useState, useEffect, useRef } from 'react';
import { useGeolocation } from '../lib/useGeolocation';
import { useTripTrackingStore } from '../store/useTripTrackingStore';
import { useTripSocket } from '../hooks/useTripSocket';
import { useGoogleMapsTracking } from '../hooks/useGoogleMapsTracking';
import { getDirections, formatDuration, formatDistance, calculateDistance } from '../services/googleMapsService';
import { EnhancedLiveTrackerMap, StatusFlow } from './ui/EnhancedLiveTrackerMap';
import '../styles/tracker.css';

export function PatientTrackingDashboard({ tripId, onTripComplete = null }) {
    const mapContainerRef = useRef(null);
    const [showDetails, setShowDetails] = useState(true);
    const [callState, setCallState] = useState('idle'); // idle, calling, active
    const [emergencyAlerts, setEmergencyAlerts] = useState([]);

    const {
        currentTrip,
        driverLocation,
        etaMinutesToPatient,
        distanceToPatient,
        getTripStatus,
        getFormattedETA,
    } = useTripTrackingStore();

    const { socket } = useTripSocket(tripId);
    const { location: patientLocation } = useGeolocation(null, true, 30000);

    /**
     * Handle emergency call
     */
    const handleEmergencyCall = () => {
        if (callState === 'idle') {
            setCallState('calling');
            // Trigger actual call through backend
            socket?.emit('callDriver', { tripId, type: 'EMERGENCY' });
            
            setTimeout(() => {
                setCallState('active');
            }, 2000);
        } else if (callState === 'active') {
            setCallState('idle');
            socket?.emit('endCall', { tripId });
        }
    };

    /**
     * Handle emergency cancel
     */
    const handleEmergencyCancel = () => {
        socket?.emit('emergencyCancel', { tripId });
        setEmergencyAlerts(prev => [...prev, 'Trip cancellation requested']);
    };

    /**
     * Share location with hospital
     */
    const handleShareLocation = () => {
        if (patientLocation) {
            socket?.emit('sharePatientLocation', {
                tripId,
                lat: patientLocation.latitude,
                lng: patientLocation.longitude,
            });
        }
    };

    return (
        <div className="patient-tracking-dashboard">
            {/* Header */}
            <div className="tracking-header">
                <h1>🚑 Ambulance Tracking</h1>
                <button 
                    className="details-toggle"
                    onClick={() => setShowDetails(!showDetails)}
                >
                    {showDetails ? '▼' : '▲'} Details
                </button>
            </div>

            {/* Status Flow */}
            <StatusFlow status={currentTrip?.status} />

            {/* Live Map */}
            <div className="live-map-wrapper">
                <EnhancedLiveTrackerMap 
                    tripId={tripId}
                    showControls={true}
                    autoFit={true}
                    height="500px"
                />
            </div>

            {/* Main Tracking Info */}
            <div className="tracking-metrics">
                <div className="metric-card eta-card">
                    <div className="metric-label">⏱️ ETA to Reach You</div>
                    <div className="metric-value">{getFormattedETA('patient')}</div>
                    <div className="metric-subtext">Real-time estimate</div>
                </div>

                <div className="metric-card distance-card">
                    <div className="metric-label">📍 Distance Away</div>
                    <div className="metric-value">{formatDistance((distanceToPatient || 0) * 1000)}</div>
                    <div className="metric-subtext">Current distance</div>
                </div>

                <div className="metric-card status-card">
                    <div className="metric-label">🔄 Status</div>
                    <div className="metric-value">{getTripStatus()}</div>
                    <div className="metric-subtext">Trip progress</div>
                </div>
            </div>

            {/* Driver Info Card */}
            {currentTrip?.driver && (
                <div className="driver-info-card">
                    <div className="driver-avatar">
                        {currentTrip.driver.name?.charAt(0) || 'D'}
                    </div>
                    <div className="driver-details">
                        <div className="driver-name">{currentTrip.driver.name}</div>
                        <div className="driver-vehicle">{currentTrip.driver.vehicleType}</div>
                        <div className="driver-rating">⭐ {currentTrip.driver.rating || 4.8}</div>
                    </div>
                    <div className="driver-actions">
                        <button 
                            className={`action-btn call-btn ${callState === 'active' ? 'active' : ''}`}
                            onClick={handleEmergencyCall}
                            title={callState === 'idle' ? 'Call driver' : 'End call'}
                        >
                            {callState === 'idle' ? '☎️' : '✓'}
                        </button>
                        <button 
                            className="action-btn message-btn"
                            title="Send message"
                        >
                            💬
                        </button>
                    </div>
                </div>
            )}

            {/* Expandable Details */}
            {showDetails && (
                <div className="tracking-details">
                    {/* Emergency Alerts */}
                    {emergencyAlerts.length > 0 && (
                        <div className="emergency-alerts">
                            <h3>⚠️ Alerts</h3>
                            {emergencyAlerts.map((alert, idx) => (
                                <div key={idx} className="alert-item">{alert}</div>
                            ))}
                        </div>
                    )}

                    {/* Trip Details */}
                    <div className="trip-details-section">
                        <h3>📋 Trip Details</h3>
                        <div className="detail-item">
                            <span className="detail-label">Pickup Address:</span>
                            <span className="detail-value">{currentTrip?.pickupAddress}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Hospital:</span>
                            <span className="detail-value">{currentTrip?.hospital?.name}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Trip ID:</span>
                            <span className="detail-value">{tripId}</span>
                        </div>
                    </div>

                    {/* Safety Instructions */}
                    <div className="safety-section">
                        <h3>🛡️ Safety Tips</h3>
                        <ul>
                            <li>Stay in a safe, visible location for pickup</li>
                            <li>Have your ID ready for verification</li>
                            <li>Inform the paramedic about any allergies</li>
                            <li>Keep your phone battery charged</li>
                            <li>Contact hospital with medical history if possible</li>
                        </ul>
                    </div>
                </div>
            )}

            {/* Emergency Controls */}
            <div className="emergency-controls">
                <button 
                    className="btn btn-primary btn-lg"
                    onClick={handleShareLocation}
                >
                    📍 Share Location with Hospital
                </button>
                <button 
                    className="btn btn-warning btn-lg"
                    onClick={handleEmergencyCancel}
                >
                    ❌ Cancel Request
                </button>
            </div>

            {/* Live Tracking Info */}
            <div className="live-tracking-info">
                <div className="live-indicator-dot"></div>
                <span>Live Tracking Active</span>
                <span className="update-count">Updates: Real-time</span>
            </div>
        </div>
    );
}

export default PatientTrackingDashboard;
