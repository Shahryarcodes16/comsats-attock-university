import { useState, type FormEvent } from "react";
import { X, Zap } from "lucide-react";
import type { RoomOverrideDTO, RoomOverrideStatus } from "@/lib/rooms/rooms.server";

interface ReportModalProps {
  roomId: string | null;
  day: number;
  slot: number;
  onClose: () => void;
  onSuccess: (updated: RoomOverrideDTO) => void;
}

export function RoomReportModal({
  roomId,
  day,
  slot,
  onClose,
  onSuccess,
}: ReportModalProps) {
  const [status, setStatus] = useState<RoomOverrideStatus>("FREE_EARLY");
  const [section, setSection] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!roomId) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/rooms/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          status,
          reported_by_section: section.trim() || undefined,
          note: note.trim() || undefined,
          slot_day: day,
          slot_index: slot,
        }),
      });

      const result = await res.json();
      if (result.success && result.data) {
        onSuccess(result.data);
        onClose();
      } else {
        setError(result.error || "Failed to submit live update.");
      }
    } catch {
      setError("Could not submit update. Check your internet connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="status-modal-backdrop" onClick={onClose}>
      <div
        className="status-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3 id="modal-room-title">Update Room {roomId}</h3>
            <button
              type="button"
              className="close-btn tap"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <p className="modal-subtitle">
            Status automatically resets at the end of the current lecture slot.
          </p>

          {error ? <p className="room-report-error">{error}</p> : null}

          {/* Status Radio Cards */}
          <div className="status-options">
            <label className="status-radio">
              <input
                type="radio"
                name="status"
                value="FREE_EARLY"
                checked={status === "FREE_EARLY"}
                onChange={() => setStatus("FREE_EARLY")}
                required
              />
              <div className="radio-card free-early">
                <span className="radio-title">🟢 Freed Early / Cancelled</span>
                <span className="radio-desc">Teacher left early or class didn't happen</span>
              </div>
            </label>

            <label className="status-radio">
              <input
                type="radio"
                name="status"
                value="OCCUPIED_MAKEUP"
                checked={status === "OCCUPIED_MAKEUP"}
                onChange={() => setStatus("OCCUPIED_MAKEUP")}
              />
              <div className="radio-card occupied-makeup">
                <span className="radio-title">🟠 Makeup Class / Quiz</span>
                <span className="radio-desc">Room is scheduled free, but a class is inside</span>
              </div>
            </label>

            <label className="status-radio">
              <input
                type="radio"
                name="status"
                value="SOCIETY_EVENT"
                checked={status === "SOCIETY_EVENT"}
                onChange={() => setStatus("SOCIETY_EVENT")}
              />
              <div className="radio-card society-event">
                <span className="radio-title">🟣 Society Meeting / Event</span>
                <span className="radio-desc">Occupied by a student society or seminar</span>
              </div>
            </label>
          </div>

          {/* Optional Context Inputs */}
          <div className="input-group">
            <input
              type="text"
              placeholder="Your Section (e.g. FA23-BCS-A) - Optional"
              maxLength={20}
              value={section}
              onChange={(e) => setSection(e.target.value)}
            />
            <input
              type="text"
              placeholder="Short note (e.g. DSA Quiz till 1 PM) - Optional"
              maxLength={80}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="submit-btn tap"
            disabled={submitting}
          >
            <Zap size={16} />
            {submitting ? "Publishing Update..." : "Publish Live Update"}
          </button>
        </form>
      </div>
    </div>
  );
}
