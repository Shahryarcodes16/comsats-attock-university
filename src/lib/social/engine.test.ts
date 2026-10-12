import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  campusNow,
  formatDuration,
  maskOf,
  minLevel,
  nextDateFor,
  phaseOf,
  presenceNow,
  presenceText,
  rankWindows,
  windowFitsMask,
  windowLabel,
} from "./engine.ts";
import { meetupStatus } from "./meetup-status.ts";

const MON = 1;
const mins = (h: number, m = 0) => h * 60 + m;
const busy = (cells: [number, number][]) => maskOf(cells.map(([day, slot]) => ({ day, slot })));

describe("privacy levels", () => {
  it("the stricter level always wins", () => {
    assert.equal(minLevel("full", "none"), "none");
    assert.equal(minLevel("free", "full"), "free");
    assert.equal(minLevel("free", "free"), "free");
  });
});

describe("presenceNow", () => {
  // Monday: L1 (8:30), L3 (11:30) and L4 (1:35)
  const mask = busy([
    [0, 0],
    [0, 2],
    [0, 3],
  ]);

  it("in class until the end of the lecture", () => {
    const p = presenceNow(mask, MON, mins(9, 0));
    assert.equal(p.kind, "in_class");
    assert.equal(p.minutes, 60);
    assert.equal(p.at, "10:00");
  });

  it("free between classes, counting down to the next one", () => {
    const p = presenceNow(mask, MON, mins(10, 15));
    assert.equal(p.kind, "free");
    assert.equal(p.minutes, 75);
    assert.equal(p.at, "11:30");
    assert.equal(presenceText(p), "Free for 1h 15m, class at 11:30");
  });

  it("the 20 minute break between L3 and L4 is a real gap", () => {
    const p = presenceNow(mask, MON, mins(13, 20));
    assert.equal(p.kind, "free");
    assert.equal(p.minutes, 15);
  });

  it("not started before the first class, done after the last", () => {
    assert.equal(presenceNow(mask, MON, mins(8, 0)).kind, "not_started");
    assert.equal(presenceNow(mask, MON, mins(15, 30)).kind, "done");
  });

  it("a free lecture after the last class is done, not free", () => {
    const p = presenceNow(busy([[0, 0]]), MON, mins(12, 0));
    assert.equal(p.kind, "done");
  });

  it("weekend, away and empty days", () => {
    assert.equal(presenceNow(mask, 0, mins(10)).kind, "weekend");
    assert.equal(presenceNow(mask, 6, mins(10)).kind, "weekend");
    assert.equal(presenceNow(mask, MON, mins(10), true).kind, "away");
    assert.equal(presenceNow(mask, 2, mins(10)).kind, "no_classes");
  });
});

describe("rankWindows", () => {
  it("never proposes a window where someone has class", () => {
    const people = [
      { id: "a", mask: busy([[1, 0], [1, 1], [2, 2]]) },
      { id: "b", mask: busy([[1, 2], [3, 0]]) },
      { id: "c", mask: busy([[0, 4]]) },
    ];
    const windows = rankWindows(people, { activity: "study" });
    assert.ok(windows.length > 0);
    for (const w of windows) {
      for (const person of people) {
        assert.equal(windowFitsMask(person.mask, w), w.free.includes(person.id));
      }
      assert.equal(w.missing.length, 0);
    }
  });

  it("finds the single gap two people share", () => {
    // Tuesday: A is busy L1-L2, B is busy L3. Both are free for L4-L5 only.
    const people = [
      { id: "a", mask: busy([[1, 0], [1, 1], [1, 2]]) },
      { id: "b", mask: busy([[1, 2]]) },
    ];
    const tue = rankWindows(people, { activity: "study" }).filter((w) => w.day === 1);
    assert.equal(tue.length, 1);
    assert.deepEqual([tue[0].start, tue[0].end], [3, 4]);
    assert.equal(windowLabel(tue[0]), "Tue · L4–L5 · 1:35–4:30");
  });

  it("keeps only the longest window for the same people", () => {
    const people = [
      { id: "a", mask: 0 },
      { id: "b", mask: 0 },
    ];
    const monday = rankWindows(people, { activity: "study" }).filter((w) => w.day === 0);
    assert.equal(monday.length, 1);
    assert.deepEqual([monday[0].start, monday[0].end], [0, 4]);
  });

  it("ranks Friday below the same free time on Thursday", () => {
    const people = [
      { id: "a", mask: 0 },
      { id: "b", mask: 0 },
    ];
    const windows = rankWindows(people, { activity: "study" });
    const thursday = windows.find((w) => w.day === 3)!;
    const friday = windows.find((w) => w.day === 4)!;
    assert.ok(thursday.score > friday.score);
  });

  it("offers partial windows only when asked, and names who is missing", () => {
    const people = [
      { id: "a", mask: 0 },
      { id: "b", mask: 0 },
      { id: "c", mask: busy([[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]]) },
    ];
    const everyone = rankWindows(people, { activity: "study" });
    assert.ok(everyone.every((w) => w.day !== 2));
    const most = rankWindows(people, { activity: "study", minFree: 2 });
    const wednesday = most.find((w) => w.day === 2)!;
    assert.deepEqual(wednesday.missing, ["c"]);
    assert.ok(everyone[0].score > wednesday.score);
  });

  it("proposes the lunch break for chai but not for studying", () => {
    const people = [
      { id: "a", mask: busy([[0, 2]]) },
      { id: "b", mask: busy([[0, 3]]) },
    ];
    const chai = rankWindows(people, { activity: "gossip", includeBreak: true });
    assert.ok(chai.some((w) => w.kind === "break" && w.day === 0));
    const study = rankWindows(people, { activity: "study", includeBreak: true });
    assert.ok(study.every((w) => w.kind === "gap"));
  });

  it("needs at least two people", () => {
    assert.deepEqual(rankWindows([{ id: "a", mask: 0 }]), []);
  });
});

describe("campus dates", () => {
  it("converts to Pakistan time", () => {
    const now = campusNow(new Date(Date.UTC(2026, 9, 9, 9, 0)));
    assert.deepEqual(now, { date: "2026-10-09", weekday: 5, minutes: mins(14) });
    const late = campusNow(new Date(Date.UTC(2026, 9, 9, 20, 0)));
    assert.equal(late.date, "2026-10-10");
    assert.equal(late.weekday, 6);
  });

  it("finds the next time a window has not started yet", () => {
    const friday2pm = { date: "2026-10-09", weekday: 5, minutes: mins(14) };
    const monday = { day: 0, start: 1, end: 1, kind: "gap" as const };
    assert.equal(nextDateFor(monday, friday2pm), "2026-10-12");
    const fridayL5 = { day: 4, start: 4, end: 4, kind: "gap" as const };
    assert.equal(nextDateFor(fridayL5, friday2pm), "2026-10-09");
    const friday4pm = { ...friday2pm, minutes: mins(16) };
    assert.equal(nextDateFor(fridayL5, friday4pm), "2026-10-16");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });

  it("tells upcoming, live and past apart", () => {
    const w = { start: 2, end: 2, kind: "gap" as const };
    const day = "2026-10-09";
    assert.equal(phaseOf(day, w, { date: day, weekday: 5, minutes: mins(11) }), "upcoming");
    assert.equal(phaseOf(day, w, { date: day, weekday: 5, minutes: mins(12) }), "live");
    assert.equal(phaseOf(day, w, { date: day, weekday: 5, minutes: mins(14) }), "past");
    assert.equal(phaseOf(day, w, { date: "2026-10-08", weekday: 4, minutes: 0 }), "upcoming");
  });

  it("formats durations", () => {
    assert.equal(formatDuration(45), "45m");
    assert.equal(formatDuration(120), "2h");
    assert.equal(formatDuration(100), "1h 40m");
  });
});

describe("meetupStatus", () => {
  const base = { cancelled: false, phase: "upcoming" as const, quorum: "all" as const, quorumN: null };

  it("needs everyone when the quorum is all", () => {
    assert.equal(meetupStatus({ ...base, responses: ["accepted", "pending", "accepted"] }), "proposed");
    assert.equal(meetupStatus({ ...base, responses: ["accepted", "accepted", "accepted"] }), "confirmed");
    assert.equal(meetupStatus({ ...base, responses: ["accepted", "declined", "accepted"] }), "needs_change");
  });

  it("confirms with a smaller quorum and survives a decline", () => {
    const some = { ...base, quorum: "some" as const, quorumN: 2 };
    assert.equal(meetupStatus({ ...some, responses: ["accepted", "declined", "pending"] }), "proposed");
    assert.equal(meetupStatus({ ...some, responses: ["accepted", "declined", "accepted"] }), "confirmed");
    assert.equal(meetupStatus({ ...some, responses: ["accepted", "declined", "declined"] }), "needs_change");
  });

  it("turns into done or expired once the time has passed", () => {
    const past = { ...base, phase: "past" as const };
    assert.equal(meetupStatus({ ...past, responses: ["accepted", "accepted"] }), "done");
    assert.equal(meetupStatus({ ...past, responses: ["accepted", "pending"] }), "expired");
    assert.equal(meetupStatus({ ...base, cancelled: true, responses: ["accepted"] }), "cancelled");
  });
});
