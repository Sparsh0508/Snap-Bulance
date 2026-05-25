import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleF,
  DirectionsRenderer,
  GoogleMap,
  MarkerF,
  TrafficLayer,
} from "@react-google-maps/api";
import { cn } from "../../lib/utils";
import { getAmbulanceMarkerType, getMarkerIcon } from "./mapIcons";
import { darkMapTheme, lightMapTheme } from "./googleMapTheme";

const containerStyle = {
  width: "100%",
  height: "100%",
};

function isFiniteCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toLatLngLiteral(location) {
  if (!location || !isFiniteCoordinate(location.lat) || !isFiniteCoordinate(location.lng)) {
    return null;
  }

  return {
    lat: location.lat,
    lng: location.lng,
  };
}

function useAnimatedLocation(targetLocation, duration = 1200) {
  const [animatedLocation, setAnimatedLocation] = useState(targetLocation);
  const previousLocationRef = useRef(targetLocation);

  useEffect(() => {
    if (!targetLocation) {
      return undefined;
    }

    const previousLocation = previousLocationRef.current;

    if (!previousLocation) {
      setAnimatedLocation(targetLocation);
      previousLocationRef.current = targetLocation;
      return undefined;
    }

    let animationFrameId = null;
    const startTime = performance.now();

    function animate(currentTime) {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const ease = 1 - (1 - progress) * (1 - progress);

      setAnimatedLocation({
        lat: previousLocation.lat + (targetLocation.lat - previousLocation.lat) * ease,
        lng: previousLocation.lng + (targetLocation.lng - previousLocation.lng) * ease,
      });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      previousLocationRef.current = targetLocation;
    }

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [duration, targetLocation?.lat, targetLocation?.lng]);

  return animatedLocation;
}

export function AmbulanceLiveMap({
  ambulances = [],
  center,
  className = "",
  destinationLocation,
  heatZones = [],
  hospitalLocation,
  onCurrentLocation,
  onRouteMetrics,
  routeDestination,
  routeOrigin,
  showTraffic = true,
  theme = "dark",
  trackedAmbulanceLocation,
  userLocation,
  zoom = 13,
}) {
  const mapRef = useRef(null);
  const [directions, setDirections] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const animatedTrackedLocation = useAnimatedLocation(trackedAmbulanceLocation || routeOrigin);

  const mapCenter = useMemo(() => {
    return (
      toLatLngLiteral(center) ||
      toLatLngLiteral(userLocation) ||
      toLatLngLiteral(animatedTrackedLocation) ||
      { lat: 19.1973, lng: 72.9644 }
    );
  }, [animatedTrackedLocation, center, userLocation]);

  const styles = theme === "light" ? lightMapTheme : darkMapTheme;
  const routeOriginLiteral = toLatLngLiteral(animatedTrackedLocation || routeOrigin);
  const routeDestinationLiteral = toLatLngLiteral(routeDestination);
  const userLocationLiteral = toLatLngLiteral(userLocation);
  const destinationLiteral = toLatLngLiteral(destinationLocation);
  const hospitalLiteral = toLatLngLiteral(hospitalLocation);

  useEffect(() => {
    if (!isReady || !routeOriginLiteral || !routeDestinationLiteral || !globalThis.google?.maps) {
      setDirections(null);
      onRouteMetrics?.(null);
      return undefined;
    }

    const directionsService = new globalThis.google.maps.DirectionsService();

    directionsService.route(
      {
        destination: routeDestinationLiteral,
        origin: routeOriginLiteral,
        travelMode: globalThis.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: globalThis.google.maps.TrafficModel.BEST_GUESS,
        },
        provideRouteAlternatives: false,
      },
      (result, status) => {
        if (status !== "OK" || !result) {
          setDirections(null);
          onRouteMetrics?.(null);
          return;
        }

        setDirections(result);
        const leg = result.routes?.[0]?.legs?.[0];

        if (leg) {
          onRouteMetrics?.({
            distanceMeters: leg.distance?.value ?? null,
            distanceText: leg.distance?.text ?? null,
            durationSeconds: leg.duration?.value ?? null,
            durationText: leg.duration?.text ?? null,
            durationInTrafficSeconds: leg.duration_in_traffic?.value ?? null,
            durationInTrafficText: leg.duration_in_traffic?.text ?? null,
          });
        }
      },
    );
  }, [isReady, onRouteMetrics, routeDestinationLiteral?.lat, routeDestinationLiteral?.lng, routeOriginLiteral?.lat, routeOriginLiteral?.lng]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    const bounds = new globalThis.google.maps.LatLngBounds();
    let hasMarkers = false;

    [userLocationLiteral, routeOriginLiteral, routeDestinationLiteral, destinationLiteral, hospitalLiteral]
      .filter(Boolean)
      .forEach((point) => {
        bounds.extend(point);
        hasMarkers = true;
      });

    ambulances.forEach((ambulance) => {
      const point = toLatLngLiteral(ambulance.location || ambulance);
      if (point) {
        bounds.extend(point);
        hasMarkers = true;
      }
    });

    if (hasMarkers) {
      mapRef.current.fitBounds(bounds, 96);
    }
  }, [ambulances, destinationLiteral, hospitalLiteral, routeDestinationLiteral, routeOriginLiteral, userLocationLiteral]);

  function buildMarkerIcon(type) {
    if (!globalThis.google?.maps?.Size) {
      return undefined;
    }

    return {
      url: getMarkerIcon(type),
      scaledSize: new globalThis.google.maps.Size(44, 44),
      anchor: new globalThis.google.maps.Point(22, 40),
    };
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[28px]", className)}>
      <GoogleMap
        center={mapCenter}
        mapContainerStyle={containerStyle}
        onLoad={(map) => {
          mapRef.current = map;
          setIsReady(true);
        }}
        options={{
          clickableIcons: false,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          keyboardShortcuts: false,
          mapTypeControl: false,
          rotateControl: false,
          scaleControl: false,
          streetViewControl: false,
          styles,
          zoomControl: false,
        }}
        zoom={zoom}
      >
        {showTraffic ? <TrafficLayer autoUpdate /> : null}

        {directions ? (
          <DirectionsRenderer
            directions={directions}
            options={{
              polylineOptions: {
                icons: theme === "dark"
                  ? [
                      {
                        icon: {
                          path: "M 0,-1 0,1",
                          scale: 2,
                          strokeOpacity: 0.7,
                          strokeWeight: 2,
                        },
                        offset: "0",
                        repeat: "12px",
                      },
                    ]
                  : undefined,
                strokeColor: theme === "dark" ? "#ff6b74" : "#af101a",
                strokeOpacity: 0.95,
                strokeWeight: 6,
              },
              suppressMarkers: true,
            }}
          />
        ) : null}

        {heatZones.map((zone) => {
          const zoneCenter = toLatLngLiteral(zone.center);
          if (!zoneCenter) {
            return null;
          }

          return (
            <CircleF
              center={zoneCenter}
              key={zone.id}
              options={{
                fillColor: zone.fillColor || "#ff6b74",
                fillOpacity: zone.fillOpacity ?? 0.12,
                radius: zone.radius ?? 600,
                strokeColor: zone.strokeColor || "#ff6b74",
                strokeOpacity: zone.strokeOpacity ?? 0.18,
                strokeWeight: 1,
              }}
            />
          );
        })}

        {ambulances.map((ambulance) => {
          const position = toLatLngLiteral(ambulance.location || ambulance);
          if (!position) {
            return null;
          }

          return (
            <MarkerF
              icon={buildMarkerIcon(getAmbulanceMarkerType(ambulance.ambulance?.type))}
              key={ambulance.id}
              position={position}
              title={ambulance.ambulance?.plateNumber || "Available ambulance"}
            />
          );
        })}

        {userLocationLiteral ? (
          <MarkerF
            icon={buildMarkerIcon("user")}
            position={userLocationLiteral}
            title="Your location"
          />
        ) : null}

        {destinationLiteral ? (
          <MarkerF
            icon={buildMarkerIcon("destination")}
            position={destinationLiteral}
            title="Destination"
          />
        ) : null}

        {hospitalLiteral ? (
          <MarkerF
            icon={buildMarkerIcon("hospital")}
            position={hospitalLiteral}
            title="Hospital destination"
          />
        ) : null}

        {routeOriginLiteral && !ambulances.length ? (
          <MarkerF
            icon={buildMarkerIcon("ambulance")}
            position={routeOriginLiteral}
            title="Live ambulance"
          />
        ) : null}
      </GoogleMap>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/40 via-black/10 to-transparent" />

      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <button
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#111927]/90 text-white shadow-panel backdrop-blur-sm transition hover:bg-[#18212f]"
          onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() || zoom) + 1)}
          type="button"
        >
          +
        </button>
        <button
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#111927]/90 text-white shadow-panel backdrop-blur-sm transition hover:bg-[#18212f]"
          onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() || zoom) - 1)}
          type="button"
        >
          -
        </button>
        {onCurrentLocation ? (
          <button
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#111927]/90 text-white shadow-panel backdrop-blur-sm transition hover:bg-[#18212f]"
            onClick={onCurrentLocation}
            type="button"
          >
            ◎
          </button>
        ) : null}
      </div>
    </div>
  );
}
