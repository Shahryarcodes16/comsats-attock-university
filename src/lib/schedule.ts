import raw from "@/data/timetable.json";
import { DAYS, DAY_SHORT, SLOTS } from "@/lib/social/slots";

export const batches = raw.b;
export const rooms = raw.r;
export const teachers = raw.t;
export const subjects = raw.s;

export type ClassEntry = {
  day: number;
  slot: number;
  batch: number;
  room: number;
  teacher: number;
  subject: number;
  repeater: boolean;
};

export const entries: ClassEntry[] = raw.e.map(
  ([day, slot, batch, room, teacher, subject, repeater]) => ({
    day,
    slot,
    batch,
    room,
    teacher,
    subject,
    repeater: repeater === 1,
  }),
);

export { DAYS, DAY_SHORT, SLOTS };

export const WEEK_CELLS = DAYS.length * SLOTS.length;

export type RoomGroup = "Lecture halls" | "Classrooms" | "Lecture theatres" | "Labs";

export const ROOM_GROUPS: RoomGroup[] = [
  "Lecture halls",
  "Classrooms",
  "Lecture theatres",
  "Labs",
];

export function roomGroup(name: string): RoomGroup {
  if (name.startsWith("LH")) return "Lecture halls";
  if (name.startsWith("CR")) return "Classrooms";
  if (name.startsWith("LT")) return "Lecture theatres";
  return "Labs";
}

export function programOf(batch: string): string {
  return batch.replace(/-[IVX]+$/, "");
}

export const programs: string[] = [];
{
  const seen = new Set<string>();
  for (const batch of batches) {
    const program = programOf(batch);
    if (!seen.has(program)) {
      seen.add(program);
      programs.push(program);
    }
  }
}

export function rangeLabel(slot: number): string {
  const item = SLOTS[slot];
  if (!item) return "";
  return `${item.start}–${item.end}`;
}

export function spanLabel(start: number, end: number): string {
  const a = SLOTS[start];
  const b = SLOTS[end];
  if (!a || !b) return "";
  return `${a.start}–${b.end}`;
}

export type Phase = "loading" | "weekend" | "before" | "live" | "break" | "after";

export type ClockInfo = {
  phase: Phase;
  dayIndex: number | null;
  liveSlot: number | null;
  focusDay: number;
  focusSlot: number;
  headline: string;
  detail: string;
};

export function readClock(date: Date | null): ClockInfo {
  if (!date) {
    return {
      phase: "loading",
      dayIndex: null,
      liveSlot: null,
      focusDay: 0,
      focusSlot: 0,
      headline: "Attock Campus",
      detail: "Timetable in force from 5 October 2026.",
    };
  }

  const weekday = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();

  if (weekday === 0 || weekday === 6) {
    return {
      phase: "weekend",
      dayIndex: null,
      liveSlot: null,
      focusDay: 0,
      focusSlot: 0,
      headline: "Campus is quiet",
      detail: "It’s the weekend. Monday’s first lecture starts at 8:30.",
    };
  }

  const dayIndex = weekday - 1;
  const live = SLOTS.findIndex((slot) => minutes >= slot.from && minutes < slot.to);
  if (live >= 0) {
    const left = SLOTS[live].to - minutes;
    return {
      phase: "live",
      dayIndex,
      liveSlot: live,
      focusDay: dayIndex,
      focusSlot: live,
      headline: `${SLOTS[live].label} is underway`,
      detail: `${rangeLabel(live)} · ${left} minute${left === 1 ? "" : "s"} left`,
    };
  }

  if (minutes < SLOTS[0].from) {
    const until = SLOTS[0].from - minutes;
    return {
      phase: "before",
      dayIndex,
      liveSlot: null,
      focusDay: dayIndex,
      focusSlot: 0,
      headline: "Before the first lecture",
      detail: `L1 starts at 8:30, in ${until} minute${until === 1 ? "" : "s"}.`,
    };
  }

  if (minutes >= SLOTS[SLOTS.length - 1].to) {
    return {
      phase: "after",
      dayIndex,
      liveSlot: null,
      focusDay: dayIndex,
      focusSlot: SLOTS.length - 1,
      headline: "Teaching is done for today",
      detail: "The last lecture ended at 4:30.",
    };
  }

  const next = SLOTS.findIndex((slot) => minutes < slot.from);
  const until = next >= 0 ? SLOTS[next].from - minutes : 0;
  return {
    phase: "break",
    dayIndex,
    liveSlot: null,
    focusDay: dayIndex,
    focusSlot: next >= 0 ? next : SLOTS.length - 1,
    headline: "Break between lectures",
    detail:
      next >= 0
        ? `${SLOTS[next].label} starts at ${SLOTS[next].start}, in ${until} minute${until === 1 ? "" : "s"}.`
        : "",
  };
}

export function greeting(date: Date | null): string {
  if (!date) return "COMSATS University Islamabad";
  const hour = date.getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const when = date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `${hello}. ${when}.`;
}

export function clockFace(date: Date | null): string {
  if (!date) return "–:–";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const byBatch: ClassEntry[][] = batches.map(() => []);
const byTeacher: ClassEntry[][] = teachers.map(() => []);
const byRoom: ClassEntry[][] = rooms.map(() => []);
const bySubject: ClassEntry[][] = subjects.map(() => []);
const byCell = new Map<string, ClassEntry[]>();

for (const entry of entries) {
  byBatch[entry.batch]?.push(entry);
  if (entry.teacher >= 0) byTeacher[entry.teacher]?.push(entry);
  if (entry.room >= 0) byRoom[entry.room]?.push(entry);
  bySubject[entry.subject]?.push(entry);
  const key = `${entry.day}|${entry.slot}`;
  const list = byCell.get(key);
  if (list) list.push(entry);
  else byCell.set(key, [entry]);
}

export function at(day: number, slot: number): ClassEntry[] {
  return byCell.get(`${day}|${slot}`) ?? [];
}

export function forBatch(id: number): ClassEntry[] {
  return byBatch[id] ?? [];
}

export function forTeacher(id: number): ClassEntry[] {
  return byTeacher[id] ?? [];
}

export function forRoom(id: number): ClassEntry[] {
  return byRoom[id] ?? [];
}

export function forSubject(id: number): ClassEntry[] {
  return bySubject[id] ?? [];
}

export function groupBySlot(list: ClassEntry[], day: number, slot: number): ClassEntry[] {
  return list.filter((entry) => entry.day === day && entry.slot === slot);
}

export type Block = {
  start: number;
  end: number;
  entry: ClassEntry;
};

export function blocksFor(list: ClassEntry[], day: number): Block[] {
  const rows = list
    .filter((entry) => entry.day === day)
    .slice()
    .sort((a, b) => a.slot - b.slot || a.subject - b.subject || a.room - b.room);
  const blocks: Block[] = [];
  for (const entry of rows) {
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      prev.end === entry.slot - 1 &&
      prev.entry.batch === entry.batch &&
      prev.entry.room === entry.room &&
      prev.entry.teacher === entry.teacher &&
      prev.entry.subject === entry.subject &&
      prev.entry.repeater === entry.repeater
    ) {
      prev.end = entry.slot;
    } else {
      blocks.push({ start: entry.slot, end: entry.slot, entry });
    }
  }
  return blocks;
}

function uniqueSlots(list: ClassEntry[]): number {
  const seen = new Set<string>();
  for (const entry of list) seen.add(`${entry.day}|${entry.slot}`);
  return seen.size;
}

export function teachingLoad(teacherId: number): number {
  return uniqueSlots(forTeacher(teacherId));
}

export function roomLoad(roomId: number): number {
  return uniqueSlots(forRoom(roomId));
}

export function batchLoad(batchId: number): number {
  return uniqueSlots(forBatch(batchId));
}

export function isFree(
  list: ClassEntry[],
  day: number,
  slot: number,
  span: 1 | 2,
): boolean {
  const last = Math.min(SLOTS.length, slot + span);
  for (let cursor = slot; cursor < last; cursor += 1) {
    if (list.some((entry) => entry.day === day && entry.slot === cursor)) return false;
  }
  return true;
}

export type CatalogHit = { id: number; label: string };

export function searchCatalog(query: string): {
  batches: CatalogHit[];
  teachers: CatalogHit[];
  rooms: CatalogHit[];
  subjects: CatalogHit[];
} {
  const needle = query.trim().toLowerCase();
  const empty = { batches: [], teachers: [], rooms: [], subjects: [] };
  if (needle.length < 1) return empty;

  const take = (labels: readonly string[], limit: number): CatalogHit[] => {
    const hits: CatalogHit[] = [];
    for (let id = 0; id < labels.length; id += 1) {
      if (labels[id].toLowerCase().includes(needle)) {
        hits.push({ id, label: labels[id] });
        if (hits.length >= limit) break;
      }
    }
    return hits;
  };

  return {
    batches: take(batches, 6),
    teachers: take(teachers, 6),
    rooms: take(rooms, 6),
    subjects: take(subjects, 8),
  };
}

export function summarize(list: ClassEntry[]): string {
  const parts = list.slice(0, 2).map((entry) => {
    const bits = [batches[entry.batch]];
    if (entry.teacher >= 0) bits.push(teachers[entry.teacher]);
    return bits.join(" · ");
  });
  if (list.length > 2) parts.push(`+${list.length - 2} more`);
  return parts.join(" | ");
}

export function formatSchedule(title: string, list: ClassEntry[]): string {
  const lines = [title, "COMSATS University Islamabad, Attock Campus", "Timetable w.e.f. 5 Oct 2026", ""];
  for (let day = 0; day < DAYS.length; day += 1) {
    lines.push(DAYS[day]);
    const blocks = blocksFor(list, day);
    if (blocks.length === 0) lines.push("  Nothing scheduled");
    for (const block of blocks) {
      const entry = block.entry;
      const who = entry.teacher >= 0 ? teachers[entry.teacher] : "Faculty not listed";
      const room = entry.room >= 0 ? rooms[entry.room] : "Room not listed";
      const flag = entry.repeater ? " (repeater)" : "";
      lines.push(
        `  ${spanLabel(block.start, block.end)}  ${subjects[entry.subject]}${flag} · ${who} · ${room}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export type FreeCell = { day: number; slot: number };

export function mutualFree(left: ClassEntry[], right: ClassEntry[]): FreeCell[] {
  const cells: FreeCell[] = [];
  for (let day = 0; day < DAYS.length; day += 1) {
    for (let slot = 0; slot < SLOTS.length; slot += 1) {
      const leftBusy = left.some((entry) => entry.day === day && entry.slot === slot);
      const rightBusy = right.some((entry) => entry.day === day && entry.slot === slot);
      if (!leftBusy && !rightBusy) cells.push({ day, slot });
    }
  }
  return cells;
}

export function cellMap(list: ClassEntry[]): Map<string, ClassEntry[]> {
  const map = new Map<string, ClassEntry[]>();
  for (const entry of list) {
    const key = `${entry.day}|${entry.slot}`;
    const bucket = map.get(key);
    if (bucket) bucket.push(entry);
    else map.set(key, [entry]);
  }
  return map;
}

export function batchesInProgram(program: string): number[] {
  const ids: number[] = [];
  batches.forEach((label, id) => {
    if (program === "All" || programOf(label) === program) ids.push(id);
  });
  return ids;
}
