import { DAY_SHORT, SLOTS, cellMap, subjects, type ClassEntry } from "@/lib/schedule";

export function WeekGrid({
  list,
  focusDay,
  liveDay,
  liveSlot,
  caption,
}: {
  list: ClassEntry[];
  focusDay: number | null;
  liveDay: number | null;
  liveSlot: number | null;
  caption: (entry: ClassEntry) => string;
}) {
  const map = cellMap(list);
  return (
    <div className="week-scroll">
      <div className="week" role="table" aria-label="Week">
        <div className="head" />
        {DAY_SHORT.map((label, day) => (
          <div key={label} className="head">
            {label}
          </div>
        ))}
        {SLOTS.map((slot, slotIndex) => (
          <div key={slot.label} className="week-row">
            <div className="time">
              {slot.label}
              <span>{slot.start}</span>
            </div>
            {DAY_SHORT.map((_, day) => {
              const items = map.get(`${day}|${slotIndex}`) ?? [];
              const focus = focusDay === day;
              return (
                <div key={`${day}-${slotIndex}`} className={focus ? "cell focus" : "cell"}>
                  {items.length === 0 ? (
                    <span className="empty-cell" aria-hidden>
                      ·
                    </span>
                  ) : (
                    items.slice(0, 3).map((entry) => {
                      const live =
                        liveDay === day &&
                        liveSlot !== null &&
                        liveSlot === slotIndex;
                      return (
                        <div
                          key={`${entry.batch}-${entry.subject}-${entry.room}-${entry.teacher}-${entry.repeater}`}
                          className={live ? "mini live" : "mini"}
                        >
                          <strong>
                            {subjects[entry.subject]}
                            {entry.repeater ? " · R" : ""}
                          </strong>
                          <span>{caption(entry)}</span>
                        </div>
                      );
                    })
                  )}
                  {items.length > 3 ? <span className="sub">+{items.length - 3} more</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
