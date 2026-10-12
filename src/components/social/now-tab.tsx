import { Coffee, UserPlus } from "lucide-react";
import { rooms, subjects, batches } from "@/lib/schedule";
import { setAway } from "@/lib/social/api";
import { presenceNow, presenceText, type Presence } from "@/lib/social/engine";
import type { FriendDTO } from "@/lib/social/types";
import { useMyWeek } from "@/components/social/hooks";
import { useSocial } from "@/components/social/provider";
import { Avatar, Empty, Toggle, useCampus } from "@/components/social/ui";

type Row = { friend: FriendDTO; presence: Presence };

function whereIsThey(friend: FriendDTO, presence: Presence, weekday: number): string | null {
  if (presence.kind !== "in_class" || presence.slot === undefined || !friend.classes) return null;
  const hit = friend.classes.find((c) => c.day === weekday - 1 && c.slot === presence.slot);
  if (!hit) return null;
  const bits = [subjects[hit.subject], hit.room >= 0 ? rooms[hit.room] : null].filter(Boolean);
  return bits.join(" · ");
}

function FriendLine({ row, weekday }: { row: Row; weekday: number }) {
  const { startPlan } = useSocial();
  const { friend, presence } = row;
  const detail = whereIsThey(friend, presence, weekday);
  return (
    <li className="person-row">
      <Avatar name={friend.name} />
      <div className="grow">
        <b>{friend.name}</b>
        <span className="sub">{presenceText(presence)}</span>
        {detail ? <span className="sub">{detail}</span> : null}
      </div>
      {presence.kind === "free" ? (
        <button
          type="button"
          className="btn tap compact"
          onClick={() => startPlan({ kind: "friend", id: friend.userId }, "gossip")}
        >
          <Coffee size={16} aria-hidden />
          Plan
        </button>
      ) : null}
    </li>
  );
}

function Group({ title, rows, weekday }: { title: string; rows: Row[]; weekday: number }) {
  if (rows.length === 0) return null;
  return (
    <section className="panel stack">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="count-pill">{rows.length}</span>
      </div>
      <ul className="people-list">
        {rows.map((row) => (
          <FriendLine key={row.friend.userId} row={row} weekday={weekday} />
        ))}
      </ul>
    </section>
  );
}

export function NowTab() {
  const { state, act, setTab } = useSocial();
  const campus = useCampus();

  const { mask: myMask } = useMyWeek();

  if (!state?.profile || !campus) return null;
  const profile = state.profile;
  const away = profile.awayDate === campus.date;
  const weekend = campus.weekday === 0 || campus.weekday === 6;

  const rows: Row[] = [];
  const quiet: FriendDTO[] = [];
  let hiddenCount = 0;
  for (const friend of state.friends) {
    if (friend.hideStatus) {
      hiddenCount += 1;
      continue;
    }
    if (friend.mask === null) {
      quiet.push(friend);
      continue;
    }
    rows.push({
      friend,
      presence: presenceNow(friend.mask, campus.weekday, campus.minutes, friend.awayDate === campus.date),
    });
  }
  const pick = (...kinds: Presence["kind"][]) => rows.filter((row) => kinds.includes(row.presence.kind));
  const freeNow = pick("free").sort((a, b) => (b.presence.minutes ?? 0) - (a.presence.minutes ?? 0));
  const inClass = pick("in_class").sort((a, b) => (a.presence.minutes ?? 0) - (b.presence.minutes ?? 0));
  const notStarted = pick("not_started").sort((a, b) => (a.presence.minutes ?? 0) - (b.presence.minutes ?? 0));
  const finished = pick("done", "no_classes", "away");

  const me = presenceNow(myMask, campus.weekday, campus.minutes, away);

  return (
    <div className="stack gap-lg">
      <section className="panel stack">
        <div className="panel-head">
          <div>
            <h2>You</h2>
            <p className="quiet">
              {batches[profile.batchId]} · {presenceText(me)}
            </p>
          </div>
        </div>
        <Toggle
          label="I'm not on campus today"
          help="Friends who can see your status will see this instead of your classes."
          checked={away}
          onChange={(next) => void act(() => setAway({ data: { away: next } }))}
        />
      </section>

      {state.friends.length === 0 ? (
        <section className="panel">
          <Empty title="No friends yet">
            Add someone with their friend code and you will see who is free right now.
          </Empty>
          <button type="button" className="btn solid tap" onClick={() => setTab("people")}>
            <UserPlus size={16} aria-hidden />
            Add a friend
          </button>
        </section>
      ) : weekend ? (
        <section className="panel">
          <Empty title="It's the weekend">Live status comes back on Monday morning.</Empty>
        </section>
      ) : (
        <>
          {rows.length > 0 && freeNow.length === 0 ? (
            <p className="fine">Nobody is between classes right now. Friends show up here as soon as they have a gap.</p>
          ) : null}
          <Group title="Free now" rows={freeNow} weekday={campus.weekday} />
          <Group title="In class" rows={inClass} weekday={campus.weekday} />
          <Group title="Not started yet" rows={notStarted} weekday={campus.weekday} />
          <Group title="Done or away" rows={finished} weekday={campus.weekday} />
        </>
      )}

      {quiet.length > 0 ? (
        <p className="fine">
          {quiet.map((f) => f.name).join(", ")} {quiet.length === 1 ? "isn't" : "aren't"} sharing their
          timetable with you.
        </p>
      ) : null}
      {hiddenCount > 0 ? (
        <p className="fine">
          {hiddenCount} friend{hiddenCount === 1 ? "" : "s"} hidden from this list. Change it under People.
        </p>
      ) : null}
    </div>
  );
}
