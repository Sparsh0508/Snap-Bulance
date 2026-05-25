function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function createPinSvg({ background, foreground, glyph, pulse = false }) {
  return svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      ${pulse ? `<circle cx="32" cy="32" r="24" fill="${background}" opacity="0.18" />` : ""}
      <path d="M32 6c-11.6 0-21 9.4-21 21 0 16.8 18.2 29.7 20 31 0.6 0.5 1.5 0.5 2.1 0 1.8-1.3 20-14.2 20-31 0-11.6-9.4-21-21-21z" fill="${background}" />
      <circle cx="32" cy="27" r="13" fill="${foreground}" />
      <text x="32" y="31.5" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="${background}">
        ${glyph}
      </text>
    </svg>
  `);
}

export function getMarkerIcon(type) {
  switch (type) {
    case "ambulance":
      return createPinSvg({ background: "#af101a", foreground: "#ffffff", glyph: "EMS" });
    case "ambulance-als":
      return createPinSvg({ background: "#6d1b7b", foreground: "#ffffff", glyph: "ALS" });
    case "ambulance-ptv":
      return createPinSvg({ background: "#2c7a7b", foreground: "#ffffff", glyph: "PTV" });
    case "user":
      return createPinSvg({ background: "#11651d", foreground: "#ffffff", glyph: "YOU", pulse: true });
    case "destination":
      return createPinSvg({ background: "#0f1720", foreground: "#ffffff", glyph: "GO" });
    case "hospital":
      return createPinSvg({ background: "#2563eb", foreground: "#ffffff", glyph: "ER" });
    default:
      return createPinSvg({ background: "#af101a", foreground: "#ffffff", glyph: "EMS" });
  }
}

export function getAmbulanceMarkerType(ambulanceType) {
  switch (ambulanceType) {
    case "ALS":
      return "ambulance-als";
    case "PTV":
      return "ambulance-ptv";
    default:
      return "ambulance";
  }
}
