import { useEffect, useRef, useState } from "react";
import { Copy, Pin, X } from "lucide-react";
import { useDesk, type Detail } from "@/components/timetable/context";
import { WeekGrid } from "@/components/timetable/week-grid";
import {
  DAYS,
  SLOTS,
  WEEK_CELLS,
  batches,
  forBatch,
  forRoom,
  forSubject,
  forTeacher,
  formatSchedule,
  programOf,
  rangeLabel,
  roomGroup,
  roomLoad,
  rooms,
  subjects,
  teachers,
  teachingLoad,
} from "@/lib/schedule";

export function DetailSheet() {
  const { detail, close } = useDesk();
  const [shown, setShown] = useState<Detail | null>(null);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (detail) {
      setShown(detail);
      const frame = window.requestAnimationFrame(() => setOpen(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setOpen(false);
    const timer = window.setTimeout(() => setShown(null), 300);
    return () => window.clearTimeout(timer);
  }, [detail]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const root = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () =>
      [...root.querySelectorAll<HTMLElement>("button, select, a, input, textarea")].filter(
        (node) => !node.hasAttribute("disabled"),
      );
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, shown]);

  if (!shown) return null;

  return (
    <div className={open ? "sheet-root open" : "sheet-root"}>
      <button type="button" className="sheet-back" aria-label="Close details" onClick={close} />
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        inert={open ? undefined : true}
      >
        <div className="sheet-bar">
          <div>
            <p className="eyebrow">{eyebrow(shown)}</p>
            <h2 id="sheet-title" className="section-title">
              {titleOf(shown)}
            </h2>
          </div>
          <button type="button" className="icon-btn tap" aria-label="Close" onClick={close}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="sheet-body">
          <SheetBody detail={shown} />
        </div>
      </div>
    </div>
  );
}

function eyebrow(detail: Detail): string {
  if (detail.type === "room") return roomGroup(rooms[detail.id] ?? "");
  if (detail.type === "teacher") return "Faculty";
  if (detail.type === "batch") return programOf(batches[detail.id] ?? "");
  return "Subject";
}

function titleOf(detail: Detail): string {
  if (detail.type === "room") return rooms[detail.id] ?? "Room";
  if (detail.type === "teacher") return teachers[detail.id] ?? "Faculty";
  if (detail.type === "batch") return batches[detail.id] ?? "Batch";
  return subjects[detail.id] ?? "Subject";
}

function SheetBody({ detail }: { detail: Detail }) {
  const { clock, open, pinBatch, pinnedBatch, pinnedTeachers, togglePinTeacher } = useDesk();
  const [copied, setCopied] = useState(false);

  async function copy(title: string, list: Parameters<typeof formatSchedule>[1]) {
    try {
      await navigator.clipboard.writeText(formatSchedule(title, list));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (detail.type === "room") {
    const list = forRoom(detail.id);
    const load = roomLoad(detail.id);
    return (
      <div className="stack">
        <p className="quiet">
          In use for {load} of {WEEK_CELLS} lectures.
        </p>
        <div className="meter" aria-hidden>
          <span style={{ width: `${Math.round((load / WEEK_CELLS) * 100)}%` }} />
        </div>
        <WeekGrid
          list={list}
          focusDay={clock.focusDay}
          liveDay={clock.dayIndex}
          liveSlot={clock.liveSlot}
          caption={(entry) =>
            [batches[entry.batch], entry.teacher >= 0 ? teachers[entry.teacher] : ""].filter(Boolean).join(" · ")
          }
        />
      </div>
    );
  }

  if (detail.type === "teacher") {
    const list = forTeacher(detail.id);
    const load = teachingLoad(detail.id);
    const pinned = pinnedTeachers.includes(detail.id);
    const names = [...new Set(list.map((entry) => batches[entry.batch]))];
    return (
      <div className="stack">
        <p className="quiet">
          {load} teaching hours this week
          {names.length ? ` · ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}` : ""}
        </p>
        <div className="meter" aria-hidden>
          <span style={{ width: `${Math.round((load / WEEK_CELLS) * 100)}%` }} />
        </div>
        <div className="row-actions">
          <button type="button" className="btn tap" onClick={() => togglePinTeacher(detail.id)}>
            <Pin size={16} aria-hidden />
            {pinned ? "Unpin" : "Pin to Today"}
          </button>
          <button type="button" className="btn tap" onClick={() => copy(teachers[detail.id], list)}>
            <Copy size={16} aria-hidden />
            {copied ? "Copied" : "Copy week"}
          </button>
        </div>
        <WeekGrid
          list={list}
          focusDay={clock.focusDay}
          liveDay={clock.dayIndex}
          liveSlot={clock.liveSlot}
          caption={(entry) =>
            [batches[entry.batch], entry.room >= 0 ? rooms[entry.room] : ""].filter(Boolean).join(" · ")
          }
        />
      </div>
    );
  }

  if (detail.type === "batch") {
    const list = forBatch(detail.id);
    const pinned = pinnedBatch === detail.id;
    return (
      <div className="stack">
        <div className="row-actions">
          <button type="button" className="btn tap" onClick={() => pinBatch(pinned ? null : detail.id)}>
            <Pin size={16} aria-hidden />
            {pinned ? "Unpin" : "Pin to Today"}
          </button>
          <button type="button" className="btn tap" onClick={() => copy(batches[detail.id], list)}>
            <Copy size={16} aria-hidden />
            {copied ? "Copied" : "Copy week"}
          </button>
        </div>
        <WeekGrid
          list={list}
          focusDay={clock.focusDay}
          liveDay={clock.dayIndex}
          liveSlot={clock.liveSlot}
          caption={(entry) =>
            [entry.teacher >= 0 ? teachers[entry.teacher] : "", entry.room >= 0 ? rooms[entry.room] : ""]
              .filter(Boolean)
              .join(" · ")
          }
        />
      </div>
    );
  }

  const offerings = forSubject(detail.id)
    .slice()
    .sort((a, b) => a.day - b.day || a.slot - b.slot || a.batch - b.batch);

  return (
    <div className="stack">
      <p className="quiet">{offerings.length} listings on the sheet, including repeaters.</p>
      {offerings.map((entry) => (
        <article
          key={`${entry.day}-${entry.slot}-${entry.batch}-${entry.teacher}-${entry.room}-${entry.repeater}`}
          className="offer"
        >
          <strong>
            {DAYS[entry.day]} · {SLOTS[entry.slot].label} · {rangeLabel(entry.slot)}
          </strong>
          <small>{entry.repeater ? "Repeater section" : "Regular section"}</small>
          <div className="links">
            <button type="button" className="btn tap" onClick={() => open({ type: "batch", id: entry.batch })}>
              {batches[entry.batch]}
            </button>
            {entry.teacher >= 0 ? (
              <button type="button" className="btn tap" onClick={() => open({ type: "teacher", id: entry.teacher })}>
                {teachers[entry.teacher]}
              </button>
            ) : null}
            {entry.room >= 0 ? (
              <button type="button" className="btn tap" onClick={() => open({ type: "room", id: entry.room })}>
                {rooms[entry.room]}
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
