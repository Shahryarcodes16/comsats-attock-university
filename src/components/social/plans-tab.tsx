import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Send, X } from "lucide-react";
import {
  cancelMeetup,
  counterPropose,
  createMeetup,
  proposeTimes,
  rescheduleMeetup,
  respondToMeetup,
} from "@/lib/social/api";
import {
  ACTIVITIES,
  ACTIVITY_LIST,
  dateLabel,
  formatDuration,
  windowLabel,
  type Activity,
} from "@/lib/social/engine";
import type { MeetupDTO, Proposal, ProposedWindow, SlotChoice } from "@/lib/social/types";
import { messageOf, useSocial, type Audience } from "@/components/social/provider";
import { Avatar, ConfirmButton, Empty } from "@/components/social/ui";

const STATUS_LABEL: Record<MeetupDTO["status"], string> = {
  proposed: "Waiting for answers",
  confirmed: "Confirmed",
  needs_change: "Needs a new time",
  cancelled: "Cancelled",
  expired: "Expired",
  done: "Done",
};

const slotOf = (w: SlotChoice): SlotChoice => ({ day: w.day, start: w.start, end: w.end, kind: w.kind });

// ── Suggested times ─────────────────────────────────────────────────────────

function ProposalList({
  audience,
  activity,
  onPick,
  pickLabel,
  selected,
  excludeSlot,
}: {
  audience: Audience;
  activity: Activity;
  onPick: (window: ProposedWindow) => void;
  pickLabel: string;
  selected?: ProposedWindow | null;
  excludeSlot?: SlotChoice;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const request = useRef(0);

  // Keyed on the audience's parts, not the object: callers build it inline.
  const { kind, id } = audience;
  useEffect(() => {
    const mine = ++request.current;
    setProposal(null);
    setProblem(null);
    proposeTimes({ data: { audience: { kind, id }, activity } })
      .then((result) => {
        if (request.current === mine) setProposal(result);
      })
      .catch((error) => {
        if (request.current === mine) setProblem(messageOf(error));
      });
  }, [kind, id, activity]);

  if (problem) return <p className="form-error">{problem}</p>;
  if (!proposal) return <p className="quiet">Looking for times when everyone is free…</p>;

  const windows = proposal.windows.filter(
    (w) => !excludeSlot || w.day !== excludeSlot.day || w.start !== excludeSlot.start || w.end !== excludeSlot.end,
  );
  return (
    <div className="stack">
      {windows.length === 0 ? (
        <Empty title="No time works for everyone">
          {proposal.considered < 2
            ? "Nobody else is sharing availability with you, so there is nothing to compare yet."
            : "There is no shared gap long enough for this. Try another activity."}
        </Empty>
      ) : (
        <ul className="slot-list">
          {windows.map((w, index) => {
            const isOn = selected?.day === w.day && selected.start === w.start && selected.end === w.end && selected.kind === w.kind;
            return (
              <li key={`${w.day}-${w.start}-${w.end}-${w.kind}`} className={isOn ? "slot on" : "slot"}>
                <div className="grow">
                  <b>
                    {index === 0 ? <span className="best-tag">Best</span> : null}
                    {w.label}
                  </b>
                  <span className="sub">
                    {w.dateLabel} · {formatDuration(w.minutes)} ·{" "}
                    {w.missingNames.length === 0
                      ? "everyone is free"
                      : `${w.missingNames.join(", ")} ${w.missingNames.length === 1 ? "has" : "have"} class`}
                  </span>
                </div>
                <button type="button" className={isOn ? "btn solid tap compact" : "btn tap compact"} onClick={() => onPick(w)}>
                  {isOn ? <Check size={16} aria-hidden /> : null}
                  {pickLabel}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {proposal.unshared.length > 0 ? (
        <p className="fine">
          {proposal.unshared.join(", ")} {proposal.unshared.length === 1 ? "isn't" : "aren't"} sharing availability
          with you, so {proposal.unshared.length === 1 ? "they weren't" : "they weren't"} counted. They can still
          say yes or no when they get the invitation.
        </p>
      ) : null}
    </div>
  );
}

// ── The planner ─────────────────────────────────────────────────────────────

function Planner() {
  const { state, act, plan, clearPlan } = useSocial();
  const [audienceValue, setAudienceValue] = useState("");
  const [activity, setActivity] = useState<Activity>("study");
  const [searching, setSearching] = useState<{ audience: Audience; activity: Activity } | null>(null);
  const [selected, setSelected] = useState<ProposedWindow | null>(null);
  const [quorum, setQuorum] = useState<"all" | "some">("all");
  const [quorumN, setQuorumN] = useState(2);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const parse = (value: string): Audience | null => {
    const [kind, ...rest] = value.split(":");
    const id = rest.join(":");
    return (kind === "friend" || kind === "group") && id ? { kind, id } : null;
  };

  // "Plan" buttons elsewhere hand over who (and sometimes what) to plan.
  useEffect(() => {
    if (!plan) return;
    const nextActivity = plan.activity ?? "study";
    setAudienceValue(`${plan.audience.kind}:${plan.audience.id}`);
    setActivity(nextActivity);
    setSearching({ audience: plan.audience, activity: nextActivity });
    setSelected(null);
    clearPlan();
  }, [plan, clearPlan]);

  const audience = parse(audienceValue);
  const joinedGroups = (state?.groups ?? []).filter((g) => g.myStatus === "joined");
  const peopleCount = useMemo(() => {
    if (!audience || !state) return 0;
    if (audience.kind === "friend") return 2;
    return state.groups.find((g) => g.id === audience.id)?.members.filter((m) => m.status === "joined").length ?? 0;
  }, [audience, state]);

  const hasAudiences = (state?.friends.length ?? 0) > 0 || joinedGroups.length > 0;

  async function send() {
    if (!audience || !selected || busy) return;
    setBusy(true);
    const done = await act(
      () =>
        createMeetup({
          data: {
            audience,
            activity,
            slot: slotOf(selected),
            quorum: audience.kind === "group" ? quorum : "all",
            quorumN: audience.kind === "group" && quorum === "some" ? Math.min(quorumN, peopleCount) : null,
            note,
          },
        }),
      "Invitation sent.",
    );
    setBusy(false);
    if (done) {
      setSearching(null);
      setSelected(null);
      setNote("");
    }
  }

  return (
    <section className="panel stack gap-lg">
      <div className="panel-head">
        <h2>Plan something</h2>
      </div>
      {!hasAudiences ? (
        <Empty title="Nobody to plan with yet">Add a friend or create a group first.</Empty>
      ) : (
        <>
          <label className="field">
            <span>With</span>
            <select
              className="select"
              value={audienceValue}
              onChange={(event) => {
                setAudienceValue(event.target.value);
                setSearching(null);
                setSelected(null);
              }}
            >
              <option value="">Choose a friend or group…</option>
              {(state?.friends.length ?? 0) > 0 ? (
                <optgroup label="Friends">
                  {state?.friends.map((f) => (
                    <option key={f.userId} value={`friend:${f.userId}`}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {joinedGroups.length > 0 ? (
                <optgroup label="Groups">
                  {joinedGroups.map((g) => (
                    <option key={g.id} value={`group:${g.id}`}>
                      {g.emoji} {g.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          <div className="stack">
            <b className="label">What</b>
            <div className="chips" role="radiogroup" aria-label="Activity">
              {ACTIVITY_LIST.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={activity === item}
                  className={activity === item ? "chip on" : "chip"}
                  onClick={() => {
                    setActivity(item);
                    setSearching(null);
                    setSelected(null);
                  }}
                >
                  {ACTIVITIES[item].short}
                </button>
              ))}
            </div>
            <p className="fine">{ACTIVITIES[activity].hint}</p>
          </div>

          {!searching ? (
            <button
              type="button"
              className="btn solid tap"
              disabled={!audience}
              onClick={() => audience && setSearching({ audience, activity })}
            >
              <Clock size={16} aria-hidden />
              Find times
            </button>
          ) : (
            <>
              <ProposalList
                audience={searching.audience}
                activity={searching.activity}
                onPick={setSelected}
                pickLabel="Choose"
                selected={selected}
              />
              {selected ? (
                <div className="stack gap-lg send-box">
                  {audience?.kind === "group" ? (
                    <div className="stack">
                      <b className="label">Who needs to say yes?</b>
                      <div className="chips" role="radiogroup" aria-label="Quorum">
                        <button type="button" role="radio" aria-checked={quorum === "all"} className={quorum === "all" ? "chip on" : "chip"} onClick={() => setQuorum("all")}>
                          Everyone
                        </button>
                        <button type="button" role="radio" aria-checked={quorum === "some"} className={quorum === "some" ? "chip on" : "chip"} onClick={() => setQuorum("some")}>
                          At least…
                        </button>
                      </div>
                      {quorum === "some" ? (
                        <label className="field">
                          <span>Minimum people (including you)</span>
                          <input
                            className="input"
                            type="number"
                            min={2}
                            max={Math.max(2, peopleCount)}
                            value={quorumN}
                            onChange={(event) => setQuorumN(Number(event.target.value) || 2)}
                          />
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="field">
                    <span>Add a note (optional)</span>
                    <input
                      className="input"
                      value={note}
                      maxLength={200}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Cafeteria? Bring your laptops?"
                    />
                  </label>
                  <button type="button" className="btn solid tap" disabled={busy} onClick={() => void send()}>
                    <Send size={16} aria-hidden />
                    {busy ? "Sending…" : `Send for ${selected.label}`}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}

// ── Plans you're part of ────────────────────────────────────────────────────

function RespIcon({ response }: { response: "pending" | "accepted" | "declined" }) {
  if (response === "accepted") return <Check size={14} aria-label="Accepted" className="r-yes" />;
  if (response === "declined") return <X size={14} aria-label="Declined" className="r-no" />;
  return <Clock size={14} aria-label="Waiting" className="r-wait" />;
}

function MeetupCard({ meetup }: { meetup: MeetupDTO }) {
  const { state, act } = useSocial();
  const [picking, setPicking] = useState<"counter" | "change" | null>(null);
  const me = meetup.participants.find((p) => p.isMe);
  const live = meetup.phase === "live";
  const open = meetup.status !== "cancelled" && meetup.phase !== "past";
  const when = state ? dateLabel(meetup.onDate, state.now) : meetup.onDate;
  const slot = slotOf(meetup);
  // For a one-to-one plan the stored audience is the invitee, so each person
  // plans against "the other one", not themselves.
  const other = meetup.participants.find((p) => !p.isMe);
  const audience: Audience | null =
    meetup.audienceKind === "group"
      ? { kind: "group", id: meetup.audienceId }
      : other
        ? { kind: "friend", id: other.userId }
        : null;
  const myCounter = me ? meetup.counters.find((c) => c.userId === me.userId) : undefined;

  return (
    <article className={`meetup status-${meetup.status}`}>
      <header className="meetup-head">
        <div className="grow">
          <b>{ACTIVITIES[meetup.activity].label}</b>
          <span className="sub">
            {meetup.audienceLabel}
            {meetup.iAmCreator ? "" : ` · organised by ${meetup.creatorName}`}
          </span>
        </div>
        <span className={`status-chip ${meetup.status}`}>{live ? "Happening now" : STATUS_LABEL[meetup.status]}</span>
      </header>

      <p className="meetup-when">
        <b>{windowLabel(meetup)}</b>
        <span className="sub">{when}</span>
      </p>
      {meetup.note ? <p className="quiet">“{meetup.note}”</p> : null}
      <p className="fine">
        {meetup.quorum === "all" ? "Needs everyone to say yes." : `Needs at least ${meetup.quorumN} people to say yes.`}
      </p>

      <ul className="resp-list">
        {meetup.participants.map((p) => (
          <li key={p.userId} className={p.response === "declined" ? "resp declined" : "resp"}>
            <Avatar name={p.name} size="sm" />
            <span>
              {p.isMe ? "You" : p.name}
              <RespIcon response={p.response} />
            </span>
            {open && p.conflict === "yes" && p.response !== "accepted" ? (
              <span className="warn" title="Has a class in this time">
                <AlertTriangle size={13} aria-hidden /> has class
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {meetup.iAmCreator && meetup.counters.length > 0 && open ? (
        <div className="stack counter-box">
          <b className="label">Suggested instead</b>
          {meetup.counters.map((c) => (
            <div key={c.userId} className="person-row">
              <div className="grow">
                <b>{windowLabel(c)}</b>
                <span className="sub">{c.name} suggests this time</span>
              </div>
              <button
                type="button"
                className="btn tap compact"
                onClick={() => void act(() => rescheduleMeetup({ data: { meetupId: meetup.id, slot: slotOf(c) } }), "Time changed. Everyone will be asked again.")}
              >
                Switch
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="row-actions">
          {!meetup.iAmCreator && me ? (
            <>
              <button
                type="button"
                className={me.response === "accepted" ? "btn solid tap" : "btn tap"}
                onClick={() => void act(() => respondToMeetup({ data: { meetupId: meetup.id, accept: true } }), "You're in.")}
              >
                <Check size={16} aria-hidden />
                {me.response === "accepted" ? "You're in" : "Accept"}
              </button>
              <button
                type="button"
                className={me.response === "declined" ? "btn danger tap" : "btn tap"}
                onClick={() => void act(() => respondToMeetup({ data: { meetupId: meetup.id, accept: false } }))}
              >
                <X size={16} aria-hidden />
                {me.response === "declined" ? "Declined" : "Decline"}
              </button>
              <button type="button" className="btn tap" onClick={() => setPicking(picking === "counter" ? null : "counter")}>
                Suggest another time
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn tap" onClick={() => setPicking(picking === "change" ? null : "change")}>
                Change time
              </button>
              <ConfirmButton
                label="Cancel plan"
                confirmLabel="Tap again to cancel"
                onConfirm={() => void act(() => cancelMeetup({ data: { meetupId: meetup.id } }), "Plan cancelled.")}
              />
            </>
          )}
        </div>
      ) : null}
      {myCounter && open ? <p className="fine">You suggested {windowLabel(myCounter)}. {meetup.creatorName} will decide.</p> : null}

      {picking && audience ? (
        <div className="stack counter-box">
          <ProposalList
            audience={audience}
            activity={meetup.activity}
            excludeSlot={slot}
            pickLabel={picking === "counter" ? "Suggest" : "Move here"}
            onPick={(w) => {
              const work =
                picking === "counter"
                  ? () => counterPropose({ data: { meetupId: meetup.id, slot: slotOf(w) } })
                  : () => rescheduleMeetup({ data: { meetupId: meetup.id, slot: slotOf(w) } });
              void act(work, picking === "counter" ? "Suggestion sent." : "Time changed. Everyone will be asked again.").then(
                (done) => done && setPicking(null),
              );
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

export function PlansTab() {
  const { state } = useSocial();
  const groups = useMemo(() => {
    const all = state?.meetups ?? [];
    const needsMe = all.filter(
      (m) =>
        !m.iAmCreator &&
        m.phase !== "past" &&
        (m.status === "proposed" || m.status === "needs_change") &&
        m.participants.some((p) => p.isMe && p.response === "pending"),
    );
    const mine = new Set(needsMe.map((m) => m.id));
    const upcoming = all.filter((m) => !mine.has(m.id) && m.phase !== "past" && m.status !== "cancelled");
    const past = all.filter((m) => m.phase === "past" || m.status === "cancelled").reverse();
    return { needsMe, upcoming, past };
  }, [state?.meetups]);

  return (
    <div className="stack gap-lg">
      {groups.needsMe.length > 0 ? (
        <section className="stack">
          <h2 className="section-title">Needs your answer</h2>
          {groups.needsMe.map((m) => (
            <MeetupCard key={m.id} meetup={m} />
          ))}
        </section>
      ) : null}

      <Planner />

      <section className="stack">
        <h2 className="section-title">Upcoming plans</h2>
        {groups.upcoming.length === 0 ? (
          <div className="panel">
            <Empty title="Nothing planned">Pick a friend or group above and the app will suggest times.</Empty>
          </div>
        ) : (
          groups.upcoming.map((m) => <MeetupCard key={m.id} meetup={m} />)
        )}
      </section>

      {groups.past.length > 0 ? (
        <details className="their-details">
          <summary>Past and cancelled ({groups.past.length})</summary>
          <div className="stack">
            {groups.past.map((m) => (
              <MeetupCard key={m.id} meetup={m} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
