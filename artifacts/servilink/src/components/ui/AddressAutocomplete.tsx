import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, Search, X, LocateFixed, AlertCircle } from "lucide-react";
import { loadPlacesLib, loadGeocodingLib } from "@/lib/google-maps";

export interface SelectedAddress {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
}

interface AddressAutocompleteProps {
  value: string;
  /** Backwards-compatible string callback (still fires for typing + selection). */
  onChange: (address: string) => void;
  /** Fires only when the user picks a real place (with coordinates). */
  onSelect?: (selected: SelectedAddress) => void;
  placeholder?: string;
  required?: boolean;
  /** When true, shows a "Usar mi ubicación actual" button. Default true. */
  showUseMyLocation?: boolean;
}

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

const VENEZUELA_BOUNDS = {
  // sw / ne corners covering all of Venezuela (incl. islands)
  sw: { lat: 0.6, lng: -73.4 },
  ne: { lat: 12.3, lng: -59.8 },
};

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Busca tu calle, urbanización o municipio...",
  required,
  showUseMyLocation = true,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const placesDivRef = useRef<HTMLDivElement | null>(null);

  // Mantener el input sincronizado con el valor del padre
  useEffect(() => { setQuery(value); }, [value]);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Inicializar servicios de Google Places (lazy)
  const ensurePlaces = useCallback(async () => {
    if (autocompleteServiceRef.current && placesServiceRef.current) return;
    await loadPlacesLib();
    autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
    // PlacesService requiere un nodo "attribution" (no necesita ser visible)
    if (!placesDivRef.current) {
      placesDivRef.current = document.createElement("div");
    }
    placesServiceRef.current = new google.maps.places.PlacesService(placesDivRef.current);
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
  }, []);

  const ensureGeocoder = useCallback(async () => {
    if (geocoderRef.current) return;
    await loadGeocodingLib();
    geocoderRef.current = new google.maps.Geocoder();
  }, []);

  // ── Búsqueda de sugerencias ──────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      await ensurePlaces();
      const service = autocompleteServiceRef.current!;
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(VENEZUELA_BOUNDS.sw.lat, VENEZUELA_BOUNDS.sw.lng),
        new google.maps.LatLng(VENEZUELA_BOUNDS.ne.lat, VENEZUELA_BOUNDS.ne.lng),
      );

      const predictions = await new Promise<google.maps.places.AutocompletePrediction[]>(
        (resolve) => {
          service.getPlacePredictions(
            {
              input: q,
              componentRestrictions: { country: "ve" },
              bounds,
              language: "es",
              sessionToken: sessionTokenRef.current!,
            },
            (preds, status) => {
              if (status !== google.maps.places.PlacesServiceStatus.OK || !preds) {
                resolve([]);
              } else {
                resolve(preds);
              }
            },
          );
        },
      );

      const mapped: Suggestion[] = predictions.map((p) => ({
        placeId: p.place_id,
        main: p.structured_formatting?.main_text ?? p.description,
        secondary: p.structured_formatting?.secondary_text ?? "",
      }));
      setSuggestions(mapped);
      setOpen(mapped.length > 0);
    } catch (err) {
      setSuggestions([]);
      setOpen(false);
      setErrorMsg("No se pudo conectar con Google Maps. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  }, [ensurePlaces]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(false);
    onChange(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 350);
  };

  // ── Selección de una sugerencia → obtener detalles (lat/lng) ────────────
  const handleSelect = async (s: Suggestion) => {
    setOpen(false);
    setLoading(true);
    setErrorMsg("");
    try {
      await ensurePlaces();
      const service = placesServiceRef.current!;
      const detail = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
        service.getDetails(
          {
            placeId: s.placeId,
            fields: ["geometry", "formatted_address", "name"],
            sessionToken: sessionTokenRef.current ?? undefined,
            language: "es",
          },
          (place, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
              resolve(null);
            } else {
              resolve(place);
            }
          },
        );
      });

      // Renueva el token de sesión (Google exige uno nuevo tras cada getDetails)
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();

      const formatted = detail?.formatted_address || `${s.main}, ${s.secondary}`.trim();
      setQuery(formatted);
      onChange(formatted);
      setSelected(true);
      setSuggestions([]);

      const loc = detail?.geometry?.location;
      if (loc && onSelect) {
        onSelect({
          address: formatted,
          lat: loc.lat(),
          lng: loc.lng(),
          placeId: s.placeId,
        });
      }
    } catch {
      setErrorMsg("No se pudieron obtener las coordenadas de esta dirección.");
    } finally {
      setLoading(false);
    }
  };

  // ── Botón "Usar mi ubicación actual" ─────────────────────────────────────
  const handleUseMyLocation = async () => {
    if (!navigator.geolocation) {
      setErrorMsg("Tu dispositivo no permite compartir ubicación.");
      return;
    }
    setGpsLoading(true);
    setErrorMsg("");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });
      const { latitude: lat, longitude: lng } = pos.coords;
      await ensureGeocoder();
      const result = await new Promise<google.maps.GeocoderResult | null>((resolve) => {
        geocoderRef.current!.geocode(
          { location: { lat, lng }, language: "es", region: "ve" },
          (results, status) => {
            if (status === "OK" && results && results.length > 0) {
              resolve(results[0]);
            } else {
              resolve(null);
            }
          },
        );
      });
      // Solo aceptamos un resultado real con dirección legible.
      // Si Google solo devuelve "Plus Code" o coordenadas, dejamos el
      // campo vacío para que el cliente escriba su dirección a mano.
      const formatted = (result?.formatted_address ?? "").trim();
      const looksLikePlusCode = /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/i.test(formatted);
      const hasReadableAddress = formatted.length > 0 && !looksLikePlusCode;

      if (hasReadableAddress) {
        setQuery(formatted);
        onChange(formatted);
      } else {
        setQuery("");
        onChange("");
        setErrorMsg(
          "Ubicación capturada. Escribe tu dirección (urbanización, edificio, casa) para que el profesional sepa exactamente dónde llegar.",
        );
      }
      setSelected(hasReadableAddress);
      setSuggestions([]);
      setOpen(false);
      // Las coordenadas siempre se guardan, aunque la dirección esté vacía.
      if (onSelect) {
        onSelect({ address: hasReadableAddress ? formatted : "", lat, lng });
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === 1) setErrorMsg("Permite el acceso a tu ubicación en el navegador para usar esta función.");
      else if (code === 2) setErrorMsg("No se pudo obtener tu ubicación. Activa el GPS e intenta de nuevo.");
      else if (code === 3) setErrorMsg("La búsqueda de tu ubicación tardó demasiado. Intenta de nuevo.");
      else setErrorMsg("No se pudo obtener tu ubicación.");
    } finally {
      setGpsLoading(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    onChange("");
    setSelected(false);
    setSuggestions([]);
    setOpen(false);
    setErrorMsg("");
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className={`w-full pl-9 pr-9 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary
            ${open ? "border-primary" : "border-border"}
            bg-background text-foreground`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          ) : query ? (
            <button type="button" onClick={handleClear} aria-label="Limpiar dirección" className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <Search className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Botón "Usar mi ubicación actual" */}
      {showUseMyLocation && (
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={gpsLoading}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
          style={{
            background: "rgba(6,182,212,0.10)",
            border: "1px solid rgba(6,182,212,0.30)",
            color: "rgb(103,232,249)",
          }}
        >
          {gpsLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Obteniendo tu ubicación...
            </>
          ) : (
            <>
              <LocateFixed className="w-4 h-4" />
              Usar mi ubicación actual
            </>
          )}
        </button>
      )}

      {/* Mensaje de error amigable */}
      {errorMsg && (
        <div className="mt-2 flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Dropdown de sugerencias */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1.5 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
            <MapPin className="w-3 h-3 text-primary" />
            <p className="text-xs text-muted-foreground font-medium">Resultados en Venezuela</p>
          </div>
          <ul>
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => handleSelect(s)}
                  className="w-full text-left px-3 py-3 hover:bg-muted transition-colors flex items-start gap-3 border-b border-border/50 last:border-0"
                >
                  <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.main}</p>
                    {s.secondary && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{s.secondary}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-3 py-1.5 bg-muted/20 border-t border-border">
            <p className="text-[10px] text-muted-foreground text-center">
              Powered by Google · Venezuela
            </p>
          </div>
        </div>
      )}

      {!open && !loading && !selected && query.trim().length >= 3 && suggestions.length === 0 && !errorMsg && (
        <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
          <Search className="w-3 h-3" />
          No se encontraron resultados. Puedes escribir la dirección manualmente.
        </p>
      )}
    </div>
  );
}
