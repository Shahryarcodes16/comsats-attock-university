import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { upsertRoomOverride, type RoomOverrideStatus } from "@/lib/rooms/rooms.server";

const reportSchema = z.object({
  room_id: z.string().min(1).max(50),
  status: z.enum(["FREE_EARLY", "OCCUPIED_MAKEUP", "SOCIETY_EVENT"]),
  reported_by_section: z.string().max(40).optional().nullable(),
  note: z.string().max(160).optional().nullable(),
  slot_day: z.number().int().min(0).max(4).optional(),
  slot_index: z.number().int().min(0).max(4).optional(),
});

export const Route = createFileRoute("/api/rooms/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = reportSchema.parse(body);
          const sql = await getSql();

          const data = await upsertRoomOverride(sql, {
            room_id: parsed.room_id,
            status: parsed.status as RoomOverrideStatus,
            reported_by_section: parsed.reported_by_section,
            note: parsed.note,
            slot_day: parsed.slot_day,
            slot_index: parsed.slot_index,
          });

          return Response.json({ success: true, data });
        } catch (err) {
          console.error("[api/rooms/report] error:", err);
          const message = err instanceof Error ? err.message : "Failed to record room update";
          return Response.json({ success: false, error: message }, { status: 400 });
        }
      },
    },
  },
});
