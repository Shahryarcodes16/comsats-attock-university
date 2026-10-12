import type { Activity, CampusNow, Level, Phase } from "./engine.ts";
import type { MeetupResponse, MeetupStatus } from "./meetup-status.ts";

export type { MeetupResponse, MeetupStatus };

/** One lecture of someone's week, as shared with a friend who may see full classes. */
export type PublicClass = {
  day: number;
  slot: number;
  subject: number;
  room: number;
  teacher: number;
  repeater: boolean;
};

export type ProfileDTO = {
  userId: string;
  name: string;
  batchId: number;
  /** Friend code, formatted XXX-XXX. */
  code: string;
  discoverable: boolean;
  defaultShare: Level;
  /** Personal changes to the batch timetable ("day.slot.batch.subject" keys). */
  dropped: string[];
  added: string[];
  awayDate: string | null;
};

/**
 * The slice of someone's week that the viewer is allowed to see. The server
 * builds this per viewer; fields above the viewer's level are never sent.
 */
export type SharedWeek = {
  level: Level;
  /** Busy-cell mask. Null when the level is `none`. */
  mask: number | null;
  /** Full classes. Only present at level `full`. */
  classes: PublicClass[] | null;
  awayDate: string | null;
};

export type FriendDTO = SharedWeek & {
  userId: string;
  name: string;
  /** Hidden when the friend shares nothing. */
  batchId: number | null;
  /** The viewer chose to stop seeing this friend's live status. */
  hideStatus: boolean;
  /** What the viewer shares with this friend. */
  myLevel: Level;
  myLevelIsDefault: boolean;
};

export type RequestDTO = {
  id: number;
  userId: string;
  name: string;
  batchId: number | null;
};

export type GroupMemberDTO = SharedWeek & {
  userId: string;
  name: string;
  status: "joined" | "invited";
  isMe: boolean;
  isOwner: boolean;
};

export type GroupDTO = {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  ownerName: string;
  myStatus: "joined" | "invited";
  /** What the viewer shares with this group. */
  myLevel: Level;
  myLevelIsDefault: boolean;
  /** Empty until the viewer has joined: invited people see no member data. */
  members: GroupMemberDTO[];
  memberCount: number;
};

export type MeetupParticipantDTO = {
  userId: string;
  name: string;
  isMe: boolean;
  response: MeetupResponse;
  /** Does this person have class during the slot? Unknown when they share nothing. */
  conflict: "yes" | "no" | "unknown";
};

export type SlotChoice = {
  day: number;
  start: number;
  end: number;
  kind: "gap" | "break";
};

export type MeetupDTO = SlotChoice & {
  id: string;
  activity: Activity;
  creatorId: string;
  creatorName: string;
  iAmCreator: boolean;
  audienceKind: "friend" | "group";
  audienceId: string;
  audienceLabel: string;
  onDate: string;
  phase: Phase;
  status: MeetupStatus;
  quorum: "all" | "some";
  quorumN: number | null;
  note: string;
  participants: MeetupParticipantDTO[];
  counters: (SlotChoice & { userId: string; name: string })[];
};

export type BlockedDTO = { userId: string; name: string };

/** Everything the Friends screen needs, in one round trip. */
export type SocialState = {
  profile: ProfileDTO | null;
  friends: FriendDTO[];
  incoming: RequestDTO[];
  outgoing: RequestDTO[];
  groups: GroupDTO[];
  meetups: MeetupDTO[];
  blocked: BlockedDTO[];
  /** Server clock in campus time, so the UI never trusts a wrong device date for meetups. */
  now: CampusNow;
};

export type SuggestionDTO = {
  userId: string;
  name: string;
  batchId: number;
  sharedClasses: number;
  sameBatch: boolean;
};

export type CodeLookup =
  | { found: false }
  | {
      found: true;
      userId: string;
      name: string;
      batchId: number;
      isMe: boolean;
      relation: "none" | "friends" | "requested" | "incoming";
    };

export type ProposedWindow = SlotChoice & {
  label: string;
  dateLabel: string;
  onDate: string;
  minutes: number;
  freeNames: string[];
  missingNames: string[];
};

export type Proposal = {
  windows: ProposedWindow[];
  /** People whose availability could not be used because they share nothing with you. */
  unshared: string[];
  /** The people the proposal was worked out for (including you). */
  considered: number;
};
