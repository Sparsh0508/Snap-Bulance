import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { BottomNav } from "../../../components/layout/BottomNav";
import { TopBar } from "../../../components/layout/TopBar";
import { AmbulanceLiveMap } from "../../../components/maps/AmbulanceLiveMap";
import { GoogleMapsLoader } from "../../../components/maps/GoogleMapsLoader";
import { GooglePlacesField } from "../../../components/maps/GooglePlacesField";
import { Button } from "../../../components/ui/Button";
import { MaterialIcon } from "../../../components/ui/MaterialIcon";
import { PageLoader } from "../../../components/ui/PageState";
import { getPatientBottomNav } from "../../../data/appData";
import { formatCurrency } from "../../../lib/formatters";
import { getCurrentCoordinates } from "../../../lib/geolocation";
import { getApiErrorMessage } from "../../../services/apiClient";
import { userApi } from "../../../services/appApi";

const DEFAULT_CENTER = { lat: 19.1973, lng: 72.9644 };
const DEFAULT_AMBULANCE_TYPES = ["ALL", "BLS", "ALS", "PTV"];
const FARE_BASE_BY_TYPE = {
  BLS: 420,
  ALS: 680,
  PTV: 280,
  ALL: 420,
};

function getAmbulanceTypeLabel(type) {
  const labels = {
    ALL: "All Units",
    BLS: "Basic Life",
    ALS: "Advanced Life",
    PTV: "Patient Van",
  };

  return labels[type] || type;
}

function buildHeatZones(location) {
  if (!location) {
    return [];
  }

  return [
    {
      id: "zone-primary",
      center: location,
      radius: 900,
      fillColor: "#ff6b74",
      strokeColor: "#ff6b74",
    },
    {
      id: "zone-secondary",
      center: {
        lat: location.lat + 0.006,
        lng: location.lng - 0.004,
      },
      radius: 650,
      fillColor: "#f59e0b",
      strokeColor: "#f59e0b",
    },
    {
      id: "zone-tertiary",
      center: {
        lat: location.lat - 0.005,
        lng: location.lng + 0.006,
      },
      radius: 520,
      fillColor: "#38bdf8",
      strokeColor: "#38bdf8",
    },
  ];
}

export default function PatientHomePage() {
  const navigate = useNavigate();
  const [liveLocation, setLiveLocation] = useState(null);
  const [pickupLocation, setPickupLocation] = useState(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [destinationLocation, setDestinationLocation] = useState(null);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [nearbyAmbulances, setNearbyAmbulances] = useState([]);
  const [selectedAmbulanceType, setSelectedAmbulanceType] = useState("ALL");
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [mapTheme, setMapTheme] = useState("dark");
  const [isCheckingTrip, setIsCheckingTrip] = useState(true);
  const [isSyncingLocation, setIsSyncingLocation] = useState(false);
  const [isLoadingAmbulances, setIsLoadingAmbulances] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const response = await userApi.getActiveTrip();
        const activeTrip = response.data;

        if (activeTrip?.id && isMounted) {
          const nextPath = activeTrip.status === "SEARCHING"
            ? `/patient/request/${activeTrip.id}`
            : `/patient/tracking/${activeTrip.id}`;

          navigate(nextPath, { replace: true });
          return;
        }
      } catch {
        // Keep the booking screen usable even if the active-trip check fails.
      } finally {
        if (isMounted) {
          setIsCheckingTrip(false);
        }
      }

      if (isMounted) {
        await syncLocation();
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!pickupLocation?.lat || !pickupLocation?.lng) {
      setNearbyAmbulances([]);
      return;
    }

    let isMounted = true;

    async function fetchNearbyAmbulances() {
      setIsLoadingAmbulances(true);

      try {
        const response = await userApi.getNearbyAmbulances(pickupLocation.lat, pickupLocation.lng, 10);

        if (isMounted) {
          setNearbyAmbulances(response.data || []);
        }
      } catch (requestError) {
        if (isMounted) {
          setNearbyAmbulances([]);
          toast.error(getApiErrorMessage(requestError, "Unable to load nearby ambulances."));
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

  const ambulanceTypes = useMemo(() => {
    const dynamicTypes = Array.from(
      new Set(
        nearbyAmbulances
          .map((ambulance) => ambulance.ambulance?.type)
          .filter(Boolean),
      ),
    );

    return Array.from(new Set(["ALL", ...dynamicTypes, ...DEFAULT_AMBULANCE_TYPES.slice(1)]));
  }, [nearbyAmbulances]);

  const filteredAmbulances = useMemo(() => {
    if (selectedAmbulanceType === "ALL") {
      return nearbyAmbulances;
    }

    return nearbyAmbulances.filter((ambulance) => ambulance.ambulance?.type === selectedAmbulanceType);
  }, [nearbyAmbulances, selectedAmbulanceType]);

  const featuredAmbulance = filteredAmbulances[0] || nearbyAmbulances[0] || null;

  const distanceKm = useMemo(() => {
    if (routeMetrics?.distanceMeters) {
      return routeMetrics.distanceMeters / 1000;
    }

    return featuredAmbulance?.distanceKm || 0;
  }, [featuredAmbulance?.distanceKm, routeMetrics?.distanceMeters]);

  const etaMinutes = useMemo(() => {
    if (routeMetrics?.durationInTrafficSeconds) {
      return Math.max(1, Math.ceil(routeMetrics.durationInTrafficSeconds / 60));
    }

    if (routeMetrics?.durationSeconds) {
      return Math.max(1, Math.ceil(routeMetrics.durationSeconds / 60));
    }

    return featuredAmbulance?.estimatedArrivalMinutes || null;
  }, [
    featuredAmbulance?.estimatedArrivalMinutes,
    routeMetrics?.durationInTrafficSeconds,
    routeMetrics?.durationSeconds,
  ]);

  const estimatedFare = useMemo(() => {
    const selectedType = featuredAmbulance?.ambulance?.type || selectedAmbulanceType || "BLS";
    const baseFare = FARE_BASE_BY_TYPE[selectedType] ?? FARE_BASE_BY_TYPE.BLS;
    return baseFare + distanceKm * 24;
  }, [distanceKm, featuredAmbulance?.ambulance?.type, selectedAmbulanceType]);

  const heatZones = useMemo(() => buildHeatZones(pickupLocation || liveLocation), [liveLocation, pickupLocation]);

  async function syncLocation() {
    setIsSyncingLocation(true);
    setLocationError("");

    try {
      const coordinates = await getCurrentCoordinates();
      setLiveLocation(coordinates);
      setPickupLocation(coordinates);
      setPickupAddress((current) => current || "Current live location");
    } catch (requestError) {
      const message = getApiErrorMessage(
        requestError,
        "Location access is required to show nearby ambulances. You can still search manually.",
      );
      setLocationError(message);
      toast.error(message);
    } finally {
      setIsSyncingLocation(false);
    }
  }

  async function handleBookAmbulance() {
    if (!pickupLocation?.lat || !pickupLocation?.lng) {
      toast.error("Please set a pickup location before booking.");
      return;
    }

    setIsBooking(true);

    try {
      const response = await userApi.bookTrip({
        lat: pickupLocation.lat,
        lng: pickupLocation.lng,
        destinationAddress: destinationAddress || null,
        destinationLat: destinationLocation?.lat ?? null,
        destinationLng: destinationLocation?.lng ?? null,
      });

      toast.success("Ambulance request created. We are finding the nearest unit now.");
      navigate(`/patient/request/${response.data.id}`, { replace: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, "Unable to create an ambulance request right now."));
    } finally {
      setIsBooking(false);
    }
  }

  async function handleShareLocation() {
    const location = pickupLocation || liveLocation;

    if (!location) {
      toast.error("Set a pickup location first so it can be shared.");
      return;
    }

    const shareText = `Emergency pickup location: ${pickupAddress || "Current live location"} (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "AmbuSOS live location",
          text: shareText,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        toast.success("Pickup details copied to clipboard.");
        return;
      }
    } catch {
      // Fall back to a toast below.
    }

    toast.info(shareText);
  }

  function handleCall() {
    const phone = featuredAmbulance?.user?.phone;

    if (phone) {
      window.location.href = `tel:${phone}`;
      return;
    }

    toast.info("No driver is assigned yet. Please use this once a live unit is available.");
  }

  if (isCheckingTrip) {
    return <PageLoader label="Preparing live emergency map..." />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar sticky />

      <main className="relative flex flex-1 flex-col overflow-hidden pb-16 md:pb-0">
        <GoogleMapsLoader loadingLabel="Loading live ambulance map...">
          <div className="relative flex-1">
            <AmbulanceLiveMap
              ambulances={filteredAmbulances}
              center={pickupLocation || liveLocation || DEFAULT_CENTER}
              className="h-full rounded-none"
              destinationLocation={destinationLocation}
              heatZones={heatZones}
              onCurrentLocation={syncLocation}
              onRouteMetrics={setRouteMetrics}
              routeDestination={pickupLocation || liveLocation}
              routeOrigin={featuredAmbulance?.location || null}
              showTraffic
              theme={mapTheme}
              userLocation={pickupLocation || liveLocation}
              zoom={13}
            />

            <div className="absolute inset-x-0 top-0 z-20 px-4 pb-3 pt-4 md:px-6 md:pt-6">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="max-w-[80%] rounded-3xl border border-white/10 bg-[#0f1720]/88 px-4 py-3 text-white shadow-panel backdrop-blur-md">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-white/60">
                      <MaterialIcon name="emergency" className="text-[16px]" />
                      Live Dispatch
                    </div>
                    <h1 className="mt-1 text-xl font-semibold md:text-2xl">Ambulance booking with live tracking</h1>
                    <p className="mt-1 text-sm text-white/70">
                      Choose pickup and destination, compare nearby units, and dispatch the nearest ambulance in real time.
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

                <div className="mx-auto w-full max-w-5xl rounded-[28px] border border-white/10 bg-[#0f1720]/86 p-3 shadow-panel backdrop-blur-xl md:p-4">
                  <div className="grid gap-3 md:grid-cols-[1.2fr_1.2fr_auto]">
                    <GooglePlacesField
                      icon="my_location"
                      label="Pickup"
                      onChange={setPickupAddress}
                      onPlaceSelect={({ address, lat, lng }) => {
                        setPickupAddress(address);
                        setPickupLocation({ lat, lng });
                      }}
                      placeholder="Search pickup point"
                      value={pickupAddress}
                    />
                    <GooglePlacesField
                      icon="local_hospital"
                      label="Destination"
                      onChange={setDestinationAddress}
                      onPlaceSelect={({ address, lat, lng }) => {
                        setDestinationAddress(address);
                        setDestinationLocation({ lat, lng });
                      }}
                      placeholder="Hospital or destination"
                      value={destinationAddress}
                    />
                    <Button
                      className="w-full self-end whitespace-nowrap md:w-auto"
                      icon="my_location"
                      loading={isSyncingLocation}
                      onClick={syncLocation}
                    >
                      Use Current
                    </Button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium text-white/80">
                      {isLoadingAmbulances ? "Refreshing nearby ambulances..." : `${nearbyAmbulances.length} units online`}
                    </div>
                    <div className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium text-white/80">
                      {etaMinutes ? `${etaMinutes} min arrival` : "ETA will appear once a route is ready"}
                    </div>
                    <div className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium text-white/80">
                      {distanceKm ? `${distanceKm.toFixed(1)} km away` : "Waiting for dispatch route"}
                    </div>
                    {locationError ? (
                      <div className="rounded-full bg-[#3a1014] px-3 py-1.5 text-xs font-medium text-[#ffb4ab]">
                        {locationError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-5 md:px-6 md:pb-6">
              <div className="mx-auto w-full max-w-5xl rounded-[32px] border border-white/10 bg-[#0f1720]/90 p-4 text-white shadow-panel backdrop-blur-xl md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-white/60">
                      <MaterialIcon name="local_taxi" className="text-[16px]" />
                      Booking Panel
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ambulanceTypes.map((type) => {
                        const isActive = selectedAmbulanceType === type;
                        return (
                          <button
                            key={type}
                            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                              isActive
                                ? "bg-white text-[#0f1720]"
                                : "border border-white/10 bg-white/6 text-white/80 hover:bg-white/12"
                            }`}
                            onClick={() => setSelectedAmbulanceType(type)}
                            type="button"
                          >
                            {getAmbulanceTypeLabel(type)}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/8 bg-white/6 p-3">
                        <div className="text-xs uppercase tracking-[0.24em] text-white/55">Nearest Unit</div>
                        <div className="mt-2 text-lg font-semibold">
                          {featuredAmbulance?.ambulance?.plateNumber || "Searching"}
                        </div>
                        <div className="mt-1 text-sm text-white/70">
                          {featuredAmbulance?.ambulance?.type || "Dispatching best match"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/6 p-3">
                        <div className="text-xs uppercase tracking-[0.24em] text-white/55">Arrival Estimate</div>
                        <div className="mt-2 text-lg font-semibold">
                          {etaMinutes ? `${etaMinutes} min` : "Calculating"}
                        </div>
                        <div className="mt-1 text-sm text-white/70">
                          {routeMetrics?.durationInTrafficText || "Traffic-aware routing"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-white/6 p-3">
                        <div className="text-xs uppercase tracking-[0.24em] text-white/55">Estimated Fare</div>
                        <div className="mt-2 text-lg font-semibold">{formatCurrency(estimatedFare)}</div>
                        <div className="mt-1 text-sm text-white/70">
                          {routeMetrics?.distanceText || (distanceKm ? `${distanceKm.toFixed(1)} km trip` : "Route preview pending")}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-[320px]">
                    <div className="rounded-[28px] border border-white/8 bg-white/6 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs uppercase tracking-[0.24em] text-white/55">Dispatch Readiness</div>
                          <div className="mt-1 text-lg font-semibold">
                            {pickupAddress || "Set your pickup location"}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[#ff6b74]/15 px-3 py-2 text-sm font-medium text-[#ffb4ab]">
                          {nearbyAmbulances.length ? `${nearbyAmbulances.length} nearby` : "Standby"}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <Button
                          className="w-full"
                          icon="call"
                          onClick={handleCall}
                          variant="soft"
                        >
                          Call Driver
                        </Button>
                        <Button
                          className="w-full"
                          icon="share"
                          onClick={handleShareLocation}
                          variant="soft"
                        >
                          Share Trip
                        </Button>
                      </div>

                      <Button
                        className="mt-3 w-full py-3 text-base"
                        icon="local_shipping"
                        loading={isBooking}
                        onClick={handleBookAmbulance}
                      >
                        Book Ambulance
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GoogleMapsLoader>
      </main>

      <BottomNav items={getPatientBottomNav("Map")} />
    </div>
  );
}
