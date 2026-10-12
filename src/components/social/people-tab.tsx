import { useMemo, useState, type FormEvent } from "react";
import { Check, ChevronDown, Coffee, Search, UserPlus, X } from "lucide-react";
import {
  blockUser,
  getSuggestions,
  lookupCode,
  removeFriend,
  reportUser,
  requestByCode,
  requestUser,
  respondToRequest,
  setMute,
  setShare,
} from "@/lib/social/api";
import { rankWindows, windowLabel, type Level } from "@/lib/social/engine";
import { batches, rooms, subjects } from "@/lib/schedule";
import { DAYS, SLOTS } from "@/lib/social/slots";
import { isBusy } from "@/lib/social/engine";
import type { CodeLookup, FriendDTO, PublicClass, SuggestionDTO } from "@/lib/social/types";
import { useMyWeek } from "@/components/social/hooks";
import { messageOf, useSocial } from "@/components/social/provider";
import {
  Avatar,
  AvailabilityGrid,
  ConfirmButton,
  Empty,
  LevelPicker,
  Toggle,
} from "@/components/social/ui";

// ── Add by code ─────────────────────────────────────────────────────────────

function AddByCode() {
  const { act, state } = useSocial();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<CodeLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function look(event: FormEvent) {
    event.preventDefault();
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    setProblem(null);
    setFound(null);
    try {
      setFound(await lookupCode({ data: { code } }));
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    const result = await act(() => requestByCode({ data: { code } }));
    setBusy(false);
    if (!result) return;
    setFound(null);
    setCode("");
  }

  return (
    <section className="panel stack">
      <div className="panel-head">
        <h2>Add a friend</h2>
      </div>
      <form className="row-form" onSubmit={look}>
        <input
          className="input code-input"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setFound(null);
            setProblem(null);
          }}
          placeholder="Friend code, like K7M-2QX"
          aria-label="Friend code"
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn tap" disabled={busy || code.trim().length === 0}>
          <Search size={16} aria-hidden />
          Look up
        </button>
      </form>
      {problem ? <p className="form-error">{problem}</p> : null}
      {found && !found.found ? (
        <p className="quiet">We couldn&apos;t find anyone with that code. Check it and try again.</p>
      ) : null}
      {found && found.found ? (
        <div className="lookup-card">
          <Avatar name={found.name} />
          <div className="grow">
            <b>{found.name}</b>
            <span className="sub">{batches[found.batchId]}</span>
          </div>
          {found.isMe ? (
            <span className="sub">That&apos;s you</span>
          ) : found.relation === "friends" ? (
            <span className="sub">Already friends</span>
          ) : found.relation === "requested" ? (
            <span className="sub">Request sent</span>
          ) : (
            <button type="button" className="btn solid tap" disabled={busy} onClick={() => void send()}>
              <UserPlus size={16} aria-hidden />
              {found.relation === "incoming" ? "Accept" : "Send request"}
            </button>
          )}
        </div>
      ) : null}
      {state?.profile ? (
        <p className="fine">
          Your own code is <b>{state.profile.code}</b>. Share it from the Me tab.
        </p>
      ) : null}
    </section>
  );
}

// ── Requests ────────────────────────────────────────────────────────────────

function Requests() {
  const { state, act } = useSocial();
  if (!state || (state.incoming.length === 0 && state.outgoing.length === 0)) return null;
  return (
    <section className="panel stack">
      <div className="panel-head">
        <h2>Requests</h2>
        {state.incoming.length > 0 ? <span className="count-pill">{state.incoming.length}</span> : null}
      </div>
      <ul className="people-list">
        {state.incoming.map((request) => (
          <li key={request.id} className="person-row">
            <Avatar name={request.name} />
            <div className="grow">
              <b>{request.name}</b>
              <span className="sub">
                {request.batchId !== null ? `${batches[request.batchId]} · ` : ""}wants to be friends
              </span>
            </div>
            <button
              type="button"
              className="btn solid tap compact"
              onClick={() =>
                void act(() => respondToRequest({ data: { requestId: request.id, accept: true } }), `You and ${request.name} are friends.`)
              }
            >
              <Check size={16} aria-hidden />
              Accept
            </button>
            <button
              type="button"
              className="btn tap compact"
              aria-label={`Decline ${request.name}`}
              onClick={() => void act(() => respondToRequest({ data: { requestId: request.id, accept: false } }))}
            >
              <X size={16} aria-hidden />
            </button>
          </li>
        ))}
        {state.outgoing.map((request) => (
          <li key={request.id} className="person-row">
            <Avatar name={request.name} />
            <div className="grow">
              <b>{request.name}</b>
              <span className="sub">Waiting for them to accept</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── One friend ──────────────────────────────────────────────────────────────

function TheirWeek({ classes }: { classes: PublicClass[] }) {
  return (
    <div className="their-week">
      {DAYS.map((day, dayIndex) => {
        const list = classes.filter((c) => c.day === dayIndex).sort((a, b) => a.slot - b.slot);
        return (
          <div key={day}>
            <b className="day-name">{day}</b>
            {list.length === 0 ? (
              <span className="sub">Nothing</span>
            ) : (
              list.map((c) => (
                <span key={`${c.slot}-${c.subject}`} className="sub">
                  {SLOTS[c.slot].label} {SLOTS[c.slot].start} · {subjects[c.subject]}
                  {c.room >= 0 ? ` · ${rooms[c.room]}` : ""}
                </span>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function FriendDetail({ friend }: { friend: FriendDTO }) {
  const { act, startPlan } = useSocial();
  const { mask: myMask } = useMyWeek();
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);

  const shared = useMemo(() => {
    if (friend.mask === null) return null;
    const theirs = friend.mask;
    let both = 0;
    for (let day = 0; day < 5; day += 1) {
      for (let slot = 0; slot < 5; slot += 1) {
        if (!isBusy(myMask, day, slot) && !isBusy(theirs, day, slot)) both += 1;
      }
    }
    const best = rankWindows(
      [
        { id: "me", mask: myMask },
        { id: friend.userId, mask: theirs },
      ],
      { activity: "gossip", includeBreak: false, minMinutes: 60 },
    )[0];
    return { both, best };
  }, [friend, myMask]);

  return (
    <div className="friend-detail stack gap-lg">
      <div className="stack">
        <b className="label">What {friend.name} sees about you</b>
        <LevelPicker
          label={`What ${friend.name} can see`}
          value={friend.myLevel}
          isDefault={friend.myLevelIsDefault}
          onChange={(level: Level) =>
            void act(() => setShare({ data: { kind: "friend", targetId: friend.userId, level } }))
          }
          onReset={() =>
            void act(() => setShare({ data: { kind: "friend", targetId: friend.userId, level: "default" } }))
          }
        />
      </div>

      <Toggle
        label={`Show ${friend.name} under “Now”`}
        help="Only changes what you see. They can still see you as you've allowed."
        checked={!friend.hideStatus}
        onChange={(show) => void act(() => setMute({ data: { friendId: friend.userId, hide: !show } }))}
      />

      {shared ? (
        <div className="stack">
          <b className="label">You and {friend.name}</b>
          <AvailabilityGrid
            total={2}
            label={`Lectures where you and ${friend.name} are free`}
            freeCount={(day, slot) =>
              (isBusy(myMask, day, slot) ? 0 : 1) + (isBusy(friend.mask ?? 0, day, slot) ? 0 : 1)
            }
          />
          <p className="fine">
            {shared.both === 0
              ? "You never share a free lecture."
              : `You share ${shared.both} free lecture${shared.both === 1 ? "" : "s"} this week.`}
            {shared.best ? ` Best stretch: ${windowLabel(shared.best)}.` : ""}
          </p>
          <button
            type="button"
            className="btn tap"
            onClick={() => startPlan({ kind: "friend", id: friend.userId })}
          >
            <Coffee size={16} aria-hidden />
            Plan something with {friend.name}
          </button>
        </div>
      ) : (
        <p className="quiet">{friend.name} isn&apos;t sharing their timetable with you, so there is nothing to compare.</p>
      )}

      {friend.classes ? (
        <details className="their-details">
          <summary>
            {friend.name}&apos;s week <ChevronDown size={16} aria-hidden />
          </summary>
          <TheirWeek classes={friend.classes} />
        </details>
      ) : null}

      <div className="row-actions">
        <ConfirmButton
          label="Remove friend"
          confirmLabel="Tap again to remove"
          onConfirm={() => void act(() => removeFriend({ data: { userId: friend.userId } }), `${friend.name} was removed.`)}
        />
        <ConfirmButton
          label="Block"
          confirmLabel="Tap again to block"
          onConfirm={() => void act(() => blockUser({ data: { userId: friend.userId } }), `${friend.name} was blocked.`)}
        />
        <button type="button" className="btn tap" onClick={() => setReporting((on) => !on)}>
          Report
        </button>
      </div>
      {reporting ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void act(() => reportUser({ data: { userId: friend.userId, reason } }), "Thanks, we've recorded your report.").then(
              (done) => {
                if (done) {
                  setReporting(false);
                  setReason("");
                }
              },
            );
          }}
        >
          <textarea
            className="input"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What happened? (optional)"
          />
          <button type="submit" className="btn tap">
            Send report
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Friends() {
  const { state } = useSocial();
  const [open, setOpen] = useState<string | null>(null);
  if (!state) return null;
  return (
    <section className="panel stack">
      <div className="panel-head">
        <h2>Friends</h2>
        <span className="count-pill">{state.friends.length}</span>
      </div>
      {state.friends.length === 0 ? (
        <Empty title="No friends yet">Share your code or add someone with theirs.</Empty>
      ) : (
        <ul className="people-list">
          {state.friends.map((friend) => {
            const expanded = open === friend.userId;
            return (
              <li key={friend.userId} className={expanded ? "friend-item open" : "friend-item"}>
                <button
                  type="button"
                  className="person-row as-button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : friend.userId)}
                >
                  <Avatar name={friend.name} />
                  <span className="grow">
                    <b>{friend.name}</b>
                    <span className="sub">
                      {friend.batchId !== null ? batches[friend.batchId] : "Not sharing"}
                    </span>
                  </span>
                  <ChevronDown size={18} className="chev" aria-hidden />
                </button>
                {expanded ? <FriendDetail friend={friend} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Suggestions ─────────────────────────────────────────────────────────────

function Suggestions() {
  const { act } = useSocial();
  const [list, setList] = useState<SuggestionDTO[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setProblem(null);
    try {
      setList(await getSuggestions());
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => {
    const byBatch = new Map<number, SuggestionDTO[]>();
    for (const item of list ?? []) {
      const bucket = byBatch.get(item.batchId);
      if (bucket) bucket.push(item);
      else byBatch.set(item.batchId, [item]);
    }
    return [...byBatch.entries()]
      .map(([batchId, people]) => ({
        batchId,
        people,
        top: Math.max(...people.map((p) => p.sharedClasses)),
        same: people.some((p) => p.sameBatch),
      }))
      .sort((a, b) => Number(b.same) - Number(a.same) || b.people.length - a.people.length);
  }, [list]);

  return (
    <section className="panel stack">
      <div className="panel-head">
        <h2>People you may know</h2>
        <button type="button" className="btn tap" disabled={busy} onClick={() => void load()}>
          {busy ? "Looking…" : list ? "Refresh" : "Find people"}
        </button>
      </div>
      {problem ? <p className="form-error">{problem}</p> : null}
      {list === null ? (
        <p className="quiet">
          Classmates who chose to be suggested show up here, based on the batch and classes you share.
        </p>
      ) : list.length === 0 ? (
        <Empty title="No one to suggest yet">
          People appear once they turn on “Suggest me to classmates” in their profile.
        </Empty>
      ) : (
        groups.map((group) => (
          <div key={group.batchId} className="stack">
            <p className="suggest-head">
              <b>
                {group.people.length} {group.people.length === 1 ? "person" : "people"} from{" "}
                {batches[group.batchId]}
              </b>
              {group.top > 0 ? ` share${group.people.length === 1 ? "s" : ""} ${group.same ? "up to " : ""}${group.top} classes with you` : ""}
            </p>
            <ul className="people-list">
              {group.people.map((person) => (
                <li key={person.userId} className="person-row">
                  <Avatar name={person.name} />
                  <div className="grow">
                    <b>{person.name}</b>
                    <span className="sub">
                      {person.sharedClasses > 0
                        ? `${person.sharedClasses} shared class${person.sharedClasses === 1 ? "" : "es"}`
                        : "Same program"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn tap compact"
                    onClick={() =>
                      void act(
                        () => requestUser({ data: { userId: person.userId } }),
                        `Request sent to ${person.name}.`,
                      ).then((done) => {
                        if (done) setList((current) => current?.filter((p) => p.userId !== person.userId) ?? null);
                      })
                    }
                  >
                    <UserPlus size={16} aria-hidden />
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

export function PeopleTab() {
  return (
    <div className="stack gap-lg">
      <AddByCode />
      <Requests />
      <Friends />
      <Suggestions />
    </div>
  );
}

