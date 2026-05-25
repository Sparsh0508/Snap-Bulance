import { useJsApiLoader } from "@react-google-maps/api";
import { PageError, PageLoader } from "../ui/PageState";

const libraries = ["places"];

export function GoogleMapsLoader({ children, loadingLabel = "Loading Google Maps..." }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "ambusos-google-maps",
    googleMapsApiKey: apiKey || "missing-key",
    libraries,
  });

  if (!apiKey) {
    return (
      <PageError
        title="Google Maps API key missing"
        message="Set VITE_GOOGLE_MAPS_API_KEY in your frontend environment to enable the live map experience."
      />
    );
  }

  if (loadError) {
    return (
      <PageError
        title="Map failed to load"
        message="Google Maps could not be loaded. Check your API key, billing, and domain restrictions."
      />
    );
  }

  if (!isLoaded) {
    return <PageLoader label={loadingLabel} />;
  }

  return children;
}
