import { useEffect, useRef, useState } from "react";
import { fr } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { calendarDate, dayKey, parisDay, slotsOnDay, type BookingSlot } from "@/lib/booking-calendar";

function smoothScrollTo(targetY: number, duration = 500) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    window.scrollTo(0, startY + distance * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function BookingCalendar({
  slots,
  value,
  onChange,
}: {
  slots: BookingSlot[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [day, setDay] = useState<Date>();
  const [month, setMonth] = useState<Date>();
  const hoursRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const selected = slots.find((s) => s.id === value);
    const first = selected ?? slots.find((s) => s.available) ?? slots[0];
    if (first && !day) {
      const date = calendarDate(first.starts_at);
      setDay(date);
      setMonth(date);
    }
    if (value && !selected?.available) onChange("");
  }, [slots, value, day, onChange]);
  const daySlots = day ? slotsOnDay(slots, day) : [];
  const dates = new Set(slots.map((s) => parisDay(s.starts_at)));
  return (
    <div className="booking-calendar">
      <Calendar
        mode="single"
        locale={fr}
        weekStartsOn={1}
        showOutsideDays={false}
        selected={day}
        {...(month ? { month } : {})}
        onMonthChange={setMonth}
        onSelect={(date) => {
          setDay(date);
          onChange("");
          requestAnimationFrame(() => {
            const el = hoursRef.current;
            if (el) smoothScrollTo(el.getBoundingClientRect().top + window.scrollY - 120);
          });
        }}
        disabled={(date) => !dates.has(dayKey(date))}
        className="booking-month"
      />
      <div ref={hoursRef} className="booking-hours" aria-live="polite">
        <h3>
          {day
            ? day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
            : "Choisissez un jour"}
        </h3>
        <div className="booking-time-grid">
          {daySlots.map((s) => {
            const time = new Date(s.starts_at).toLocaleTimeString("fr-FR", {
              timeZone: "Europe/Paris",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <Button
                key={s.id}
                type="button"
                variant={value === s.id ? "default" : "outline"}
                disabled={!s.available}
                aria-pressed={value === s.id}
                aria-label={`${time}${s.available ? "" : " — Créneau non disponible"}`}
                onClick={() => onChange(s.id)}
              >
                <span>{time}</span>
                {!s.available && <small>Indisponible</small>}
              </Button>
            );
          })}
        </div>
        {!daySlots.length && <p>Aucun créneau ouvert pour ce jour.</p>}
        <small className="text-muted-foreground">Heure de Paris</small>
      </div>
    </div>
  );
}
