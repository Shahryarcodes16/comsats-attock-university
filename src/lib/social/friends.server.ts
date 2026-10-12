import { batches, programOf } from "@/lib/schedule";
import {
  acceptedFriendIds,
  areFriends,
  fail,
  formatCode,
  getProfile,
  isJoinedMember,
  isBlockedEitherWay,
  newCode,
  normalizeCode,
  requireProfile,
  type ProfileRow,
  type Sql,
} from "./core.server.ts";
import { campusNow, isLevel, type Level } from "./engine.ts";
import { entriesForKey, entryKey, isEntryKey, personalEntries } from "./personal.ts";
import type { CodeLookup, ProfileDTO, SuggestionDTO } from "./types.ts";

// ── Profile ─────────────────────────────────────────────────────────────────

export type ProfileInput = {
  name: string;
  batchId: number;
  discoverable: boolean;
  defaultShare: Level;
  dropped: string[];
  added: string[];
};

export function toProfileDTO(row: ProfileRow): ProfileDTO {
  return {
    userId: row.user_id,
    name: row.display_name,
    batchId: row.batch_id,
    code: formatCode(row.friend_code),
    discoverable: row.discoverable,
    defaultShare: row.default_share,
    dropped: row.dropped,
    added: row.added,
    awayDate: row.away_date,
  };
}

function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 1) fail("Add a name your friends will recognise.");
  if (name.length > 40) fail("That name is too long (40 characters at most).");
  return name;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

export async function saveProfile(sql: Sql, userId: string, input: ProfileInput): Promise<void> {
  const name = cleanName(input.name);
  if (!Number.isInteger(input.batchId) || input.batchId < 0 || input.batchId >= batches.length) {
    fail("Pick your batch from the list.");
  }
  if (!isLevel(input.defaultShare)) fail("Pick what friends can see by default.");
  const dropped = [...new Set(input.dropped.filter(isEntryKey))].slice(0, 120);
  const added = [...new Set(input.added.filter((key) => isEntryKey(key) && entriesForKey(key).length > 0))].slice(
    0,
    60,
  );

  const existing = await getProfile(sql, userId);
  if (existing) {
    await sql`
      update profiles set
        display_name = ${name},
        batch_id = ${input.batchId},
        discoverable = ${input.discoverable},
        default_share = ${input.defaultShare},
        dropped = ${JSON.stringify(dropped)}::jsonb,
        added = ${JSON.stringify(added)}::jsonb,
        updated_at = now()
      where user_id = ${userId}`;
    return;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await sql`
        insert into profiles
          (user_id, display_name, batch_id, friend_code, discoverable, default_share, dropped, added)
        values
          (${userId}, ${name}, ${input.batchId}, ${newCode()}, ${input.discoverable},
           ${input.defaultShare}, ${JSON.stringify(dropped)}::jsonb, ${JSON.stringify(added)}::jsonb)`;
      return;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Either a code collision (retry with a new code) or a double submit.
      if (await getProfile(sql, userId)) return;
    }
  }
  fail("Couldn't create your profile. Please try again.");
}

export async function setAway(sql: Sql, userId: string, away: boolean): Promise<void> {
  await requireProfile(sql, userId);
  const today = campusNow().date;
  await sql`update profiles set away_date = ${away ? today : null} where user_id = ${userId}`;
}

// ── Friend codes and requests ──────────────────────────────────────────────

type FriendshipRow = {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
};

async function friendshipBetween(sql: Sql, a: string, b: string): Promise<FriendshipRow[]> {
  return sql<FriendshipRow>`
    select id, requester_id, addressee_id, status from friendships
    where (requester_id = ${a} and addressee_id = ${b}) or (requester_id = ${b} and addressee_id = ${a})`;
}

export async function lookupCode(sql: Sql, me: string, rawCode: string): Promise<CodeLookup> {
  await requireProfile(sql, me);
  const code = normalizeCode(rawCode);
  if (!code) return { found: false };
  const rows = await sql<{ user_id: string }>`select user_id from profiles where friend_code = ${code}`;
  const targetId = rows[0]?.user_id;
  if (!targetId) return { found: false };
  if (await isBlockedEitherWay(sql, me, targetId)) return { found: false };
  const target = await getProfile(sql, targetId);
  if (!target) return { found: false };
  let relation: "none" | "friends" | "requested" | "incoming" = "none";
  if (targetId !== me) {
    const rowsBetween = await friendshipBetween(sql, me, targetId);
    for (const row of rowsBetween) {
      if (row.status === "accepted") relation = "friends";
      else if (row.requester_id === me) relation = "requested";
      else relation = "incoming";
    }
  }
  return {
    found: true,
    userId: target.user_id,
    name: target.display_name,
    batchId: target.batch_id,
    isMe: targetId === me,
    relation,
  };
}

const REQUESTS_PER_HOUR = 15;
const MAX_OPEN_REQUESTS = 40;

export type RequestOutcome = "requested" | "accepted" | "already_friends";

async function sendRequest(sql: Sql, me: string, target: ProfileRow): Promise<RequestOutcome> {
  if (target.user_id === me) fail("That's your own code.");
  // Never reveal that someone blocked you: it looks the same as an unknown code.
  if (await isBlockedEitherWay(sql, me, target.user_id)) fail("We couldn't find anyone with that code.");

  const existing = await friendshipBetween(sql, me, target.user_id);
  if (existing.some((row) => row.status === "accepted")) return "already_friends";

  // They already asked (or you declined them before): wanting it now settles it.
  const theirs = existing.find((row) => row.requester_id === target.user_id);
  if (theirs) {
    await sql`
      update friendships set status = 'accepted', responded_at = now() where id = ${theirs.id}`;
    return "accepted";
  }
  if (existing.some((row) => row.requester_id === me)) return "requested";

  const recent = await sql<{ n: number }>`
    select count(*) as n from friendships
    where requester_id = ${me} and created_at > now() - interval '1 hour'`;
  if ((recent[0]?.n ?? 0) >= REQUESTS_PER_HOUR) {
    fail("You've sent a lot of requests. Try again in a little while.");
  }
  const open = await sql<{ n: number }>`
    select count(*) as n from friendships where requester_id = ${me} and status <> 'accepted'`;
  if ((open[0]?.n ?? 0) >= MAX_OPEN_REQUESTS) {
    fail("You have too many requests waiting. Wait for some answers first.");
  }

  try {
    await sql`insert into friendships (requester_id, addressee_id) values (${me}, ${target.user_id})`;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return "requested";
}

export async function requestByCode(sql: Sql, me: string, rawCode: string): Promise<RequestOutcome> {
  await requireProfile(sql, me);
  const code = normalizeCode(rawCode);
  if (!code) fail("Friend codes have 6 letters and numbers, like K7M-2QX.");
  const rows = await sql<{ user_id: string }>`select user_id from profiles where friend_code = ${code}`;
  const target = rows[0] ? await getProfile(sql, rows[0].user_id) : null;
  if (!target) fail("We couldn't find anyone with that code.");
  return sendRequest(sql, me, target);
}

/** Only people who opted in to suggestions can be asked this way. */
export async function requestUser(sql: Sql, me: string, targetId: string): Promise<RequestOutcome> {
  await requireProfile(sql, me);
  const target = await getProfile(sql, targetId);
  if (!target || !target.discoverable) fail("That person isn't available to add.");
  return sendRequest(sql, me, target);
}

export async function respondToRequest(
  sql: Sql,
  me: string,
  friendshipId: number,
  accept: boolean,
): Promise<void> {
  const rows = await sql<FriendshipRow>`
    select id, requester_id, addressee_id, status from friendships
    where id = ${friendshipId} and addressee_id = ${me}`;
  const row = rows[0];
  if (!row || row.status !== "pending") fail("That request isn't waiting any more.");
  if (accept) {
    if (await isBlockedEitherWay(sql, me, row.requester_id)) fail("That request isn't waiting any more.");
    await sql`update friendships set status = 'accepted', responded_at = now() where id = ${row.id}`;
  } else {
    await sql`update friendships set status = 'declined', responded_at = now() where id = ${row.id}`;
  }
}

export async function removeFriend(sql: Sql, me: string, otherId: string): Promise<void> {
  await sql`
    delete from friendships
    where (requester_id = ${me} and addressee_id = ${otherId})
       or (requester_id = ${otherId} and addressee_id = ${me})`;
  await sql`
    delete from share_settings
    where kind = 'friend'
      and ((owner_id = ${me} and target_id = ${otherId}) or (owner_id = ${otherId} and target_id = ${me}))`;
  await sql`
    delete from friend_prefs
    where (user_id = ${me} and friend_id = ${otherId}) or (user_id = ${otherId} and friend_id = ${me})`;
}

export async function blockUser(sql: Sql, me: string, otherId: string): Promise<void> {
  if (otherId === me) fail("You can't block yourself.");
  await removeFriend(sql, me, otherId);
  await sql`
    insert into blocks (blocker_id, blocked_id) values (${me}, ${otherId})
    on conflict (blocker_id, blocked_id) do nothing`;
}

export async function unblockUser(sql: Sql, me: string, otherId: string): Promise<void> {
  await sql`delete from blocks where blocker_id = ${me} and blocked_id = ${otherId}`;
}

export async function reportUser(sql: Sql, me: string, otherId: string, reason: string): Promise<void> {
  if (otherId === me) fail("You can't report yourself.");
  const trimmed = reason.trim().slice(0, 500);
  await sql`insert into reports (reporter_id, reported_id, reason) values (${me}, ${otherId}, ${trimmed})`;
}

// ── Privacy and muting ─────────────────────────────────────────────────────

export type ShareTarget =
  | { kind: "default"; level: Level }
  | { kind: "friend"; targetId: string; level: Level | "default" }
  | { kind: "group"; targetId: string; level: Level | "default" };

export async function setShare(sql: Sql, me: string, target: ShareTarget): Promise<void> {
  await requireProfile(sql, me);
  if (target.kind === "default") {
    await sql`update profiles set default_share = ${target.level}, updated_at = now() where user_id = ${me}`;
    return;
  }
  if (target.kind === "friend") {
    if (!(await areFriends(sql, me, target.targetId))) fail("You can only set this for a friend.");
  } else if (!(await isJoinedMember(sql, target.targetId, me))) {
    fail("You can only set this for a group you've joined.");
  }
  if (target.level === "default") {
    await sql`
      delete from share_settings
      where owner_id = ${me} and kind = ${target.kind} and target_id = ${target.targetId}`;
    return;
  }
  await sql`
    insert into share_settings (owner_id, kind, target_id, level)
    values (${me}, ${target.kind}, ${target.targetId}, ${target.level})
    on conflict (owner_id, kind, target_id) do update set level = excluded.level`;
}

export async function setMute(sql: Sql, me: string, friendId: string, hide: boolean): Promise<void> {
  if (!(await areFriends(sql, me, friendId))) fail("That person isn't one of your friends.");
  await sql`
    insert into friend_prefs (user_id, friend_id, hide_status) values (${me}, ${friendId}, ${hide})
    on conflict (user_id, friend_id) do update set hide_status = excluded.hide_status`;
}

// ── Suggestions ─────────────────────────────────────────────────────────────

/**
 * People who opted in and share your batch or classes. Only a name, a batch and
 * a count of shared classes are returned; nothing live, and nobody who is
 * already a friend, blocked, or has a request in either direction (including
 * ones that were declined, so no one keeps reappearing).
 */
export async function suggestions(sql: Sql, me: string): Promise<SuggestionDTO[]> {
  const mine = await requireProfile(sql, me);
  const myKeys = new Set(personalEntries(mine.batch_id, mine.dropped, mine.added).map(entryKey));

  const taken = new Set<string>([me, ...(await acceptedFriendIds(sql, me))]);
  const related = await sql<{ other: string }>`
    select addressee_id as other from friendships where requester_id = ${me}
    union select requester_id as other from friendships where addressee_id = ${me}
    union select blocked_id as other from blocks where blocker_id = ${me}
    union select blocker_id as other from blocks where blocked_id = ${me}`;
  for (const row of related) taken.add(row.other);

  const pool = await sql<ProfileRow>`
    select user_id, display_name, batch_id, friend_code, discoverable, default_share, dropped, added, away_date
    from profiles where discoverable = true and user_id <> ${me}
    order by created_at desc limit 500`;

  const result: SuggestionDTO[] = [];
  for (const candidate of pool) {
    if (taken.has(candidate.user_id)) continue;
    const theirs = personalEntries(candidate.batch_id, candidate.dropped, candidate.added).map(entryKey);
    let shared = 0;
    for (const key of new Set(theirs)) if (myKeys.has(key)) shared += 1;
    const sameBatch = candidate.batch_id === mine.batch_id;
    const sameProgram = programOf(batches[candidate.batch_id] ?? "") === programOf(batches[mine.batch_id] ?? "");
    if (shared === 0 && !sameBatch && !sameProgram) continue;
    result.push({
      userId: candidate.user_id,
      name: candidate.display_name,
      batchId: candidate.batch_id,
      sharedClasses: shared,
      sameBatch,
    });
  }
  return result
    .sort(
      (a, b) =>
        Number(b.sameBatch) - Number(a.sameBatch) ||
        b.sharedClasses - a.sharedClasses ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 60);
}
