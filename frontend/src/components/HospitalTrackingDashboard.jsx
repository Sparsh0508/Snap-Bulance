/**
 * HospitalTrackingDashboard.jsx
 * Hospital administrative dashboard showing all active ambulances in real-time
 * Shows incoming ambulances, ETAs, patient info, and coordination tools
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTripSocket } from '../hooks/useTripSocket';
import { useGoogleMapsTracking } from '../hooks/useGoogleMapsTracking';
import { formatDuration, formatDistance } from '../services/googleMapsService';
import '../styles/tracker.css';

export function HospitalTrackingDashboard({ hospitalId }) {
    const mapContainerRef = useRef(null);
    const [activeAmbulances, setActiveAmbulances] = useState([]);
    const [selectedAmbulance, setSelectedAmbulance] = useState(null);
    const [viewMode, setViewMode] = useState('map'); // map, list
    const [filter, setFilter] = useState('all'); // all, incoming, at_location, departed

    const { socket } = useTripSocket(`hospital_${hospitalId}`);
    const mapTracking = useGoogleMapsTracking(mapContainerRef, {
        zoom: 14,
        center: { lat: 28.5355, lng: 77.3910 }, // Hospital default
    });

    /**
     * Handle incoming ambulance updates
     */
    useEffect(() => {
        if (!socket) return;

        const handleAmbulanceUpdate = (data) => {
            setActiveAmbulances(prev => {
                const exists = prev.find(a => a.tripId === data.tripId);
                if (exists) {
                    // Update existing
                    return prev.map(a =>
                        a.tripId === data.tripId
                            ? { ...a, ...data, lastUpdate: new Date() }
                            : a
                    );
                } else {
                    // Add new
                    return [...prev, { ...data, lastUpdate: new Date() }];
                }
            });
        };

        socket.on('activeAmbulanceUpdated', handleAmbulanceUpdate);
        
        return () => {
            socket.off('activeAmbulanceUpdated', handleAmbulanceUpdate);
        };
    }, [socket]);

    /**
     * Update map markers when ambulances change
     */
    useEffect(() => {
        if (!mapTracking.isReady) return;

        activeAmbulances.forEach((ambulance, index) => {
            mapTracking.addMarker(
                `ambulance_${ambulance.tripId}`,
                {
                    lat: ambulance.lat,
                    lng: ambulance.lng,
                },
                {
                    title: `Ambulance ${index + 1} - ${ambulance.patientName}`,
                    icon: {
                        path: 'M0,-28 C-7.72,-28 -14,-22.04 -14,-14.4 C0,0 14,15.96 14,15.96 C14,15.96 0,32 0,32 C0,32 -14,15.96 -14,15.96 C-14,15.96 0,0 0,-14.4 C0,-22.04 -7.72,-28 0,-28 Z',
                        fillColor: getAmbulanceColor(ambulance.status),
                        fillOpacity: 1,
                        strokeColor: '#fff',
                        strokeWeight: 2,
                        scale: 0.7,
                    },
                }
            );
        });
    }, [mapTracking.isReady, activeAmbulances]);

    /**
     * Get color based on ambulance status
     */
    const getAmbulanceColor = (status) => {
        const colors = {
            'ASSIGNED': '#FFA726',     // Orange - On the way
            'ARRIVED': '#66BB6A',       // Green - Arrived at patient
            'ON_BOARD': '#EF5350',      // Red - En route to hospital
            'SEARCHING': '#AB47BC',     // Purple - Searching
        };
        return colors[status] || '#999';
    };

    /**
     * Filter ambulances based on selected filter
     */
    const getFilteredAmbulances = () => {
        return activeAmbulances.filter(ambulance => {
            if (filter === 'all') return true;
            if (filter === 'incoming') return ambulance.status === 'ASSIGNED' || ambulance.status === 'ARRIVED';
            if (filter === 'at_location') return ambulance.status === 'ARRIVED';
            if (filter === 'departed') return ambulance.status === 'ON_BOARD';
            return true;
        });
    };

    const filteredAmbulances = getFilteredAmbulances();

    return (
        <div className="hospital-tracking-dashboard">
            {/* Header */}
            <div className="dashboard-header hospital-header">
                <div className="header-left">
                    <h1>🏥 Hospital Ambulance Tracking</h1>
                    <div className="active-count">
                        <span className="count-badge">{activeAmbulances.length}</span>
                        <span className="count-label">Active Ambulances</span>
                    </div>
                </div>

                <div className="header-controls">
                    <div className="view-mode-selector">
                        <button 
                            className={`mode-btn ${viewMode === 'map' ? 'active' : ''}`}
                            onClick={() => setViewMode('map')}
                        >
                            🗺️ Map View
                        </button>
                        <button 
                            className={`mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                        >
                            📋 List View
                        </button>
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="filter-tabs">
                <button 
                    className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    All ({activeAmbulances.length})
                </button>
                <button 
                    className={`filter-tab ${filter === 'incoming' ? 'active' : ''}`}
                    onClick={() => setFilter('incoming')}
                >
                    Incoming ({activeAmbulances.filter(a => ['ASSIGNED', 'ARRIVED'].includes(a.status)).length})
                </button>
                <button 
                    className={`filter-tab ${filter === 'at_location' ? 'active' : ''}`}
                    onClick={() => setFilter('at_location')}
                >
                    At Patient ({activeAmbulances.filter(a => a.status === 'ARRIVED').length})
                </button>
                <button 
                    className={`filter-tab ${filter === 'departed' ? 'active' : ''}`}
                    onClick={() => setFilter('departed')}
                >
                    Departed ({activeAmbulances.filter(a => a.status === 'ON_BOARD').length})
                </button>
            </div>

            {/* Main Content */}
            {viewMode === 'map' ? (
                <div className="map-view-container">
                    <div 
                        ref={mapContainerRef}
                        className="hospital-map"
                        style={{ width: '100%', height: '600px', borderRadius: '12px' }}
                    />

                    {/* Selected Ambulance Details */}
                    {selectedAmbulance && (
                        <div className="ambulance-details-panel">
                            <button 
                                className="close-btn"
                                onClick={() => setSelectedAmbulance(null)}
                            >
                                ✕
                            </button>
                            <div className="details-content">
                                <h3>🚑 {selectedAmbulance.patientName}</h3>
                                <div className="detail-row">
                                    <span className="label">Status:</span>
                                    <span className="value status">{selectedAmbulance.status.replace(/_/g, ' ')}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">ETA:</span>
                                    <span className="value">{formatDuration(selectedAmbulance.etaToHospitalSeconds)}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Distance:</span>
                                    <span className="value">{formatDistance((selectedAmbulance.distanceToHospital || 0) * 1000)}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">Last Update:</span>
                                    <span className="value">{selectedAmbulance.lastUpdate?.toLocaleTimeString()}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* List View */
                <div className="list-view-container">
                    <div className="ambulance-list">
                        {filteredAmbulances.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">🚑</div>
                                <p>No ambulances to display</p>
                            </div>
                        ) : (
                            filteredAmbulances.map((ambulance, idx) => (
                                <div 
                                    key={ambulance.tripId}
                                    className={`ambulance-list-item ${selectedAmbulance?.tripId === ambulance.tripId ? 'selected' : ''}`}
                                    onClick={() => setSelectedAmbulance(ambulance)}
                                >
                                    {/* Status Indicator */}
                                    <div className={`status-indicator status-${ambulance.status.toLowerCase()}`} />

                                    {/* Ambulance Info */}
                                    <div className="ambulance-info">
                                        <div className="info-header">
                                            <span className="number">#{idx + 1}</span>
                                            <span className="patient-name">{ambulance.patientName}</span>
                                            <span className="status-badge">{ambulance.status}</span>
                                        </div>
                                        <div className="info-details">
                                            <span className="detail">📍 {formatDistance((ambulance.distanceToHospital || 0) * 1000)} away</span>
                                            <span className="detail">⏱️ {formatDuration(ambulance.etaToHospitalSeconds)}</span>
                                            <span className="detail">🕐 {ambulance.lastUpdate?.toLocaleTimeString()}</span>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="ambulance-actions">
                                        <button className="action-btn" title="Contact driver">☎️</button>
                                        <button className="action-btn" title="Send alert">📢</button>
                                        <button className="action-btn" title="View on map">🗺️</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Statistics Panel */}
            <div className="statistics-panel">
                <div className="stat-card">
                    <div className="stat-title">Total Incoming</div>
                    <div className="stat-value">{activeAmbulances.filter(a => ['ASSIGNED', 'ARRIVED'].includes(a.status)).length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-title">Average ETA</div>
                    <div className="stat-value">
                        {filteredAmbulances.length > 0
                            ? formatDuration(
                                filteredAmbulances.reduce((acc, a) => acc + (a.etaToHospitalSeconds || 0), 0) /
                                filteredAmbulances.length
                              )
                            : '--'}
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-title">Bed Availability</div>
                    <div className="stat-value">12 / 25</div>
                </div>
                <div className="stat-card">
                    <div className="stat-title">Emergency Dept Ready</div>
                    <div className="stat-value status-online">✓ Ready</div>
                </div>
            </div>
        </div>
    );
}

export default HospitalTrackingDashboard;
