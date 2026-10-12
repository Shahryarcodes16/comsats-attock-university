/**
 * Pure availability engine shared by the browser and the server.
 *
 * A person's week is a 25-bit mask (5 days x 5 lectures): bit = day * 5 + slot,
 * set when they have a class. Everything the friends features show (who is free
 * now, a group's best shared gap, a meetup proposal) is derived from masks and
 * the clock, so the server only ever has to send each viewer the slice of a
 * timetable they are allowed to see.
 *
 * No framework or bundler-only imports here: the unit tests load this file
 * directly with Node.
 */
import { DAY_COUNT, DAY_SHORT, SLOT_COUNT, SLOTS } from "./slots.ts";

// ── Privacy levels ──────────────────────────────────────────────────────────

/** What one person lets another see: nothing, busy/free only, or full classes. */
export type Level = "none" | "free" | "full";

export const LEVELS: readonly Level[] = ["none", "free", "full"];

const LEVEL_RANK: Record<Level, number> = { none: 0, free: 1, full: 2 };

export function isLevel(value: unknown): value is Level {
  return value === "none" || value === "free" || value === "full";
}

/** The more restrictive of two levels: when settings conflict, the stricter one wins. */
export function minLevel(a: Level, b: Level): Level {
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}

// ── Week masks ──────────────────────────────────────────────────────────────

export function cellIndex(day: number, slot: number): number {
  return day * SLOT_COUNT + slot;
}

export function maskOf(cells: Iterable<{ day: number; slot: number }>): number {
  let mask = 0;
  for (const cell of cells) {
    if (cell.day < 0 || cell.day >= DAY_COUNT || cell.slot < 0 || cell.slot >= SLOT_COUNT) continue;
    mask |= 1 << cellIndex(cell.day, cell.slot);
  }
  return mask;
}

export function isBusy(mask: number, day: number, slot: number): boolean {
  return ((mask >> cellIndex(day, slot)) & 1) === 1;
}

function isFreeRun(mask: number, day: number, start: number, end: number): boolean {
  for (let slot = start; slot <= end; slot += 1) {
    if (isBusy(mask, day, slot)) return false;
  }
  return true;
}

function busySlots(mask: number, day: number): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    if (isBusy(mask, day, slot)) slots.push(slot);
  }
  return slots;
}

// ── Text helpers ────────────────────────────────────────────────────────────

/** 13:15 (as minutes) -> "1:15", matching how the timetable prints lecture times. */
export function clockText(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 12 || 12;
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// ── Presence: in class, free, done ─────────────────────────────────────────

export type PresenceKind =
  | "in_class"
  | "free"
  | "not_started"
  | "done"
  | "no_classes"
  | "away"
  | "weekend";

export type Presence = {
  kind: PresenceKind;
  /** Lecture index when `in_class`. */
  slot?: number;
  /** Minutes left in the class / free window, or until the first class. */
  minutes?: number;
  /** The clock time (e.g. "1:35") that `minutes` counts towards. */
  at?: string;
};

/**
 * Where someone is right now, from their week mask and the clock.
 * `weekday` is JS style (0 = Sunday). Nothing is tracked live: the answer is a
 * pure function of the timetable and the time, so it works offline too.
 */
export function presenceNow(
  mask: number,
  weekday: number,
  minutesNow: number,
  away = false,
): Presence {
  if (weekday === 0 || weekday === 6) return { kind: "weekend" };
  if (away) return { kind: "away" };
  const day = weekday - 1;
  const busy = busySlots(mask, day);
  if (busy.length === 0) return { kind: "no_classes" };

  const live = SLOTS.findIndex((slot) => minutesNow >= slot.from && minutesNow < slot.to);
  if (live >= 0 && busy.includes(live)) {
    return {
      kind: "in_class",
      slot: live,
      minutes: SLOTS[live].to - minutesNow,
      at: clockText(SLOTS[live].to),
    };
  }

  const first = SLOTS[busy[0]].from;
  const last = SLOTS[busy[busy.length - 1]].to;
  if (minutesNow >= last) return { kind: "done" };
  if (minutesNow < first) {
    return { kind: "not_started", minutes: first - minutesNow, at: clockText(first) };
  }
  const next = busy.find((slot) => SLOTS[slot].from > minutesNow);
  if (next === undefined) return { kind: "done" };
  return {
    kind: "free",
    slot: next,
    minutes: SLOTS[next].from - minutesNow,
    at: clockText(SLOTS[next].from),
  };
}

export function presenceText(presence: Presence): string {
  switch (presence.kind) {
    case "in_class":
      return `In class until ${presence.at}`;
    case "free":
      return `Free for ${formatDuration(presence.minutes ?? 0)}, class at ${presence.at}`;
    case "not_started":
      return `First class at ${presence.at}`;
    case "done":
      return "Done for the day";
    case "no_classes":
      return "No classes today";
    case "away":
      return "Not on campus today";
    case "weekend":
      return "Weekend";
  }
}

// ── Ranked free windows ─────────────────────────────────────────────────────

export type Activity = "study" | "gossip" | "game";

export const ACTIVITIES: Record<
  Activity,
  { label: string; short: string; minMinutes: number; hint: string }
> = {
  study: {
    label: "Study session",
    short: "Study",
    minMinutes: 80,
    hint: "A full lecture slot or longer, ideally midday.",
  },
  gossip: {
    label: "Chai and gossip",
    short: "Gossip",
    minMinutes: 20,
    hint: "Short gaps are fine, even the lunch break.",
  },
  game: {
    label: "Game time",
    short: "Game",
    minMinutes: 60,
    hint: "An hour or more, later in the day is better.",
  },
};

export const ACTIVITY_LIST: Activity[] = ["study", "gossip", "game"];

export function isActivity(value: unknown): value is Activity {
  return value === "study" || value === "gossip" || value === "game";
}

export type Person = { id: string; mask: number };

export type Window = {
  day: number;
  /** First and last lecture index covered (inclusive). */
  start: number;
  end: number;
  /** `gap` is a run of free lectures; `break` is the 20 minute lunch break. */
  kind: "gap" | "break";
  free: string[];
  missing: string[];
  minutes: number;
  score: number;
};

export type RankOptions = {
  activity?: Activity;
  /** Windows shorter than this are dropped. Defaults to the activity's minimum. */
  minMinutes?: number;
  /** How many people must be free. Defaults to everyone. */
  minFree?: number;
  /** Offer the lunch break (only when the activity allows a short window). */
  includeBreak?: boolean;
};

const BREAK_START = 2;
const BREAK_END = 3;

function popcount(value: number): number {
  let count = 0;
  for (let v = value; v > 0; v >>= 1) count += v & 1;
  return count;
}

function windowSpan(kind: "gap" | "break", start: number, end: number): { from: number; to: number } {
  if (kind === "break") return { from: SLOTS[BREAK_START].to, to: SLOTS[BREAK_END].from };
  return { from: SLOTS[start].from, to: SLOTS[end].to };
}

// Friday congregational prayer: a window that runs into this block is a poor pick.
const JUMMAH_FROM = 12 * 60 + 30;
const JUMMAH_TO = 14 * 60;

function scoreWindow(
  day: number,
  start: number,
  end: number,
  kind: "gap" | "break",
  freeCount: number,
  total: number,
  activity: Activity,
): number {
  const { from, to } = windowSpan(kind, start, end);
  const minutes = to - from;
  let score = (freeCount / total) * 100;

  // Longer is better for study and games; for chai a short gap is plenty.
  if (activity === "gossip") score += (Math.min(minutes, 90) / 90) * 12;
  else if (activity === "study") score += (Math.min(minutes, 270) / 270) * 45;
  else score += (Math.min(minutes, 270) / 270) * 30;

  // Midday is best. Early mornings and the last lecture lose people to travel.
  const middle = (from + to) / 2;
  const bandStart = 10 * 60 + 30;
  const bandEnd = 14 * 60 + 30;
  const distance = middle < bandStart ? bandStart - middle : middle > bandEnd ? middle - bandEnd : 0;
  score -= Math.min(8, (distance / 60) * 4);
  if (kind === "gap") {
    if (start === 0) score -= 4;
    if (end === SLOT_COUNT - 1) score -= 4;
  }

  if (activity === "game" && end >= 3) score += 5;

  if (day === 4) {
    const overlap = Math.min(to, JUMMAH_TO) - Math.max(from, JUMMAH_FROM);
    score -= overlap > 0 ? 10 : 3;
  }
  return Math.round(score * 10) / 10;
}

/**
 * Every useful stretch of shared free time, best first.
 *
 * For each day it tries every run of consecutive lectures, records who is free
 * for the whole run, and then drops any run that a longer one already covers
 * with at least the same people. What is left is scored on how many people are
 * free, how long the stretch is, the time of day, and (mildly) Friday prayers.
 */
export function rankWindows(people: Person[], options: RankOptions = {}): Window[] {
  const total = people.length;
  if (total < 2 || total > 30) return [];
  const activity = options.activity ?? "study";
  const minMinutes = options.minMinutes ?? ACTIVITIES[activity].minMinutes;
  const minFree = Math.max(2, Math.min(total, options.minFree ?? total));

  type Candidate = {
    day: number;
    start: number;
    end: number;
    kind: "gap" | "break";
    bits: number;
  };
  const candidates: Candidate[] = [];

  for (let day = 0; day < DAY_COUNT; day += 1) {
    const dayCandidates: Candidate[] = [];
    for (let start = 0; start < SLOT_COUNT; start += 1) {
      for (let end = start; end < SLOT_COUNT; end += 1) {
        const minutes = SLOTS[end].to - SLOTS[start].from;
        if (minutes < minMinutes) continue;
        let bits = 0;
        people.forEach((person, index) => {
          if (isFreeRun(person.mask, day, start, end)) bits |= 1 << index;
        });
        if (popcount(bits) < minFree) continue;
        dayCandidates.push({ day, start, end, kind: "gap", bits });
      }
    }
    for (const a of dayCandidates) {
      const covered = dayCandidates.some(
        (b) =>
          b !== a && b.start <= a.start && b.end >= a.end && (b.bits & a.bits) === a.bits,
      );
      if (!covered) candidates.push(a);
    }

    if (options.includeBreak && minMinutes <= SLOTS[BREAK_END].from - SLOTS[BREAK_START].to) {
      let bits = 0;
      people.forEach((person, index) => {
        if (busySlots(person.mask, day).length > 0) bits |= 1 << index;
      });
      if (popcount(bits) >= minFree) {
        candidates.push({ day, start: BREAK_START, end: BREAK_END, kind: "break", bits });
      }
    }
  }

  return candidates
    .map((candidate): Window => {
      const free: string[] = [];
      const missing: string[] = [];
      people.forEach((person, index) => {
        if ((candidate.bits >> index) & 1) free.push(person.id);
        else missing.push(person.id);
      });
      const span = windowSpan(candidate.kind, candidate.start, candidate.end);
      return {
        day: candidate.day,
        start: candidate.start,
        end: candidate.end,
        kind: candidate.kind,
        free,
        missing,
        minutes: span.to - span.from,
        score: scoreWindow(
          candidate.day,
          candidate.start,
          candidate.end,
          candidate.kind,
          free.length,
          total,
          activity,
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.day - b.day || a.start - b.start);
}

export function windowLabel(w: Pick<Window, "day" | "start" | "end" | "kind">): string {
  const day = DAY_SHORT[w.day] ?? "";
  if (w.kind === "break") {
    const { from, to } = windowSpan("break", w.start, w.end);
    return `${day} · Lunch break · ${clockText(from)}–${clockText(to)}`;
  }
  const lectures =
    w.start === w.end ? SLOTS[w.start].label : `${SLOTS[w.start].label}–${SLOTS[w.end].label}`;
  return `${day} · ${lectures} · ${SLOTS[w.start].start}–${SLOTS[w.end].end}`;
}

export function sameWindow(
  a: Pick<Window, "day" | "start" | "end" | "kind">,
  b: Pick<Window, "day" | "start" | "end" | "kind">,
): boolean {
  return a.day === b.day && a.start === b.start && a.end === b.end && a.kind === b.kind;
}

/** Is this whole window free for someone with this mask? (A break needs a class that day.) */
export function windowFitsMask(
  mask: number,
  w: Pick<Window, "day" | "start" | "end" | "kind">,
): boolean {
  if (w.kind === "break") return busySlots(mask, w.day).length > 0;
  return isFreeRun(mask, w.day, w.start, w.end);
}

// ── Dates (the campus runs on Pakistan Standard Time, UTC+5, no DST) ────────

export type CampusNow = {
  /** YYYY-MM-DD in campus time. */
  date: string;
  /** JS weekday, 0 = Sunday. */
  weekday: number;
  minutes: number;
};

const CAMPUS_OFFSET_MS = 5 * 60 * 60 * 1000;

export function campusNow(at: Date = new Date()): CampusNow {
  const shifted = new Date(at.getTime() + CAMPUS_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The next calendar date on which this window has not yet started. */
export function nextDateFor(
  w: Pick<Window, "day" | "start" | "end" | "kind">,
  now: CampusNow,
): string {
  const target = w.day + 1;
  let delta = (target - now.weekday + 7) % 7;
  if (delta === 0 && now.minutes >= windowSpan(w.kind, w.start, w.end).from) delta = 7;
  return addDays(now.date, delta);
}

export type Phase = "upcoming" | "live" | "past";

export function phaseOf(
  onDate: string,
  w: Pick<Window, "start" | "end" | "kind">,
  now: CampusNow,
): Phase {
  if (onDate > now.date) return "upcoming";
  if (onDate < now.date) return "past";
  const { from, to } = windowSpan(w.kind, w.start, w.end);
  if (now.minutes < from) return "upcoming";
  if (now.minutes >= to) return "past";
  return "live";
}

/** "Tomorrow", "Today", or "Tue 14 Oct". */
export function dateLabel(onDate: string, now: CampusNow): string {
  if (onDate === now.date) return "Today";
  if (onDate === addDays(now.date, 1)) return "Tomorrow";
  const [y, m, d] = onDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
