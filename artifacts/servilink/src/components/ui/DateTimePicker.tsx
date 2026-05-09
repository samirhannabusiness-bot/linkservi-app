import { useState, useRef, useEffect } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Clock, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";

interface DateTimePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  minDate?: Date;
  placeholder?: string;
  disabled?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

export function DateTimePicker({
  value,
  onChange,
  minDate,
  placeholder = "Seleccionar fecha y hora",
  disabled,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value);
  const [hour, setHour] = useState(value ? value.getHours() : 8);
  const [minute, setMinute] = useState(value ? value.getMinutes() : 0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) {
      setSelectedDate(undefined);
      onChange(undefined);
      return;
    }
    const combined = setMinutes(setHours(day, hour), minute);
    setSelectedDate(combined);
    onChange(combined);
  };

  const handleTimeChange = (newHour: number, newMinute: number) => {
    setHour(newHour);
    setMinute(newMinute);
    if (selectedDate) {
      const combined = setMinutes(setHours(selectedDate, newHour), newMinute);
      setSelectedDate(combined);
      onChange(combined);
    }
  };

  const displayLabel = value
    ? format(value, "EEEE d 'de' MMMM · HH:mm", { locale: es })
    : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-all
          ${open ? "border-primary ring-2 ring-primary/20" : "border-border"}
          bg-background text-foreground focus:outline-none disabled:opacity-50`}
      >
        <CalendarIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className={`flex-1 ${!displayLabel ? "text-muted-foreground" : ""}`}>
          {displayLabel ?? placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selecciona el día</p>
          </div>

          <div className="flex justify-center py-1">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDaySelect}
              disabled={minDate ? (d) => d < minDate : undefined}
              locale={es}
              captionLayout="dropdown"
            />
          </div>

          <div className="border-t border-border p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hora preferida</p>
              <span className="ml-auto text-sm font-bold text-foreground">
                {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Hora</p>
                <div className="h-36 overflow-y-auto rounded-xl border border-border bg-background">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleTimeChange(h, minute)}
                      className={`w-full px-3 py-1.5 text-sm text-left transition-colors
                        ${h === hour
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-foreground hover:bg-muted"}`}
                    >
                      {String(h).padStart(2, "0")}:00
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Minutos</p>
                <div className="rounded-xl border border-border bg-background overflow-hidden">
                  {MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleTimeChange(hour, m)}
                      className={`w-full px-3 py-2.5 text-sm text-left transition-colors
                        ${m === minute
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-foreground hover:bg-muted"}`}
                    >
                      :{String(m).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 p-3 border-t border-border">
            <button
              type="button"
              onClick={() => {
                setSelectedDate(undefined);
                onChange(undefined);
                setOpen(false);
              }}
              className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Sin fecha
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
