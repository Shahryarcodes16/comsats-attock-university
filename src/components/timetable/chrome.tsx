import type { CSSProperties, ReactNode } from "react";
import { Clock, DoorOpen, GraduationCap, Moon, Search, Sun, Users, UsersRound } from "lucide-react";
import crest from "@/assets/crest.png";
import {
  DAY_SHORT,
  DAYS,
  SLOTS,
  greeting,
  rangeLabel,
  type ClockInfo,
} from "@/lib/schedule";
import { useDesk, type View } from "@/components/timetable/context";
import { useSocial } from "@/components/social/provider";

const NAV: { id: View; label: string; icon: typeof Clock }[] = [
  { id: "today", label: "Today", icon: Clock },
  { id: "rooms", label: "Rooms", icon: DoorOpen },
  { id: "faculty", label: "Faculty", icon: GraduationCap },
  { id: "batches", label: "Batches", icon: Users },
  { id: "find", label: "Find", icon: Search },
  { id: "friends", label: "Friends", icon: UsersRound },
];

function InboxDot() {
  const { inbox } = useSocial();
  if (inbox === 0) return null;
  return (
    <b className="nav-badge" aria-label={`${inbox} waiting`}>
      {inbox > 9 ? "9+" : inbox}
    </b>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <img className="crest" src={crest} alt="COMSATS University Islamabad" />
      <div>
        <p className="eyebrow">COMSATS</p>
        <p className="brand-name">Attock</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { view, setView } = useDesk();
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="side-nav" aria-label="Sections">
        {NAV.map((item) => {
          const Icon = item.icon;
          const on = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={on ? "side-link on" : "side-link"}
              aria-current={on ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden />
              {item.label}
              {item.id === "friends" ? <InboxDot /> : null}
            </button>
          );
        })}
      </nav>
      <p className="side-foot">
        Timetable w.e.f. 5 Oct 2026.
        <br />
        Developed by Shahryar.
      </p>
    </aside>
  );
}

export function Topbar() {
  const { now, theme, toggleTheme } = useDesk();
  const ink = theme === "ink";
  return (
    <header className="topbar">
      <div>
        <div className="mobile-brand brand">
          <img className="crest" src={crest} alt="" />
          <div>
            <p className="eyebrow">Attock Campus</p>
            <p className="brand-name">Timetable</p>
          </div>
        </div>
        <p className="hello">{greeting(now)}</p>
      </div>
      <button
        type="button"
        className="icon-btn tap"
        aria-label={ink ? "Use the paper theme" : "Use the ink theme"}
        onClick={toggleTheme}
      >
        <span className="icon-swap">
          <span className={ink ? "off" : ""}>
            <Moon size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <span className={ink ? "" : "off"}>
            <Sun size={18} strokeWidth={1.75} aria-hidden />
          </span>
        </span>
      </button>
    </header>
  );
}

export function Dock() {
  const { view, setView } = useDesk();
  const index = NAV.findIndex((item) => item.id === view);
  return (
    <nav className="dock" aria-label="Sections" style={{ "--i": index, "--n": NAV.length } as CSSProperties}>
      <i className="dock-thumb" aria-hidden />
      {NAV.map((item) => {
        const Icon = item.icon;
        const on = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={on ? "on" : undefined}
            aria-current={on ? "page" : undefined}
            onClick={() => setView(item.id)}
          >
            <span className="dock-icon">
              <Icon size={18} strokeWidth={1.75} aria-hidden />
              {item.id === "friends" ? <InboxDot /> : null}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

export function Segment({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: ReactNode; disabled?: boolean; mark?: boolean }[];
  onChange: (value: string) => void;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div
      className="seg"
      role="tablist"
      aria-label={label}
      style={{ "--n": options.length, "--i": index } as CSSProperties}
    >
      <i className="seg-thumb" aria-hidden />
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={option.disabled}
            className={[on ? "on" : "", option.mark ? "mark" : ""].filter(Boolean).join(" ")}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function showingCopy(
  day: number,
  slot: number,
  following: boolean,
  clock: ClockInfo,
): string {
  const when = `${DAYS[day]}, ${SLOTS[slot].label} (${rangeLabel(slot)})`;
  if (clock.phase === "loading") return "Reading the campus clock…";
  if (!following) return `Showing ${when}`;
  if (clock.phase === "live") return `Right now · ${when}`;
  if (clock.phase === "weekend") return `Weekend preview · ${when}`;
  if (clock.phase === "after") return `Last lecture today · ${when}`;
  return `Coming up · ${when}`;
}

export function DaySlotBar() {
  const { day, slot, setDay, setSlot, clock, following, backToNow } = useDesk();
  return (
    <div className="stack">
      <Segment
        label="Day"
        value={String(day)}
        onChange={(value) => setDay(Number(value))}
        options={DAY_SHORT.map((label, index) => ({
          value: String(index),
          label,
          mark: clock.dayIndex === index,
        }))}
      />
      <Segment
        label="Lecture"
        value={String(slot)}
        onChange={(value) => setSlot(Number(value))}
        options={SLOTS.map((item, index) => ({
          value: String(index),
          label: (
            <>
              {item.label}
              <small>{item.start}</small>
            </>
          ),
          mark: clock.dayIndex === day && clock.liveSlot === index,
        }))}
      />
      <div className="status">
        <span>{showingCopy(day, slot, following, clock)}</span>
        {following ? null : (
          <button type="button" className="btn tap" onClick={backToNow}>
            Back to now
          </button>
        )}
      </div>
    </div>
  );
}
