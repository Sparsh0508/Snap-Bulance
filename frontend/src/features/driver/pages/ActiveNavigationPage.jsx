import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { DashboardShell } from "../../../components/layout/DashboardShell";
import { AmbulanceLiveMap } from "../../../components/maps/AmbulanceLiveMap";
import { GoogleMapsLoader } from "../../../components/maps/GoogleMapsLoader";
import { Button } from "../../../components/ui/Button";
import { MaterialIcon } from "../../../components/ui/MaterialIcon";
import { Panel } from "../../../components/ui/Panel";
import { PageError, PageLoader } from "../../../components/ui/PageState";
import { TextField } from "../../../components/ui/TextField";
import { formatStatusLabel } from "../../../lib/formatters";
import {
  clearLocationWatch,
  getCurrentCoordinates,
  watchCurrentPosition,
} from "../../../lib/geolocation";
import { getApiErrorMessage } from "../../../services/apiClient";
import { driverApi, tripApi } from "../../../services/appApi";
import { socket } from "../../../services/socketClient";

function toLatLng(location) {
  if (!location?.lat || !location?.lng) {
    return null;
  }

  return {
    lat: location.lat,
    lng: location.lng,
  };
}

function buildDriverHeatZones(routePhase, pickupLocation, hospitalLocation) {
  const focusLocation = routePhase === "TO_HOSPITAL" ? hospitalLocation : pickupLocation;

  if (!focusLocation) {
    return [];
  }

  return [
    {
      id: "driver-focus",
      center: focusLocation,
      radius: routePhase === "TO_HOSPITAL" ? 820 : 620,
      fillColor: routePhase === "TO_HOSPITAL" ? "#60a5fa" : "#ff6b74",
      strokeColor: routePhase === "TO_HOSPITAL" ? "#60a5fa" : "#ff6b74",
    },
  ];
}

export default function ActiveNavigationPage() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const [trip, setTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [error, setError] = useState("");
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [liveLocation, setLiveLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [mapTheme, setMapTheme] = useState("dark");
  const [report, setReport] = useState({
    severity: "MODERATE",
    suspectedCondition: "",
    vitalsCheck: "",
    paramedicNotes: "",
  });

  const routePhase = useMemo(() => {
    if (!trip) {
      return "TO_PICKUP";
    }

    return ["ARRIVED", "ON_BOARD"].includes(trip.status) ? "TO_HOSPITAL" : "TO_PICKUP";
  }, [trip]);

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

  const routeDestination = routePhase === "TO_HOSPITAL" ? hospitalLocation : pickupLocation;
  const mapCenter = liveLocation || pickupLocation || hospitalLocation;
  const heatZones = useMemo(
    () => buildDriverHeatZones(routePhase, pickupLocation, hospitalLocation),
    [hospitalLocation, pickupLocation, routePhase],
  );

  const routeLabel = routePhase === "TO_PICKUP"
    ? trip?.pickupAddress
    : trip?.hospital?.name || trip?.destAddress || "Assigned Hospital";

  const etaLabel = routeMetrics?.durationInTrafficText || routeMetrics?.durationText || "Live";
  const distanceLabel = routeMetrics?.distanceText || (trip?.distanceKm ? `${trip.distanceKm} km` : "Live");

  useEffect(() => {
    if (!tripId) {
      return undefined;
    }

    let mounted = true;

    async function fetchTrip() {
      setIsLoading(true);

      try {
        const response = await driverApi.getTrip(tripId);

        if (!mounted) {
          return;
        }

        setTrip(response.data);
        setShowCompletionForm(response.data.status === "ON_BOARD");
        setReport((current) => ({
          ...current,
          severity: response.data.medicalReport?.severity || current.severity,
          suspectedCondition: response.data.medicalReport?.suspectedCondition || current.suspectedCondition,
          paramedicNotes: response.data.medicalReport?.paramedicNotes || current.paramedicNotes,
          vitalsCheck: response.data.medicalReport?.vitalsCheck
            ? JSON.stringify(response.data.medicalReport.vitalsCheck, null, 2)
            : current.vitalsCheck,
        }));

        if (!liveLocation) {
          setLiveLocation(toLatLng(response.data.driver?.location));
        }
      } catch (requestError) {
        if (mounted) {
          setError(getApiErrorMessage(requestError, "Unable to load this trip."));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    function handleTripStatusChanged(payload) {
      if (payload.status === "COMPLETED") {
        toast.success("Trip completed successfully.");
        navigate("/driver/dashboard", { replace: true });
        return;
      }

      fetchTrip();
    }

    socket.connect();
    socket.emit("joinTrip", tripId);
    socket.on("tripStatusChanged", handleTripStatusChanged);

    fetchTrip();

    return () => {
      mounted = false;
      socket.off("tripStatusChanged", handleTripStatusChanged);
    };
  }, [liveLocation, navigate, tripId]);

  useEffect(() => {
    if (!trip?.driver?.id || !tripId) {
      return undefined;
    }

    function emitLocation(lat, lng) {
      socket.emit("updateDriverLocation", {
        tripId,
        lat,
        lng,
        driverId: trip.driver.id,
      });
    }

    const watchId = watchCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setLiveLocation(nextLocation);
        setLocationError("");
        emitLocation(nextLocation.lat, nextLocation.lng);
      },
      (watchError) => {
        setLocationError(getApiErrorMessage(watchError, "Live GPS tracking is unavailable on this device."));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      },
    );

    return () => {
      clearLocationWatch(watchId);
    };
  }, [trip?.driver?.id, tripId]);

  const syncDriverLocation = useCallback(async () => {
    if (!trip?.driver?.id) {
      return;
    }

    try {
      const coordinates = await getCurrentCoordinates();
      setLiveLocation(coordinates);
      setLocationError("");
      socket.emit("updateDriverLocation", {
        tripId,
        lat: coordinates.lat,
        lng: coordinates.lng,
        driverId: trip.driver.id,
      });
      toast.success("Location synced.");
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, "Could not refresh live location."));
    }
  }, [trip?.driver?.id, tripId]);

  function updateReport(field, value) {
    setReport((current) => ({ ...current, [field]: value }));
  }

  async function handlePrimaryAction() {
    if (!trip) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (routePhase === "TO_PICKUP") {
        const response = await tripApi.arriveToPatient(trip.id);
        const updatedTrip = response.data.updatedTrip;

        socket.emit("updateTripStatus", {
          tripId: trip.id,
          status: updatedTrip.status,
          message: `Patient picked up. Heading to ${updatedTrip.hospital?.name || "assigned hospital"}.`,
          destLat: updatedTrip.destLat,
          destLng: updatedTrip.destLng,
        });

        setTrip((current) => ({
          ...current,
          ...updatedTrip,
          hospital: updatedTrip.hospital || current?.hospital,
        }));
        toast.success("Patient pickup confirmed.");
        return;
      }

      if (!showCompletionForm) {
        await tripApi.arriveAtHospital(trip.id);
        socket.emit("updateTripStatus", {
          tripId: trip.id,
          status: "ON_BOARD",
          message: "Arrived at hospital. Preparing handover.",
        });
        setShowCompletionForm(true);
        toast.success("Hospital arrival confirmed.");
        return;
      }

      let parsedVitals = null;

      if (report.vitalsCheck.trim()) {
        try {
          parsedVitals = JSON.parse(report.vitalsCheck);
        } catch {
          setIsSubmitting(false);
          toast.error("Vitals must be valid JSON before completing handover.");
          return;
        }
      }

      await tripApi.complete(trip.id, {
        severity: report.severity,
        suspectedCondition: report.suspectedCondition,
        vitalsCheck: parsedVitals,
        paramedicNotes: report.paramedicNotes,
      });

      socket.emit("updateTripStatus", {
        tripId: trip.id,
        status: "COMPLETED",
        message: "Handover completed successfully.",
      });

      toast.success("Trip completed and medical report saved.");
      navigate("/driver/dashboard", { replace: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, "Could not update trip status."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <PageLoader label="Loading navigation..." />;
  }

  if (!trip) {
    return <PageError actionLabel="Back to Dashboard" message={error} onAction={() => navigate("/driver/dashboard")} />;
  }

  return (
    <DashboardShell
      sideTitle="AmbuSOS Driver"
      sideSubtitle={trip.driver?.ambulance?.plateNumber || "Mission"}
      sideItems={[
        { label: "Dashboard", icon: "dashboard", to: "/driver/dashboard" },
        { label: "Navigation", icon: "emergency", to: `/driver/navigation/${trip.id}`, active: true },
      ]}
      sideCta={<Button className="mt-auto w-full" icon="dashboard" onClick={() => navigate("/driver/dashboard")}>Back to Dashboard</Button>}
      bottomItems={[
        { label: "Dashboard", icon: "dashboard", to: "/driver/dashboard" },
        { label: "Mission", icon: "emergency", to: `/driver/navigation/${trip.id}`, active: true },
      ]}
      mainClassName="flex-1 overflow-hidden"
    >
      <div className="flex h-[calc(100vh-56px)] flex-col md:h-[calc(100vh-64px)] md:flex-row">
        <GoogleMapsLoader loadingLabel="Loading driver navigation...">
          <div className="relative flex-1">
            <AmbulanceLiveMap
              center={mapCenter}
              className="h-full rounded-none"
              destinationLocation={routePhase === "TO_HOSPITAL" ? hospitalLocation : null}
              heatZones={heatZones}
              hospitalLocation={hospitalLocation}
              onCurrentLocation={syncDriverLocation}
              onRouteMetrics={setRouteMetrics}
              routeDestination={routeDestination}
              routeOrigin={liveLocation}
              showTraffic
              theme={mapTheme}
              trackedAmbulanceLocation={liveLocation}
              userLocation={pickupLocation}
              zoom={13}
            />

            <Panel className="absolute left-4 right-4 top-4 z-10 overflow-hidden bg-[#0f1720]/92 text-white shadow-panel backdrop-blur-xl md:left-auto md:right-6 md:w-96">
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div className="flex items-center gap-3">
                  <MaterialIcon
                    name={routePhase === "TO_PICKUP" ? "emergency" : "local_hospital"}
                    filled
                    className="text-[28px] text-[#ffb4ab]"
                  />
                  <div>
                    <div className="text-lg font-semibold">
                      {routePhase === "TO_PICKUP" ? "Respond to Scene" : "Transfer to Hospital"}
                    </div>
                    <div className="text-sm text-white/65">{routeLabel}</div>
                  </div>
                </div>
                <button
                  className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/12"
                  onClick={() => setMapTheme((current) => current === "dark" ? "light" : "dark")}
                  type="button"
                >
                  {mapTheme === "dark" ? "Light Map" : "Dark Map"}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 p-4 text-on-surface">
                <div className="rounded-2xl bg-white/6 p-3 text-white">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/55">ETA</div>
                  <div className="mt-2 text-lg font-semibold">{etaLabel}</div>
                </div>
                <div className="rounded-2xl bg-white/6 p-3 text-white">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/55">Distance</div>
                  <div className="mt-2 text-lg font-semibold">{distanceLabel}</div>
                </div>
                <div className="rounded-2xl bg-white/6 p-3 text-white">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/55">Phase</div>
                  <div className="mt-2 text-sm font-semibold">
                    {routePhase === "TO_PICKUP" ? "Route to Patient" : showCompletionForm ? "Handover" : "Route to Hospital"}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel className="absolute bottom-4 left-4 right-4 z-10 p-4 md:bottom-auto md:left-6 md:right-auto md:top-32 md:w-80">
              <div className="mb-2 flex items-start justify-between">
                <div className="text-label-md uppercase text-secondary">Mission #{trip.id.slice(0, 8).toUpperCase()}</div>
                <MaterialIcon name="fiber_manual_record" filled className="animate-soft-pulse text-[16px] text-primary" />
              </div>
              <h3 className="text-headline-md">{trip.medicalReport?.suspectedCondition || "Emergency Response"}</h3>
              <p className="mt-1 flex items-center gap-2 text-body-md text-secondary">
                <MaterialIcon name="location_on" className="text-[18px]" />
                {routePhase === "TO_PICKUP" ? trip.pickupAddress : trip.hospital?.address || trip.destAddress || "Hospital destination"}
              </p>
              <p className="mt-2 text-label-sm uppercase tracking-wider text-secondary">{formatStatusLabel(trip.status)}</p>
              {locationError ? (
                <p className="mt-3 rounded-2xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                  {locationError}
                </p>
              ) : null}
              {showCompletionForm ? (
                <div className="mt-4 border-t border-surface-variant pt-4">
                  <div className="grid gap-stack-sm">
                    <TextField
                      id="severity"
                      label="Severity"
                      onChange={(event) => updateReport("severity", event.target.value)}
                      value={report.severity}
                    />
                    <TextField
                      id="suspected-condition"
                      label="Suspected Condition"
                      onChange={(event) => updateReport("suspectedCondition", event.target.value)}
                      value={report.suspectedCondition}
                    />
                    <TextField
                      id="paramedic-notes"
                      label="Paramedic Notes"
                      onChange={(event) => updateReport("paramedicNotes", event.target.value)}
                      rows={4}
                      type="textarea"
                      value={report.paramedicNotes}
                    />
                    <TextField
                      helper='Optional JSON object, for example {"bp":"120/80","spo2":"98%"}'
                      id="vitals"
                      label="Vitals JSON"
                      onChange={(event) => updateReport("vitalsCheck", event.target.value)}
                      rows={4}
                      type="textarea"
                      value={report.vitalsCheck}
                    />
                  </div>
                  <Button className="mt-4 w-full px-6 py-2" icon="check_circle" iconSide="right" loading={isSubmitting} onClick={handlePrimaryAction}>
                    Complete Handover
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-surface-variant pt-4">
                  <Button variant="soft" className="px-4 py-2" icon="my_location" onClick={syncDriverLocation}>
                    Sync Location
                  </Button>
                  <Button className="px-6 py-2" icon="check_circle" iconSide="right" loading={isSubmitting} onClick={handlePrimaryAction}>
                    {routePhase === "TO_PICKUP" ? "Arrived at Patient" : "Arrived at Hospital"}
                  </Button>
                </div>
              )}
            </Panel>
          </div>
        </GoogleMapsLoader>
      </div>
    </DashboardShell>
  );
}
