import type { Phase } from "./engine.ts";

export type MeetupResponse = "pending" | "accepted" | "declined";

export type MeetupStatus =
  | "proposed"
  | "confirmed"
  | "needs_change"
  | "cancelled"
  | "expired"
  | "done";

/**
 * Where a meetup stands. `responses` includes the organiser, who counts as
 * having accepted. "all" needs everyone; "some" needs `quorumN` people.
 *
 *   proposed -> confirmed        enough people accepted
 *   proposed -> needs_change     too many declined for it to ever be confirmed
 *   confirmed -> done            the time has passed
 *   proposed/needs_change -> expired   the time passed without it being confirmed
 */
export function meetupStatus(input: {
  cancelled: boolean;
  phase: Phase;
  quorum: "all" | "some";
  quorumN: number | null;
  responses: MeetupResponse[];
}): MeetupStatus {
  const total = input.responses.length;
  const accepted = input.responses.filter((r) => r === "accepted").length;
  const declined = input.responses.filter((r) => r === "declined").length;
  const needed = input.quorum === "all" ? total : Math.min(total, input.quorumN ?? total);
  const met = accepted >= needed;
  const impossible = total - declined < needed;

  if (input.cancelled) return "cancelled";
  if (input.phase === "past") return met ? "done" : "expired";
  if (met) return "confirmed";
  if (impossible) return "needs_change";
  return "proposed";
}
