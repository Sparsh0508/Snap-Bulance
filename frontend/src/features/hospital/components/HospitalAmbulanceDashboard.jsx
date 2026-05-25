/**
 * HospitalAmbulanceDashboard.jsx
 * Real-time dashboard for hospital staff to monitor all ambulances en route
 * Shows live locations, ETAs, distances, and assigned patients
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, MapPin, Clock, User, Navigation } from 'lucide-react';
import AmbulanceTrackerMap from '../../ui/AmbulanceTrackerMap';
import Button from '../../ui/Button';
import PageState from '../../ui/PageState';
import { useHospitalDashboardSocket } from '../../../hooks/useTripSocket';
import { appApi } from '../../../services/appApi';

/**
 * Hospital Ambulance Dashboard Component
 */
export default function HospitalAmbulanceDashboard({ hospitalId }) {
    const [ambulances, setAmbulances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedAmbulance, setSelectedAmbulance] = useState(null);

    /**
     * Fetch initial active ambulances
     */
    useEffect(() => {
        const fetchAmbulances = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await appApi.get(
                    `/trips/hospital/${hospitalId}/active-ambulances`
                );
                setAmbulances(response.data.ambulances || []);
            } catch (err) {
                console.error('Error fetching ambulances:', err);
                setError(
                    err.response?.data?.message ||
                    err.message ||
                    'Failed to load ambulances'
                );
            } finally {
                setLoading(false);
            }
        };

        if (hospitalId) {
            fetchAmbulances();
        }
    }, [hospitalId]);

    /**
     * Handle real-time ambulance updates via Socket.IO
     */
    const handleAmbulanceUpdate = useCallback((data) => {
        console.log('Ambulance updated:', data);

        setAmbulances((prev) => {
            const existing = prev.find((a) => a.tripId === data.tripId);

            if (existing) {
                // Update existing ambulance
                return prev.map((a) =>
                    a.tripId === data.tripId
                        ? {
                            ...a,
                            driverLocation: data.driverLocation,
                            distanceToHospital: data.distanceToHospital,
                            etaToHospitalSeconds: data.etaToHospitalSeconds,
                            status: data.status,
                            updatedAt: data.updatedAt,
                        }
                        : a
                );
            }

            // Add new ambulance
            return [...prev, data];
        });
    }, []);

    // Setup socket listener
    useHospitalDashboardSocket(hospitalId, {
        onAmbulanceUpdate: handleAmbulanceUpdate,
    });

    /**
     * Format ETA from seconds to readable string
     */
    const formatETA = (seconds) => {
        if (!seconds) return 'Calculating...';
        const minutes = Math.ceil(seconds / 60);
        if (minutes < 1) return 'Arriving now';
        return `${minutes} min`;
    };

    /**
     * Get status color
     */
    const getStatusColor = (status) => {
        const colors = {
            'ASSIGNED': 'bg-blue-50 border-blue-200 text-blue-900',
            'ARRIVED': 'bg-green-50 border-green-200 text-green-900',
            'ON_BOARD': 'bg-orange-50 border-orange-200 text-orange-900',
        };
        return colors[status] || 'bg-gray-50 border-gray-200 text-gray-900';
    };

    /**
     * Get badge color
     */
    const getBadgeColor = (status) => {
        const colors = {
            'ASSIGNED': 'bg-blue-100 text-blue-800',
            'ARRIVED': 'bg-green-100 text-green-800',
            'ON_BOARD': 'bg-orange-100 text-orange-800',
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    if (loading && ambulances.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-700">Loading ambulances...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <PageState
                icon={<AlertCircle className="h-16 w-16" />}
                title="Unable to Load Dashboard"
                message={error}
            />
        );
    }

    const mapLocations = [];
    const mapDestinations = [];

    ambulances.forEach((amb) => {
        if (amb.driverLocation?.lat && amb.driverLocation?.lng) {
            mapLocations.push({
                lat: amb.driverLocation.lat,
                lng: amb.driverLocation.lng,
            });
        }
        if (amb.destinationLocation?.lat && amb.destinationLocation?.lng) {
            mapDestinations.push({
                lat: amb.destinationLocation.lat,
                lng: amb.destinationLocation.lng,
            });
        }
    });

    return (
        <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-slate-200 px-4 py-3 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto">
                    <h1 className="text-2xl font-bold text-slate-900">
                        Ambulance Dashboard
                    </h1>
                    <p className="text-sm text-slate-600 mt-1">
                        {ambulances.length} active ambulance{ambulances.length !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
                {ambulances.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <PageState
                            icon={<MapPin className="h-16 w-16 text-gray-400" />}
                            title="No Active Ambulances"
                            message="No ambulances are currently en route to this hospital."
                        />
                    </div>
                ) : (
                    <div className="h-full grid grid-cols-1 lg:grid-cols-4 gap-4 p-4">
                        {/* Map - Takes 3 columns */}
                        <div className="lg:col-span-3 h-full">
                            <div className="h-full rounded-xl overflow-hidden shadow-lg bg-white">
                                <AmbulanceTrackerMap
                                    driverLocation={
                                        selectedAmbulance?.driverLocation
                                            ? {
                                                lat: selectedAmbulance.driverLocation.lat,
                                                lng: selectedAmbulance.driverLocation.lng,
                                            }
                                            : ambulances[0]?.driverLocation
                                            ? {
                                                lat: ambulances[0].driverLocation.lat,
                                                lng: ambulances[0].driverLocation.lng,
                                            }
                                            : null
                                    }
                                    hospitalLocation={
                                        selectedAmbulance?.destinationLocation
                                            ? {
                                                lat: selectedAmbulance.destinationLocation.lat,
                                                lng: selectedAmbulance.destinationLocation.lng,
                                            }
                                            : null
                                    }
                                    tripStatus={selectedAmbulance?.status || ambulances[0]?.status}
                                    etaMinutes={
                                        selectedAmbulance?.etaToHospitalSeconds
                                            ? Math.ceil(
                                                selectedAmbulance.etaToHospitalSeconds / 60
                                            )
                                            : null
                                    }
                                    distanceKm={selectedAmbulance?.distanceToHospital}
                                    showRoute={true}
                                />
                            </div>
                        </div>

                        {/* Ambulances List */}
                        <div className="h-full overflow-y-auto space-y-3">
                            <div className="sticky top-0 bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <h2 className="font-semibold text-slate-900 text-sm">
                                    Active Ambulances
                                </h2>
                            </div>

                            {ambulances.map((ambulance) => (
                                <div
                                    key={ambulance.tripId}
                                    onClick={() => setSelectedAmbulance(ambulance)}
                                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all transform hover:scale-105 ${
                                        selectedAmbulance?.tripId === ambulance.tripId
                                            ? 'border-blue-500 bg-blue-50 shadow-md'
                                            : `border-slate-200 ${getStatusColor(ambulance.status)}`
                                    }`}
                                >
                                    {/* Status Badge */}
                                    <div className="flex items-start justify-between mb-2">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getBadgeColor(ambulance.status)}`}>
                                            {ambulance.status === 'ASSIGNED'
                                                ? 'En Route'
                                                : ambulance.status === 'ARRIVED'
                                                ? 'Arrived'
                                                : 'On Board'}
                                        </span>
                                        <span className="text-xs text-slate-600">
                                            {new Date(ambulance.updatedAt).toLocaleTimeString()}
                                        </span>
                                    </div>

                                    {/* Patient Info */}
                                    {ambulance.patient && (
                                        <div className="mb-2 pb-2 border-b border-slate-200">
                                            <p className="text-xs text-slate-600">Patient</p>
                                            <p className="text-sm font-medium text-slate-900 truncate">
                                                {ambulance.patient.name}
                                            </p>
                                            <p className="text-xs text-slate-600">
                                                {ambulance.patient.phone}
                                            </p>
                                        </div>
                                    )}

                                    {/* ETA & Distance */}
                                    <div className="space-y-1 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-600 flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                ETA
                                            </span>
                                            <span className="font-semibold text-blue-600">
                                                {formatETA(ambulance.etaToHospitalSeconds)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-600 flex items-center gap-1">
                                                <Navigation className="h-3 w-3" />
                                                Distance
                                            </span>
                                            <span className="font-semibold text-orange-600">
                                                {ambulance.distanceToHospital
                                                    ? `${ambulance.distanceToHospital.toFixed(1)} km`
                                                    : '--'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Driver Info */}
                                    {ambulance.driver && (
                                        <div className="mt-2 pt-2 border-t border-slate-200">
                                            <p className="text-xs text-slate-600">Driver</p>
                                            <p className="text-xs font-medium text-slate-900 truncate">
                                                {ambulance.driver.name}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
