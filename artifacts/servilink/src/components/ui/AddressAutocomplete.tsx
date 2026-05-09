import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, Search, X } from "lucide-react";

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
    municipality?: string;
    county?: string;
  };
  lat: string;
  lon: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  required?: boolean;
}

function formatVenezuelanAddress(result: NominatimResult): string {
  const a = result.address;
  const parts: string[] = [];
  if (a.road) parts.push(a.road);
  if (a.neighbourhood || a.suburb) parts.push(a.neighbourhood ?? a.suburb ?? "");
  if (a.municipality || a.county || a.city) parts.push(a.municipality ?? a.county ?? a.city ?? "");
  if (a.state) parts.push(a.state);
  return parts.filter(Boolean).join(", ") || result.display_name.split(",").slice(0, 3).join(",").trim();
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Ej: Av. Libertador, Chacao, Caracas",
  required,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", `${q}, Venezuela`);
      url.searchParams.set("countrycodes", "ve");
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "6");
      url.searchParams.set("accept-language", "es");

      const res = await fetch(url.toString(), {
        signal: abortRef.current.signal,
        headers: {
          "User-Agent": "LinkServi/1.0 (service marketplace Venezuela)",
        },
      });
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setSuggestions([]);
        setOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(false);
    onChange(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 400);
  };

  const handleSelect = (result: NominatimResult) => {
    const formatted = formatVenezuelanAddress(result);
    setQuery(formatted);
    onChange(formatted);
    setSelected(true);
    setOpen(false);
    setSuggestions([]);
  };

  const handleClear = () => {
    setQuery("");
    onChange("");
    setSelected(false);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
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
            <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          ) : (
            <Search className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1.5 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
            <MapPin className="w-3 h-3 text-primary" />
            <p className="text-xs text-muted-foreground font-medium">Resultados en Venezuela</p>
          </div>
          <ul>
            {suggestions.map((result) => {
              const a = result.address;
              const main = formatVenezuelanAddress(result);
              const secondary = [a.city ?? a.municipality, a.state].filter(Boolean).join(", ");
              return (
                <li key={result.place_id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(result)}
                    className="w-full text-left px-3 py-3 hover:bg-muted transition-colors flex items-start gap-3 border-b border-border/50 last:border-0"
                  >
                    <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{main}</p>
                      {secondary && <p className="text-xs text-muted-foreground truncate mt-0.5">{secondary}</p>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-3 py-1.5 bg-muted/20 border-t border-border">
            <p className="text-[10px] text-muted-foreground text-center">
              Powered by OpenStreetMap · Datos de Venezuela
            </p>
          </div>
        </div>
      )}

      {!open && !loading && !selected && query.trim().length >= 3 && suggestions.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
          <Search className="w-3 h-3" />
          No se encontraron resultados. Puedes escribir la dirección manualmente.
        </p>
      )}
    </div>
  );
}
