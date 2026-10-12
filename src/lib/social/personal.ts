import { entries, forBatch, type ClassEntry } from "@/lib/schedule";
import { maskOf } from "./engine.ts";
import type { PublicClass } from "./types.ts";

/**
 * A person's own week is their batch's timetable, minus classes they skip,
 * plus classes they attend with another batch (repeaters, electives).
 * Classes are identified by "day.slot.batch.subject" so the list survives a
 * reordered timetable file.
 */
export function entryKey(entry: Pick<ClassEntry, "day" | "slot" | "batch" | "subject">): string {
  return `${entry.day}.${entry.slot}.${entry.batch}.${entry.subject}`;
}

const KEY_PATTERN = /^\d\.\d\.\d{1,4}\.\d{1,5}$/;

export function isEntryKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

let byKey: Map<string, ClassEntry[]> | null = null;

function index(): Map<string, ClassEntry[]> {
  if (byKey) return byKey;
  const map = new Map<string, ClassEntry[]>();
  for (const entry of entries) {
    const key = entryKey(entry);
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  byKey = map;
  return map;
}

export function entriesForKey(key: string): ClassEntry[] {
  return index().get(key) ?? [];
}

export function personalEntries(
  batchId: number,
  dropped: readonly string[],
  added: readonly string[],
): ClassEntry[] {
  const skip = new Set(dropped);
  const result = forBatch(batchId).filter((entry) => !skip.has(entryKey(entry)));
  const have = new Set(result.map(entryKey));
  for (const key of added) {
    if (have.has(key)) continue;
    const extra = entriesForKey(key);
    if (extra.length === 0) continue;
    result.push(...extra);
    have.add(key);
  }
  return result;
}

export function weekMask(list: readonly ClassEntry[]): number {
  return maskOf(list);
}

export function toPublicClass(entry: ClassEntry): PublicClass {
  return {
    day: entry.day,
    slot: entry.slot,
    subject: entry.subject,
    room: entry.room,
    teacher: entry.teacher,
    repeater: entry.repeater,
  };
}
