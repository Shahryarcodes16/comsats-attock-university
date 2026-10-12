import { useMemo, useState, type FormEvent } from "react";
import { Check, ChevronDown, Crown, Plus, X } from "lucide-react";
import {
  createGroup,
  deleteGroup,
  inviteToGroup,
  leaveGroup,
  removeFromGroup,
  respondToGroupInvite,
  setShare,
} from "@/lib/social/api";
import { formatDuration, isBusy, rankWindows, windowLabel, type Level, type Window } from "@/lib/social/engine";
import type { GroupDTO } from "@/lib/social/types";
import { useSocial } from "@/components/social/provider";
import { Avatar, AvailabilityGrid, ConfirmButton, Empty, LevelPicker } from "@/components/social/ui";

const EMOJIS = ["🎓", "📚", "💻", "🏠", "⚽", "☕", "🎮", "🧪"];
const MAX = 10;

function FriendPicker({
  options,
  picked,
  onToggle,
  limit,
}: {
  options: { userId: string; name: string }[];
  picked: string[];
  onToggle: (id: string) => void;
  limit: number;
}) {
  if (options.length === 0) {
    return <p className="quiet">You have no friends to add yet. Add friends from the People tab first.</p>;
  }
  return (
    <ul className="pick-list">
      {options.map((option) => {
        const on = picked.includes(option.userId);
        const full = !on && picked.length >= limit;
        return (
          <li key={option.userId}>
            <label className={on ? "pick on" : "pick"}>
              <input type="checkbox" checked={on} disabled={full} onChange={() => onToggle(option.userId)} />
              <Avatar name={option.name} size="sm" />
              <span>{option.name}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function NewGroup({ onDone }: { onDone: () => void }) {
  const { state, act } = useSocial();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const friends = state?.friends ?? [];
  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const done = await act(
      () => createGroup({ data: { name, emoji, memberIds: picked } }),
      "Group created. Invitations are on their way.",
    );
    setBusy(false);
    if (done) onDone();
  }

  return (
    <form className="panel stack gap-lg" onSubmit={submit}>
      <div className="panel-head">
        <h2>New group</h2>
        <button type="button" className="icon-btn tap" aria-label="Cancel" onClick={onDone}>
          <X size={18} aria-hidden />
        </button>
      </div>
      <label className="field">
        <span>Group name</span>
        <input
          className="input"
          value={name}
          maxLength={40}
          required
          placeholder="FYP team, Hostel gang…"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="stack">
        <b className="label">Icon</b>
        <div className="emoji-row" role="radiogroup" aria-label="Group icon">
          {EMOJIS.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={emoji === item}
              className={emoji === item ? "emoji on" : "emoji"}
              onClick={() => setEmoji(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="stack">
        <b className="label">
          Who&apos;s in? <span className="sub">Pick 2 to {MAX - 1} friends ({picked.length} chosen)</span>
        </b>
        <FriendPicker
          options={friends.map((f) => ({ userId: f.userId, name: f.name }))}
          picked={picked}
          onToggle={toggle}
          limit={MAX - 1}
        />
      </div>
      <button type="submit" className="btn solid tap" disabled={busy || name.trim().length === 0 || picked.length < 2}>
        {busy ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}

function GroupFree({ group }: { group: GroupDTO }) {
  const { startPlan } = useSocial();
  const sharing = group.members.filter((m) => m.status === "joined" && m.mask !== null);
  const silent = group.members.filter((m) => m.status === "joined" && m.mask === null);
  const nameOf = (id: string) => group.members.find((m) => m.userId === id)?.name ?? "";

  const { everyone, most } = useMemo(() => {
    const people = sharing.map((m) => ({ id: m.userId, mask: m.mask ?? 0 }));
    if (people.length < 2) return { everyone: [] as Window[], most: [] as Window[] };
    const all = rankWindows(people, { activity: "study", minMinutes: 60 });
    const nearly =
      people.length >= 3
        ? rankWindows(people, { activity: "study", minMinutes: 60, minFree: Math.max(2, people.length - 1) }).filter(
            (w) => w.missing.length > 0,
          )
        : [];
    return { everyone: all.slice(0, 5), most: nearly.slice(0, Math.max(0, 5 - all.length, 2)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.members]);

  if (sharing.length < 2) {
    return (
      <p className="quiet">
        Shared free time appears once at least two joined members share their availability.
      </p>
    );
  }

  const renderRows = (list: Window[], offset: number) => (
    <ol className="rank-list">
      {list.map((w, index) => (
        <li key={`${w.day}-${w.start}-${w.end}`} className="rank-row">
          <span className="rank-n">{offset + index + 1}</span>
          <div className="grow">
            <b>{windowLabel(w)}</b>
            <span className="sub">
              {formatDuration(w.minutes)} ·{" "}
              {w.missing.length === 0
                ? `all ${w.free.length} free`
                : `${w.free.length} of ${sharing.length} free, ${w.missing.map(nameOf).join(", ")} ${w.missing.length === 1 ? "has" : "have"} class`}
            </span>
          </div>
          <button
            type="button"
            className="btn tap compact"
            onClick={() => startPlan({ kind: "group", id: group.id }, "study")}
          >
            Plan
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="stack">
      <b className="label">Best times for everyone</b>
      {everyone.length === 0 ? (
        <Empty title="No time works for all of you">
          Nobody&apos;s free together for an hour or more. {most.length > 0 ? "Here is the next best." : "Try a smaller group."}
        </Empty>
      ) : (
        renderRows(everyone, 0)
      )}
      {most.length > 0 ? (
        <>
          <b className="label">Most of the group</b>
          {renderRows(most, everyone.length)}
        </>
      ) : null}
      <AvailabilityGrid
        total={sharing.length}
        label="How many members are free in each lecture"
        freeCount={(day, slot) => sharing.filter((m) => !isBusy(m.mask ?? 0, day, slot)).length}
      />
      {silent.length > 0 ? (
        <p className="fine">
          {silent.map((m) => m.name).join(", ")} {silent.length === 1 ? "isn't" : "aren't"} sharing availability
          with this group, so {silent.length === 1 ? "they are" : "they're"} left out of these results.
        </p>
      ) : null}
    </div>
  );
}

function GroupInvite({ group }: { group: GroupDTO }) {
  const { state } = useSocial();
  const { act } = useSocial();
  const [picked, setPicked] = useState<string[]>([]);
  const inGroup = new Set(group.members.map((m) => m.userId));
  const options = (state?.friends ?? []).filter((f) => !inGroup.has(f.userId));
  const room = MAX - group.memberCount;
  if (room <= 0) return <p className="fine">This group is full ({MAX} people).</p>;
  if (options.length === 0) return null;
  return (
    <details className="their-details">
      <summary>
        Invite more friends <ChevronDown size={16} aria-hidden />
      </summary>
      <div className="stack">
        <FriendPicker
          options={options.map((f) => ({ userId: f.userId, name: f.name }))}
          picked={picked}
          limit={room}
          onToggle={(id) => setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}
        />
        <button
          type="button"
          className="btn tap"
          disabled={picked.length === 0}
          onClick={() =>
            void act(() => inviteToGroup({ data: { groupId: group.id, memberIds: picked } }), "Invitations sent.").then(
              (done) => done && setPicked([]),
            )
          }
        >
          Send invitations
        </button>
      </div>
    </details>
  );
}

function GroupDetail({ group }: { group: GroupDTO }) {
  const { act } = useSocial();
  const { state } = useSocial();
  const isOwner = state?.profile?.userId === group.ownerId;
  return (
    <div className="friend-detail stack gap-lg">
      <GroupFree group={group} />

      <div className="stack">
        <b className="label">Members</b>
        <ul className="people-list">
          {group.members.map((member) => (
            <li key={member.userId} className="person-row">
              <Avatar name={member.name} size="sm" />
              <div className="grow">
                <b>
                  {member.name}
                  {member.isMe ? " (you)" : ""}
                  {member.isOwner ? <Crown size={13} className="owner-mark" aria-label="Owner" /> : null}
                </b>
                <span className="sub">
                  {member.status === "invited"
                    ? "Invited, not joined yet"
                    : member.mask === null && !member.isMe
                      ? "Not sharing availability"
                      : "Joined"}
                </span>
              </div>
              {isOwner && !member.isMe ? (
                <ConfirmButton
                  label="Remove"
                  confirmLabel="Sure?"
                  onConfirm={() =>
                    void act(() => removeFromGroup({ data: { groupId: group.id, userId: member.userId } }))
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {isOwner ? <GroupInvite group={group} /> : null}

      <div className="stack">
        <b className="label">What this group sees about you</b>
        <LevelPicker
          label="What this group can see"
          value={group.myLevel}
          isDefault={group.myLevelIsDefault}
          onChange={(level: Level) => void act(() => setShare({ data: { kind: "group", targetId: group.id, level } }))}
          onReset={() => void act(() => setShare({ data: { kind: "group", targetId: group.id, level: "default" } }))}
        />
        <p className="fine">
          Inside a group, members only ever use your free and busy times to find shared gaps.
        </p>
      </div>

      <div className="row-actions">
        {isOwner ? (
          <ConfirmButton
            label="Delete group"
            confirmLabel="Tap again to delete"
            onConfirm={() => void act(() => deleteGroup({ data: { groupId: group.id } }), "Group deleted.")}
          />
        ) : (
          <ConfirmButton
            label="Leave group"
            confirmLabel="Tap again to leave"
            onConfirm={() => void act(() => leaveGroup({ data: { groupId: group.id } }), "You left the group.")}
          />
        )}
      </div>
    </div>
  );
}

export function GroupsTab() {
  const { state, act } = useSocial();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (!state) return null;
  const invites = state.groups.filter((g) => g.myStatus === "invited");
  const joined = state.groups.filter((g) => g.myStatus === "joined");

  return (
    <div className="stack gap-lg">
      {invites.length > 0 ? (
        <section className="panel stack">
          <div className="panel-head">
            <h2>Invitations</h2>
            <span className="count-pill">{invites.length}</span>
          </div>
          <ul className="people-list">
            {invites.map((group) => (
              <li key={group.id} className="person-row">
                <span className="group-emoji" aria-hidden>
                  {group.emoji || "👥"}
                </span>
                <div className="grow">
                  <b>{group.name}</b>
                  <span className="sub">
                    {group.ownerName} invited you · {group.memberCount} people
                  </span>
                </div>
                <button
                  type="button"
                  className="btn solid tap compact"
                  onClick={() =>
                    void act(() => respondToGroupInvite({ data: { groupId: group.id, accept: true } }), `You joined ${group.name}.`)
                  }
                >
                  <Check size={16} aria-hidden />
                  Join
                </button>
                <button
                  type="button"
                  className="btn tap compact"
                  aria-label={`Decline ${group.name}`}
                  onClick={() => void act(() => respondToGroupInvite({ data: { groupId: group.id, accept: false } }))}
                >
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {creating ? (
        <NewGroup onDone={() => setCreating(false)} />
      ) : (
        <button type="button" className="btn solid tap" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden />
          New group
        </button>
      )}

      <section className="panel stack">
        <div className="panel-head">
          <h2>Your groups</h2>
          <span className="count-pill">{joined.length}</span>
        </div>
        {joined.length === 0 ? (
          <Empty title="No groups yet">
            Make one for your FYP team or hostel gang and see when everyone is free.
          </Empty>
        ) : (
          <ul className="people-list">
            {joined.map((group) => {
              const expanded = open === group.id;
              return (
                <li key={group.id} className={expanded ? "friend-item open" : "friend-item"}>
                  <button
                    type="button"
                    className="person-row as-button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : group.id)}
                  >
                    <span className="group-emoji" aria-hidden>
                      {group.emoji || "👥"}
                    </span>
                    <span className="grow">
                      <b>{group.name}</b>
                      <span className="sub">
                        {group.members.filter((m) => m.status === "joined").length} joined
                        {group.memberCount > group.members.filter((m) => m.status === "joined").length
                          ? ` · ${group.memberCount - group.members.filter((m) => m.status === "joined").length} invited`
                          : ""}
                      </span>
                    </span>
                    <ChevronDown size={18} className="chev" aria-hidden />
                  </button>
                  {expanded ? <GroupDetail group={group} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
