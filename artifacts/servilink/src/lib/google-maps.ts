import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// Llave de Google Maps: se inyecta como variable Vite en build time.
// - En dev: VITE_GOOGLE_MAPS_API_KEY del entorno de Replit.
// - En producción: pasada como --build-arg desde cloudbuild.yaml
//   (substitution _VITE_GOOGLE_MAPS_API_KEY).
// Si falta, el cargador falla rápido en consola en lugar de mostrar el
// watermark "For development purposes only" con una llave de prueba.
const API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "";

let _initialized = false;

function ensureInit() {
  if (_initialized) return;
  _initialized = true;
  if (!API_KEY) {
    // eslint-disable-next-line no-console
    console.error(
      "[google-maps] VITE_GOOGLE_MAPS_API_KEY no está definida. El mapa no podrá cargar.",
    );
    return;
  }
  setOptions({ apiKey: API_KEY, version: "weekly" });
}

export async function loadMapsLib() {
  ensureInit();
  return importLibrary("maps") as Promise<google.maps.MapsLibrary>;
}

export async function loadMarkerLib() {
  ensureInit();
  return importLibrary("marker") as Promise<google.maps.MarkerLibrary>;
}

export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#040c1a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#040c1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7a8599" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#152336" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0a1628" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1a3451" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0a1628" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1628" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d5068" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a2540" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c4c4c4" }] },
];
