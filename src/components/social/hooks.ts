import { useMemo } from "react";
import type { ClassEntry } from "@/lib/schedule";
import { maskOf } from "@/lib/social/engine";
import { personalEntries } from "@/lib/social/personal";
import { useSocial } from "@/components/social/provider";

/** The signed-in person's own week, built from their batch and personal changes. */
export function useMyWeek(): { entries: ClassEntry[]; mask: number } {
  const { state } = useSocial();
  const profile = state?.profile ?? null;
  return useMemo(() => {
    if (!profile) return { entries: [], mask: 0 };
    const entries = personalEntries(profile.batchId, profile.dropped, profile.added);
    return { entries, mask: maskOf(entries) };
  }, [profile]);
}
