import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { BottomNav } from "../../../components/layout/BottomNav";
import { TopBar } from "../../../components/layout/TopBar";
import { AmbulanceLiveMap } from "../../../components/maps/AmbulanceLiveMap";
import { GoogleMapsLoader } from "../../../components/maps/GoogleMapsLoader";
import { Button } from "../../../components/ui/Button";
import { MaterialIcon } from "../../../components/ui/MaterialIcon";
import { PageError, PageLoader } from "../../../components/ui/PageState";
import { getPatientBottomNav } from "../../../data/appData";
import { formatStatusLabel, formatTime } from "../../../lib/formatters";
import { getDriverLatLng } from "../../../lib/geolocation";
import { getApiErrorMessage } from "../../../services/apiClient";
import { userApi } from "../../../services/appApi";
import { socket } from "../../../services/socketClient";
import { useTripTrackingStore } from "../../../store/useTripTrackingStore";

function toLatLng(location) {
  if (!location?.lat || !location?.lng) {
    return null;
  }

  return {
    lat: location.lat,
    lng: location.lng,
  };
}

function buildTrackingZones(location) {
  if (!location) {
    return [];
  }

  return [
    {
      id: "patient-zone",
      center: location,
      radius: 640,
      fillColor: "#60a5fa",
      strokeColor: "#60a5fa",
    },
  ];
}

export default function LiveTripTrackingPage() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const [trip, setTrip] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [statusMessage, setStatusMessage] = useState("Ambulance is en route.");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [mapTheme, setMapTheme] = useState("dark");

  const {
    addLocationToHistory,
    reset: resetTripTracking,
    setCurrentTrip,
    updateDriverLocation,
  } = useTripTrackingStore();

  const pickupLocation = useMemo(() => {
    if (!trip?.pickupLat || !trip?.pickupLng) {
      return null;
    }

    return {
      lat: trip.pickupLat,
      lng: trip.pickupLng,
    };
  }, [trip]);

  const hospitalLocation = useMemo(() => {
    if (trip?.hospital?.location) {
      return toLatLng(trip.hospital.location);
    }

    if (trip?.destLat && trip?.destLng) {
      return {
        lat: trip.destLat,
        lng: trip.destLng,
      };
    }

    return null;
  }, [trip]);

  const routePhase = useMemo(() => {
    if (!trip) {
      return "TO_PICKUP";
    }

    return ["ARRIVED", "ON_BOARD"].includes(trip.status) ? "TO_HOSPITAL" : "TO_PICKUP";
  }, [trip]);

  const routeDestination = routePhase === "TO_HOSPITAL" ? hospitalLocation : pickupLocation;
  const heatZones = useMemo(() => buildTrackingZones(pickupLocation), [pickupLocation]);

  const driverSummary = useMemo(() => {
    if (!trip?.driver) {
      return "Awaiting driver assignment";
    }

    const unit = trip.driver.ambulance?.plateNumber || "Live Unit";
    const type = trip.driver.ambulance?.type || "Ambulance";
    return `${unit} - ${type}`;
  }, [trip?.driver]);

  useEffect(() => {
    if (!tripId) {
      return undefined;
    }

    let isMounted = true;

    async function fetchTrip() {
      try {
        const response = await userApi.getTrip(tripId);

        if (!isMounted) {
          return;
        }

        setTrip(response.data);
        setCurrentTrip(response.data);
        setDriverLocation(toLatLng(response.data.driver?.location) || (() => {
          const coords = getDriverLatLng(response.data.driver);
          return coords ? { lat: coords[0], lng: coords[1] } : null;
        })());
        setStatusMessage(formatStatusLabel(response.data.status));
        setError("");
      } catch (requestError) {
        if (isMounted) {
          setError(getApiErrorMessage(requestError, "Unable to load live trip status."));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    function joinRooms() {
      socket.emit("joinTrip", tripId);
      socket.emit("startTripTracking", { tripId });
    }

    function applyTrackingPayload(payload) {
      if (typeof payload.lat !== "number" || typeof payload.lng !== "number") {
        return;
      }

      setDriverLocation({ lat: payload.lat, lng: payload.lng });

      if (payload.etaToPatientSeconds || payload.etaToHospitalSeconds) {
        const nextEtaSeconds = routePhase === "TO_HOSPITAL"
          ? payload.etaToHospitalSeconds
          : payload.etaToPatientSeconds;
        setEtaMinutes(nextEtaSeconds ? Math.ceil(nextEtaSeconds / 60) : null);
      }

      const nextDistance = routePhase === "TO_HOSPITAL"
        ? payload.distanceToHospital
        : payload.distanceToPatient;
      if (nextDistance !== undefined) {
        setDistanceKm(nextDistance);
      }

      updateDriverLocation({
        lat: payload.lat,
        lng: payload.lng,
        distanceToPatient: payload.distanceToPatient,
        distanceToHospital: payload.distanceToHospital,
        etaToPatientSeconds: payload.etaToPatientSeconds,
        etaToHospitalSeconds: payload.etaToHospitalSeconds,
        updatedAt: payload.updatedAt,
      });

      addLocationToHistory({
        lat: payload.lat,
        lng: payload.lng,
        timestamp: payload.updatedAt,
      });
    }

    function handleTripStatusChanged(payload) {
      setStatusMessage(payload.message || formatStatusLabel(payload.status));

      if (payload.status === "COMPLETED") {
        navigate(`/patient/trip/${tripId}`, { replace: true });
        return;
      }

      fetchTrip();
    }

    function handleDriverLocationUpdated(payload) {
      applyTrackingPayload(payload);
    }

    function handleTrackingStarted(payload) {
      applyTrackingPayload({
        lat: payload.driverLat,
        lng: payload.driverLng,
        distanceToPatient: payload.distanceToPatient,
        distanceToHospital: payload.distanceToHospital,
        etaToPatientSeconds: payload.etaToPatientSeconds,
        etaToHospitalSeconds: payload.etaToHospitalSeconds,
        updatedAt: payload.updatedAt,
      });
    }

    function handleCfrAlert(payload) {
      toast.info(payload.message);
    }

    socket.connect();
    if (socket.connected) {
      joinRooms();
    }

    socket.on("connect", joinRooms);
    socket.on("tripStatusChanged", handleTripStatusChanged);
    socket.on("driverLocationUpdated", handleDriverLocationUpdated);
    socket.on("trackingStarted", handleTrackingStarted);
    socket.on("cfrAlert", handleCfrAlert);

    fetchTrip();

    return () => {
      isMounted = false;
      socket.emit("stopTripTracking", { tripId });
      socket.off("connect", joinRooms);
      socket.off("tripStatusChanged", handleTripStatusChanged);
      socket.off("driverLocationUpdated", handleDriverLocationUpdated);
      socket.off("trackingStarted", handleTrackingStarted);
      socket.off("cfrAlert", handleCfrAlert);
      resetTripTracking();
    };
  }, [addLocationToHistory, navigate, resetTripTracking, routePhase, setCurrentTrip, tripId, updateDriverLocation]);

  if (isLoading) {
    return <PageLoader label="Loading live tracking..." />;
  }

  if (!trip) {
    return <PageError actionLabel="Back Home" message={error} onAction={() => navigate("/patient/home")} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />

      <main className="relative flex flex-1 flex-col overflow-hidden pb-16 md:flex-row md:pb-0">
        <GoogleMapsLoader loadingLabel="Loading live trip map...">
          <div className="relative flex-1">
            <AmbulanceLiveMap
              center={pickupLocation || hospitalLocation}
              className="h-full rounded-none"
              destinationLocation={routePhase === "TO_HOSPITAL" ? hospitalLocation : null}
              heatZones={heatZones}
              hospitalLocation={hospitalLocation}
              onRouteMetrics={setRouteMetrics}
              routeDestination={routeDestination}
              routeOrigin={driverLocation}
              showTraffic
              theme={mapTheme}
              trackedAmbulanceLocation={driverLocation}
              userLocation={pickupLocation}
              zoom={13}
            />

            <div className="absolute inset-x-0 top-0 z-20 p-4 md:hidden">
              <div className="flex items-center justify-between rounded-[24px] border border-white/10 bg-[#0f1720]/90 px-4 py-3 text-white shadow-panel backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-[#ff6b74] animate-pulse" />
                  <span className="text-sm font-semibold">{formatStatusLabel(trip.status)}</span>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/55">ETA</div>
                  <div className="text-base font-semibold">
                    {etaMinutes ? `${etaMinutes} min` : routeMetrics?.durationInTrafficText || "Live"}
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute right-4 top-4 z-20 hidden md:block">
              <button
                className="rounded-2xl border border-white/10 bg-[#0f1720]/88 px-3 py-2 text-sm font-medium text-white shadow-panel backdrop-blur-md transition hover:bg-[#16202e]"
                onClick={() => setMapTheme((current) => current === "dark" ? "light" : "dark")}
                type="button"
              >
                {mapTheme === "dark" ? "Light Map" : "Dark Map"}
              </button>
            </div>
          </div>
        </GoogleMapsLoader>

        <div className="relative z-20 w-full shrink-0 border-t border-outline-variant bg-surface-container-lowest md:max-w-[420px] md:border-l md:border-t-0">
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 md:p-6">
            <div className="rounded-[28px] border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-secondary">Current Status</div>
                  <div className="mt-2 flex items-center gap-3 text-primary">
                    <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                    <h2 className="text-xl font-semibold">{statusMessage}</h2>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-secondary">Last Update</div>
                  <div className="mt-2 text-lg font-semibold">
                    {formatTime(trip.completedAt || trip.pickedUpAt || trip.acceptedAt || trip.requestedAt)}
                  </div>
                  <div className="text-sm text-secondary">
                    {driverLocation ? `${driverLocation.lat.toFixed(3)}, ${driverLocation.lng.toFixed(3)}` : "Awaiting location"}
                  </div>
                </div>
              </div>

              <div className="my-4 h-px bg-outline-variant" />

              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-surface-container p-2">
                  <MaterialIcon name="ambulance" filled className="text-primary" />
                </div>
                <div>
                  <div className="font-semibold">{driverSummary}</div>
                  <div className="text-sm text-secondary">
                    Driver: {trip.driver?.user?.fullName || "Pending assignment"}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-surface-container p-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-secondary">ETA</div>
                  <div className="mt-2 text-xl font-semibold text-primary">
                    {etaMinutes ? `${etaMinutes} min` : routeMetrics?.durationInTrafficText || "Calculating"}
                  </div>
                </div>
                <div className="rounded-2xl bg-surface-container p-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-secondary">Distance</div>
                  <div className="mt-2 text-xl font-semibold text-primary">
                    {distanceKm !== null ? `${distanceKm.toFixed(1)} km` : routeMetrics?.distanceText || "Calculating"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <div className="rounded-2xl bg-tertiary-container p-2 text-on-tertiary-container">
                  <MaterialIcon name="local_hospital" filled />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{trip.hospital?.name || "Destination pending"}</h3>
                  <span className="text-sm text-secondary">
                    {routePhase === "TO_HOSPITAL" ? "Hospital receiving patient" : "Destination will lock in after pickup"}
                  </span>
                </div>
              </div>
              <span className="block text-sm text-secondary">
                {trip.destAddress || "Hospital destination will appear once the driver reaches the patient."}
              </span>
            </div>

            <div className="mt-auto flex flex-col gap-3">
              <Button
                variant="soft"
                className="w-full py-3 text-base"
                icon="share"
                onClick={() => {
                  const trackingUrl = window.location.href;
                  if (navigator.share) {
                    navigator.share({
                      title: `Trip ${tripId} Live Tracking`,
                      text: "Follow my emergency ambulance arrival in real-time.",
                      url: trackingUrl,
                    }).catch(async () => {
                      if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(trackingUrl);
                        toast.success("Tracking link copied to clipboard.");
                      }
                    });
                    return;
                  }

                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(trackingUrl);
                    toast.success("Tracking link copied to clipboard.");
                  }
                }}
              >
                Share Live Status
              </Button>

              <Button
                variant="soft"
                className="w-full py-3 text-base"
                icon="call"
                onClick={() => {
                  if (trip.driver?.user?.phone) {
                    window.location.href = `tel:${trip.driver.user.phone}`;
                    return;
                  }

                  toast.info("Driver contact will appear once the assignment is confirmed.");
                }}
              >
                Call Driver
              </Button>
            </div>
          </div>
        </div>
      </main>

      <BottomNav items={getPatientBottomNav("Map")} />
    </div>
  );
}
