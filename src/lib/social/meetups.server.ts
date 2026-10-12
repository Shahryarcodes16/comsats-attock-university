import {
  areFriends,
  fail,
  getProfile,
  isBlockedEitherWay,
  isJoinedMember,
  loadProfiles,
  loadVisibility,
  newId,
  profileMask,
  requireProfile,
  type Sql,
} from "./core.server.ts";
import {
  campusNow,
  dateLabel,
  isActivity,
  nextDateFor,
  phaseOf,
  rankWindows,
  windowFitsMask,
  windowLabel,
  type Activity,
  type Person,
  type Window,
} from "./engine.ts";
import type { Proposal, SlotChoice } from "./types.ts";

export type AudienceInput = { kind: "friend" | "group"; id: string };

type Resolved = { label: string; memberIds: string[]; groupId: string | null };

async function resolveAudience(sql: Sql, me: string, audience: AudienceInput): Promise<Resolved> {
  if (audience.kind === "friend") {
    if (!(await areFriends(sql, me, audience.id)) || (await isBlockedEitherWay(sql, me, audience.id))) {
      fail("You can only plan with your friends.");
    }
    const friend = await getProfile(sql, audience.id);
    if (!friend) fail("That friend isn't available.");
    return { label: friend.display_name, memberIds: [me, audience.id], groupId: null };
  }
  if (!(await isJoinedMember(sql, audience.id, me))) fail("You're not in that group.");
  const groups = await sql<{ name: string; emoji: string }>`select name, emoji from groups where id = ${audience.id}`;
  if (!groups[0]) fail("That group doesn't exist any more.");
  const members = await sql<{ user_id: string }>`
    select user_id from group_members where group_id = ${audience.id} and status = 'joined'`;
  return {
    label: `${groups[0].emoji ? `${groups[0].emoji} ` : ""}${groups[0].name}`.trim(),
    memberIds: members.map((row) => row.user_id),
    groupId: audience.id,
  };
}

/** The people whose availability the viewer may use, and who is off limits. */
async function peopleFor(
  sql: Sql,
  me: string,
  resolved: Resolved,
): Promise<{ people: Person[]; names: Map<string, string>; unshared: string[] }> {
  const profiles = await loadProfiles(sql, resolved.memberIds);
  const visibility = await loadVisibility(
    sql,
    me,
    [...profiles.values()],
    resolved.groupId ? [resolved.groupId] : [],
  );
  const people: Person[] = [];
  const names = new Map<string, string>();
  const unshared: string[] = [];
  for (const id of resolved.memberIds) {
    const profile = profiles.get(id);
    if (!profile) continue;
    names.set(id, profile.display_name);
    const level =
      id === me
        ? "full"
        : resolved.groupId
          ? visibility.groupLevel(profile, resolved.groupId)
          : visibility.friendLevel(profile);
    if (level === "none") unshared.push(profile.display_name);
    else people.push({ id, mask: profileMask(profile) });
  }
  return { people, names, unshared };
}

function validSlot(input: SlotChoice): SlotChoice {
  const ints = [input.day, input.start, input.end].every((n) => Number.isInteger(n));
  if (!ints || input.day < 0 || input.day > 4) fail("Pick a time from the suggestions.");
  if (input.kind === "break") return { day: input.day, start: 2, end: 3, kind: "break" };
  if (input.kind !== "gap" || input.start < 0 || input.end > 4 || input.start > input.end) {
    fail("Pick a time from the suggestions.");
  }
  return { day: input.day, start: input.start, end: input.end, kind: "gap" };
}

export async function proposeTimes(
  sql: Sql,
  me: string,
  audience: AudienceInput,
  activity: Activity,
): Promise<Proposal> {
  await requireProfile(sql, me);
  if (!isActivity(activity)) fail("Pick what you want to do.");
  const resolved = await resolveAudience(sql, me, audience);
  const { people, names, unshared } = await peopleFor(sql, me, resolved);
  const empty: Proposal = { windows: [], unshared, considered: people.length };
  if (people.length < 2) return empty;

  const options = { activity, includeBreak: activity === "gossip" };
  let ranked = rankWindows(people, options).filter((w) => w.free.includes(me));
  if (ranked.length === 0 && people.length >= 3) {
    ranked = rankWindows(people, { ...options, minFree: Math.max(2, Math.ceil(people.length / 2)) }).filter(
      (w) => w.free.includes(me),
    );
  }

  // Offer different days where possible, so the choices are genuinely different.
  const picked: Window[] = [];
  const days = new Set<number>();
  for (const w of ranked) {
    if (picked.length === 3) break;
    if (days.has(w.day)) continue;
    picked.push(w);
    days.add(w.day);
  }
  for (const w of ranked) {
    if (picked.length === 3) break;
    if (!picked.includes(w)) picked.push(w);
  }

  const now = campusNow();
  return {
    ...empty,
    windows: picked.map((w) => {
      const onDate = nextDateFor(w, now);
      return {
        day: w.day,
        start: w.start,
        end: w.end,
        kind: w.kind,
        label: windowLabel(w),
        dateLabel: dateLabel(onDate, now),
        onDate,
        minutes: w.minutes,
        freeNames: w.free.map((id) => names.get(id) ?? "").filter(Boolean),
        missingNames: w.missing.map((id) => names.get(id) ?? "").filter(Boolean),
      };
    }),
  };
}

export type NewMeetup = {
  audience: AudienceInput;
  activity: Activity;
  slot: SlotChoice;
  quorum: "all" | "some";
  quorumN: number | null;
  note: string;
};

const MAX_ACTIVE_PER_PERSON = 25;

export async function createMeetup(sql: Sql, me: string, input: NewMeetup): Promise<string> {
  const mine = await requireProfile(sql, me);
  if (!isActivity(input.activity)) fail("Pick what you want to do.");
  const slot = validSlot(input.slot);
  const resolved = await resolveAudience(sql, me, input.audience);
  if (resolved.memberIds.length < 2) fail("There's no one else to invite yet.");
  if (!windowFitsMask(profileMask(mine), slot)) fail("You have a class during that time.");

  let quorumN: number | null = null;
  if (input.quorum === "some") {
    quorumN = input.quorumN ?? 0;
    if (!Number.isInteger(quorumN) || quorumN < 2 || quorumN > resolved.memberIds.length) {
      fail(`Pick between 2 and ${resolved.memberIds.length} people for the minimum.`);
    }
  }

  const now = campusNow();
  const onDate = nextDateFor(slot, now);
  const active = await sql<{ n: number }>`
    select count(*) as n from meetups
    where creator_id = ${me} and status = 'active' and on_date >= ${now.date}`;
  if ((active[0]?.n ?? 0) >= MAX_ACTIVE_PER_PERSON) {
    fail("You have a lot of plans open. Cancel a few before making more.");
  }
  const duplicate = await sql`
    select 1 as ok from meetups
    where creator_id = ${me} and status = 'active' and audience_kind = ${input.audience.kind}
      and audience_id = ${input.audience.id} and day = ${slot.day} and start_slot = ${slot.start}
      and end_slot = ${slot.end} and kind = ${slot.kind} and on_date = ${onDate}`;
  if (duplicate.length > 0) fail("You've already proposed that time to them.");

  const id = newId();
  const note = input.note.trim().slice(0, 200);
  await sql`
    insert into meetups
      (id, creator_id, activity, audience_kind, audience_id, day, start_slot, end_slot, kind,
       on_date, quorum, quorum_n, note)
    values
      (${id}, ${me}, ${input.activity}, ${input.audience.kind}, ${input.audience.id}, ${slot.day},
       ${slot.start}, ${slot.end}, ${slot.kind}, ${onDate}, ${input.quorum}, ${quorumN}, ${note})`;
  for (const memberId of resolved.memberIds) {
    const accepted = memberId === me;
    await sql`
      insert into meetup_participants (meetup_id, user_id, response, responded_at)
      values (${id}, ${memberId}, ${accepted ? "accepted" : "pending"}, ${accepted ? new Date().toISOString() : null})`;
  }
  return id;
}

type MeetupRow = {
  id: string;
  creator_id: string;
  day: number;
  start_slot: number;
  end_slot: number;
  kind: "gap" | "break";
  on_date: string;
  status: "active" | "cancelled";
};

async function loadMeetup(sql: Sql, id: string): Promise<MeetupRow> {
  const rows = await sql<MeetupRow>`
    select id, creator_id, day, start_slot, end_slot, kind, on_date, status from meetups where id = ${id}`;
  if (!rows[0]) fail("That plan doesn't exist any more.");
  return rows[0];
}

function ensureOpen(row: MeetupRow): void {
  if (row.status === "cancelled") fail("That plan was cancelled.");
  const phase = phaseOf(
    row.on_date,
    { start: row.start_slot, end: row.end_slot, kind: row.kind },
    campusNow(),
  );
  if (phase === "past") fail("That plan is already over.");
}

async function requireParticipant(sql: Sql, meetupId: string, userId: string): Promise<void> {
  const rows = await sql`
    select 1 as ok from meetup_participants where meetup_id = ${meetupId} and user_id = ${userId}`;
  if (rows.length === 0) fail("You're not part of that plan.");
}

export async function respondToMeetup(
  sql: Sql,
  me: string,
  meetupId: string,
  accept: boolean,
): Promise<void> {
  const row = await loadMeetup(sql, meetupId);
  await requireParticipant(sql, meetupId, me);
  if (row.creator_id === me) fail("You organised this one. Cancel it if your plans changed.");
  ensureOpen(row);
  await sql`
    update meetup_participants set response = ${accept ? "accepted" : "declined"}, responded_at = now()
    where meetup_id = ${meetupId} and user_id = ${me}`;
  if (accept) await sql`delete from meetup_counters where meetup_id = ${meetupId} and user_id = ${me}`;
}

export async function counterPropose(
  sql: Sql,
  me: string,
  meetupId: string,
  input: SlotChoice,
): Promise<void> {
  const slot = validSlot(input);
  const row = await loadMeetup(sql, meetupId);
  await requireParticipant(sql, meetupId, me);
  if (row.creator_id === me) fail("Use “Change time” on your own plan.");
  ensureOpen(row);
  const mine = await requireProfile(sql, me);
  if (!windowFitsMask(profileMask(mine), slot)) fail("You have a class during that time.");
  await sql`
    insert into meetup_counters (meetup_id, user_id, day, start_slot, end_slot, kind)
    values (${meetupId}, ${me}, ${slot.day}, ${slot.start}, ${slot.end}, ${slot.kind})
    on conflict (meetup_id, user_id) do update
      set day = excluded.day, start_slot = excluded.start_slot, end_slot = excluded.end_slot,
          kind = excluded.kind, created_at = now()`;
}

/** The organiser moves the plan to a new slot; everyone has to answer again. */
export async function rescheduleMeetup(
  sql: Sql,
  me: string,
  meetupId: string,
  input: SlotChoice,
): Promise<void> {
  const slot = validSlot(input);
  const row = await loadMeetup(sql, meetupId);
  if (row.creator_id !== me) fail("Only the organiser can change the time.");
  ensureOpen(row);
  const mine = await requireProfile(sql, me);
  if (!windowFitsMask(profileMask(mine), slot)) fail("You have a class during that time.");
  const onDate = nextDateFor(slot, campusNow());
  await sql`
    update meetups set day = ${slot.day}, start_slot = ${slot.start}, end_slot = ${slot.end},
      kind = ${slot.kind}, on_date = ${onDate}, updated_at = now()
    where id = ${meetupId}`;
  await sql`
    update meetup_participants set response = 'pending', responded_at = null
    where meetup_id = ${meetupId} and user_id <> ${me}`;
  await sql`delete from meetup_counters where meetup_id = ${meetupId}`;
}

export async function cancelMeetup(sql: Sql, me: string, meetupId: string): Promise<void> {
  const row = await loadMeetup(sql, meetupId);
  if (row.creator_id !== me) fail("Only the organiser can cancel this plan.");
  await sql`update meetups set status = 'cancelled', updated_at = now() where id = ${meetupId}`;
}
