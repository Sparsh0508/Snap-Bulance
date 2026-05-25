# AmbuSOS Real-Time Ambulance Tracking System

## Overview

The Real-Time Ambulance Tracking System is a comprehensive solution that enables patients, drivers, hospitals, and admins to track ambulance movement live on a map. The system uses Socket.IO for instant updates, React + Leaflet for interactive maps, and MongoDB for persistent storage.

### Key Features

✅ **Real-Time GPS Tracking** - Continuous location updates from ambulances
✅ **Live Map Display** - Interactive map showing driver, patient, and hospital locations
✅ **ETA Calculation** - Automatic estimated time calculation based on distance and speed
✅ **Location History** - Track complete ambulance route for trip analytics
✅ **Hospital Dashboard** - View all active ambulances en route
✅ **Auto-Reconnect** - Automatic socket reconnection on network issues
✅ **Battery Optimization** - Configurable update intervals to save battery on mobile devices
✅ **Responsive UI** - Works seamlessly on desktop, tablet, and mobile
✅ **Secure APIs** - JWT authentication and authorization
✅ **Trip Analytics** - Complete trip history with route data

---

## Architecture

### Backend Services

#### 1. **Trip Model** (`backend/src-mern/models/trip.js`)

Enhanced with real-time tracking fields:

```javascript
// Real-time tracking fields
currentDriverLat: Number
currentDriverLng: Number
currentDistanceToPatient: Number
currentDistanceToHospital: Number
estimatedArrivalToPatientTime: Number (seconds)
estimatedArrivalToHospitalTime: Number (seconds)
lastLocationUpdate: Date
locationHistory: [{lat, lng, timestamp}]
```

#### 2. **Location Tracking Socket Handler** (`backend/src-mern/sockets/location-tracking.js`)

Manages real-time location updates with the following events:

**Events Emitted:**
- `updateDriverLocation` - Receive driver location update
- `startTripTracking` - Join trip tracking room
- `stopTripTracking` - Leave trip tracking room
- `joinHospitalDashboard` - Join hospital ambulance dashboard
- `leaveHospitalDashboard` - Leave hospital dashboard

**Events Received:**
- `driverLocationUpdated` - Broadcast to trip room with ETA/distance
- `activeAmbulanceUpdated` - Broadcast to hospital room with ambulance status
- `trackingStarted` - Confirm tracking started
- `trackingError` - Handle tracking errors

#### 3. **Trip API Endpoints** (`backend/src-mern/routes/trips.js`)

```
GET  /trips/:tripId/live                      - Get live tracking data
GET  /trips/patient/active                    - Get active trip for patient
GET  /trips/driver/active                     - Get active trips for driver
GET  /trips/hospital/:hospitalId/active-ambulances - Get all ambulances for hospital
GET  /trips/nearby-hospitals                  - Get nearby hospitals
POST /trips/:tripId/start-tracking            - Initialize tracking
```

---

### Frontend Services

#### 1. **GPS Geolocation Hook** (`frontend/src/lib/useGeolocation.js`)

Continuous GPS tracking with battery optimization:

```javascript
const { location, error, isTracking, startTracking, stopTracking } = useGeolocation(
  onLocationUpdate,
  enabled = true,
  updateIntervalMs = 5000 // Minimum interval between updates
);
```

**Returns:**
- `location` - Current GPS coordinates with accuracy
- `error` - Geolocation errors
- `isTracking` - Tracking status
- `startTracking()` - Start tracking
- `stopTracking()` - Stop tracking

#### 2. **Trip Tracking Store** (`frontend/src/store/useTripTrackingStore.js`)

Zustand store for managing real-time trip state:

```javascript
// State
currentTrip
isTracking
driverLocation
locationHistory
etaMinutesToPatient
distanceToPatient

// Methods
setCurrentTrip(trip)
updateDriverLocation(location)
addLocationToHistory(location)
getTripStatus()
getFormattedETA(type)
getFormattedDistance(type)
reset()
```

#### 3. **Trip Socket Manager** (`frontend/src/hooks/useTripSocket.js`)

Manages Socket.IO events for trip tracking:

```javascript
// For patient/trip tracking
const { isConnected, sendLocationUpdate, stopTracking } = useTripSocket(tripId, {
  onLocationUpdate: (data) => {},
  onStatusChange: (data) => {},
  onError: (error) => {},
});

// For hospital dashboard
const { isConnected } = useHospitalDashboardSocket(hospitalId, {
  onAmbulanceUpdate: (data) => {},
});
```

#### 4. **Driver Tracking Hook** (`frontend/src/hooks/useDriverTracking.js`)

Automatically sends driver GPS location to backend:

```javascript
const { location, error, isTracking, startTracking, stopTracking } = useDriverTracking(
  tripId,
  {
    driverId: driverId,
    updateIntervalMs: 10000, // Send every 10 seconds
    enableHighAccuracy: false, // Save battery
  }
);
```

#### 5. **Ambulance Tracker Map** (`frontend/src/components/ui/AmbulanceTrackerMap.jsx`)

Interactive Leaflet map component showing:
- Ambulance location with animated marker and pulse effect
- Patient pickup location
- Hospital destination
- Route polyline
- Location accuracy circle
- Real-time marker updates

---

## Usage Guide

### For Patients - Track Live Ambulance

#### 1. View Live Tracking Page

When a patient's trip is assigned to a driver, they're redirected to the live tracking page:

```javascript
// Route
/patient/trip/:tripId/live

// Shows:
- Real-time ambulance location on map
- Driver details (name, phone, vehicle info)
- ETA to patient location
- Distance to patient
- Trip status updates
- Call and chat options
```

#### 2. Real-Time Updates

The page automatically receives:
- Driver location updates every 5-10 seconds
- ETA recalculated based on current distance
- Trip status changes (Assigned → Arrived → On Board → Completed)
- Connection status indicator

### For Drivers - Send GPS Tracking

#### 1. Enable GPS Tracking

When a driver accepts a trip:

```javascript
import { useDriverTracking } from '../hooks/useDriverTracking';

function DriverAcceptTripScreen() {
  const { location, error, isTracking } = useDriverTracking(tripId, {
    driverId: currentDriver.id,
    updateIntervalMs: 10000, // Update every 10 seconds
  });

  if (error) {
    return <div>Enable location permissions to start tracking</div>;
  }

  return (
    <div>
      {isTracking && <div>✓ Tracking active</div>}
      <span>Latitude: {location?.latitude}</span>
      <span>Longitude: {location?.longitude}</span>
    </div>
  );
}
```

#### 2. Automatic Location Sending

The hook automatically:
1. Gets GPS location from device
2. Throttles updates to specified interval (saves battery)
3. Sends location to backend via Socket.IO
4. Maintains trip tracking room

#### 3. Battery Optimization

Configure for low battery usage:
```javascript
useDriverTracking(tripId, {
  enableHighAccuracy: false,      // Reduced accuracy saves battery
  updateIntervalMs: 15000,         // Update every 15 seconds
});
```

### For Hospitals - Monitor All Ambulances

#### 1. Hospital Dashboard

```javascript
import HospitalAmbulanceDashboard from '../features/hospital/components/HospitalAmbulanceDashboard';

function HospitalDashboard() {
  return <HospitalAmbulanceDashboard hospitalId={hospitalId} />;
}
```

#### 2. Dashboard Features

- List of all active ambulances en route to hospital
- Real-time map showing selected ambulance
- ETA countdown timer
- Distance tracking
- Patient information
- Driver details
- Click to select specific ambulance for focused view

#### 3. Real-Time Updates

Hospital staff receives automatic updates for:
- New ambulances en route
- Location changes (updates every time driver location changes)
- ETA updates
- Status changes (Arrived, On Board, etc.)

---

## API Reference

### Trip Tracking Endpoints

#### GET /trips/:tripId/live
Get live tracking data for a trip.

**Response:**
```json
{
  "tripId": "uuid",
  "status": "ASSIGNED",
  "driverLocation": {
    "lat": 28.6139,
    "lng": 77.2090,
    "updatedAt": "2026-05-19T10:30:00Z"
  },
  "pickupLocation": {
    "lat": 28.6100,
    "lng": 77.2000,
    "address": "123 Main St"
  },
  "destinationLocation": {
    "lat": 28.6200,
    "lng": 77.2200,
    "address": "Hospital Name"
  },
  "tracking": {
    "distanceToPatient": 2.5,
    "distanceToHospital": 8.0,
    "etaToPatientSeconds": 420,
    "etaToHospitalSeconds": 1200
  },
  "driver": {
    "id": "driver-id",
    "name": "John Doe",
    "phone": "+91-9876543210",
    "vehicleType": "Ambulance",
    "vehicleNumber": "DL-01-AB-1234"
  }
}
```

#### GET /trips/patient/active
Get the active trip for the logged-in patient.

**Response:**
```json
{
  "activeTrip": {
    "id": "trip-id",
    "status": "ASSIGNED",
    "driverLocation": { "lat": 28.6139, "lng": 77.2090 },
    "pickupLocation": { "lat": 28.6100, "lng": 77.2000 },
    "tracking": {
      "distanceToPatient": 2.5,
      "etaToPatientSeconds": 420
    },
    "driver": { "name": "John Doe", "phone": "..." }
  }
}
```

#### GET /trips/driver/active
Get all active trips for the logged-in driver.

**Response:**
```json
{
  "activeTrips": [
    {
      "_id": "trip-id",
      "status": "ASSIGNED",
      "currentDistanceToPatient": 2.5,
      "estimatedArrivalToPatientTime": 420
    }
  ]
}
```

#### GET /trips/hospital/:hospitalId/active-ambulances
Get all ambulances for hospital dashboard.

**Response:**
```json
{
  "ambulances": [
    {
      "tripId": "trip-id",
      "status": "ASSIGNED",
      "driverLocation": { "lat": 28.6139, "lng": 77.2090 },
      "destinationLocation": { "lat": 28.6200, "lng": 77.2200 },
      "distanceToHospital": 8.0,
      "etaToHospitalSeconds": 1200,
      "driver": { "id": "...", "name": "John Doe" },
      "patient": { "name": "Jane Doe", "phone": "..." }
    }
  ]
}
```

#### GET /trips/nearby-hospitals
Get hospitals near patient location.

**Query Parameters:**
- `lat` (required) - Latitude
- `lng` (required) - Longitude
- `radiusKm` (optional, default: 50) - Search radius in kilometers

**Response:**
```json
{
  "nearby": [
    {
      "id": "hospital-id",
      "name": "Hospital Name",
      "address": "123 Medical St",
      "lat": 28.6200,
      "lng": 77.2200,
      "distance": 8.5
    }
  ]
}
```

### Socket Events

#### Client → Server

**updateDriverLocation**
```javascript
socket.emit('updateDriverLocation', {
  tripId: 'trip-id',
  lat: 28.6139,
  lng: 77.2090,
  driverId: 'driver-id',
  timestamp: '2026-05-19T10:30:00Z'
});
```

**startTripTracking**
```javascript
socket.emit('startTripTracking', { tripId: 'trip-id' });
```

**stopTripTracking**
```javascript
socket.emit('stopTripTracking', { tripId: 'trip-id' });
```

**joinHospitalDashboard**
```javascript
socket.emit('joinHospitalDashboard', { hospitalId: 'hospital-id' });
```

#### Server → Client

**driverLocationUpdated**
```javascript
socket.on('driverLocationUpdated', (data) => {
  // {
  //   tripId,
  //   lat,
  //   lng,
  //   distanceToPatient,
  //   distanceToHospital,
  //   etaToPatientSeconds,
  //   etaToHospitalSeconds,
  //   updatedAt
  // }
});
```

**activeAmbulanceUpdated** (for hospital dashboard)
```javascript
socket.on('activeAmbulanceUpdated', (data) => {
  // {
  //   tripId,
  //   driverId,
  //   lat,
  //   lng,
  //   status,
  //   distanceToHospital,
  //   etaToHospitalSeconds,
  //   patientName,
  //   updatedAt
  // }
});
```

---

## Performance Optimization

### Battery Usage Optimization

```javascript
// Driver GPS tracking with battery optimization
const { location } = useDriverTracking(tripId, {
  enableHighAccuracy: false,      // ← Disable high accuracy
  updateIntervalMs: 15000,         // ← Increase interval (15s)
});

// Expected battery impact:
// - 10s interval: ~20-30% battery per hour
// - 15s interval: ~15-20% battery per hour
// - 30s interval: ~10-15% battery per hour
```

### Data Optimization

1. **Location History Limit**: Stores last 100 locations only
2. **Throttled Socket Events**: Minimum interval between updates
3. **Selective Broadcasting**: Hospital updates only for relevant ambulances
4. **Compressed Payloads**: Minimal data in each update

### Network Optimization

- Auto-reconnect with exponential backoff
- Queue location updates if offline
- Resume tracking automatically on reconnect
- Efficient socket rooms (trip-specific, hospital-specific)

---

## Error Handling

### GPS Errors

```javascript
const { location, error } = useGeolocation(...);

if (error?.code === 'PERMISSION_DENIED') {
  // User denied location permission
}
if (error?.code === 'TIMEOUT') {
  // GPS request timed out
}
if (error?.code === 'POSITION_UNAVAILABLE') {
  // GPS unavailable
}
```

### Socket Errors

```javascript
socket.on('locationUpdateError', (data) => {
  console.error(data.message);
});

socket.on('trackingError', (data) => {
  console.error(data.message);
});
```

---

## Integration Examples

### Example 1: Driver Accepting Trip

```javascript
// driver/pages/AcceptTripPage.jsx
import { useDriverTracking } from '../hooks/useDriverTracking';

export default function AcceptTripPage() {
  const [trip, setTrip] = useState(null);
  const { location, error, isTracking } = useDriverTracking(
    trip?.id,
    { driverId: currentUser.id }
  );

  const handleAcceptTrip = async () => {
    await tripApi.acceptTrip(tripId);
    // Tracking automatically starts
  };

  return (
    <div>
      <h1>Trip Assigned</h1>
      {error && <Alert>{error.message}</Alert>}
      {isTracking && <span>✓ GPS Tracking Active</span>}
      <Button onClick={handleAcceptTrip}>Accept Trip</Button>
    </div>
  );
}
```

### Example 2: Patient Viewing Live Tracking

```javascript
// patient/pages/LiveTripTrackingPage.jsx
import { useTripSocket } from '../hooks/useTripSocket';
import AmbulanceTrackerMap from '../components/ui/AmbulanceTrackerMap';

export default function LiveTripTrackingPage() {
  const { driverLocation, etaMinutes } = useTripTrackingStore();
  
  useTripSocket(tripId, {
    onLocationUpdate: (data) => {
      // Update store with latest location
    }
  });

  return (
    <div>
      <AmbulanceTrackerMap
        driverLocation={driverLocation}
        etaMinutes={etaMinutes}
      />
    </div>
  );
}
```

### Example 3: Hospital Dashboard

```javascript
// hospital/pages/DashboardPage.jsx
import HospitalAmbulanceDashboard from '../components/HospitalAmbulanceDashboard';

export default function HospitalDashboard() {
  return (
    <HospitalAmbulanceDashboard hospitalId={currentHospital.id} />
  );
}
```

---

## Testing

### Manual Testing Checklist

- [ ] Driver accepts trip → GPS tracking starts
- [ ] Patient sees live location on map
- [ ] ETA updates every 10 seconds
- [ ] Distance decreases as ambulance moves
- [ ] Hospital dashboard shows ambulance
- [ ] Socket auto-reconnects after disconnect
- [ ] Location history records path
- [ ] Trip completion stops tracking
- [ ] Battery usage is acceptable
- [ ] Works on mobile with location permission

### Performance Testing

```javascript
// Monitor socket events
socket.onAny((eventName, data) => {
  console.time(`Socket: ${eventName}`);
  // Handle event
  console.timeEnd(`Socket: ${eventName}`);
});

// Monitor battery usage
navigator.getBattery?.then(battery => {
  battery.onlevelchange = () => {
    console.log(`Battery: ${battery.level}%`);
  };
});
```

---

## Troubleshooting

### Issue: GPS not updating

**Solution:**
1. Check browser location permission
2. Ensure device GPS is enabled
3. Verify socket is connected
4. Check `enableHighAccuracy` setting

### Issue: Socket keeps disconnecting

**Solution:**
1. Check network connectivity
2. Verify Socket.IO CORS configuration
3. Check browser console for errors
4. Ensure server is running

### Issue: High battery drain

**Solution:**
1. Increase `updateIntervalMs` to 15000+
2. Set `enableHighAccuracy: false`
3. Disable tracking when not needed
4. Monitor background GPS access

### Issue: ETA not updating

**Solution:**
1. Verify location is actually updating
2. Check trip has valid destination
3. Ensure socket events are being received
4. Check browser console for errors

---

## Future Enhancements

- [ ] Google Maps integration for better route calculation
- [ ] Traffic-aware ETA prediction
- [ ] Multiple ambulance route optimization
- [ ] Offline location caching
- [ ] Analytics dashboard
- [ ] Push notifications for status changes
- [ ] Video call between patient and paramedic
- [ ] Digital signature for handover
- [ ] Integration with emergency services
- [ ] Advanced user analytics

---

## Support

For issues or questions:
1. Check this documentation
2. Review error messages in browser console
3. Check Socket.IO connection status
4. Verify backend APIs are running
5. Check database connections

---

**Last Updated:** May 19, 2026
**Version:** 1.0.0
