/**
 * Server-only building blocks for the friends features.
 *
 * The rule that everything here enforces: a timetable only leaves the server
 * after `Visibility` has decided how much of it the viewer may see, and the
 * response is built from that decision. Nothing is "hidden in the UI".
 */
import { randomInt, randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { batches } from "@/lib/schedule";
import { isLevel, maskOf, minLevel, type Level } from "./engine.ts";
import { personalEntries, toPublicClass } from "./personal.ts";
import type { SharedWeek } from "./types.ts";

export type { Sql };

/** An error whose message is safe and useful to show to the person. */
export class SocialError extends Error {}

export function fail(message: string): never {
  throw new SocialError(message);
}

export type ProfileRow = {
  user_id: string;
  display_name: string;
  batch_id: number;
  friend_code: string;
  discoverable: boolean;
  default_share: Level;
  dropped: string[];
  added: string[];
  away_date: string | null;
};

const PROFILE_COLUMNS =
  "user_id, display_name, batch_id, friend_code, discoverable, default_share, dropped, added, away_date";

export function placeholders(count: number, offset = 1): string {
  return Array.from({ length: count }, (_, i) => `$${i + offset}`).join(", ");
}

export function uniq<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

export function newId(): string {
  return randomUUID();
}

// ── Friend codes ────────────────────────────────────────────────────────────

// No 0/O or 1/I/L, so a code read aloud or copied by hand is hard to get wrong.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === 6 ? code : null;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

// ── Profiles ────────────────────────────────────────────────────────────────

export async function getProfile(sql: Sql, userId: string): Promise<ProfileRow | null> {
  const rows = await sql.query<ProfileRow>(
    `select ${PROFILE_COLUMNS} from profiles where user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function requireProfile(sql: Sql, userId: string): Promise<ProfileRow> {
  const profile = await getProfile(sql, userId);
  if (!profile) fail("Set up your timetable first.");
  return profile;
}

export async function loadProfiles(sql: Sql, ids: string[]): Promise<Map<string, ProfileRow>> {
  const list = uniq(ids);
  const map = new Map<string, ProfileRow>();
  if (list.length === 0) return map;
  const rows = await sql.query<ProfileRow>(
    `select ${PROFILE_COLUMNS} from profiles where user_id in (${placeholders(list.length)})`,
    list,
  );
  for (const row of rows) map.set(row.user_id, row);
  return map;
}

export function batchLabel(batchId: number): string {
  return batches[batchId] ?? "";
}

export function profileMask(profile: ProfileRow): number {
  return maskOf(personalEntries(profile.batch_id, profile.dropped, profile.added));
}

export function levelOrDefault(value: unknown, fallback: Level): Level {
  return isLevel(value) ? value : fallback;
}

// ── Friendships ─────────────────────────────────────────────────────────────

export async function acceptedFriendIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ requester_id: string; addressee_id: string }>`
    select requester_id, addressee_id from friendships
    where status = 'accepted' and (requester_id = ${userId} or addressee_id = ${userId})`;
  return rows.map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id));
}

export async function areFriends(sql: Sql, a: string, b: string): Promise<boolean> {
  const rows = await sql`
    select 1 as ok from friendships
    where status = 'accepted'
      and ((requester_id = ${a} and addressee_id = ${b})
        or (requester_id = ${b} and addressee_id = ${a}))
    limit 1`;
  return rows.length > 0;
}

export async function isBlockedEitherWay(sql: Sql, a: string, b: string): Promise<boolean> {
  const rows = await sql`
    select 1 as ok from blocks
    where (blocker_id = ${a} and blocked_id = ${b}) or (blocker_id = ${b} and blocked_id = ${a})
    limit 1`;
  return rows.length > 0;
}

// ── Visibility: who may see how much of whose timetable ────────────────────

export type Visibility = {
  /** Level the owner gives the viewer as a friend. Non-friends get `none`. */
  friendLevel: (owner: ProfileRow) => Level;
  /**
   * Level the owner gives the viewer inside a group. If the two are also
   * friends and the owner set something explicit for that friend, the stricter
   * of the two wins.
   */
  groupLevel: (owner: ProfileRow, groupId: string) => Level;
};

export async function loadVisibility(
  sql: Sql,
  viewerId: string,
  owners: ProfileRow[],
  groupIds: string[],
): Promise<Visibility> {
  const ownerIds = uniq(owners.map((owner) => owner.user_id).filter((id) => id !== viewerId));
  const friendExplicit = new Map<string, Level>();
  const friends = new Set<string>();
  const blocked = new Set<string>();
  const groupExplicit = new Map<string, Level>();

  if (ownerIds.length > 0) {
    const ph = placeholders(ownerIds.length, 2);
    const explicit = await sql.query<{ owner_id: string; level: Level }>(
      `select owner_id, level from share_settings
       where kind = 'friend' and target_id = $1 and owner_id in (${ph})`,
      [viewerId, ...ownerIds],
    );
    for (const row of explicit) friendExplicit.set(row.owner_id, row.level);

    const pairs = await sql.query<{ requester_id: string; addressee_id: string }>(
      `select requester_id, addressee_id from friendships
       where status = 'accepted'
         and ((requester_id = $1 and addressee_id in (${ph}))
           or (addressee_id = $1 and requester_id in (${ph})))`,
      [viewerId, ...ownerIds],
    );
    for (const row of pairs) {
      friends.add(row.requester_id === viewerId ? row.addressee_id : row.requester_id);
    }

    const blockRows = await sql.query<{ blocker_id: string; blocked_id: string }>(
      `select blocker_id, blocked_id from blocks
       where (blocker_id = $1 and blocked_id in (${ph}))
          or (blocked_id = $1 and blocker_id in (${ph}))`,
      [viewerId, ...ownerIds],
    );
    for (const row of blockRows) {
      blocked.add(row.blocker_id === viewerId ? row.blocked_id : row.blocker_id);
    }

    if (groupIds.length > 0) {
      const groups = await sql.query<{ owner_id: string; target_id: string; level: Level }>(
        `select owner_id, target_id, level from share_settings
         where kind = 'group'
           and target_id in (${placeholders(groupIds.length)})
           and owner_id in (${placeholders(ownerIds.length, groupIds.length + 1)})`,
        [...groupIds, ...ownerIds],
      );
      for (const row of groups) groupExplicit.set(`${row.owner_id}|${row.target_id}`, row.level);
    }
  }

  return {
    friendLevel(owner) {
      if (owner.user_id === viewerId) return "full";
      if (blocked.has(owner.user_id) || !friends.has(owner.user_id)) return "none";
      return friendExplicit.get(owner.user_id) ?? owner.default_share;
    },
    groupLevel(owner, groupId) {
      if (owner.user_id === viewerId) return "full";
      if (blocked.has(owner.user_id)) return "none";
      const inGroup = groupExplicit.get(`${owner.user_id}|${groupId}`) ?? owner.default_share;
      const direct = friends.has(owner.user_id) ? friendExplicit.get(owner.user_id) : undefined;
      return direct ? minLevel(inGroup, direct) : inGroup;
    },
  };
}

/** Build the slice of `owner`'s week that a viewer at `level` may receive. */
export function sharedWeek(owner: ProfileRow, level: Level): SharedWeek {
  if (level === "none") return { level, mask: null, classes: null, awayDate: null };
  const list = personalEntries(owner.batch_id, owner.dropped, owner.added);
  return {
    level,
    mask: maskOf(list),
    classes: level === "full" ? list.map(toPublicClass) : null,
    awayDate: owner.away_date,
  };
}

// ── Groups ──────────────────────────────────────────────────────────────────

export const MAX_GROUP_SIZE = 10;
export const MIN_GROUP_SIZE = 3;

export async function joinedGroupIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ group_id: string }>`
    select group_id from group_members where user_id = ${userId} and status = 'joined'`;
  return rows.map((row) => row.group_id);
}

export async function isJoinedMember(sql: Sql, groupId: string, userId: string): Promise<boolean> {
  const rows = await sql`
    select 1 as ok from group_members
    where group_id = ${groupId} and user_id = ${userId} and status = 'joined'`;
  return rows.length > 0;
}
