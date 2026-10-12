import { useEffect, useMemo, useState } from "react";
import { Clock, Copy, Pin, Printer, Search } from "lucide-react";
import { DaySlotBar, Segment } from "@/components/timetable/chrome";
import { ClassList } from "@/components/timetable/class-list";
import { useDesk } from "@/components/timetable/context";
import { WeekGrid } from "@/components/timetable/week-grid";
import {
  ROOM_GROUPS,
  WEEK_CELLS,
  at,
  batches,
  batchesInProgram,
  batchLoad,
  clockFace,
  DAYS,
  forBatch,
  forRoom,
  forSubject,
  forTeacher,
  formatSchedule,
  groupBySlot,
  isFree,
  mutualFree,
  programs,
  programOf,
  roomGroup,
  rooms,
  searchCatalog,
  summarize,
  teachers,
  teachingLoad,
  type RoomGroup,
} from "@/lib/schedule";

function Meter({ value }: { value: number }) {
  return (
    <div className="meter" aria-hidden>
      <span style={{ width: `${Math.round((value / WEEK_CELLS) * 100)}%` }} />
    </div>
  );
}

export function TodayView() {
  const {
    now,
    clock,
    ready,
    day,
    slot,
    pinnedBatch,
    pinBatch,
    batchId,
    setBatchId,
    pinnedTeachers,
    open,
    setView,
  } = useDesk();
  const cell = at(day, slot);
  const busyRooms = new Set(cell.map((entry) => entry.room).filter((id) => id >= 0));
  const busyTeachers = new Set(cell.map((entry) => entry.teacher).filter((id) => id >= 0));
  const mine = pinnedBatch === null ? [] : forBatch(pinnedBatch);

  return (
    <div className="page">
      <section className="hero">
        <p className="kicker">
          <i className={clock.phase === "live" ? "pip live" : "pip"} aria-hidden />
          {clock.phase === "live" ? "In session" : "Campus clock"}
        </p>
        <h1 className="display">{clock.phase === "loading" ? "Attock Campus" : clockFace(now)}</h1>
        <p className="lede">
          <strong>{clock.headline}.</strong> {clock.detail}
        </p>
        <div className="stats">
          <button type="button" className="stat tap" onClick={() => setView("batches")}>
            <b>{cell.length}</b>
            <span>Classes this lecture</span>
          </button>
          <button type="button" className="stat tap" onClick={() => setView("rooms")}>
            <b>{rooms.length - busyRooms.size}</b>
            <span>Rooms free</span>
          </button>
          <button type="button" className="stat tap" onClick={() => setView("faculty")}>
            <b>{teachers.length - busyTeachers.size}</b>
            <span>Faculty free</span>
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>My batch</h2>
          {pinnedBatch !== null ? (
            <button type="button" className="btn tap" onClick={() => pinBatch(null)}>
              Unpin
            </button>
          ) : null}
        </div>
        {!ready ? (
          <p className="quiet">Opening your desk…</p>
        ) : pinnedBatch === null ? (
          <div className="stack">
            <p className="quiet">Pin a batch and today’s classes stay on this page.</p>
            <label className="stack">
              <span className="quiet">Batch</span>
              <select
                className="select"
                aria-label="Batch to pin"
                value={batchId}
                onChange={(event) => setBatchId(Number(event.target.value))}
              >
                {programs.map((program) => (
                  <optgroup key={program} label={program}>
                    {batchesInProgram(program).map((id) => (
                      <option key={id} value={id}>
                        {batches[id]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="button" className="btn solid tap" onClick={() => pinBatch(batchId)}>
              <Pin size={16} aria-hidden />
              Pin {batches[batchId]}
            </button>
          </div>
        ) : (
          <div className="stack">
            <p className="quiet">
              {batches[pinnedBatch]} · {batchLoad(pinnedBatch)} lectures this week
            </p>
            <ClassList list={mine} day={day} who="batch" />
            <button type="button" className="btn tap" onClick={() => setView("batches")}>
              Open the full week
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Watching</h2>
          <button type="button" className="btn tap" onClick={() => setView("faculty")}>
            Faculty
          </button>
        </div>
        {pinnedTeachers.length === 0 ? (
          <p className="quiet">Pin faculty from their week and their current lecture shows up here.</p>
        ) : (
          <div className="stack">
            {pinnedTeachers.map((id) => {
              const hits = groupBySlot(forTeacher(id), day, slot);
              return (
                <button key={id} type="button" className="watch tap" onClick={() => open({ type: "teacher", id })}>
                  <span>
                    <b>{teachers[id]}</b>
                    <span className="sub">
                      {hits.length === 0 ? "Free this lecture" : summarize(hits)}
                    </span>
                  </span>
                  <Clock size={16} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
      </section>
      <p className="fine">
        Only rooms and teachers on the published sheet are listed. Make-up classes are not included, so confirm
        before you go.
      </p>
    </div>
  );
}

export function RoomsView() {
  const { day, slot, open } = useDesk();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"free" | "busy">("free");
  const [group, setGroup] = useState<"All" | RoomGroup>("All");
  const [span, setSpan] = useState<1 | 2>(1);
  const effectiveSpan: 1 | 2 = slot === 4 ? 1 : span;

  const occupied = useMemo(() => {
    const map = new Map<number, ReturnType<typeof at>>();
    for (const entry of at(day, slot)) {
      if (entry.room < 0) continue;
      const list = map.get(entry.room);
      if (list) list.push(entry);
      else map.set(entry.room, [entry]);
    }
    return map;
  }, [day, slot]);

  const needle = query.trim().toLowerCase();
  const matched = rooms
    .map((label, id) => ({ id, label }))
    .filter((room) => (group === "All" ? true : roomGroup(room.label) === group))
    .filter((room) => room.label.toLowerCase().includes(needle));

  const free = matched.filter((room) => isFree(forRoom(room.id), day, slot, effectiveSpan));
  const busy = matched.filter((room) => occupied.has(room.id));

  return (
    <div className="page">
      <div className="panel-head">
        <h1 className="section-title">Rooms</h1>
      </div>
      <DaySlotBar />
      {day === 2 && slot === 1 ? (
        <p className="note">
          Wednesday 10:00–11:30 is the activity slot. A few regular classes are still on the sheet, so free counts
          follow those listings.
        </p>
      ) : null}
      <label className="search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder="Search a room"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="chips" role="tablist" aria-label="Room type">
        {(["All", ...ROOM_GROUPS] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={group === item ? "chip on" : "chip"}
            onClick={() => setGroup(item)}
          >
            {item === "Lecture halls"
              ? "Halls"
              : item === "Lecture theatres"
                ? "Theatres"
                : item === "Classrooms"
                  ? "Classrooms"
                  : item === "Labs"
                    ? "Labs"
                    : "All"}
          </button>
        ))}
      </div>
      <Segment
        label="How long the room should be free"
        value={effectiveSpan === 2 ? "2" : "1"}
        onChange={(value) => setSpan(value === "2" ? 2 : 1)}
        options={[
          { value: "1", label: "This lecture" },
          { value: "2", label: "And the next", disabled: slot === 4 },
        ]}
      />
      <Segment
        label="Free or busy"
        value={mode}
        onChange={(value) => setMode(value === "busy" ? "busy" : "free")}
        options={[
          { value: "free", label: `Free ${free.length}` },
          { value: "busy", label: `Busy ${busy.length}` },
        ]}
      />
      {mode === "free" ? (
        free.length === 0 ? (
          <p className="quiet">No open room matches this filter.</p>
        ) : (
          ROOM_GROUPS.map((name) => {
            const list = free.filter((room) => roomGroup(room.label) === name);
            if (list.length === 0) return null;
            return (
              <section key={name}>
                <h2 className="group-label">
                  {name}
                  <span>{list.length}</span>
                </h2>
                <div className="tile-grid">
                  {list.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className="tile tap"
                      onClick={() => open({ type: "room", id: room.id })}
                    >
                      <i className="dot" aria-hidden />
                      {room.label}
                    </button>
                  ))}
                </div>
              </section>
            );
          })
        )
      ) : busy.length === 0 ? (
        <p className="quiet">No busy room matches this filter.</p>
      ) : (
        <div className="stack">
          {busy.map((room) => (
            <button
              key={room.id}
              type="button"
              className="busy-row tap"
              onClick={() => open({ type: "room", id: room.id })}
            >
              <b>{room.label}</b>
              <span>{summarize(occupied.get(room.id) ?? [])}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FacultyView() {
  const { day, slot, open, pinnedTeachers } = useDesk();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"free" | "busy">("free");
  const [sort, setSort] = useState<"az" | "light">("az");
  const needle = query.trim().toLowerCase();

  const occupied = useMemo(() => {
    const map = new Map<number, ReturnType<typeof at>>();
    for (const entry of at(day, slot)) {
      if (entry.teacher < 0) continue;
      const list = map.get(entry.teacher);
      if (list) list.push(entry);
      else map.set(entry.teacher, [entry]);
    }
    return map;
  }, [day, slot]);

  const order = (left: number, right: number) => {
    if (sort === "light") {
      const diff = teachingLoad(left) - teachingLoad(right);
      if (diff !== 0) return diff;
    }
    return teachers[left].localeCompare(teachers[right]);
  };

  const matched = teachers
    .map((label, id) => ({ id, label }))
    .filter((person) => person.label.toLowerCase().includes(needle))
    .sort((a, b) => order(a.id, b.id));
  const free = matched.filter((person) => isFree(forTeacher(person.id), day, slot, 1));
  const busy = matched.filter((person) => occupied.has(person.id));

  return (
    <div className="page">
      <div className="panel-head">
        <h1 className="section-title">Faculty</h1>
      </div>
      <DaySlotBar />
      <label className="search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder="Search faculty"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <Segment
        label="Sort"
        value={sort}
        onChange={(value) => setSort(value === "light" ? "light" : "az")}
        options={[
          { value: "az", label: "A to Z" },
          { value: "light", label: "Lightest week" },
        ]}
      />
      <Segment
        label="Free or busy"
        value={mode}
        onChange={(value) => setMode(value === "busy" ? "busy" : "free")}
        options={[
          { value: "free", label: `Free ${free.length}` },
          { value: "busy", label: `Busy ${busy.length}` },
        ]}
      />
      {mode === "free" ? (
        free.length === 0 ? (
          <p className="quiet">No free faculty member matches this search.</p>
        ) : (
          <div className="people">
            {free.map((person) => (
              <button
                key={person.id}
                type="button"
                className="person tap"
                onClick={() => open({ type: "teacher", id: person.id })}
              >
                {person.label}
                {pinnedTeachers.includes(person.id) ? " · pinned" : ""}
              </button>
            ))}
          </div>
        )
      ) : busy.length === 0 ? (
        <p className="quiet">Nobody matching this search is teaching right then.</p>
      ) : (
        <div className="stack">
          {busy.map((person) => (
            <button
              key={person.id}
              type="button"
              className="busy-row tap"
              onClick={() => open({ type: "teacher", id: person.id })}
            >
              <b>{person.label}</b>
              <span>{summarize(occupied.get(person.id) ?? [])}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BatchesView() {
  const { batchId, setBatchId, day, clock, pinBatch, pinnedBatch } = useDesk();
  const [program, setProgram] = useState("All");
  const [copied, setCopied] = useState(false);
  const ids = batchesInProgram(program);
  const list = forBatch(batchId);

  useEffect(() => {
    const next = batchesInProgram(program);
    if (!next.includes(batchId) && next[0] !== undefined) setBatchId(next[0]);
  }, [program, batchId, setBatchId]);

  async function copy() {
    const text = formatSchedule(batches[batchId], list);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="page">
      <div className="panel-head">
        <h1 className="section-title">Batches</h1>
        <button
          type="button"
          className="btn tap"
          onClick={() => pinBatch(pinnedBatch === batchId ? null : batchId)}
        >
          <Pin size={16} aria-hidden />
          {pinnedBatch === batchId ? "Pinned" : "Pin"}
        </button>
      </div>
      <div className="chips" aria-label="Programme">
        {["All", ...programs].map((item) => (
          <button
            key={item}
            type="button"
            className={program === item ? "chip on" : "chip"}
            onClick={() => setProgram(item)}
          >
            {item.replace("BS(", "").replace(")", "")}
          </button>
        ))}
      </div>
      <select
        className="select"
        aria-label="Choose batch"
        value={ids.includes(batchId) ? batchId : (ids[0] ?? batchId)}
        onChange={(event) => setBatchId(Number(event.target.value))}
      >
        {(program === "All" ? programs : [program]).map((name) => (
          <optgroup key={name} label={name}>
            {batchesInProgram(name).map((id) => (
              <option key={id} value={id}>
                {batches[id]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="quiet">
        {programOf(batches[batchId])} · {batchLoad(batchId)} of {WEEK_CELLS} lectures filled
      </p>
      <Meter value={batchLoad(batchId)} />
      <WeekGrid
        list={list}
        focusDay={day}
        liveDay={clock.dayIndex}
        liveSlot={clock.liveSlot}
        caption={(entry) =>
          [entry.teacher >= 0 ? teachers[entry.teacher] : "", entry.room >= 0 ? rooms[entry.room] : ""]
            .filter(Boolean)
            .join(" · ")
        }
      />
      <h2 className="section-title">{clock.dayIndex === day ? "This day" : DAYS[day]}</h2>
      <ClassList list={list} day={day} who="batch" />
      <div className="row-actions noprint">
        <button type="button" className="btn tap" onClick={copy}>
          {copied ? "Copied" : "Copy week"}
          <Copy size={16} aria-hidden />
        </button>
        <button type="button" className="btn tap" onClick={() => window.print()}>
          <Printer size={16} aria-hidden />
          Print
        </button>
      </div>
    </div>
  );
}

function HitGroup({
  title,
  hits,
  onOpen,
}: {
  title: string;
  hits: { id: number; label: string }[];
  onOpen: (id: number) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <section className="stack">
      <h2 className="group-label">{title}</h2>
      {hits.map((hit) => (
        <button key={`${title}-${hit.id}`} type="button" className="hit tap" onClick={() => onOpen(hit.id)}>
          {hit.label}
          {title === "Subjects" ? <small>{forSubject(hit.id).length} offerings</small> : null}
        </button>
      ))}
    </section>
  );
}

export function FindView() {
  const { open, setView, setBatchId, day, slot } = useDesk();
  const [query, setQuery] = useState("");
  const [meet, setMeet] = useState<"teachers" | "batch">("teachers");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const hits = searchCatalog(query);

  const leftId = left === "" ? -1 : Number(left);
  const rightId = right === "" ? -1 : Number(right);
  const ready = leftId >= 0 && rightId >= 0 && (meet === "batch" || leftId !== rightId);
  const free = ready
    ? mutualFree(
        meet === "teachers" ? forTeacher(leftId) : forBatch(leftId),
        forTeacher(rightId),
      )
    : [];
  const freeNow = free.some((cell) => cell.day === day && cell.slot === slot);

  return (
    <div className="page">
      <div className="panel-head">
        <h1 className="section-title">Find</h1>
      </div>
      <label className="search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          placeholder="Subject, teacher, room, or batch"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {query.trim() ? (
        <div className="stack">
          <HitGroup title="Batches" hits={hits.batches} onOpen={(id) => { setBatchId(id); setView("batches"); }} />
          <HitGroup title="Faculty" hits={hits.teachers} onOpen={(id) => open({ type: "teacher", id })} />
          <HitGroup title="Rooms" hits={hits.rooms} onOpen={(id) => open({ type: "room", id })} />
          <HitGroup title="Subjects" hits={hits.subjects} onOpen={(id) => open({ type: "subject", id })} />
          {hits.batches.length + hits.teachers.length + hits.rooms.length + hits.subjects.length === 0 ? (
            <p className="quiet">Nothing on the sheet matches that.</p>
          ) : null}
        </div>
      ) : (
        <section className="panel stack">
          <h2>When are they both free?</h2>
          <p className="quiet">
            Pick two teachers, or a batch and a teacher, and see the lectures where neither is already booked.
          </p>
          <Segment
            label="Who to compare"
            value={meet}
            onChange={(value) => {
              setMeet(value === "batch" ? "batch" : "teachers");
              setLeft("");
              setRight("");
            }}
            options={[
              { value: "teachers", label: "Two teachers" },
              { value: "batch", label: "Batch and teacher" },
            ]}
          />
          <label className="stack">
            <span className="quiet">{meet === "batch" ? "Batch" : "First teacher"}</span>
            <select className="select" value={left} onChange={(event) => setLeft(event.target.value)}>
              <option value="">Choose</option>
              {meet === "batch"
                ? batches.map((label, id) => (
                    <option key={label} value={id}>
                      {label}
                    </option>
                  ))
                : teachers.map((label, id) => (
                    <option key={label} value={id}>
                      {label}
                    </option>
                  ))}
            </select>
          </label>
          <label className="stack">
            <span className="quiet">{meet === "batch" ? "Teacher" : "Second teacher"}</span>
            <select className="select" value={right} onChange={(event) => setRight(event.target.value)}>
              <option value="">Choose</option>
              {teachers.map((label, id) => (
                <option key={label} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {ready ? (
            <>
              <p className="quiet">
                {free.length} shared free lecture{free.length === 1 ? "" : "s"} this week.
                {freeNow ? " Both are free in the lecture you are viewing." : ""}
              </p>
              <div className="free-grid" aria-label="Shared free lectures">
                <span className="hd" />
                {["M", "T", "W", "T", "F"].map((label, index) => (
                  <span key={`${label}${index}`} className="hd">
                    {label}
                  </span>
                ))}
                {["L1", "L2", "L3", "L4", "L5"].map((label, slotIndex) => (
                  <div key={label} className="week-row">
                    <span className="hd">{label.replace("L", "")}</span>
                    {[0, 1, 2, 3, 4].map((dayIndex) => {
                      const openCell = free.some((cell) => cell.day === dayIndex && cell.slot === slotIndex);
                      return (
                        <i key={dayIndex} className={openCell ? "open" : "shut"}>
                          {openCell ? "Free" : ""}
                        </i>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

