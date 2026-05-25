# Real-Time Live Tracking Implementation Guide

## Overview

This comprehensive guide covers the complete real-time live tracking system integration for AmbuSOS using Google Maps API, Socket.IO for real-time updates, and smooth animations.

## Architecture

### System Components

```
Frontend (React)
├── Enhanced Map Components
│   ├── EnhancedLiveTrackerMap.jsx
│   ├── PatientTrackingDashboard.jsx
│   ├── DriverTrackingDashboard.jsx
│   └── HospitalTrackingDashboard.jsx
├── Hooks
│   ├── useGoogleMapsTracking.js
│   ├── useMarkerAnimation.js
│   ├── useDriverTracking.js
│   └── useGeolocation.js (enhanced with fallback)
├── Services
│   ├── googleMapsService.js (Directions, Polyline, etc.)
│   └── socketClient.js
└── Store
    └── useTripTrackingStore.js (Zustand)

Backend (Node.js/Express)
├── Socket Handlers
│   ├── location-tracking.js (enhanced)
│   └── register-socket-handlers.js
├── Models
│   ├── trip.js (enhanced with route tracking)
│   ├── driver-profile.js
│   └── user.js
├── Routes
│   └── trips.js (new tracking endpoints)
└── Services
    └── googleMapsService integration (via frontend)
```

## Setup Instructions

### 1. Environment Configuration

Create `.env` file in frontend directory:

```env
VITE_REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
VITE_API_BASE_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

#### Getting Google Maps API Key:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable APIs:
   - Maps JavaScript API
   - Directions API
   - Places API
4. Create API Key (Restrict to JavaScript origins and API restrictions)

### 2. Backend Setup

#### Install Dependencies:
```bash
npm install socket.io@4.8.3
```

#### Update Backend Configuration (src-mern/config.js):
```javascript
export const TRACKING_CONFIG = {
    LOCATION_UPDATE_INTERVAL: 10000, // 10 seconds
    ROUTE_RECALC_INTERVAL: 30000, // 30 seconds
    ETA_UPDATE_INTERVAL: 5000, // 5 seconds
    MAX_LOCATION_HISTORY: 100,
    SOCKET_ROOMS: {
        TRIP: 'trip_', // Prefix for trip rooms
        HOSPITAL: 'hospital_', // Prefix for hospital rooms
    },
};
```

#### Update Server (src-mern/server.js):
```javascript
import { registerLocationTracking } from './sockets/location-tracking.js';
import { TRACKING_CONFIG } from './config.js';

// Initialize Socket.IO
const io = require('socket.io')(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
});

// Register socket handlers
registerLocationTracking(io);
```

### 3. Frontend Setup

#### Install Dependencies:
```bash
npm install @react-google-maps/api@2.20.8
npm install socket.io-client@4.8.3
npm install zustand@5.0.11
```

#### Update API Client (src/services/googleMapsService.js):
```javascript
// Already created - just ensure API key is loaded
import { GOOGLE_MAPS_API_KEY } from '../lib/googleMapsConfig';

// Load Google Maps script in your main App.jsx
useEffect(() => {
    if (!window.google) {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry,places,directions&language=en`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    }
}, []);
```

## Usage Guide

### For Patients

#### 1. Import Patient Dashboard:
```jsx
import PatientTrackingDashboard from '../components/PatientTrackingDashboard';

export function PatientPage() {
    const { tripId } = useParams();
    
    return (
        <div>
            <PatientTrackingDashboard tripId={tripId} />
        </div>
    );
}
```

#### 2. Features:
- Real-time ambulance location on Google Map
- Live ETA countdown
- Distance display
- Driver information and contact
- Emergency cancel button
- Live indicator showing tracking is active
- Status flow visualization

### For Drivers

#### 1. Import Driver Dashboard:
```jsx
import DriverTrackingDashboard from '../components/DriverTrackingDashboard';

export function DriverPage() {
    const { tripId } = useParams();
    const { user } = useAuthStore();
    
    return (
        <div>
            <DriverTrackingDashboard 
                tripId={tripId}
                driverId={user?.id}
                onStatusChange={handleStatusChange}
            />
        </div>
    );
}
```

#### 2. Features:
- Real-time GPS tracking
- Route navigation with directions
- Patient location on map
- Speed monitoring with warnings
- ETA and distance calculations
- Status update buttons (Arrived, Pickup, Complete)
- Voice guidance toggle
- Performance metrics

### For Hospitals

#### 1. Import Hospital Dashboard:
```jsx
import HospitalTrackingDashboard from '../components/HospitalTrackingDashboard';

export function HospitalPage() {
    const { hospitalId } = useParams();
    
    return (
        <div>
            <HospitalTrackingDashboard hospitalId={hospitalId} />
        </div>
    );
}
```

#### 2. Features:
- Real-time map of all incoming ambulances
- List view with filtering
- Individual ambulance details
- Average ETA calculation
- Bed availability display
- Emergency department readiness status
- Color-coded ambulance status

## Real-Time Data Flow

### Location Update Flow:
```
Driver GPS
    ↓
useDriverTracking Hook
    ↓
socket.emit('updateDriverLocation')
    ↓
Backend: location-tracking.js
    ↓
Calculate Distance & ETA
    ↓
Update Trip Model
    ↓
socket.emit('driverLocationUpdated')
    ↓
Patient/Hospital Dashboard (Real-time Update)
    ↓
useGoogleMapsTracking Hook
    ↓
Animate Marker Smoothly on Map
```

### Socket Events

#### Client → Server:
```javascript
// Driver sends location
socket.emit('updateDriverLocation', {
    tripId: '123',
    lat: 28.6139,
    lng: 77.2090,
    driverId: 'driver-123',
    accuracy: 5,
    timestamp: '2024-05-19T10:30:00Z'
});

// Start tracking
socket.emit('startTripTracking', { tripId: '123' });

// Stop tracking
socket.emit('stopTripTracking', { tripId: '123' });

// Hospital dashboard
socket.emit('joinHospitalDashboard', { hospitalId: 'hospital-123' });
```

#### Server → Client:
```javascript
// Driver location update (sent to trip room)
socket.emit('driverLocationUpdated', {
    tripId: '123',
    lat: 28.6139,
    lng: 77.2090,
    distanceToPatient: 2.5,
    etaToPatientSeconds: 900,
    updatedAt: '2024-05-19T10:30:00Z'
});

// Active ambulance update (sent to hospital room)
socket.emit('activeAmbulanceUpdated', {
    tripId: '123',
    driverId: 'driver-123',
    lat: 28.6139,
    lng: 77.2090,
    status: 'ASSIGNED',
    distanceToHospital: 5.2,
    etaToHospitalSeconds: 1560
});
```

## Marker Animation

The system includes smooth marker animations for realistic movement:

```javascript
// Automatic smooth animation between location updates
useMarkerAnimation(markerRef, currentLocation, 2000); // 2-second animation

// Bounce animation on arrival
useMarkerBounce(markerRef, trigger);

// Pulsing effect for active markers
useMarkerPulse(markerRef, isActive);

// Rotation based on bearing
useMarkerRotation(markerRef, bearing);
```

## Route Polyline Management

### Backend Route Storage:
```javascript
// Store route polyline in trip
POST /api/trips/:tripId/update-route
{
    "polyline": "encoded_polyline_string",
    "distance": 5200,  // in meters
    "duration": 900,   // in seconds
    "waypoints": [
        { "lat": 28.6139, "lng": 77.2090, "order": 0 },
        { "lat": 28.6200, "lng": 77.2200, "order": 1 }
    ]
}
```

### Frontend Route Display:
```javascript
// Automatically displays encoded polyline on map
const { polyline } = routeData;
mapTracking.addPolyline(`route_${tripId}`, polyline, {
    color: '#4285F4',
    weight: 4,
    opacity: 0.7,
});
```

## ETA Calculations

### Traffic-Adjusted ETA:
```javascript
// Simple calculation (baseline)
ETA = distance (km) / average_speed (40 km/h) = seconds

// Traffic-aware calculation
if (peak_hours) {
    average_speed = 25 km/h;
} else if (night_hours) {
    average_speed = 50 km/h;
}
```

### Backend ETA Calculation:
```javascript
// Recalculate ETA based on current location
POST /api/trips/:tripId/estimate-eta
{
    "currentLat": 28.6139,
    "currentLng": 77.2090
}

Response:
{
    "etaToPatientSeconds": 600,
    "etaToHospitalSeconds": 1200,
    "distanceToPatient": 4.2,
    "distanceToHospital": 8.5
}
```

## Geolocation Fallback

The system automatically falls back to IP-based location if GPS is unavailable:

```javascript
// useGeolocation hook automatically:
1. Attempts GPS location first
2. If GPS permission denied → asks user to enable
3. If GPS times out → uses IP-based location from ipapi.co
4. Shows "usesFallback" flag to indicate IP-based location
5. Lower accuracy (5km) but ensures tracking continues
```

## Handling Offline & Reconnection

### Socket Reconnection:
```javascript
socket.on('connect', () => {
    console.log('Connected to tracking server');
    socket.emit('startTripTracking', { tripId });
});

socket.on('disconnect', () => {
    console.log('Lost connection - buffering updates');
    // Continue buffering locations locally
    // Sync when reconnected
});

socket.io.on('reconnect', () => {
    console.log('Reconnected - syncing data');
    // Resync all updates when reconnected
});
```

### Location Update Buffering:
```javascript
// When offline, buffer locations in localStorage
const bufferLocationUpdate = (location) => {
    const buffered = JSON.parse(localStorage.getItem('bufferedUpdates') || '[]');
    buffered.push(location);
    localStorage.setItem('bufferedUpdates', JSON.stringify(buffered));
};

// On reconnect, send buffered updates
if (socket.connected) {
    const buffered = JSON.parse(localStorage.getItem('bufferedUpdates') || '[]');
    buffered.forEach(loc => {
        socket.emit('updateDriverLocation', loc);
    });
    localStorage.removeItem('bufferedUpdates');
}
```

## Performance Optimization

### Location Update Throttling:
```javascript
// Update every 10 seconds (prevents excessive bandwidth)
updateIntervalMs: 10000

// Throttle within the hook
if (now - lastUpdateRef.current < updateIntervalMs) {
    return; // Skip this update
}
```

### Map Rendering Optimization:
```javascript
// Lazy load map components
const EnhancedLiveTrackerMap = lazy(() => import('./components/ui/EnhancedLiveTrackerMap'));

// Memoize dashboard components
const PatientDashboard = memo(PatientTrackingDashboard);
const DriverDashboard = memo(DriverTrackingDashboard);
```

### Socket Event Optimization:
```javascript
// Use Socket.IO rooms to reduce broadcasts
socket.to(tripId).emit('driverLocationUpdated', data); // Only to trip watchers
socket.to(`hospital_${hospitalId}`).emit('activeAmbulanceUpdated', data); // Only to hospital staff
```

## Testing

### Simulate Locations for Testing:
```javascript
import { useSendLocationUpdate } from '../hooks/useDriverTracking';

// In test component
const sendTestLocation = useSendLocationUpdate(tripId, driverId);

// Simulate movement between two points
const simulateTrip = () => {
    const positions = generateRoute(startLat, startLng, endLat, endLng, 10);
    positions.forEach((pos, idx) => {
        setTimeout(() => {
            sendTestLocation(pos.lat, pos.lng);
        }, idx * 5000); // 5 seconds between updates
    });
};
```

### Monitor Socket Events:
```javascript
// In browser console
socket.onAny((eventName, ...args) => {
    console.log(`Socket Event: ${eventName}`, args);
});
```

## Troubleshooting

### Map not showing:
- Verify Google Maps API key is correct
- Check API has Maps JavaScript API enabled
- Verify map container has height defined
- Check browser console for errors

### Location not updating:
- Verify GPS permission is granted
- Check device location services are enabled
- Ensure Socket.IO connection is active
- Check network bandwidth
- Try fallback (IP-based location)

### Animations lagging:
- Reduce animation duration
- Check marker update frequency
- Monitor browser performance (DevTools)
- Reduce number of visible markers
- Disable voice guidance if lag persists

### High CPU Usage:
- Increase location update interval
- Reduce animation frame rate
- Limit number of markers rendered
- Use requestAnimationFrame batching

## Security Considerations

1. **Location Privacy**: Store locations only while trip is active
2. **Socket.IO Auth**: Verify user identity before allowing tracking
3. **Rate Limiting**: Limit location updates per user per minute
4. **Data Encryption**: Use HTTPS/WSS for all communications
5. **Access Control**: Only patients/drivers/hospitals can view their own data

## Future Enhancements

1. **Machine Learning ETAs**: Use historical data for better predictions
2. **Traffic Integration**: Real-time traffic from Google Maps API
3. **Route Optimization**: Multi-stop route calculation
4. **Predictive Analytics**: Predict patient location based on patterns
5. **Augmented Reality**: AR navigation for drivers
6. **Voice Commands**: Voice-activated status updates
7. **Live Chat**: Direct messaging between driver and patient/hospital
8. **Emergency Protocols**: Auto-alert when ETA changes significantly

## Monitoring & Analytics

### Track Metrics:
- Active concurrent tracking sessions
- Location update frequency
- Average ETA accuracy
- Socket connection reliability
- Geographic distribution of ambulances

### Database Queries:
```javascript
// Get trip duration analytics
GET /api/analytics/trip-durations?start_date=&end_date=

// Get location accuracy metrics
GET /api/analytics/location-accuracy

// Get active ambulances count
GET /api/analytics/active-ambulances-count

// Get average ETA accuracy
GET /api/analytics/eta-accuracy
```

## References

- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript)
- [Google Directions API](https://developers.google.com/maps/documentation/directions)
- [Socket.IO Documentation](https://socket.io/docs/)
- [React Documentation](https://react.dev)
- [Zustand Store Documentation](https://github.com/pmndrs/zustand)

---

**Last Updated**: May 19, 2024
**Version**: 1.0.0
**Author**: AmbuSOS Development Team
