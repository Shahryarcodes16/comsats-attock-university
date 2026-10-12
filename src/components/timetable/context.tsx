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
import { batches, readClock, teachers, type ClockInfo } from "@/lib/schedule";

export type View = "today" | "rooms" | "faculty" | "batches" | "find" | "friends";
export type ThemeName = "paper" | "ink";

export type Detail =
  | { type: "room"; id: number }
  | { type: "teacher"; id: number }
  | { type: "batch"; id: number }
  | { type: "subject"; id: number };

const KEY = "cui-attock-desk-v1";

type Prefs = {
  theme: ThemeName;
  view: View;
  batchId: number;
  pinnedBatch: number | null;
  pinnedTeachers: number[];
};

const VIEWS: View[] = ["today", "rooms", "faculty", "batches", "find", "friends"];

const defaultBatch = Math.max(
  0,
  batches.findIndex((label) => label === "BS(CS)-I"),
);

const DEFAULTS: Prefs = {
  theme: "paper",
  view: "today",
  batchId: defaultBatch,
  pinnedBatch: null,
  pinnedTeachers: [],
};

function inRange(value: unknown, length: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length;
}

function sanitize(value: unknown): Prefs {
  if (!value || typeof value !== "object") return DEFAULTS;
  const raw = value as Partial<Prefs>;
  const pinnedTeachers = Array.isArray(raw.pinnedTeachers)
    ? raw.pinnedTeachers.filter((id) => inRange(id, teachers.length)).slice(0, 8)
    : [];
  return {
    theme: raw.theme === "ink" ? "ink" : "paper",
    view: VIEWS.includes(raw.view as View) ? (raw.view as View) : "today",
    batchId: inRange(raw.batchId, batches.length) ? raw.batchId : defaultBatch,
    pinnedBatch: inRange(raw.pinnedBatch, batches.length) ? raw.pinnedBatch : null,
    pinnedTeachers,
  };
}

type DeskApi = {
  ready: boolean;
  now: Date | null;
  clock: ClockInfo;
  theme: ThemeName;
  toggleTheme: () => void;
  view: View;
  setView: (view: View) => void;
  day: number;
  slot: number;
  following: boolean;
  setDay: (day: number) => void;
  setSlot: (slot: number) => void;
  backToNow: () => void;
  batchId: number;
  setBatchId: (id: number) => void;
  pinnedBatch: number | null;
  pinBatch: (id: number | null) => void;
  pinnedTeachers: number[];
  togglePinTeacher: (id: number) => void;
  detail: Detail | null;
  open: (detail: Detail) => void;
  close: () => void;
};

const DeskContext = createContext<DeskApi | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [pick, setPick] = useState<{ day: number; slot: number } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    try {
      setPrefs(sanitize(JSON.parse(localStorage.getItem(KEY) || "null")));
    } catch {
      setPrefs(DEFAULTS);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(KEY, JSON.stringify(prefs));
    if (prefs.theme === "ink") document.documentElement.dataset.theme = "ink";
    else delete document.documentElement.dataset.theme;
  }, [prefs, ready]);

  const clock = useMemo(() => readClock(now), [now]);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const day = pick?.day ?? clock.focusDay;
  const slot = pick?.slot ?? clock.focusSlot;

  const toggleTheme = useCallback(() => {
    setPrefs((current) => ({
      ...current,
      theme: current.theme === "ink" ? "paper" : "ink",
    }));
  }, []);
  const setView = useCallback((view: View) => {
    setPrefs((current) => ({ ...current, view }));
  }, []);
  const setDay = useCallback((nextDay: number) => {
    setPick((current) => ({
      day: nextDay,
      slot: current?.slot ?? clockRef.current.focusSlot,
    }));
  }, []);
  const setSlot = useCallback((nextSlot: number) => {
    setPick((current) => ({
      day: current?.day ?? clockRef.current.focusDay,
      slot: nextSlot,
    }));
  }, []);
  const backToNow = useCallback(() => setPick(null), []);
  const setBatchId = useCallback((batchId: number) => {
    setPrefs((current) => ({ ...current, batchId }));
  }, []);
  const pinBatch = useCallback((pinnedBatch: number | null) => {
    setPrefs((current) => ({
      ...current,
      pinnedBatch,
      batchId: pinnedBatch ?? current.batchId,
    }));
  }, []);
  const togglePinTeacher = useCallback((id: number) => {
    setPrefs((current) => {
      const has = current.pinnedTeachers.includes(id);
      const pinnedTeachers = has
        ? current.pinnedTeachers.filter((item) => item !== id)
        : [...current.pinnedTeachers, id].slice(-8);
      return { ...current, pinnedTeachers };
    });
  }, []);
  const open = useCallback((next: Detail) => setDetail(next), []);
  const close = useCallback(() => setDetail(null), []);

  const api = useMemo<DeskApi>(
    () => ({
      ready,
      now,
      clock,
      theme: prefs.theme,
      toggleTheme,
      view: prefs.view,
      setView,
      day,
      slot,
      following: pick === null,
      setDay,
      setSlot,
      backToNow,
      batchId: prefs.batchId,
      setBatchId,
      pinnedBatch: prefs.pinnedBatch,
      pinBatch,
      pinnedTeachers: prefs.pinnedTeachers,
      togglePinTeacher,
      detail,
      open,
      close,
    }),
    [
      ready,
      now,
      clock,
      prefs,
      day,
      slot,
      pick,
      detail,
      toggleTheme,
      setView,
      setDay,
      setSlot,
      backToNow,
      setBatchId,
      pinBatch,
      togglePinTeacher,
      open,
      close,
    ],
  );

  return <DeskContext.Provider value={api}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskApi {
  const api = useContext(DeskContext);
  if (!api) throw new Error("Desk is not available");
  return api;
}
