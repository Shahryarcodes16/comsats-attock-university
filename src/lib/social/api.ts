/**
 * Server functions for the friends features. Every one runs behind
 * `authMiddleware`, so `context.userId` is the verified session user: nothing
 * here ever trusts an id sent by the browser to say who the caller is.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type {
  CodeLookup,
  Proposal,
  SocialState,
  SuggestionDTO,
} from "./types.ts";

const level = z.enum(["none", "free", "full"]);
const activity = z.enum(["study", "gossip", "game"]);
const id = z.string().min(1).max(100);
const slot = z.object({
  day: z.number().int(),
  start: z.number().int(),
  end: z.number().int(),
  kind: z.enum(["gap", "break"]),
});
const audience = z.object({ kind: z.enum(["friend", "group"]), id });

async function db() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export const getSocialState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SocialState> => {
    const { getSocialState: load } = await import("./state.server.ts");
    return load(await db(), context.userId);
  });

// ── Profile ────────────────────────────────────────────────────────────────

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().max(200),
        batchId: z.number().int(),
        discoverable: z.boolean(),
        defaultShare: level,
        dropped: z.array(z.string().max(40)).max(200),
        added: z.array(z.string().max(40)).max(200),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { saveProfile: save } = await import("./friends.server.ts");
    await save(await db(), context.userId, data);
    return { ok: true as const };
  });

export const setAway = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ away: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { setAway: set } = await import("./friends.server.ts");
    await set(await db(), context.userId, data.away);
    return { ok: true as const };
  });

// ── Friends ────────────────────────────────────────────────────────────────

export const lookupCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ code: z.string().max(40) }).parse(input))
  .handler(async ({ context, data }): Promise<CodeLookup> => {
    const { lookupCode: lookup } = await import("./friends.server.ts");
    return lookup(await db(), context.userId, data.code);
  });

export const requestByCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ code: z.string().max(40) }).parse(input))
  .handler(async ({ context, data }) => {
    const { requestByCode: request } = await import("./friends.server.ts");
    return { outcome: await request(await db(), context.userId, data.code) };
  });

export const requestUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ userId: id }).parse(input))
  .handler(async ({ context, data }) => {
    const { requestUser: request } = await import("./friends.server.ts");
    return { outcome: await request(await db(), context.userId, data.userId) };
  });

export const respondToRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ requestId: z.number().int(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { respondToRequest: respond } = await import("./friends.server.ts");
    await respond(await db(), context.userId, data.requestId, data.accept);
    return { ok: true as const };
  });

export const removeFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ userId: id }).parse(input))
  .handler(async ({ context, data }) => {
    const { removeFriend: remove } = await import("./friends.server.ts");
    await remove(await db(), context.userId, data.userId);
    return { ok: true as const };
  });

export const blockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ userId: id }).parse(input))
  .handler(async ({ context, data }) => {
    const { blockUser: block } = await import("./friends.server.ts");
    await block(await db(), context.userId, data.userId);
    return { ok: true as const };
  });

export const unblockUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ userId: id }).parse(input))
  .handler(async ({ context, data }) => {
    const { unblockUser: unblock } = await import("./friends.server.ts");
    await unblock(await db(), context.userId, data.userId);
    return { ok: true as const };
  });

export const reportUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ userId: id, reason: z.string().max(500) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { reportUser: report } = await import("./friends.server.ts");
    await report(await db(), context.userId, data.userId, data.reason);
    return { ok: true as const };
  });

export const getSuggestions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SuggestionDTO[]> => {
    const { suggestions } = await import("./friends.server.ts");
    return suggestions(await db(), context.userId);
  });

// ── Privacy and muting ─────────────────────────────────────────────────────

export const setShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("default"), level }),
        z.object({ kind: z.literal("friend"), targetId: id, level: z.union([level, z.literal("default")]) }),
        z.object({ kind: z.literal("group"), targetId: id, level: z.union([level, z.literal("default")]) }),
      ])
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { setShare: set } = await import("./friends.server.ts");
    await set(await db(), context.userId, data);
    return { ok: true as const };
  });

export const setMute = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ friendId: id, hide: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { setMute: mute } = await import("./friends.server.ts");
    await mute(await db(), context.userId, data.friendId, data.hide);
    return { ok: true as const };
  });

// ── Groups ─────────────────────────────────────────────────────────────────

export const createGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({ name: z.string().max(200), emoji: z.string().max(20), memberIds: z.array(id).max(30) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { createGroup: create } = await import("./groups.server.ts");
    return { groupId: await create(await db(), context.userId, data) };
  });

export const inviteToGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ groupId: id, memberIds: z.array(id).max(30) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { inviteToGroup: invite } = await import("./groups.server.ts");
    await invite(await db(), context.userId, data.groupId, data.memberIds);
    return { ok: true as const };
  });

export const respondToGroupInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ groupId: id, accept: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { respondToGroupInvite: respond } = await import("./groups.server.ts");
    await respond(await db(), context.userId, data.groupId, data.accept);
    return { ok: true as const };
  });

export const leaveGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ groupId: id }).parse(input))
  .handler(async ({ context, data }) => {
    const { leaveGroup: leave } = await import("./groups.server.ts");
    await leave(await db(), context.userId, data.groupId);
    return { ok: true as const };
  });

export const removeFromGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ groupId: id, userId: id }).parse(input))
  .handler(async ({ context, data }) => {
    const { removeFromGroup: remove } = await import("./groups.server.ts");
    await remove(await db(), context.userId, data.groupId, data.userId);
    return { ok: true as const };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ groupId: id }).parse(input))
  .handler(async ({ context, data }) => {
    const { deleteGroup: remove } = await import("./groups.server.ts");
    await remove(await db(), context.userId, data.groupId);
    return { ok: true as const };
  });

// ── Meetups ────────────────────────────────────────────────────────────────

export const proposeTimes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ audience, activity }).parse(input))
  .handler(async ({ context, data }): Promise<Proposal> => {
    const { proposeTimes: propose } = await import("./meetups.server.ts");
    return propose(await db(), context.userId, data.audience, data.activity);
  });

export const createMeetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        audience,
        activity,
        slot,
        quorum: z.enum(["all", "some"]),
        quorumN: z.number().int().nullable(),
        note: z.string().max(400),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { createMeetup: create } = await import("./meetups.server.ts");
    return { meetupId: await create(await db(), context.userId, data) };
  });

export const respondToMeetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ meetupId: id, accept: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const { respondToMeetup: respond } = await import("./meetups.server.ts");
    await respond(await db(), context.userId, data.meetupId, data.accept);
    return { ok: true as const };
  });

export const counterPropose = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ meetupId: id, slot }).parse(input))
  .handler(async ({ context, data }) => {
    const { counterPropose: counter } = await import("./meetups.server.ts");
    await counter(await db(), context.userId, data.meetupId, data.slot);
    return { ok: true as const };
  });

export const rescheduleMeetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ meetupId: id, slot }).parse(input))
  .handler(async ({ context, data }) => {
    const { rescheduleMeetup: reschedule } = await import("./meetups.server.ts");
    await reschedule(await db(), context.userId, data.meetupId, data.slot);
    return { ok: true as const };
  });

export const cancelMeetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ meetupId: id }).parse(input))
  .handler(async ({ context, data }) => {
    const { cancelMeetup: cancel } = await import("./meetups.server.ts");
    await cancel(await db(), context.userId, data.meetupId);
    return { ok: true as const };
  });
