import type { Sql } from "@/lib/db";
import { campusNow } from "@/lib/social/engine";
import { SLOTS } from "@/lib/social/slots";

export type RoomOverrideStatus = "FREE_EARLY" | "OCCUPIED_MAKEUP" | "SOCIETY_EVENT";

export type RoomOverrideDTO = {
  room_id: string;
  status: RoomOverrideStatus;
  reported_by_section: string | null;
  note: string | null;
  verifications: number;
  slot_day: number;
  slot_index: number;
  expires_at: string;
  updated_at: string;
};

/**
 * Calculate the expiry timestamp for a campus slot on a given weekday.
 * Campus time is PKT (UTC+5).
 */
export function slotExpiry(day: number, slotIndex: number): { day: number; slot: number; expiresAt: Date } {
  const cNow = campusNow();
  const slotObj = SLOTS[slotIndex] ?? SLOTS[0];
  const endMinutes = slotObj.to;
  const hours = Math.floor(endMinutes / 60);
  const mins = endMinutes % 60;

  // Calculate day difference from campus date
  const [year, month, dNum] = cNow.date.split("-").map(Number);
  // PKT is UTC+5, so UTC hours = PKT hours - 5
  const utcHours = hours - 5;
  const expiresAt = new Date(Date.UTC(year, month - 1, dNum, utcHours, mins, 0));

  return {
    day,
    slot: slotIndex,
    expiresAt,
  };
}

export async function getLiveRoomOverrides(sql: Sql): Promise<Record<string, RoomOverrideDTO>> {
  // Return all overrides that have not expired yet
  const rows = await sql.query<RoomOverrideDTO>(
    `SELECT room_id, status, reported_by_section, note, verifications, slot_day, slot_index, expires_at, updated_at
     FROM room_overrides
     WHERE expires_at > now()
     ORDER BY updated_at DESC`
  );

  const overrides: Record<string, RoomOverrideDTO> = {};
  for (const row of rows) {
    if (!overrides[row.room_id]) {
      overrides[row.room_id] = {
        ...row,
        expires_at: new Date(row.expires_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      };
    }
  }
  return overrides;
}

export async function upsertRoomOverride(
  sql: Sql,
  data: {
    room_id: string;
    status: RoomOverrideStatus;
    reported_by_section?: string | null;
    note?: string | null;
    slot_day?: number;
    slot_index?: number;
  }
): Promise<RoomOverrideDTO> {
  const cNow = campusNow();
  const day = typeof data.slot_day === "number" ? data.slot_day : (cNow.weekday >= 1 && cNow.weekday <= 5 ? cNow.weekday - 1 : 0);
  
  // Find current slot or default to slot 0
  let slotIndex = typeof data.slot_index === "number" ? data.slot_index : 0;
  if (typeof data.slot_index !== "number") {
    const live = SLOTS.findIndex((s) => cNow.minutes >= s.from && cNow.minutes < s.to);
    slotIndex = live >= 0 ? live : 0;
  }

  const { expiresAt } = slotExpiry(day, slotIndex);

  // If status is the same, increment verifications. If status changes, update status and reset verifications
  const rows = await sql.query<RoomOverrideDTO>(
    `INSERT INTO room_overrides (room_id, status, reported_by_section, note, verifications, slot_day, slot_index, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, $5, $6, $7, now())
     ON CONFLICT (room_id, slot_day, slot_index)
     DO UPDATE SET
       verifications = CASE 
         WHEN room_overrides.status = EXCLUDED.status THEN room_overrides.verifications + 1 
         ELSE 1 
       END,
       status = EXCLUDED.status,
       reported_by_section = COALESCE(NULLIF(EXCLUDED.reported_by_section, ''), room_overrides.reported_by_section),
       note = COALESCE(NULLIF(EXCLUDED.note, ''), room_overrides.note),
       expires_at = EXCLUDED.expires_at,
       updated_at = now()
     RETURNING room_id, status, reported_by_section, note, verifications, slot_day, slot_index, expires_at, updated_at`,
    [
      data.room_id.trim().toUpperCase(),
      data.status,
      data.reported_by_section?.trim() || null,
      data.note?.trim() || null,
      day,
      slotIndex,
      expiresAt.toISOString(),
    ]
  );

  const saved = rows[0];
  return {
    ...saved,
    expires_at: new Date(saved.expires_at).toISOString(),
    updated_at: new Date(saved.updated_at).toISOString(),
  };
}
