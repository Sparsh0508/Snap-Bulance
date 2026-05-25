import { useEffect, useState } from "react";
import { Autocomplete } from "@react-google-maps/api";
import { cn } from "../../lib/utils";
import { MaterialIcon } from "../ui/MaterialIcon";

export function GooglePlacesField({
  className = "",
  icon,
  inputClassName = "",
  label,
  onPlaceSelect,
  placeholder,
  value,
  onChange,
}) {
  const [autocomplete, setAutocomplete] = useState(null);
  const [localValue, setLocalValue] = useState(value || "");

  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  function handlePlaceChanged() {
    if (!autocomplete) {
      return;
    }

    const place = autocomplete.getPlace();
    const geometry = place?.geometry?.location;

    if (!geometry) {
      return;
    }

    const address = place.formatted_address || place.name || localValue;

    onPlaceSelect?.({
      address,
      lat: geometry.lat(),
      lng: geometry.lng(),
      place,
    });
  }

  return (
    <label className={cn("flex flex-col gap-2", className)}>
      {label ? <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</span> : null}
      <Autocomplete onLoad={setAutocomplete} onPlaceChanged={handlePlaceChanged}>
        <div className="relative">
          {icon ? (
            <MaterialIcon
              name={icon}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-secondary"
            />
          ) : null}
          <input
            className={cn(
              "w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-body-md text-on-surface shadow-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary",
              icon && "pl-10",
              inputClassName,
            )}
            onChange={(event) => {
              setLocalValue(event.target.value);
              onChange?.(event.target.value);
            }}
            placeholder={placeholder}
            value={localValue}
          />
        </div>
      </Autocomplete>
    </label>
  );
}
