# AmbuSOS 🚑

> Optimized emergency response platform for fast ambulance booking, live tracking, and hospital coordination.

<div align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/Status-MVP%20Completed-success?style=for-the-badge" alt="Status"/>
</div>

## Overview

AmbuSOS connects patients, drivers, hospitals, and admins in a real-time emergency dispatch system. It supports SOS requests, GPS-based location detection, ambulance matching, live tracking, route optimization, and hospital handoff.

## Tech Stack

- Frontend: React, Tailwind CSS
- Backend: Node.js, Express, Socket.IO
- Database: MongoDB, Mongoose
- Intelligence: OSRM, Gemini API
- Security: JWT authentication, role-based access
- Real-time: WebSocket-based tracking and notifications

## Key Features

- Emergency ambulance request with automatic location detection
- AI-based ambulance recommendation using distance, availability, traffic, and hospital preference
- Live driver tracking and ETA updates
- Hospital dashboard for incoming patient coordination
- Admin dashboard for ambulance, driver, and hospital management
- SOS notifications, emergency contacts, and push notifications
- Medical history sharing with consent

## High-Level Architecture

- Client layer: patient app, driver app, hospital dashboard, admin portal
- Service layer: authentication, booking, dispatch, tracking, recommendation, notification
- Data layer: MongoDB for core data, Redis for caching, Kafka for events
- External integrations: Google Maps APIs, Firebase/APNs, SMS, hospital systems

## System Architecture

```mermaid
flowchart LR
    U[Patient] --> API[API Gateway]
    D[Driver] --> API
    H[Hospital] --> API
    A[Admin] --> API

    API --> S1[Booking Service]
    API --> S2[Tracking Service]
    API --> S3[Notification Service]
    API --> S4[Recommendation Engine]

    S1 --> DB[(MongoDB)]
    S2 --> Redis[(Redis)]
    S3 --> FCM[Push / SMS]
    S4 --> Maps[Google Maps API]
```

## Workflow

```mermaid
flowchart TD
    A[Patient triggers SOS] --> B[System detects location]
    B --> C[AI recommends nearest ambulance]
    C --> D[Dispatch request sent to driver]
    D --> E{Driver accepts?}
    E -- Yes --> F[Ambulance assigned to patient]
    E -- No --> G[Retry with next available ambulance]
    G --> C
    F --> H[Real-time tracking starts]
    H --> I[Route optimization via Google Maps]
    I --> J[Ambulance reaches patient]
    J --> K[Patient picked up]
    K --> L[Trip updates sent to hospital]
    L --> M[Hospital receives patient info]
    M --> N[Ambulance reaches hospital]
    N --> O[Trip completed]
```

## Data Model

```mermaid
erDiagram
    USER {
        string _id PK
        string email
        string phone
        string passwordHash
        string fullName
        string role
        string bloodType
        string allergies
        string emergencyContact
        string fcmToken
    }
    DRIVER_PROFILE {
        string _id PK
        string userId FK
        string licenseNumber
        number yearsExperience
        number rating
        string status
        number currentLat
        number currentLng
        date lastLocationUpdate
        string ambulanceId FK
    }
    AMBULANCE {
        string _id PK
        string plateNumber
        string type
        string model
        string equipmentList
    }
    HOSPITAL {
        string _id PK
        string name
        string address
        number latitude
        number longitude
        string phone
        number availableBeds
        number icuAvailable
        number ventilators
        string specialties
    }
    HOSPITAL_PROFILE {
        string _id PK
        string userId FK
        string hospitalId FK
    }
    CFR_PROFILE {
        string _id PK
        string userId FK
        string certificationId
        boolean isVerified
    }
    TRIP {
        string _id PK
        string status
        string pickupAddress
        number pickupLat
        number pickupLng
        string destAddress
        number destLat
        number destLng
        string passengerId FK
        string driverId FK
        string hospitalId FK
        string responderIds
        date requestedAt
        date acceptedAt
        date pickedUpAt
        date completedAt
        string routePolyline
        number distanceKm
        number earningsAmount
    }
    MEDICAL_REPORT {
        string _id PK
        string tripId FK
        string paramedicNotes
        string aiSummary
        string suspectedCondition
        string severity
        mixed vitalsCheck
        date createdAt
    }
    CHAT_MESSAGE {
        string _id PK
        string tripId FK
        string senderId FK
        string senderName
        string message
        date timestamp
    }
    PROXIMITY_ALERT {
        string _id PK
        date sentAt
        string userId FK
        string triggerTripId FK
        number userLocationLat
        number userLocationLng
    }

    USER ||--o{ DRIVER_PROFILE : has
    USER ||--o{ HOSPITAL_PROFILE : has
    USER ||--o{ CFR_PROFILE : has
    USER ||--o{ TRIP : passenger
    USER ||--o{ CHAT_MESSAGE : sends
    USER ||--o{ PROXIMITY_ALERT : receives

    DRIVER_PROFILE ||--|| AMBULANCE : assigned
    DRIVER_PROFILE ||--o{ TRIP : drives

    HOSPITAL ||--o{ TRIP : destination
    HOSPITAL ||--o{ HOSPITAL_PROFILE : employs

    TRIP ||--|| MEDICAL_REPORT : has
    TRIP ||--o{ CHAT_MESSAGE : contains
    TRIP ||--o{ PROXIMITY_ALERT : triggers
```

> Note: `Trip.responderIds` is an array of string IDs rather than a direct Mongoose ref.

## Local Setup

1. Refer to the environment documentation in the repository and add the required variables to the backend `.env` file.
2. Install dependencies for the frontend and backend.
3. Start the backend server and frontend app.
4. Seed the system using `POST /dev/seed-system`.
5. Reset the database using `DELETE /dev/reset-system` when needed.

## Contact

Email: [sparsh.agarwal0508@gmail.com](mailto:sparsh.agarwal0508@gmail.com)
