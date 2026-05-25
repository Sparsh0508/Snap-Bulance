import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { TopBar } from "../../../components/layout/TopBar";
import { AmbulanceLiveMap } from "../../../components/maps/AmbulanceLiveMap";
import { GoogleMapsLoader } from "../../../components/maps/GoogleMapsLoader";
import { Button } from "../../../components/ui/Button";
import { MaterialIcon } from "../../../components/ui/MaterialIcon";
import { PageError, PageLoader } from "../../../components/ui/PageState";
import { getApiErrorMessage } from "../../../services/apiClient";
import { tripApi, userApi } from "../../../services/appApi";
import { socket } from "../../../services/socketClient";

function getTripPickupLocation(trip) {
  if (!trip?.pickupLat || !trip?.pickupLng) {
    return null;
  }

  return {
    lat: trip.pickupLat,
    lng: trip.pickupLng,
  };
}

function buildDispatchZones(location) {
  if (!location) {
    return [];
  }

  return [
    {
      id: "dispatch-core",
      center: location,
      radius: 780,
      fillColor: "#ff6b74",
      strokeColor: "#ff6b74",
    },
    {
      id: "dispatch-outer",
      center: {
        lat: location.lat - 0.004,
        lng: location.lng + 0.003,
      },
      radius: 980,
      fillColor: "#f59e0b",
      strokeColor: "#f59e0b",
    },
  ];
}

export default function LookingForDriverPage() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const [trip, setTrip] = useState(null);
  const [nearbyAmbulances, setNearbyAmbulances] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [mapTheme, setMapTheme] = useState("dark");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAmbulances, setIsLoadingAmbulances] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState("");

  const pickupLocation = useMemo(() => getTripPickupLocation(trip), [trip]);
  const featuredAmbulance = nearbyAmbulances[0] || null;
  const heatZones = useMemo(() => buildDispatchZones(pickupLocation), [pickupLocation]);

  useEffect(() => {
    if (!tripId) {
      return undefined;
    }

    let intervalId = null;

    async function syncTripStatus() {
      try {
        const response = await userApi.getTrip(tripId);
        const nextTrip = response.data;
        setTrip(nextTrip);
        setError("");

        if (["ASSIGNED", "EN_ROUTE", "ARRIVED", "ON_BOARD"].includes(nextTrip.status)) {
          navigate(`/patient/tracking/${tripId}`, { replace: true });
        }
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unable to load the current request."));
      } finally {
        setIsLoading(false);
      }
    }

    function joinRoom() {
      socket.emit("joinTrip", tripId);
    }

    function handleTripAccepted() {
      navigate(`/patient/tracking/${tripId}`, { replace: true });
    }

    function handleTripStatusChanged(payload) {
      if (["ASSIGNED", "EN_ROUTE", "ARRIVED", "ON_BOARD"].includes(payload.status)) {
        navigate(`/patient/tracking/${tripId}`, { replace: true });
      }
    }

    function handleCfrAlert(payload) {
      toast.info(payload.message);
    }

    socket.connect();
    if (socket.connected) {
      joinRoom();
    }

    socket.on("connect", joinRoom);
    socket.on("tripAccepted", handleTripAccepted);
    socket.on("tripStatusChanged", handleTripStatusChanged);
    socket.on("cfrAlert", handleCfrAlert);

    syncTripStatus();
    intervalId = window.setInterval(syncTripStatus, 3000);

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }

      socket.off("connect", joinRoom);
      socket.off("tripAccepted", handleTripAccepted);
      socket.off("tripStatusChanged", handleTripStatusChanged);
      socket.off("cfrAlert", handleCfrAlert);
    };
  }, [navigate, tripId]);

  useEffect(() => {
    if (!pickupLocation?.lat || !pickupLocation?.lng) {
      setNearbyAmbulances([]);
      return;
    }

    let isMounted = true;

    async function fetchNearbyAmbulances() {
      setIsLoadingAmbulances(true);

      try {
        const response = await userApi.getNearbyAmbulances(pickupLocation.lat, pickupLocation.lng, 6);
        if (isMounted) {
          setNearbyAmbulances(response.data || []);
        }
      } catch (requestError) {
        if (isMounted) {
          setNearbyAmbulances([]);
          setError(getApiErrorMessage(requestError, "Unable to load nearby ambulances."));
        }
      } finally {
        if (isMounted) {
          setIsLoadingAmbulances(false);
        }
      }
    }

    fetchNearbyAmbulances();

    return () => {
      isMounted = false;
    };
  }, [pickupLocation?.lat, pickupLocation?.lng]);

  async function handleCancel() {
    setIsCancelling(true);

    try {
      await tripApi.cancel(tripId);
      toast.success("Trip request cancelled.");
      navigate("/patient/home", { replace: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, "Could not cancel this request."));
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return <PageLoader label="Searching for the nearest available unit..." />;
  }

  if (!trip) {
    return <PageError actionLabel="Back Home" message={error} onAction={() => navigate("/patient/home")} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar rightSlot={<MaterialIcon name="help" className="text-primary" />} />

      <main className="relative flex flex-1 overflow-hidden">
        <GoogleMapsLoader loadingLabel="Loading live dispatch map...">
          <div className="relative flex-1">
            <AmbulanceLiveMap
              ambulances={nearbyAmbulances}
              center={pickupLocation}
              className="h-full rounded-none"
              heatZones={heatZones}
              onRouteMetrics={setRouteMetrics}
              routeDestination={pickupLocation}
              routeOrigin={featuredAmbulance?.location || null}
              showTraffic
              theme={mapTheme}
              userLocation={pickupLocation}
              zoom={13}
            />

            <div className="absolute inset-x-0 top-0 z-20 px-4 pt-4 md:px-6 md:pt-6">
              <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-3">
                <div className="rounded-[28px] border border-white/10 bg-[#0f1720]/88 px-4 py-4 text-white shadow-panel backdrop-blur-xl">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-white/60">
                    <MaterialIcon name="radar" className="text-[16px]" />
                    Dispatch Search
                  </div>
                  <h1 className="mt-1 text-xl font-semibold md:text-2xl">Scanning for the nearest available crew</h1>
                  <p className="mt-1 text-sm text-white/70">
                    Live ambulances are being ranked by response distance, traffic, and readiness.
                  </p>
                </div>

                <button
                  className="rounded-2xl border border-white/10 bg-[#0f1720]/88 px-3 py-2 text-sm font-medium text-white shadow-panel backdrop-blur-md transition hover:bg-[#16202e]"
                  onClick={() => setMapTheme((current) => current === "dark" ? "light" : "dark")}
                  type="button"
                >
                  {mapTheme === "dark" ? "Light Map" : "Dark Map"}
                </button>
              </div>
            </div>

            <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
              <div className="relative flex h-28 w-28 items-center justify-center">
                <div className="absolute inset-0 animate-pulse rounded-full border border-[#ffb4ab]/30 bg-[#ff6b74]/12" />
                <div className="absolute inset-3 animate-ping rounded-full border border-[#ffb4ab]/20" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#ff6b74] shadow-panel">
                  <MaterialIcon name="ambulance" filled className="text-[32px] text-white" />
                </div>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-5 md:px-6 md:pb-6">
              <div className="mx-auto max-w-4xl rounded-[32px] border border-white/10 bg-[#0f1720]/92 p-4 text-white shadow-panel backdrop-blur-xl md:p-5">
                <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">Trip ID</div>
                        <div className="mt-1 text-lg font-semibold">#{trip.id.slice(0, 8).toUpperCase()}</div>
                      </div>
                      <div className="rounded-full bg-white/8 px-3 py-1.5 text-sm text-white/80">
                        {isLoadingAmbulances ? "Refreshing units..." : `${nearbyAmbulances.length} units live`}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/8 bg-white/6 p-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-white/10 p-2">
                          <MaterialIcon name="my_location" className="text-[20px] text-white" />
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.24em] text-white/55">Pickup</div>
                          <div className="mt-1 text-sm text-white/85">{trip.pickupAddress}</div>
                        </div>
                      </div>
                      <div className="my-4 h-px bg-white/8" />
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-white/10 p-2">
                          <MaterialIcon name="local_hospital" className="text-[20px] text-white" />
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.24em] text-white/55">Destination</div>
                          <div className="mt-1 text-sm text-white/85">
                            {trip.hospital?.name || trip.destAddress || "Nearest hospital will be assigned after pickup"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between px-1">
                      {[
                        ["Requested", true],
                        ["Matching", "active"],
                        ["En Route", false],
                      ].map(([label, state]) => (
                        <div key={label} className="flex flex-col items-center gap-2">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${
                              state === true
                                ? "bg-white text-[#0f1720]"
                                : state === "active"
                                  ? "border border-[#ffb4ab] bg-[#ff6b74]/12 text-[#ffb4ab]"
                                  : "border border-white/10 bg-white/5 text-white/40"
                            }`}
                          >
                            {state === "active" ? (
                              <div className="h-2.5 w-2.5 rounded-full bg-[#ff6b74]" />
                            ) : (
                              <MaterialIcon name="check" className="text-[16px]" />
                            )}
                          </div>
                          <span className={`text-xs ${state === "active" ? "text-[#ffb4ab]" : "text-white/65"}`}>
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="rounded-[24px] border border-white/8 bg-white/6 p-4">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">Best Match</div>
                      <div className="mt-2 text-lg font-semibold">
                        {featuredAmbulance?.ambulance?.plateNumber || "Ranking available units"}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        {featuredAmbulance?.ambulance?.type || "Traffic-aware dispatch selection"}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.24em] text-white/55">ETA</div>
                          <div className="mt-1 text-lg font-semibold">
                            {routeMetrics?.durationInTrafficText || (featuredAmbulance ? `${featuredAmbulance.estimatedArrivalMinutes} min` : "Calculating")}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.24em] text-white/55">Distance</div>
                          <div className="mt-1 text-lg font-semibold">
                            {routeMetrics?.distanceText || (featuredAmbulance ? `${featuredAmbulance.distanceKm.toFixed(1)} km` : "--")}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button variant="secondary" className="w-full" icon="close" loading={isCancelling} onClick={handleCancel}>
                      Cancel Request
                    </Button>

                    {error ? (
                      <p className="rounded-2xl border border-[#5f2120] bg-[#3a1014]/90 px-4 py-3 text-sm text-[#ffb4ab]">
                        {error}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GoogleMapsLoader>
      </main>
    </div>
  );
}
