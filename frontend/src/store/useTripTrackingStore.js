/**
 * useTripTrackingStore.js
 * Zustand store for managing real-time trip tracking state
 */

import { create } from 'zustand';

export const useTripTrackingStore = create((set, get) => ({
    // Trip state
    currentTrip: null,
    isTracking: false,
    error: null,
    lastUpdate: null,

    // Location state
    driverLocation: null,
    locationHistory: [],

    // Derived values
    etaMinutesToPatient: null,
    etaMinutesToHospital: null,
    distanceToPatient: null,
    distanceToHospital: null,

    // Actions
    setCurrentTrip: (trip) => {
        set({
            currentTrip: trip,
            locationHistory: trip?.locationHistory || [],
            lastUpdate: new Date(),
        });
    },

    /**
     * Update driver location and calculate ETA
     */
    updateDriverLocation: (location) => {
        const { currentTrip } = get();
        
        if (!location || !currentTrip) return;

        set({
            driverLocation: {
                lat: location.lat,
                lng: location.lng,
                timestamp: location.updatedAt,
            },
            distanceToPatient: location.distanceToPatient,
            distanceToHospital: location.distanceToHospital,
            etaMinutesToPatient: location.etaToPatientSeconds
                ? Math.ceil(location.etaToPatientSeconds / 60)
                : null,
            etaMinutesToHospital: location.etaToHospitalSeconds
                ? Math.ceil(location.etaToHospitalSeconds / 60)
                : null,
            lastUpdate: new Date(),
        });
    },

    /**
     * Add location to history
     */
    addLocationToHistory: (location) => {
        set((state) => ({
            locationHistory: [
                ...state.locationHistory,
                {
                    lat: location.lat,
                    lng: location.lng,
                    timestamp: location.timestamp || new Date(),
                },
            ].slice(-100), // Keep last 100 locations
        }));
    },

    /**
     * Set tracking status
     */
    setIsTracking: (tracking) => {
        set({ isTracking: tracking });
    },

    /**
     * Set error
     */
    setError: (error) => {
        set({ error });
    },

    /**
     * Clear error
     */
    clearError: () => {
        set({ error: null });
    },

    /**
     * Reset store
     */
    reset: () => {
        set({
            currentTrip: null,
            isTracking: false,
            error: null,
            driverLocation: null,
            locationHistory: [],
            etaMinutesToPatient: null,
            etaMinutesToHospital: null,
            distanceToPatient: null,
            distanceToHospital: null,
            lastUpdate: null,
        });
    },

    /**
     * Get trip status
     */
    getTripStatus: () => {
        const { currentTrip } = get();
        if (!currentTrip) return 'NO_TRIP';
        
        const statusMap = {
            'SEARCHING': 'Finding ambulance',
            'ASSIGNED': 'Ambulance en route',
            'ARRIVED': 'Ambulance arrived',
            'ON_BOARD': 'En route to hospital',
            'COMPLETED': 'Trip completed',
            'CANCELLED': 'Trip cancelled',
        };
        
        return statusMap[currentTrip.status] || currentTrip.status;
    },

    /**
     * Get formatted ETA string
     */
    getFormattedETA: (type = 'patient') => {
        const minutes = type === 'patient'
            ? get().etaMinutesToPatient
            : get().etaMinutesToHospital;
            
        if (minutes === null) return 'Calculating...';
        if (minutes < 1) return 'Arriving now';
        if (minutes === 1) return '1 minute';
        return `${minutes} minutes`;
    },

    /**
     * Get formatted distance string
     */
    getFormattedDistance: (type = 'patient') => {
        const distance = type === 'patient'
            ? get().distanceToPatient
            : get().distanceToHospital;
            
        if (distance === null) return '-- km';
        return `${distance.toFixed(1)} km`;
    },
}));

/**
 * Hook to get formatted trip display data
 */
export function useTripDisplayData() {
    const trip = useTripTrackingStore((state) => state.currentTrip);
    const getTripStatus = useTripTrackingStore((state) => state.getTripStatus);
    const getFormattedETA = useTripTrackingStore((state) => state.getFormattedETA);
    const getFormattedDistance = useTripTrackingStore((state) => state.getFormattedDistance);

    return {
        tripId: trip?.id,
        status: getTripStatus(),
        etaToPatient: getFormattedETA('patient'),
        etaToHospital: getFormattedETA('hospital'),
        distanceToPatient: getFormattedDistance('patient'),
        distanceToHospital: getFormattedDistance('hospital'),
    };
}
