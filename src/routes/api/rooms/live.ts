import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { getLiveRoomOverrides } from "@/lib/rooms/rooms.server";

export const Route = createFileRoute("/api/rooms/live")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sql = await getSql();
          const overrides = await getLiveRoomOverrides(sql);
          return Response.json({ success: true, overrides });
        } catch (err) {
          console.error("[api/rooms/live] error:", err);
          return Response.json(
            { success: false, error: "Failed to fetch live room statuses" },
            { status: 500 }
          );
        }
      },
    },
  },
});
