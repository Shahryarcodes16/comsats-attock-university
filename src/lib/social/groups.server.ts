import {
  MAX_GROUP_SIZE,
  MIN_GROUP_SIZE,
  acceptedFriendIds,
  fail,
  newId,
  requireProfile,
  uniq,
  type Sql,
} from "./core.server.ts";

export type NewGroup = { name: string; emoji: string; memberIds: string[] };

function cleanGroupName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 1) fail("Give the group a name, like “FYP team”.");
  if (name.length > 40) fail("That group name is too long (40 characters at most).");
  return name;
}

// A group emoji is at most a couple of characters; keep it short and plain.
function cleanEmoji(raw: string): string {
  return [...raw.trim()].slice(0, 2).join("");
}

async function requireFriends(sql: Sql, me: string, ids: string[]): Promise<void> {
  const friends = new Set(await acceptedFriendIds(sql, me));
  for (const id of ids) {
    if (!friends.has(id)) fail("You can only add people who are already your friends.");
  }
}

async function requireOwner(sql: Sql, me: string, groupId: string): Promise<void> {
  const rows = await sql`select 1 as ok from groups where id = ${groupId} and owner_id = ${me}`;
  if (rows.length === 0) fail("Only the person who made the group can do that.");
}

export async function createGroup(sql: Sql, me: string, input: NewGroup): Promise<string> {
  await requireProfile(sql, me);
  const name = cleanGroupName(input.name);
  const memberIds = uniq(input.memberIds).filter((id) => id !== me);
  if (memberIds.length + 1 < MIN_GROUP_SIZE) {
    fail(`A group needs at least ${MIN_GROUP_SIZE} people: you and two friends.`);
  }
  if (memberIds.length + 1 > MAX_GROUP_SIZE) fail(`A group can have at most ${MAX_GROUP_SIZE} people.`);
  await requireFriends(sql, me, memberIds);

  const id = newId();
  await sql`insert into groups (id, name, emoji, owner_id) values (${id}, ${name}, ${cleanEmoji(input.emoji)}, ${me})`;
  await sql`
    insert into group_members (group_id, user_id, status, invited_by, joined_at)
    values (${id}, ${me}, 'joined', ${me}, now())`;
  for (const memberId of memberIds) {
    await sql`
      insert into group_members (group_id, user_id, status, invited_by)
      values (${id}, ${memberId}, 'invited', ${me})`;
  }
  return id;
}

export async function inviteToGroup(
  sql: Sql,
  me: string,
  groupId: string,
  memberIds: string[],
): Promise<void> {
  await requireOwner(sql, me, groupId);
  const ids = uniq(memberIds).filter((id) => id !== me);
  if (ids.length === 0) return;
  await requireFriends(sql, me, ids);
  const existing = await sql<{ user_id: string }>`select user_id from group_members where group_id = ${groupId}`;
  const already = new Set(existing.map((row) => row.user_id));
  const fresh = ids.filter((id) => !already.has(id));
  if (existing.length + fresh.length > MAX_GROUP_SIZE) {
    fail(`A group can have at most ${MAX_GROUP_SIZE} people.`);
  }
  for (const id of fresh) {
    await sql`
      insert into group_members (group_id, user_id, status, invited_by)
      values (${groupId}, ${id}, 'invited', ${me})`;
  }
}

export async function respondToGroupInvite(
  sql: Sql,
  me: string,
  groupId: string,
  accept: boolean,
): Promise<void> {
  const rows = await sql<{ status: string }>`
    select status from group_members where group_id = ${groupId} and user_id = ${me}`;
  if (rows[0]?.status !== "invited") fail("That invitation isn't waiting any more.");
  if (accept) {
    await requireProfile(sql, me);
    await sql`
      update group_members set status = 'joined', joined_at = now()
      where group_id = ${groupId} and user_id = ${me}`;
  } else {
    await sql`delete from group_members where group_id = ${groupId} and user_id = ${me}`;
  }
}

async function dropMemberData(sql: Sql, groupId: string, userId: string): Promise<void> {
  await sql`delete from share_settings where kind = 'group' and target_id = ${groupId} and owner_id = ${userId}`;
}

export async function leaveGroup(sql: Sql, me: string, groupId: string): Promise<void> {
  const owned = await sql`select 1 as ok from groups where id = ${groupId} and owner_id = ${me}`;
  if (owned.length > 0) fail("You made this group, so delete it instead of leaving.");
  await sql`delete from group_members where group_id = ${groupId} and user_id = ${me}`;
  await dropMemberData(sql, groupId, me);
}

export async function removeFromGroup(
  sql: Sql,
  me: string,
  groupId: string,
  userId: string,
): Promise<void> {
  await requireOwner(sql, me, groupId);
  if (userId === me) fail("Delete the group if you want to leave it.");
  await sql`delete from group_members where group_id = ${groupId} and user_id = ${userId}`;
  await dropMemberData(sql, groupId, userId);
}

export async function deleteGroup(sql: Sql, me: string, groupId: string): Promise<void> {
  await requireOwner(sql, me, groupId);
  await sql`delete from meetups where audience_kind = 'group' and audience_id = ${groupId}`;
  await sql`delete from share_settings where kind = 'group' and target_id = ${groupId}`;
  await sql`delete from groups where id = ${groupId}`;
}
