import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
import { tripStatuses } from '../types.js';
const tripSchema = new Schema({
    _id: { type: String, default: () => randomUUID() },
    status: { type: String, enum: tripStatuses, default: 'SEARCHING' },
    pickupAddress: { type: String, required: true },
    pickupLat: { type: Number, required: true },
    pickupLng: { type: Number, required: true },
    destAddress: { type: String, default: null },
    destLat: { type: Number, default: null },
    destLng: { type: Number, default: null },
    passengerId: { type: String, ref: 'User', required: true },
    driverId: { type: String, ref: 'DriverProfile', default: null },
    hospitalId: { type: String, ref: 'Hospital', default: null },
    responderIds: { type: [String], default: [] },
    requestedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    pickedUpAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    routePolyline: { type: String, default: null },
    distanceKm: { type: Number, default: null },
    earningsAmount: { type: Number, default: null },
    
    // Real-time tracking fields
    currentDriverLat: { type: Number, default: null },
    currentDriverLng: { type: Number, default: null },
    currentDistanceToPatient: { type: Number, default: null },
    currentDistanceToHospital: { type: Number, default: null },
    estimatedArrivalToPatientTime: { type: Number, default: null }, // in seconds
    estimatedArrivalToHospitalTime: { type: Number, default: null }, // in seconds
    lastLocationUpdate: { type: Date, default: null },
    
    // Location history for analytics
    locationHistory: [{
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now },
    }],
    
    // Route information
    routeInfo: {
        distance: { type: Number, default: null }, // in meters
        duration: { type: Number, default: null }, // in seconds
        polyline: { type: String, default: null }, // Encoded polyline
        waypoints: [{ // Array of route waypoints
            lat: { type: Number },
            lng: { type: Number },
            order: { type: Number },
        }],
        updatedAt: { type: Date, default: null },
    },
    
    // Trip status timeline with timestamps
    statusTimeline: [{
        status: { type: String, enum: tripStatuses },
        timestamp: { type: Date, default: Date.now },
        location: {
            lat: { type: Number },
            lng: { type: Number },
        },
        notes: { type: String },
    }],
    
    // Tracking metrics
    trackingMetrics: {
        averageSpeed: { type: Number, default: null }, // km/h
        maxSpeed: { type: Number, default: null }, // km/h
        totalDistance: { type: Number, default: null }, // km
        actualDuration: { type: Number, default: null }, // seconds
        deviationFromEstimate: { type: Number, default: null }, // seconds
    },
}, {
    versionKey: false,
    timestamps: true, // Adds createdAt and updatedAt
});

// Create indexes for better query performance
tripSchema.index({ status: 1 });
tripSchema.index({ driverId: 1, status: 1 });
tripSchema.index({ hospitalId: 1, status: 1 });
tripSchema.index({ passengerId: 1 });
tripSchema.index({ 'statusTimeline.timestamp': -1 });

export const TripModel = models.Trip || model('Trip', tripSchema);
