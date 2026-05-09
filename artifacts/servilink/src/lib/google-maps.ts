import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const API_KEY = "AIzaSyCUk4gxdWBl_w9DPd5C0CDGMgBrEsAWu1U";

let _initialized = false;

function ensureInit() {
  if (_initialized) return;
  _initialized = true;
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
