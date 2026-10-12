import { useState, type FormEvent } from "react";
import { useDesk } from "@/components/timetable/context";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { saveProfile } from "@/lib/social/api";
import type { Level } from "@/lib/social/engine";
import { batches, batchesInProgram, programs } from "@/lib/schedule";
import { useSocial } from "@/components/social/provider";
import { LevelPicker, Toggle } from "@/components/social/ui";

/** First run: pick a batch, a name, and what friends can see. */
export function Onboarding() {
  const { act } = useSocial();
  const { pinnedBatch, batchId: deskBatch } = useDesk();
  const user = useCurrentUser();
  const [name, setName] = useState(user?.displayName ?? "");
  const [batchId, setBatchId] = useState(pinnedBatch ?? deskBatch);
  const [share, setShare] = useState<Level>("free");
  const [discoverable, setDiscoverable] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    await act(
      () => saveProfile({ data: { name, batchId, discoverable, defaultShare: share, dropped: [], added: [] } }),
      "You're all set. Add your first friend.",
    );
    setBusy(false);
  }

  return (
    <div className="page">
      <section className="hero">
        <p className="kicker">
          <i className="pip" aria-hidden />
          Friends
        </p>
        <h1 className="display">Find time together</h1>
        <p className="lede">
          Add friends with a code, then see who is free right now and when your whole group can meet.
          Two quick choices first.
        </p>
      </section>

      <form className="panel stack gap-lg" onSubmit={submit}>
        <label className="field">
          <span>Your name</span>
          <input
            className="input"
            value={name}
            maxLength={40}
            required
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="What friends call you"
          />
        </label>

        <label className="field">
          <span>Your batch</span>
          <select
            className="select"
            value={batchId}
            onChange={(event) => setBatchId(Number(event.target.value))}
          >
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
          <small>Your week is built from your batch. You can skip or add classes later.</small>
        </label>

        <div className="stack">
          <b className="label">What can new friends see?</b>
          <LevelPicker label="Default sharing" value={share} onChange={setShare} />
          <p className="fine">You can change this for each friend and each group at any time.</p>
        </div>

        <Toggle
          label="Suggest me to classmates"
          help="Others in your batch can find and add you. Off by default."
          checked={discoverable}
          onChange={setDiscoverable}
        />

        <button type="submit" className="btn solid tap" disabled={busy || name.trim().length === 0}>
          {busy ? "Saving…" : "Create my profile"}
        </button>
      </form>
    </div>
  );
}
