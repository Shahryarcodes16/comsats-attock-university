/**
 * The campus week as plain data. No imports on purpose: the timetable JSON,
 * the schedule helpers and the pure availability engine all share this one
 * definition, and the engine's unit tests can load it without a bundler.
 */
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export const SLOTS = [
  { label: "L1", start: "8:30", end: "10:00", from: 8 * 60 + 30, to: 10 * 60 },
  { label: "L2", start: "10:00", end: "11:30", from: 10 * 60, to: 11 * 60 + 30 },
  { label: "L3", start: "11:30", end: "1:15", from: 11 * 60 + 30, to: 13 * 60 + 15 },
  { label: "L4", start: "1:35", end: "3:00", from: 13 * 60 + 35, to: 15 * 60 },
  { label: "L5", start: "3:00", end: "4:30", from: 15 * 60, to: 16 * 60 + 30 },
] as const;

export const DAY_COUNT = DAYS.length;
export const SLOT_COUNT = SLOTS.length;
