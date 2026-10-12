import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSocialState } from "@/lib/social/api";
import type { Activity } from "@/lib/social/engine";
import type { SocialState } from "@/lib/social/types";

export type SocialTab = "now" | "people" | "groups" | "plans" | "me";

export type Audience = { kind: "friend" | "group"; id: string };

type Notice = { id: number; kind: "ok" | "error"; text: string };

type Phase = "signed_out" | "loading" | "ready" | "error";

type SocialApi = {
  phase: Phase;
  state: SocialState | null;
  loadError: string | null;
  refresh: () => Promise<void>;
  /** Run a change, then refresh. Errors become a notice; returns null on failure. */
  act: <T>(work: () => Promise<T>, success?: string) => Promise<T | null>;
  notice: Notice | null;
  dismissNotice: () => void;
  /** Things waiting on the person: requests, group invites, plans to answer. */
  inbox: number;
  tab: SocialTab;
  setTab: (tab: SocialTab) => void;
  /** Start planning from anywhere: opens the Plans tab with this audience chosen. */
  plan: { audience: Audience; activity?: Activity } | null;
  startPlan: (audience: Audience, activity?: Activity) => void;
  clearPlan: () => void;
};

const SocialContext = createContext<SocialApi | null>(null);

export function messageOf(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; status?: unknown };
    if (e.status === 401 || e.message === "Unauthorized") return "Please sign in again.";
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return "Something went wrong. Please try again.";
}

const POLL_MS = 45_000;

export function SocialProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? null;
  const [state, setState] = useState<SocialState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tab, setTabState] = useState<SocialTab>("now");
  const [plan, setPlan] = useState<SocialApi["plan"]>(null);
  const noticeId = useRef(0);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((kind: Notice["kind"], text: string) => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, kind, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), kind === "error" ? 6000 : 3000);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await getSocialState();
      setState(next);
      setPhase("ready");
      setLoadError(null);
    } catch (error) {
      setLoadError(messageOf(error));
      setPhase((current) => (current === "ready" ? current : "error"));
    }
  }, [userId]);

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      setState(null);
      setPhase("signed_out");
      return;
    }
    setPhase((current) => (current === "ready" ? current : "loading"));
    void refresh();
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [userId, isPending, refresh]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const act = useCallback(
    async <T,>(work: () => Promise<T>, success?: string): Promise<T | null> => {
      try {
        const result = await work();
        await refresh();
        if (success) flash("ok", success);
        return result;
      } catch (error) {
        flash("error", messageOf(error));
        return null;
      }
    },
    [refresh, flash],
  );

  const inbox = useMemo(() => {
    if (!state) return 0;
    const invites = state.groups.filter((group) => group.myStatus === "invited").length;
    const plans = state.meetups.filter(
      (meetup) =>
        !meetup.iAmCreator &&
        meetup.phase !== "past" &&
        (meetup.status === "proposed" || meetup.status === "needs_change") &&
        meetup.participants.some((p) => p.isMe && p.response === "pending"),
    ).length;
    return state.incoming.length + invites + plans;
  }, [state]);

  // Opening a section is a good moment to fetch the latest.
  const setTab = useCallback(
    (next: SocialTab) => {
      setTabState(next);
      void refresh();
    },
    [refresh],
  );
  const startPlan = useCallback(
    (audience: Audience, activity?: Activity) => {
      setPlan({ audience, activity });
      setTab("plans");
    },
    [setTab],
  );
  const clearPlan = useCallback(() => setPlan(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const api = useMemo<SocialApi>(
    () => ({
      phase,
      state,
      loadError,
      refresh,
      act,
      notice,
      dismissNotice,
      inbox,
      tab,
      setTab,
      plan,
      startPlan,
      clearPlan,
    }),
    [phase, state, loadError, refresh, act, notice, dismissNotice, inbox, tab, setTab, plan, startPlan, clearPlan],
  );

  return <SocialContext.Provider value={api}>{children}</SocialContext.Provider>;
}

export function useSocial(): SocialApi {
  const api = useContext(SocialContext);
  if (!api) throw new Error("Social features are not available here");
  return api;
}
