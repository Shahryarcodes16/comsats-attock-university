import {
  batches,
  blocksFor,
  rooms,
  SLOTS,
  subjects,
  teachers,
  type Block,
  type ClassEntry,
} from "@/lib/schedule";
import { useDesk } from "@/components/timetable/context";

function overlaps(blocks: Block[]): boolean {
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      const a = blocks[left];
      const b = blocks[right];
      if (a.start <= b.end && b.start <= a.end) return true;
    }
  }
  return false;
}

export function ClassList({
  list,
  day,
  who,
}: {
  list: ClassEntry[];
  day: number;
  who: "batch" | "teacher";
}) {
  const { clock, open } = useDesk();
  const blocks = blocksFor(list, day);
  if (blocks.length === 0) {
    return <p className="quiet">Nothing scheduled. A clear day.</p>;
  }
  return (
    <div className="stack">
      {overlaps(blocks) ? (
        <p className="note">
          More than one class shares a slot. These run in parallel, so confirm which section is yours.
        </p>
      ) : null}
      {blocks.map((block) => {
        const entry = block.entry;
        const live =
          clock.dayIndex === day &&
          clock.liveSlot !== null &&
          clock.liveSlot >= block.start &&
          clock.liveSlot <= block.end;
        const person = entry.teacher >= 0 ? teachers[entry.teacher] : "";
        const room = entry.room >= 0 ? rooms[entry.room] : "";
        const batch = batches[entry.batch];
        return (
          <article
            key={`${block.start}-${entry.batch}-${entry.subject}-${entry.room}-${entry.repeater}`}
            className={live ? "class-card live" : "class-card"}
          >
            <div className="when">
              <b>{SLOTS[block.start].start}</b>
              <span>{SLOTS[block.end].end}</span>
            </div>
            <div>
              <p className="subject">
                {subjects[entry.subject]}
                <span className="flags">
                  {entry.repeater ? <span className="flag">Repeater</span> : null}
                  {live ? <span className="flag now">Now</span> : null}
                </span>
              </p>
              <div className="links">
                {who === "batch" && person ? (
                  <button type="button" className="btn tap" onClick={() => open({ type: "teacher", id: entry.teacher })}>
                    {person}
                  </button>
                ) : null}
                {who === "teacher" ? (
                  <button type="button" className="btn tap" onClick={() => open({ type: "batch", id: entry.batch })}>
                    {batch}
                  </button>
                ) : null}
                {room ? (
                  <button type="button" className="btn tap" onClick={() => open({ type: "room", id: entry.room })}>
                    {room}
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
