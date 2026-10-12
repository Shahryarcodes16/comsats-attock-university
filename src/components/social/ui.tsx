import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import { useDesk } from "@/components/timetable/context";
import { Segment } from "@/components/timetable/chrome";
import { campusNow, type CampusNow, type Level } from "@/lib/social/engine";
import { DAY_SHORT, SLOTS } from "@/lib/social/slots";
import { useSocial } from "@/components/social/provider";

/** The campus clock (Pakistan time), ticking with the app's own clock. */
export function useCampus(): CampusNow | null {
  const { now } = useDesk();
  return useMemo(() => (now ? campusNow(now) : null), [now]);
}

export const LEVEL_COPY: Record<Level, { label: string; help: string }> = {
  full: { label: "Full", help: "They see your classes, rooms and teachers." },
  free: { label: "Free slots", help: "They see when you are busy or free, never which class or where." },
  none: { label: "Nothing", help: "They see nothing from your timetable." },
};

export function LevelPicker({
  label,
  value,
  isDefault,
  onChange,
  onReset,
  disabled,
}: {
  label: string;
  value: Level;
  isDefault?: boolean;
  onChange: (level: Level) => void;
  onReset?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="stack level-picker">
      <Segment
        label={label}
        value={value}
        options={(["full", "free", "none"] as Level[]).map((level) => ({
          value: level,
          label: LEVEL_COPY[level].label,
          disabled,
        }))}
        onChange={(next) => onChange(next as Level)}
      />
      <p className="fine">
        {LEVEL_COPY[value].help}
        {isDefault === true ? " (Your default.)" : null}
        {isDefault === false && onReset ? (
          <>
            {" "}
            <button type="button" className="link-btn" onClick={onReset} disabled={disabled}>
              Use my default
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 7;
  return (
    <span className={`avatar ${size} tone-${hash % 3}`} aria-hidden>
      {initial}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-note">
      <b>{title}</b>
      {children ? <span>{children}</span> : null}
    </div>
  );
}

export function Toast() {
  const { notice, dismissNotice } = useSocial();
  if (!notice) return null;
  return (
    <div className={`toast ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <span>{notice.text}</span>
      <button type="button" className="icon-btn tap" aria-label="Dismiss" onClick={dismissNotice}>
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

/**
 * A week of lectures shaded by how many people are free in each. With a total
 * of 2 this is the friend comparison; with a group it shows where the group's
 * free time clusters.
 */
export function AvailabilityGrid({
  freeCount,
  total,
  label,
}: {
  freeCount: (day: number, slot: number) => number;
  total: number;
  label: string;
}) {
  return (
    <div className="avail-grid" role="img" aria-label={label}>
      <span />
      {DAY_SHORT.map((day) => (
        <span key={day} className="hd">
          {day}
        </span>
      ))}
      {SLOTS.map((slot, slotIndex) => (
        <div key={slot.label} className="avail-row">
          <span className="hd">{slot.label}</span>
          {DAY_SHORT.map((day, dayIndex) => {
            const free = freeCount(dayIndex, slotIndex);
            const state = free === total ? "all" : free === 0 ? "none" : "some";
            return (
              <i
                key={day}
                className={`cell ${state}`}
                style={state === "some" ? ({ "--share": free / total }) as CSSProperties : undefined}
              >
                {state === "all" ? "Free" : state === "some" ? `${free}/${total}` : ""}
              </i>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle">
      <span>
        <b>{label}</b>
        {help ? <small>{help}</small> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden />
    </label>
  );
}

/** A destructive action that needs a second tap, so it can't happen by accident. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={armed ? "btn danger tap" : "btn tap"}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
