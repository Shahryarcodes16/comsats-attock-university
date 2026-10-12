import { useEffect, useMemo, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { batches, batchesInProgram, forBatch, programs, subjects } from "@/lib/schedule";
import { saveProfile, setShare, unblockUser } from "@/lib/social/api";
import type { Level } from "@/lib/social/engine";
import { entriesForKey, entryKey } from "@/lib/social/personal";
import { DAY_SHORT, SLOTS } from "@/lib/social/slots";
import type { ProfileDTO } from "@/lib/social/types";
import { useSocial } from "@/components/social/provider";
import { LevelPicker, Toggle } from "@/components/social/ui";

function inviteLink(code: string): string {
  return `${window.location.origin}/add/${code.replace("-", "")}`;
}

function CodeCard({ profile }: { profile: ProfileDTO }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy(kind: "code" | "link") {
    const text = kind === "code" ? profile.code : inviteLink(profile.code);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  return (
    <section className="panel stack">
      <div className="panel-head">
        <h2>Your friend code</h2>
      </div>
      <p className="code-big" aria-label={`Your friend code is ${profile.code.split("").join(" ")}`}>
        {profile.code}
      </p>
      <p className="quiet">Friends type this in, or open your link. You&apos;ll get a request to approve either way.</p>
      <div className="row-actions">
        <button type="button" className="btn tap" onClick={() => void copy("code")}>
          <Copy size={16} aria-hidden />
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        <button type="button" className="btn tap" onClick={() => void copy("link")}>
          <Copy size={16} aria-hidden />
          {copied === "link" ? "Copied" : "Copy invite link"}
        </button>
        {canShare ? (
          <button
            type="button"
            className="btn tap"
            onClick={() =>
              void navigator
                .share({ title: "Add me on the Attock timetable", text: `Add me with code ${profile.code}`, url: inviteLink(profile.code) })
                .catch(() => undefined)
            }
          >
            <Share2 size={16} aria-hidden />
            Share
          </button>
        ) : null}
      </div>
      <p className="fine">
        Anyone with your code can send a request, never see your timetable. Nothing is shared until you accept.
      </p>
    </section>
  );
}

type ProfilePatch = Partial<
  Pick<ProfileDTO, "name" | "batchId" | "discoverable" | "defaultShare" | "dropped" | "added">
>;

function ProfileForm({ profile }: { profile: ProfileDTO }) {
  const { act } = useSocial();
  const [name, setName] = useState(profile.name);
  const [batchId, setBatchId] = useState(profile.batchId);
  useEffect(() => {
    setName(profile.name);
    setBatchId(profile.batchId);
  }, [profile.name, profile.batchId]);
  const dirty = name.trim() !== profile.name || batchId !== profile.batchId;

  const save = (patch: ProfilePatch, ok?: string) =>
    act(
      () =>
        saveProfile({
          data: {
            name: profile.name,
            batchId: profile.batchId,
            discoverable: profile.discoverable,
            defaultShare: profile.defaultShare,
            dropped: profile.dropped,
            added: profile.added,
            ...patch,
          },
        }),
      ok,
    );

  return (
    <section className="panel stack gap-lg">
      <div className="panel-head">
        <h2>Profile</h2>
      </div>
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>Batch</span>
        <select className="select" value={batchId} onChange={(event) => setBatchId(Number(event.target.value))}>
          {programs.map((program) => (
            <optgroup key={program} label={program}>
              {batchesInProgram(program).map((id) => (
                <option key={id} value={id}>
                  {batches[id]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {batchId !== profile.batchId ? (
          <small>Changing batch resets your skipped and added classes.</small>
        ) : null}
      </label>
      <button
        type="button"
        className="btn solid tap"
        disabled={!dirty || name.trim().length === 0}
        onClick={() =>
          void save(
            {
              name,
              batchId,
              ...(batchId !== profile.batchId ? { dropped: [], added: [] } : {}),
            },
            "Profile saved.",
          )
        }
      >
        Save profile
      </button>

      <div className="stack">
        <b className="label">What new friends can see</b>
        <LevelPicker
          label="Default sharing"
          value={profile.defaultShare}
          onChange={(level: Level) => void act(() => setShare({ data: { kind: "default", level } }), "Default updated.")}
        />
        <p className="fine">Override it for any friend or group from the People and Groups tabs.</p>
      </div>

      <Toggle
        label="Suggest me to classmates"
        help="People from your batch can find and add you. Only your name and batch are shown."
        checked={profile.discoverable}
        onChange={(discoverable) => void save({ discoverable })}
      />
    </section>
  );
}

function ClassesEditor({ profile }: { profile: ProfileDTO }) {
  const { act } = useSocial();
  const [dropped, setDropped] = useState(() => new Set(profile.dropped));
  const [added, setAdded] = useState(() => new Set(profile.added));
  const [other, setOther] = useState<number | null>(null);

  useEffect(() => {
    setDropped(new Set(profile.dropped));
    setAdded(new Set(profile.added));
  }, [profile.dropped, profile.added]);

  const own = useMemo(() => uniqueClasses(profile.batchId), [profile.batchId]);
  const otherList = useMemo(
    () => (other === null ? [] : uniqueClasses(other).filter((c) => !added.has(c.key))),
    [other, added],
  );
  const addedList = useMemo(
    () =>
      [...added].flatMap((key) => {
        const entry = entriesForKey(key)[0];
        return entry ? [{ key, day: entry.day, slot: entry.slot, subject: entry.subject, batch: entry.batch }] : [];
      }),
    [added],
  );

  const dirty =
    dropped.size !== profile.dropped.length ||
    added.size !== profile.added.length ||
    [...dropped].some((k) => !profile.dropped.includes(k)) ||
    [...added].some((k) => !profile.added.includes(k));

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <section className="panel stack gap-lg">
      <div className="panel-head">
        <h2>My classes</h2>
      </div>
      <p className="quiet">
        Your week starts as {batches[profile.batchId]}&apos;s timetable. Untick classes you don&apos;t attend and add
        ones you take with another batch, like a repeated course. Friends and groups see the result.
      </p>
      <ul className="class-check">
        {own.map((c) => (
          <li key={c.key}>
            <label className={dropped.has(c.key) ? "check off" : "check"}>
              <input type="checkbox" checked={!dropped.has(c.key)} onChange={() => setDropped((s) => toggle(s, c.key))} />
              <span>
                <b>{subjects[c.subject]}</b>
                <small>
                  {DAY_SHORT[c.day]} · {SLOTS[c.slot].label} {SLOTS[c.slot].start}
                </small>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {addedList.length > 0 ? (
        <div className="stack">
          <b className="label">Added from other batches</b>
          <ul className="class-check">
            {addedList.map((c) => (
              <li key={c.key}>
                <label className="check">
                  <input type="checkbox" checked onChange={() => setAdded((s) => toggle(s, c.key))} />
                  <span>
                    <b>{subjects[c.subject]}</b>
                    <small>
                      {batches[c.batch]} · {DAY_SHORT[c.day]} · {SLOTS[c.slot].label} {SLOTS[c.slot].start}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="their-details">
        <summary>Add a class from another batch</summary>
        <div className="stack">
          <select
            className="select"
            aria-label="Batch to add a class from"
            value={other ?? ""}
            onChange={(event) => setOther(event.target.value === "" ? null : Number(event.target.value))}
          >
            <option value="">Choose a batch…</option>
            {programs.map((program) => (
              <optgroup key={program} label={program}>
                {batchesInProgram(program)
                  .filter((id) => id !== profile.batchId)
                  .map((id) => (
                    <option key={id} value={id}>
                      {batches[id]}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <ul className="class-check">
            {otherList.map((c) => (
              <li key={c.key}>
                <label className="check off">
                  <input type="checkbox" checked={false} onChange={() => setAdded((s) => toggle(s, c.key))} />
                  <span>
                    <b>{subjects[c.subject]}</b>
                    <small>
                      {DAY_SHORT[c.day]} · {SLOTS[c.slot].label} {SLOTS[c.slot].start}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <button
        type="button"
        className="btn solid tap"
        disabled={!dirty}
        onClick={() =>
          void act(
            () =>
              saveProfile({
                data: {
                  name: profile.name,
                  batchId: profile.batchId,
                  discoverable: profile.discoverable,
                  defaultShare: profile.defaultShare,
                  dropped: [...dropped],
                  added: [...added],
                },
              }),
            "Classes saved.",
          )
        }
      >
        Save my classes
      </button>
    </section>
  );
}

function uniqueClasses(batchId: number): { key: string; day: number; slot: number; subject: number }[] {
  const seen = new Set<string>();
  const list: { key: string; day: number; slot: number; subject: number }[] = [];
  for (const entry of forBatch(batchId)) {
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ key, day: entry.day, slot: entry.slot, subject: entry.subject });
  }
  return list.sort((a, b) => a.day - b.day || a.slot - b.slot);
}

export function MeTab() {
  const { state, act } = useSocial();
  if (!state?.profile) return null;
  const profile = state.profile;
  return (
    <div className="stack gap-lg">
      <CodeCard profile={profile} />
      <ProfileForm profile={profile} />
      <ClassesEditor profile={profile} />
      {state.blocked.length > 0 ? (
        <section className="panel stack">
          <div className="panel-head">
            <h2>Blocked</h2>
          </div>
          <ul className="people-list">
            {state.blocked.map((person) => (
              <li key={person.userId} className="person-row">
                <div className="grow">
                  <b>{person.name}</b>
                </div>
                <button
                  type="button"
                  className="btn tap compact"
                  onClick={() => void act(() => unblockUser({ data: { userId: person.userId } }), `${person.name} was unblocked.`)}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="panel stack">
        <div className="panel-head">
          <h2>Account</h2>
        </div>
        <UserButton />
      </section>
    </div>
  );
}
