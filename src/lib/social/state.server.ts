/**
 * Assembles everything the Friends screen needs in one round trip, building
 * each person's data through `Visibility` so the viewer only ever receives what
 * they are allowed to see.
 */
import {
  getProfile,
  loadProfiles,
  loadVisibility,
  placeholders,
  profileMask,
  sharedWeek,
  uniq,
  type ProfileRow,
  type Sql,
} from "./core.server.ts";
import { addDays, campusNow, phaseOf, windowFitsMask, type Level } from "./engine.ts";
import { toProfileDTO } from "./friends.server.ts";
import { meetupStatus, type MeetupResponse } from "./meetup-status.ts";
import type {
  FriendDTO,
  GroupDTO,
  GroupMemberDTO,
  MeetupDTO,
  RequestDTO,
  SlotChoice,
  SocialState,
} from "./types.ts";

type FriendshipRow = {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
};

type MeetupRow = {
  id: string;
  creator_id: string;
  activity: "study" | "gossip" | "game";
  audience_kind: "friend" | "group";
  audience_id: string;
  day: number;
  start_slot: number;
  end_slot: number;
  kind: "gap" | "break";
  on_date: string;
  quorum: "all" | "some";
  quorum_n: number | null;
  note: string;
  status: "active" | "cancelled";
};

export async function getSocialState(sql: Sql, me: string): Promise<SocialState> {
  const now = campusNow();
  const mine = await getProfile(sql, me);
  if (!mine) {
    return {
      profile: null,
      friends: [],
      incoming: [],
      outgoing: [],
      groups: [],
      meetups: [],
      blocked: [],
      now,
    };
  }

  const [relations, myMemberships, settings, prefs, blockRows] = await Promise.all([
    sql<FriendshipRow>`
      select id, requester_id, addressee_id, status from friendships
      where requester_id = ${me} or addressee_id = ${me}`,
    sql<{ group_id: string; status: "invited" | "joined" }>`
      select group_id, status from group_members where user_id = ${me}`,
    sql<{ kind: "friend" | "group"; target_id: string; level: Level }>`
      select kind, target_id, level from share_settings where owner_id = ${me}`,
    sql<{ friend_id: string; hide_status: boolean }>`
      select friend_id, hide_status from friend_prefs where user_id = ${me}`,
    sql<{ blocked_id: string }>`select blocked_id from blocks where blocker_id = ${me}`,
  ]);

  const friendIds: string[] = [];
  const incomingRows: FriendshipRow[] = [];
  const outgoingRows: FriendshipRow[] = [];
  for (const row of relations) {
    if (row.status === "accepted") {
      friendIds.push(row.requester_id === me ? row.addressee_id : row.requester_id);
    } else if (row.addressee_id === me && row.status === "pending") {
      incomingRows.push(row);
    } else if (row.requester_id === me) {
      // A declined request still reads as "sent": nobody is told they were ignored.
      outgoingRows.push(row);
    }
  }

  const myGroupIds = myMemberships.map((row) => row.group_id);

  // Meetups: everything I'm part of, from a week ago onwards.
  const since = addDays(now.date, -7);
  const meetupRows = await sql<MeetupRow>`
    select id, creator_id, activity, audience_kind, audience_id, day, start_slot, end_slot, kind,
           on_date, quorum, quorum_n, note, status
    from meetups
    where on_date >= ${since}
      and id in (select meetup_id from meetup_participants where user_id = ${me})
    order by on_date, day, start_slot
    limit 80`;
  const meetupIds = meetupRows.map((row) => row.id);
  const meetupGroupIds = uniq(
    meetupRows.filter((row) => row.audience_kind === "group").map((row) => row.audience_id),
  );
  const allGroupIds = uniq([...myGroupIds, ...meetupGroupIds]);

  const groupRows = allGroupIds.length
    ? await sql.query<{ id: string; name: string; emoji: string; owner_id: string }>(
        `select id, name, emoji, owner_id from groups where id in (${placeholders(allGroupIds.length)})`,
        allGroupIds,
      )
    : [];
  const memberRows = myGroupIds.length
    ? await sql.query<{ group_id: string; user_id: string; status: "invited" | "joined" }>(
        `select group_id, user_id, status from group_members where group_id in (${placeholders(myGroupIds.length)})`,
        myGroupIds,
      )
    : [];
  const participantRows = meetupIds.length
    ? await sql.query<{ meetup_id: string; user_id: string; response: MeetupResponse }>(
        `select meetup_id, user_id, response from meetup_participants where meetup_id in (${placeholders(meetupIds.length)})`,
        meetupIds,
      )
    : [];
  const counterRows = meetupIds.length
    ? await sql.query<{ meetup_id: string; user_id: string; day: number; start_slot: number; end_slot: number; kind: "gap" | "break" }>(
        `select meetup_id, user_id, day, start_slot, end_slot, kind from meetup_counters where meetup_id in (${placeholders(meetupIds.length)})`,
        meetupIds,
      )
    : [];

  // Only joined members' data is ever loaded for a group the viewer has joined.
  const joinedGroupSet = new Set(
    myMemberships.filter((row) => row.status === "joined").map((row) => row.group_id),
  );
  const visibleMemberRows = memberRows.filter((row) => joinedGroupSet.has(row.group_id));

  const profiles = await loadProfiles(sql, [
    ...friendIds,
    ...incomingRows.map((row) => row.requester_id),
    ...outgoingRows.map((row) => row.addressee_id),
    ...visibleMemberRows.map((row) => row.user_id),
    ...groupRows.map((row) => row.owner_id),
    ...participantRows.map((row) => row.user_id),
    ...meetupRows.map((row) => row.creator_id),
    ...blockRows.map((row) => row.blocked_id),
  ]);
  const visibility = await loadVisibility(
    sql,
    me,
    [...profiles.values()].filter((p) => p.user_id !== me),
    allGroupIds,
  );

  const myFriendLevel = new Map<string, Level>();
  const myGroupLevel = new Map<string, Level>();
  for (const row of settings) {
    (row.kind === "friend" ? myFriendLevel : myGroupLevel).set(row.target_id, row.level);
  }
  const hidden = new Map(prefs.map((row) => [row.friend_id, row.hide_status]));
  const nameOf = (id: string): string => (id === me ? mine.display_name : (profiles.get(id)?.display_name ?? "Someone"));

  // Friends
  const friends: FriendDTO[] = [];
  for (const id of uniq(friendIds)) {
    const profile = profiles.get(id);
    if (!profile) continue;
    const level = visibility.friendLevel(profile);
    friends.push({
      ...sharedWeek(profile, level),
      userId: id,
      name: profile.display_name,
      batchId: level === "none" ? null : profile.batch_id,
      hideStatus: hidden.get(id) ?? false,
      myLevel: myFriendLevel.get(id) ?? mine.default_share,
      myLevelIsDefault: !myFriendLevel.has(id),
    });
  }
  friends.sort((a, b) => a.name.localeCompare(b.name));

  const toRequest = (row: FriendshipRow, otherId: string): RequestDTO | null => {
    const profile = profiles.get(otherId);
    if (!profile) return null;
    return { id: row.id, userId: otherId, name: profile.display_name, batchId: profile.batch_id };
  };
  const incoming = incomingRows
    .map((row) => toRequest(row, row.requester_id))
    .filter((row): row is RequestDTO => row !== null);
  const outgoing = outgoingRows
    .map((row) => toRequest(row, row.addressee_id))
    .filter((row): row is RequestDTO => row !== null);

  // Groups
  const groups: GroupDTO[] = [];
  for (const membership of myMemberships) {
    const group = groupRows.find((row) => row.id === membership.group_id);
    if (!group) continue;
    const rows = memberRows.filter((row) => row.group_id === group.id);
    let members: GroupMemberDTO[] = [];
    if (membership.status === "joined") {
      members = rows.flatMap((row): GroupMemberDTO[] => {
        const profile = row.user_id === me ? mine : profiles.get(row.user_id);
        if (!profile) return [];
        const base = {
          userId: row.user_id,
          name: profile.display_name,
          status: row.status,
          isMe: row.user_id === me,
          isOwner: row.user_id === group.owner_id,
        };
        if (row.status === "invited") {
          return [{ ...base, level: "none", mask: null, classes: null, awayDate: null }];
        }
        const level = visibility.groupLevel(profile, group.id);
        return [{ ...base, ...sharedWeek(profile, level) }];
      });
      members.sort(
        (a, b) =>
          Number(b.isMe) - Number(a.isMe) ||
          Number(a.status === "invited") - Number(b.status === "invited") ||
          a.name.localeCompare(b.name),
      );
    }
    groups.push({
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      ownerId: group.owner_id,
      ownerName: nameOf(group.owner_id),
      myStatus: membership.status,
      myLevel: myGroupLevel.get(group.id) ?? mine.default_share,
      myLevelIsDefault: !myGroupLevel.has(group.id),
      members,
      memberCount: rows.length,
    });
  }
  groups.sort((a, b) => Number(b.myStatus === "invited") - Number(a.myStatus === "invited") || a.name.localeCompare(b.name));

  // Meetups
  const meetups: MeetupDTO[] = meetupRows.map((row) => {
    const slot: SlotChoice = { day: row.day, start: row.start_slot, end: row.end_slot, kind: row.kind };
    const parts = participantRows.filter((p) => p.meetup_id === row.id);
    const phase = phaseOf(row.on_date, slot, now);
    const audienceGroup = row.audience_kind === "group" ? groupRows.find((g) => g.id === row.audience_id) : null;
    const otherId = parts.find((p) => p.user_id !== me)?.user_id ?? row.audience_id;

    const participants = parts.map((p) => {
      const profile: ProfileRow | undefined = p.user_id === me ? mine : profiles.get(p.user_id);
      let conflict: "yes" | "no" | "unknown" = "unknown";
      if (profile) {
        const level =
          p.user_id === me
            ? "full"
            : row.audience_kind === "group"
              ? visibility.groupLevel(profile, row.audience_id)
              : visibility.friendLevel(profile);
        if (level !== "none") {
          conflict = row.kind === "break" || windowFitsMask(profileMask(profile), slot) ? "no" : "yes";
        }
      }
      return {
        userId: p.user_id,
        name: nameOf(p.user_id),
        isMe: p.user_id === me,
        response: p.response,
        conflict,
      };
    });
    participants.sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));

    return {
      ...slot,
      id: row.id,
      activity: row.activity,
      creatorId: row.creator_id,
      creatorName: nameOf(row.creator_id),
      iAmCreator: row.creator_id === me,
      audienceKind: row.audience_kind,
      audienceId: row.audience_id,
      audienceLabel:
        row.audience_kind === "group"
          ? `${audienceGroup?.emoji ? `${audienceGroup.emoji} ` : ""}${audienceGroup?.name ?? "Group"}`.trim()
          : nameOf(otherId),
      onDate: row.on_date,
      phase,
      status: meetupStatus({
        cancelled: row.status === "cancelled",
        phase,
        quorum: row.quorum,
        quorumN: row.quorum_n,
        responses: parts.map((p) => p.response),
      }),
      quorum: row.quorum,
      quorumN: row.quorum_n,
      note: row.note,
      participants,
      counters: counterRows
        .filter((c) => c.meetup_id === row.id)
        .map((c) => ({
          userId: c.user_id,
          name: nameOf(c.user_id),
          day: c.day,
          start: c.start_slot,
          end: c.end_slot,
          kind: c.kind,
        })),
    };
  });

  return {
    profile: toProfileDTO(mine),
    friends,
    incoming,
    outgoing,
    groups,
    meetups,
    blocked: blockRows.map((row) => ({ userId: row.blocked_id, name: nameOf(row.blocked_id) })),
    now,
  };
}
