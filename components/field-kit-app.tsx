"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler, type ReactNode } from "react";
import {
  Backpack,
  Check,
  ChevronRight,
  FlaskConical,
  HeartPulse,
  Hammer,
  LayoutDashboard,
  LogIn,
  LogOut,
  MoonStar,
  Shield,
  Sparkles,
  Swords,
  WandSparkles,
} from "lucide-react";
import { createSeedCharacter } from "@/lib/seed-data";
import { getFirebaseServices, isFirebaseConfigured, listenForGoogleUser, saveCharacter, signInWithGoogle, signOutUser, subscribeToCharacter } from "@/lib/firebase";
import {
  type Attack,
  type CharacterData,
  type Elixir,
  type EventLogEntry,
  type Feature,
  type NavView,
  type Resource,
  type Spell,
} from "@/lib/types";

const LOCAL_STORAGE_KEY = "breks-field-kit-cache";
const ACTION_FEEDBACK_MS = 1400;
const TOAST_TIMEOUT_MS = 5000;
const ABILITY_ORDER = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"] as const;
const LONG_REST_ELIXIRS = ["Healing", "Swiftness", "Resilience", "Boldness", "Flight", "Transformation"];
const spellFilters = ["Prepared", "Always Prepared", "Emergency Support", "Control", "Damage", "Mobility", "Utility", "Reaction", "Concentration", "All"];

const navItems: Array<{ id: NavView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "combat", label: "Combat", icon: Swords },
  { id: "spells", label: "Spells & Elixirs", icon: WandSparkles },
  { id: "veech", label: "Veech", icon: Sparkles },
  { id: "exploration", label: "Exploration & Tools", icon: Hammer },
  { id: "inventory", label: "Inventory & Infusions", icon: Backpack },
  { id: "rest", label: "Rest & Session", icon: MoonStar },
  { id: "setup", label: "Character Setup", icon: Shield },
];

type UndoState = {
  label: string;
  snapshot: CharacterData;
};

type ToastState = {
  id: string;
  message: string;
  tone?: "default" | "success";
  undoable?: boolean;
};

function getInitialCharacter() {
  const seed = createSeedCharacter();

  if (typeof window === "undefined") {
    return seed;
  }

  const cached = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!cached) {
    return createSeedCharacter();
  }

  try {
    return hydrateCharacter(JSON.parse(cached));
  } catch {
    return seed;
  }
}

function getInitialSyncStatus() {
  if (typeof window === "undefined") {
    return "Preparing field notes...";
  }

  return window.localStorage.getItem(LOCAL_STORAGE_KEY) ? "Loaded cached field notes." : "Started from seed data.";
}

function cloneCharacter(data: CharacterData) {
  return JSON.parse(JSON.stringify(data)) as CharacterData;
}

function hydrateCharacter(raw: Partial<CharacterData>) {
  const seed = createSeedCharacter();
  const hydrated = {
    ...seed,
    ...raw,
    core: { ...seed.core, ...raw.core },
    abilities: { ...seed.abilities, ...raw.abilities },
    stats: { ...seed.stats, ...raw.stats },
    savingThrows: { ...seed.savingThrows, ...raw.savingThrows },
    longRest: { ...seed.longRest, ...raw.longRest },
    ui: { ...seed.ui, ...raw.ui },
    resources: raw.resources ?? seed.resources,
    reminders: raw.reminders ?? seed.reminders,
    decisionPrompts: raw.decisionPrompts ?? seed.decisionPrompts,
    attacks: raw.attacks ?? seed.attacks,
    spells: raw.spells ?? seed.spells,
    elixirs: raw.elixirs ?? seed.elixirs,
    features: raw.features ?? seed.features,
    tools: raw.tools ?? seed.tools,
    infusionsKnown: raw.infusionsKnown ?? seed.infusionsKnown,
    infusionsActive: raw.infusionsActive ?? seed.infusionsActive,
    inventory: raw.inventory ?? seed.inventory,
    companion: { ...seed.companion, ...raw.companion },
    restChecklist: raw.restChecklist ?? seed.restChecklist,
    eventLog: raw.eventLog ?? seed.eventLog,
  } satisfies CharacterData;

  syncDerivedState(hydrated);
  return hydrated;
}

function stampLog(text: string, sessionLabel: string): EventLogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    text,
    sessionLabel,
  };
}

function formatSigned(value: number | string) {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return numeric >= 0 ? `+${numeric}` : `${numeric}`;
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesSpellFilter(spell: Spell, filter: string) {
  if (filter === "All") return true;
  if (filter === "Prepared") return spell.prepared;
  if (filter === "Always Prepared") return Boolean(spell.alwaysPrepared);
  if (filter === "Reaction") return spell.actionType === "reaction";
  if (filter === "Concentration") return spell.concentration;
  if (filter === "Emergency Support") return spell.tags.some((tag) => ["healing", "support"].includes(tag));
  if (filter === "Control") return spell.tags.includes("control");
  if (filter === "Damage") return spell.tags.includes("damage");
  if (filter === "Mobility") return spell.tags.some((tag) => ["mobility", "escape"].includes(tag));
  if (filter === "Utility") return spell.tags.includes("utility") || spell.tags.includes("ritual");
  return true;
}

function syncDerivedState(draft: CharacterData) {
  const elixirResource = draft.resources.find((item) => item.id === "elixirs");
  if (elixirResource) {
    elixirResource.current = draft.elixirs.filter((item) => !item.consumed).length;
  }

  const veechResource = draft.resources.find((item) => item.id === "veech-hp");
  if (veechResource) {
    veechResource.current = draft.companion.currentHp;
  }
}

function buildElixirFromSelection(options: {
  name: string;
  holder: string;
  notes: string;
  source: Elixir["source"];
  duration: string;
  effect: string;
  createdDuringRestId?: string;
  expiresOnLongRest?: boolean;
}): Elixir {
  return {
    id: crypto.randomUUID(),
    name: options.name,
    effect: options.effect,
    holder: options.holder,
    consumed: false,
    duration: options.duration,
    notes: options.notes || undefined,
    source: options.source,
    createdDuringRestId: options.createdDuringRestId,
    expiresOnLongRest: options.expiresOnLongRest,
  };
}

function useTemporaryFeedback() {
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  function pulse(id: string, label: string) {
    setFeedback((current) => ({ ...current, [id]: label }));
    window.setTimeout(() => {
      setFeedback((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }, ACTION_FEEDBACK_MS);
  }

  return { feedback, pulse };
}

function ShellCard({
  title,
  subtitle,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-[28px] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)] sm:p-5", className)}>
      {(title || subtitle) && (
        <header className="mb-4">
          {title ? <h2 className="text-xl font-semibold text-[var(--text)]">{title}</h2> : null}
          {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
        </header>
      )}
      {children}
    </section>
  );
}

function StatTable({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white/82">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[1.2fr_0.9fr] items-center gap-3 border-t border-[var(--line)] px-4 py-3 first:border-t-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">{row.label}</p>
          <p className="text-right text-2xl font-bold leading-none sm:text-3xl">{row.value}</p>
        </div>
      ))}
    </div>
  );
}

function AbilityScoreTable({
  rows,
}: {
  rows: Array<{ keyLabel: string; modifier: number; score: number }>;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
      <div className="hidden grid-cols-[0.8fr_0.8fr_0.6fr] gap-3 bg-[var(--green-soft)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] sm:grid">
        <span>Ability</span>
        <span className="text-right">Mod</span>
        <span className="text-right">Score</span>
      </div>
      {rows.map((row) => (
        <div key={row.keyLabel} className="grid grid-cols-[0.9fr_0.8fr_0.6fr] gap-3 border-t border-[var(--line)] px-4 py-3 first:border-t-0">
          <p className="font-semibold">{row.keyLabel}</p>
          <p className="text-right text-xl font-bold">{formatSigned(row.modifier)}</p>
          <p className="text-right text-sm text-[var(--muted)]">{row.score}</p>
        </div>
      ))}
    </div>
  );
}

function FieldValueInput({
  label,
  value,
  denominator,
  onChange,
  onBlur,
  onKeyDown,
}: {
  label: string;
  value: string;
  denominator?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--line)] bg-white/82 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">{label}</p>
      <div className="mt-3 flex items-end gap-3">
        <input
          aria-label={label}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-center text-4xl font-bold outline-none transition focus:border-[var(--green)]"
        />
        {denominator ? <p className="pb-2 text-xl font-semibold text-[var(--muted)]">/ {denominator}</p> : null}
      </div>
    </div>
  );
}

function EditableNumberField({
  fieldKey,
  label,
  initialValue,
  denominator,
  onCommit,
}: {
  fieldKey: string;
  label: string;
  initialValue: number;
  denominator?: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(String(initialValue));

  return (
    <FieldValueInput
      key={fieldKey}
      label={label}
      value={value}
      denominator={denominator}
      onChange={setValue}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function EditableNumberRow({
  fieldKey,
  label,
  initialValue,
  denominator,
  onCommit,
}: {
  fieldKey: string;
  label: string;
  initialValue: number;
  denominator?: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(String(initialValue));

  return (
    <div className="grid grid-cols-[1.1fr_1fr] items-center gap-3 border-t border-[var(--line)] px-4 py-3 first:border-t-0">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">{label}</p>
      <div className="flex items-center justify-end gap-2">
        <input
          key={fieldKey}
          aria-label={label}
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => onCommit(value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className="w-24 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-right text-xl font-bold outline-none transition focus:border-[var(--green)]"
        />
        {denominator ? <span className="text-sm font-semibold text-[var(--muted)]">/ {denominator}</span> : null}
      </div>
    </div>
  );
}

type ActionRowData = {
  id: string;
  name: string;
  typeOrTrigger: string;
  summary: string;
  cost: string;
  disabled?: boolean;
  disabledReason?: string;
  details?: string;
};

function ActionTable({
  title,
  rows,
  feedback,
  onUse,
  className,
}: {
  title: string;
  rows: ActionRowData[];
  feedback: Record<string, string>;
  onUse: (row: ActionRowData) => void;
  className?: string;
}) {
  return (
    <ShellCard title={title} className={className}>
      <div className="overflow-hidden rounded-[22px] border border-[var(--line)]">
        <div className="hidden grid-cols-[1.1fr_0.8fr_1.6fr_0.8fr_0.5fr] gap-3 bg-[var(--green-soft)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] md:grid">
          <span>Name</span>
          <span>Type / Trigger</span>
          <span>Summary</span>
          <span>Cost</span>
          <span className="text-right">Use</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className="border-t border-[var(--line)] bg-white/82 px-4 py-3 first:border-t-0 transition hover:bg-[var(--panel-strong)] active:bg-[var(--green-soft)]"
          >
            <div className="grid gap-2 md:grid-cols-[1.1fr_0.8fr_1.6fr_0.8fr_0.5fr] md:items-center md:gap-3">
              <div>
                <p className="font-semibold">{row.name}</p>
                {row.details ? <p className="mt-1 text-xs text-[var(--muted)]">{row.details}</p> : null}
              </div>
              <p className="text-sm text-[var(--muted)]">{row.typeOrTrigger}</p>
              <p className="text-sm leading-6 text-[var(--muted)]">{row.summary}</p>
              <div>
                <p className="text-sm text-[var(--muted)]">{row.cost}</p>
                {row.disabledReason ? <p className="mt-1 text-xs text-[var(--red)]">{row.disabledReason}</p> : null}
              </div>
              <div className="md:text-right">
                <button
                  type="button"
                  disabled={row.disabled}
                  onClick={() => onUse(row)}
                  className={cx(
                    "min-h-10 rounded-xl px-4 text-sm font-semibold transition",
                    row.disabled
                      ? "cursor-not-allowed border border-[var(--line)] bg-white text-[var(--muted)] opacity-70"
                      : feedback[row.id]
                        ? "bg-[var(--orange)] text-white"
                        : "bg-[var(--green)] text-white hover:bg-[#244936]",
                  )}
                >
                  {feedback[row.id] ?? "Use"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ShellCard>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="grid gap-2 text-sm text-[var(--muted)]">
      <span>{label}</span>
      <input
        aria-label={label}
        className="min-h-11 rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--green)]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="grid gap-2 text-sm text-[var(--muted)]">
      <span>{label}</span>
      <textarea
        aria-label={label}
        rows={rows}
        className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--green)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function FieldKitApp() {
  const [character, setCharacter] = useState<CharacterData>(getInitialCharacter);
  const [firebaseMode, setFirebaseMode] = useState<"loading" | "local-only" | "connected" | "signed-out">(isFirebaseConfigured ? "loading" : "local-only");
  const [syncStatus, setSyncStatus] = useState(getInitialSyncStatus);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [manualLog, setManualLog] = useState("");
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [sessionNote, setSessionNote] = useState("");
  const lastSavedRef = useRef("");
  const hydratedRef = useRef(false);
  const writeTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const { feedback, pulse } = useTemporaryFeedback();

  const filteredSpells = useMemo(
    () => character.spells.filter((spell) => matchesSpellFilter(spell, character.ui.spellFilter)),
    [character.spells, character.ui.spellFilter],
  );
  const activeInfusions = useMemo(() => character.infusionsActive.filter((item) => item.active), [character.infusionsActive]);
  const pinnedReminders = useMemo(() => character.reminders.filter((item) => item.pinned), [character.reminders]);
  const regularPreparedSpells = useMemo(
    () => character.spells.filter((spell) => spell.prepared && !spell.alwaysPrepared),
    [character.spells],
  );
  const currentPreparationId = character.longRest.currentPreparationId;
  const currentRestElixirs = useMemo(
    () => character.elixirs.filter((item) => item.source === "long-rest" && item.createdDuringRestId === currentPreparationId),
    [character.elixirs, currentPreparationId],
  );
  const expiringElixirs = useMemo(
    () => character.elixirs.filter((item) => item.expiresOnLongRest && item.createdDuringRestId && item.createdDuringRestId !== currentPreparationId),
    [character.elixirs, currentPreparationId],
  );
  const longRestResources = useMemo(() => character.resources.filter((item) => item.resetType === "long-rest"), [character.resources]);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(character));
  }, [character]);

  useEffect(() => {
    const services = getFirebaseServices();
    if (!isFirebaseConfigured || !services) {
      hydratedRef.current = true;
      return;
    }

    const unsubscribe = listenForGoogleUser(
      services,
      (user) => {
        setFirebaseMode("connected");
        setUserId(user.uid);
        setUserLabel(user.displayName || user.email || "Signed in");
        setSyncStatus("Google sign-in ready. Syncing with Firestore...");
      },
      () => {
        setFirebaseMode("signed-out");
        setUserId(null);
        setUserLabel(null);
        hydratedRef.current = true;
        setSyncStatus("Signed out. Use Google to open your field kit.");
      },
      (message) => {
        setFirebaseMode("local-only");
        hydratedRef.current = true;
        setSyncStatus(`Firebase auth failed: ${message}`);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const services = getFirebaseServices();
    if (!services || !userId) {
      return;
    }

    const unsubscribe = subscribeToCharacter(
      services,
      userId,
      (data) => {
        hydratedRef.current = true;
        const hydrated = hydrateCharacter(data);
        const serialized = JSON.stringify(hydrated);
        lastSavedRef.current = serialized;
        setCharacter(hydrated);
        setSyncStatus("Firestore synced.");
      },
      async () => {
        const seed = createSeedCharacter();
        syncDerivedState(seed);
        await saveCharacter(services, userId, seed);
      },
    );

    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    const services = getFirebaseServices();
    if (!services || !userId || !hydratedRef.current) {
      return;
    }

    const serialized = JSON.stringify(character);
    if (serialized === lastSavedRef.current) {
      return;
    }

    if (writeTimerRef.current) {
      window.clearTimeout(writeTimerRef.current);
    }

    writeTimerRef.current = window.setTimeout(async () => {
      try {
        await saveCharacter(services, userId, character);
        lastSavedRef.current = serialized;
        setSyncStatus("Changes saved to Firestore.");
      } catch (error) {
        setSyncStatus(error instanceof Error ? `Save failed, local cache kept: ${error.message}` : "Save failed, local cache kept.");
      }
    }, 500);
  }, [character, userId]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, TOAST_TIMEOUT_MS);
  }, [toast]);

  function addLog(draft: CharacterData, text: string) {
    draft.eventLog.unshift(stampLog(text, draft.currentSessionLabel));
  }

  function commit(label: string, updater: (draft: CharacterData) => void) {
    setCharacter((current) => {
      const snapshot = cloneCharacter(current);
      const draft = cloneCharacter(current);
      updater(draft);
      syncDerivedState(draft);
      setUndoState({ label, snapshot });
      return draft;
    });
  }

  function showToast(message: string, undoable = true, tone: ToastState["tone"] = "success") {
    setToast({
      id: crypto.randomUUID(),
      message,
      undoable,
      tone,
    });
  }

  function performAction(options: {
    actionId: string;
    label: string;
    toastMessage: string;
    updater: (draft: CharacterData) => void;
    tone?: ToastState["tone"];
  }) {
    if (feedback[options.actionId]) {
      return;
    }

    pulse(options.actionId, options.label);
    commit(options.toastMessage, options.updater);
    showToast(options.toastMessage, true, options.tone ?? "success");
  }

  async function handleGoogleSignIn() {
    const services = getFirebaseServices();
    if (!services) {
      setSyncStatus("Firebase is not configured yet.");
      return;
    }

    try {
      setSyncStatus("Opening Google sign-in...");
      await signInWithGoogle(services);
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Google sign-in failed: ${error.message}` : "Google sign-in failed.");
    }
  }

  async function handleSignOut() {
    const services = getFirebaseServices();
    if (!services) return;

    try {
      await signOutUser(services);
      setSyncStatus("Signed out.");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Sign-out failed: ${error.message}` : "Sign-out failed.");
    }
  }

  function undoLastAction() {
    if (!undoState) return;
    setCharacter(undoState.snapshot);
    setSyncStatus(`Undid: ${undoState.label}`);
    setUndoState(null);
    setToast(null);
  }

  function changeView(view: NavView) {
    setCharacter((current) => ({
      ...current,
      ui: {
        ...current.ui,
        activeView: view,
      },
    }));
  }

  function saveTypedHp(field: "currentHp" | "tempHp", raw: string) {
    const oldValue = character.stats[field];
    const max = field === "currentHp" ? character.stats.maxHp : Number.MAX_SAFE_INTEGER;
    const next = Math.max(0, Math.min(max, numberValue(raw)));
    if (next === oldValue) {
      return;
    }

    commit(`Updated ${field}`, (draft) => {
      draft.stats[field] = next;
      addLog(draft, `${field === "currentHp" ? "Current HP" : "Temporary HP"} changed from ${oldValue} to ${next}.`);
    });
    showToast(`${field === "currentHp" ? "Current HP" : "Temp HP"} updated to ${next}.`);
  }

  function updateResource(resourceId: string, delta: number, verb: "Spent" | "Restored") {
    const resource = character.resources.find((item) => item.id === resourceId);
    if (!resource) return;
    const next = Math.max(0, Math.min(resource.max, resource.current + delta));
    if (next === resource.current) return;

    performAction({
      actionId: `${verb}-${resourceId}`,
      label: verb === "Spent" ? "Spent" : "Restored",
      toastMessage: `${resource.name} ${verb === "Spent" ? "used" : "restored"} — ${next}/${resource.max}`,
      updater: (draft) => {
        const target = draft.resources.find((item) => item.id === resourceId);
        if (!target) return;
        const previous = target.current;
        target.current = next;
        addLog(draft, `${verb} ${Math.abs(next - previous)} ${resource.name}. It is now ${target.current}/${target.max}.`);
      },
    });
  }

  function castSpell(spell: Spell) {
    const actionId = `spell-${spell.id}`;
    performAction({
      actionId,
      label: "Cast",
      toastMessage: spell.level > 0 ? `${spell.name} cast — slot spent` : `${spell.name} cast`,
      updater: (draft) => {
        if (spell.level > 0) {
          const slot = draft.resources.find((item) => item.id === `slot${spell.level}`);
          if (slot && slot.current > 0) {
            slot.current -= 1;
          }
        }
        addLog(draft, `Cast ${spell.name}${spell.level > 0 ? ` using a level ${spell.level} slot` : ""}.`);
      },
    });
  }

  function togglePrepared(spellId: string) {
    commit("Updated prepared spell", (draft) => {
      const spell = draft.spells.find((item) => item.id === spellId);
      if (spell && !spell.alwaysPrepared) {
        spell.prepared = !spell.prepared;
      }
    });
  }

  function toggleConsumeElixir(elixirId: string) {
    const target = character.elixirs.find((item) => item.id === elixirId);
    if (!target) return;

    performAction({
      actionId: `elixir-${elixirId}`,
      label: target.consumed ? "Restored" : "Used",
      toastMessage: target.consumed ? `${target.name} marked unused` : `${target.name} used`,
      updater: (draft) => {
        const elixir = draft.elixirs.find((item) => item.id === elixirId);
        if (!elixir) return;
        elixir.consumed = !elixir.consumed;
        addLog(draft, `${elixir.consumed ? "Used" : "Restored"} ${elixir.name}.`);
      },
    });
  }

  function createAdditionalElixirFromAction() {
    if (character.longRest.emptyFlasks <= 0) {
      showToast("No empty flasks available for an additional elixir.", false, "default");
      return;
    }

    const slotLevel = window.prompt("Choose spell slot level to spend (1 or 2).", "1");
    if (!slotLevel || !["1", "2"].includes(slotLevel)) return;
    const effect = window.prompt(`Choose elixir effect:\n${LONG_REST_ELIXIRS.join("\n")}`, "Healing");
    if (!effect) return;
    const holder = window.prompt("Who holds the elixir?", "Brek") ?? "Brek";
    const notes = window.prompt("Optional note", "") ?? "";
    const sourceEffect = buildElixirEffect(effect);
    const slot = character.resources.find((item) => item.id === `slot${slotLevel}`);
    if (!slot || slot.current <= 0) {
      showToast(`No level ${slotLevel} slots remaining.`, false, "default");
      return;
    }

    performAction({
      actionId: "action-extra-elixir",
      label: "Created",
      toastMessage: `Additional ${effect} elixir created`,
      updater: (draft) => {
        const targetSlot = draft.resources.find((item) => item.id === `slot${slotLevel}`);
        if (targetSlot) {
          targetSlot.current -= 1;
        }
        draft.longRest.emptyFlasks = Math.max(0, draft.longRest.emptyFlasks - 1);
        draft.elixirs.unshift(
          buildElixirFromSelection({
            name: `${effect} Elixir`,
            effect: sourceEffect,
            holder,
            notes,
            source: "additional",
            duration: "Until consumed or the end of Brek's next long rest",
            createdDuringRestId: draft.longRest.currentPreparationId,
            expiresOnLongRest: true,
          }),
        );
        addLog(draft, `Created an additional Experimental Elixir (${effect}) using a level ${slotLevel} spell slot.`);
      },
    });
  }

  function createLongRestElixir() {
    if (currentRestElixirs.length >= 2) {
      showToast("Both long-rest elixirs are already created for this rest.", false, "default");
      return;
    }
    if (character.longRest.emptyFlasks <= 0) {
      showToast("No empty flasks available for a long-rest elixir.", false, "default");
      return;
    }

    const result = window.prompt(`Roll or choose the result:\n${LONG_REST_ELIXIRS.join("\n")}`, "Healing");
    if (!result) return;
    const holder = window.prompt("Who holds it?", "Brek") ?? "Brek";
    const notes = window.prompt("Optional note", "") ?? "";

    performAction({
      actionId: `long-rest-elixir-${currentRestElixirs.length}`,
      label: "Created",
      toastMessage: `${result} long-rest elixir created`,
      updater: (draft) => {
        draft.longRest.emptyFlasks = Math.max(0, draft.longRest.emptyFlasks - 1);
        draft.elixirs.unshift(
          buildElixirFromSelection({
            name: `${result} Elixir`,
            effect: buildElixirEffect(result),
            holder,
            notes,
            source: "long-rest",
            duration: "Until consumed or the end of Brek's next long rest",
            createdDuringRestId: draft.longRest.currentPreparationId,
            expiresOnLongRest: true,
          }),
        );
        addLog(draft, `Prepared a long-rest Experimental Elixir (${result}).`);
      },
    });
  }

  function completeLongRest() {
    const createdNames = currentRestElixirs.map((item) => item.name).join(", ") || "none";
    const expiringNames = expiringElixirs.map((item) => item.name).join(", ") || "none";
    const summary = [
      "Complete long rest?",
      "",
      "Automatic resets:",
      ...longRestResources.map((item) => `- ${item.name} to ${item.max}`),
      `- Current HP to ${character.stats.maxHp}`,
      "",
      `Expiring elixirs: ${expiringNames}`,
      `New long-rest elixirs: ${createdNames}`,
      `Active infusions retained: ${activeInfusions.map((item) => item.infusionName).join(", ") || "none"}`,
    ].join("\n");

    if (!window.confirm(summary)) {
      return;
    }

    commit("Completed long rest", (draft) => {
      draft.elixirs = draft.elixirs.filter((item) => !(item.expiresOnLongRest && item.createdDuringRestId && item.createdDuringRestId !== draft.longRest.currentPreparationId));
      draft.resources.forEach((item) => {
        if (item.resetType === "long-rest" || item.resetType === "short-rest") {
          item.current = item.max;
        }
      });
      draft.stats.currentHp = draft.stats.maxHp;
      draft.stats.tempHp = 0;
      draft.companion.currentHp = draft.companion.maxHp;
      const created = draft.elixirs
        .filter((item) => item.source === "long-rest" && item.createdDuringRestId === draft.longRest.currentPreparationId)
        .map((item) => item.name.replace(" Elixir", ""));
      addLog(
        draft,
        `Completed a long rest. Restored spell slots, Flash of Genius, Lucky, and Fury of the Small. Created ${created.length || 0} Experimental Elixirs${created.length ? `: ${created.join(" and ")}` : ""}.`,
      );
      if (draft.longRest.notes.trim()) {
        addLog(draft, `Long-rest note: ${draft.longRest.notes.trim()}`);
      }
      draft.longRest.currentPreparationId = crypto.randomUUID();
      draft.longRest.notes = "";
    });
    showToast("Long rest completed.");
  }

  function startNewSession() {
    const label = window.prompt("New session label", `Session ${character.eventLog.length + 1}`);
    if (!label) return;
    commit("Started new session", (draft) => {
      draft.currentSessionLabel = label;
      addLog(draft, `Started ${label}.`);
    });
  }

  function buildActionRows(section: "action" | "bonus" | "reaction" | "passive") {
    if (section === "action") {
      const attackRows: ActionRowData[] = character.attacks.map((attack) => ({
        id: attack.id,
        name: attack.name,
        typeOrTrigger: "Action",
        summary: `${attack.attackBonus} to hit, ${attack.damage} ${attack.damageType}, ${attack.range}`,
        cost: "—",
        details: attack.traits.join(", "),
      }));
      const featureRows = character.features
        .filter((item) => item.category === "action")
        .map((item) => {
          const noSlots = character.resources.filter((entry) => entry.id.startsWith("slot")).every((entry) => entry.current <= 0);
          const noFlasks = character.longRest.emptyFlasks <= 0;
          const disabled = item.id === "action-extra-elixir" ? noSlots || noFlasks : false;
          return {
            id: item.id,
            name: item.name,
            typeOrTrigger: item.trigger,
            summary: item.effect,
            cost: item.id === "action-extra-elixir" ? "1st+ spell slot" : "—",
            disabled,
            disabledReason:
              item.id === "action-extra-elixir" && noSlots
                ? "No spell slots remaining."
                : item.id === "action-extra-elixir" && noFlasks
                  ? "No empty flasks available."
                  : undefined,
            details: item.id === "action-extra-elixir" ? "Requires alchemist's supplies and an empty flask." : item.range ? `Range ${item.range}` : undefined,
          };
        });
      return [...attackRows, ...featureRows];
    }

    return character.features
      .filter((item) => item.category === section)
      .map((item) => {
        const resource = item.resourceId ? character.resources.find((entry) => entry.id === item.resourceId) : null;
        const disabled = Boolean(resource && resource.current <= 0);
        return {
          id: item.id,
          name: item.name,
          typeOrTrigger: item.trigger,
          summary: item.effect,
          cost: resource ? `${resource.current}/${resource.max}` : "—",
          disabled,
          disabledReason: disabled ? "No uses remaining." : undefined,
          details: item.range ? `Range ${item.range}` : undefined,
        };
      });
  }

  function handleActionRowUse(row: ActionRowData, section: "action" | "bonus" | "reaction" | "passive") {
    const feature = character.features.find((item) => item.id === row.id);
    const attack = character.attacks.find((item) => item.id === row.id);

    if (attack) {
      performAction({
        actionId: row.id,
        label: "Logged",
        toastMessage: `${attack.name} action logged`,
        updater: (draft) => addLog(draft, `Used ${attack.name}: ${attack.attackBonus} to hit, ${attack.damage} ${attack.damageType}.`),
      });
      return;
    }

    if (!feature) return;
    if (feature.id === "action-extra-elixir") {
      createAdditionalElixirFromAction();
      return;
    }

    performAction({
      actionId: row.id,
      label: feature.category === "reaction" ? "Used" : "Logged",
      toastMessage:
        feature.resourceId && row.cost !== "—"
          ? `${feature.name} used — ${Math.max(0, (character.resources.find((item) => item.id === feature.resourceId)?.current ?? 1) - 1)} remaining`
          : `${feature.name} ${section === "passive" ? "noted" : "logged"}`,
      updater: (draft) => {
        if (feature.resourceId) {
          const resource = draft.resources.find((item) => item.id === feature.resourceId);
          if (resource && resource.current > 0) {
            resource.current -= 1;
          }
        }
        addLog(draft, feature.name);
      },
    });
  }

  function buildElixirEffect(result: string) {
    switch (result) {
      case "Healing":
        return "Regain 2d4 + Intelligence modifier HP";
      case "Swiftness":
        return "+10 ft. walking speed for 1 hour";
      case "Resilience":
        return "+1 AC for 10 minutes";
      case "Boldness":
        return "Add 1d4 to attack rolls and saving throws for 1 minute";
      case "Flight":
        return "Fly speed 10 ft. for 10 minutes";
      case "Transformation":
        return "Alter Self effect for 10 minutes";
      default:
        return result;
    }
  }

  if (firebaseMode === "signed-out") {
    return (
      <main className="min-h-screen px-3 py-4 sm:px-5 lg:px-6">
        <div className="mx-auto grid min-h-[80vh] max-w-3xl place-items-center">
          <ShellCard className="w-full bg-[linear-gradient(135deg,rgba(255,248,236,0.98),rgba(240,247,241,0.98))] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-[var(--green-soft)] text-[var(--green)]">
                <FlaskConical className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Brek&apos;s Field Kit</p>
                <h1 className="text-3xl">Sign In</h1>
              </div>
            </div>
            <p className="mt-5 text-base leading-7 text-[var(--muted)]">
              Sign in with Google to load your Firestore-backed field kit on GitHub Pages. Once you&apos;re in, the app will seed Brek automatically if this is your first session.
            </p>
            <button type="button" onClick={handleGoogleSignIn} className="mt-6 flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--green)] px-5 text-white">
              <LogIn className="h-5 w-5" />
              Sign in with Google
            </button>
            <p className="mt-4 text-sm text-[var(--muted)]">{syncStatus}</p>
          </ShellCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 pb-24 pt-4 text-[var(--text)] sm:px-5 lg:px-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            <ShellCard>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--green-soft)] text-[var(--green)]">
                  <FlaskConical className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Brek&apos;s Field Kit</p>
                  <h1 className="text-3xl leading-none">Session Dashboard</h1>
                </div>
              </div>
              <nav className="mt-5 grid gap-2">
                {navItems.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => changeView(id)}
                    className={cx(
                      "flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3 text-left transition",
                      character.ui.activeView === id ? "bg-[var(--green)] text-white" : "bg-white/70 text-[var(--text)] hover:bg-[var(--green-soft)]",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </ShellCard>

            <ShellCard title="Sync Status">
              <p className="text-sm text-[var(--muted)]">{syncStatus}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                {firebaseMode === "connected" ? `Firestore active${userLabel ? ` • ${userLabel}` : ""}` : "Local cache only"}
              </p>
              {firebaseMode === "connected" ? (
                <button type="button" onClick={handleSignOut} className="mt-4 flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              ) : null}
              {undoState ? (
                <button type="button" onClick={undoLastAction} className="mt-4 min-h-11 rounded-2xl bg-[var(--brass)] px-4 text-sm font-semibold text-white">
                  Undo {undoState.label}
                </button>
              ) : null}
            </ShellCard>
          </div>
        </aside>

        <section className="space-y-4">
          <ShellCard className="overflow-hidden bg-[linear-gradient(135deg,rgba(255,248,236,0.98),rgba(240,247,241,0.98))]">
            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr] xl:items-start">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Field Journal</p>
                    <h1 className="mt-1 text-4xl leading-none">{character.core.name}</h1>
                    <p className="mt-2 text-lg text-[var(--muted)]">
                      Level {character.core.level} {character.core.species} {character.core.subclass} {character.core.className}
                    </p>
                  </div>
                  <div className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-[var(--line)] bg-white/70 text-4xl shadow-sm">
                    B
                  </div>
                </div>

                <StatTable
                  rows={[
                    { label: "AC", value: character.stats.ac },
                    { label: "Initiative", value: character.stats.initiative },
                    { label: "Spell Save DC", value: character.stats.spellSaveDc },
                    { label: "Spell Attack", value: character.stats.spellAttackBonus },
                    { label: "Speed", value: character.stats.speed },
                    { label: "Intelligence Modifier", value: character.stats.intelligenceModifier },
                    { label: "Proficiency Bonus", value: character.stats.proficiencyBonus },
                    { label: "Darkvision", value: character.stats.darkvision },
                  ]}
                />

              </div>

              <div className="rounded-[28px] border border-[var(--line)] bg-white/70 p-4 xl:min-h-[640px]">
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-5 w-5 text-[var(--red)]" />
                  <h2 className="text-lg font-semibold">Vital Tracker</h2>
                </div>
                <div className="mt-32 overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82 xl:mt-36">
                  <div className="grid grid-cols-[1.1fr_1fr] items-center gap-3 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Max HP</p>
                    <p className="text-right text-xl font-bold leading-none sm:text-2xl">{character.stats.maxHp}</p>
                  </div>
                  <EditableNumberRow fieldKey={`current-row-${character.stats.currentHp}`} label="Current HP" initialValue={character.stats.currentHp} denominator={String(character.stats.maxHp)} onCommit={(value) => saveTypedHp("currentHp", value)} />
                  <EditableNumberRow fieldKey={`temp-row-${character.stats.tempHp}`} label="Temp HP" initialValue={character.stats.tempHp} onCommit={(value) => saveTypedHp("tempHp", value)} />
                </div>
              </div>
            </div>
          </ShellCard>

          {character.ui.activeView === "dashboard" ? (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <ShellCard title="Ability Scores" subtitle="High-frequency numbers stay above the fold.">
                  <AbilityScoreTable
                    rows={ABILITY_ORDER.map((ability) => ({
                      keyLabel: ability.slice(0, 3).toUpperCase(),
                      modifier: character.abilities[ability].modifier,
                      score: character.abilities[ability].score,
                    }))}
                  />
                </ShellCard>

                <ShellCard title="Saving Throws" subtitle="Proficient saves are marked with a visible indicator.">
                  <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                    <div className="grid grid-cols-[1fr_0.8fr_0.6fr] gap-3 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                      <span>Save</span>
                      <span className="text-right">Total</span>
                      <span className="text-right">Prof</span>
                    </div>
                    {ABILITY_ORDER.map((ability) => {
                      const save = character.savingThrows[ability];
                      return (
                        <div key={ability} className="grid grid-cols-[1fr_0.8fr_0.6fr] gap-3 border-t border-[var(--line)] px-4 py-3 text-sm">
                          <span>{ability.slice(0, 3).toUpperCase()}</span>
                          <span className="text-right font-semibold">{formatSigned(save.value)}</span>
                          <span className="text-right font-semibold">{save.proficient ? "● P" : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                    <p><span className="font-semibold text-[var(--text)]">Fey Ancestry:</span> Advantage on saving throws to avoid or end the charmed condition.</p>
                    <p><span className="font-semibold text-[var(--text)]">Tool Expertise:</span> Double proficiency bonus for ability checks using a tool Brek is proficient with.</p>
                    <p><span className="font-semibold text-[var(--text)]">Tool proficiency contribution:</span> +6 before the relevant ability modifier.</p>
                  </div>
                </ShellCard>
              </div>

              <ShellCard title="Quick Resource Strip" subtitle="Spend and restore counters with immediate feedback instead of hunting through the log.">
                <div className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white/82">
                  <div className="hidden grid-cols-[1.2fr_0.55fr_0.65fr_0.9fr_0.8fr] gap-3 bg-[var(--green-soft)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] md:grid">
                    <span>Resource</span>
                    <span className="text-right">Current</span>
                    <span className="text-right">Max</span>
                    <span>Reset</span>
                    <span className="text-right">Actions</span>
                  </div>
                  {character.resources.map((resource) => (
                    <div key={resource.id} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 first:border-t-0 md:grid-cols-[1.2fr_0.55fr_0.65fr_0.9fr_0.8fr] md:items-center md:gap-3">
                      <div>
                        <p className="font-semibold">{resource.name}</p>
                        {resource.notes ? <p className="mt-1 text-sm text-[var(--muted)]">{resource.notes}</p> : null}
                      </div>
                      <p className="text-sm font-semibold md:text-right">{resource.current}</p>
                      <p className="text-sm text-[var(--muted)] md:text-right">{resource.max}</p>
                      <p className="text-sm text-[var(--muted)]">{resource.resetType}</p>
                      <div className="grid grid-cols-2 gap-2 md:justify-self-end">
                        <button type="button" onClick={() => updateResource(resource.id, -1, "Spent")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white">
                          {feedback[`Spent-${resource.id}`] ?? "Spend"}
                        </button>
                        <button type="button" onClick={() => updateResource(resource.id, 1, "Restored")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white">
                          {feedback[`Restored-${resource.id}`] ?? "Restore"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ShellCard>

              <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <ShellCard title="Do Not Forget" subtitle="Pinned reminders stay visible, but the layout is denser and easier to scan.">
                  <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                    {pinnedReminders.map((reminder) => (
                      <div key={reminder.id} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 first:border-t-0 md:grid-cols-[0.8fr_2fr_0.45fr] md:items-start md:gap-3">
                        <div>
                          <h3 className="font-semibold">{reminder.title}</h3>
                        </div>
                        <p className="text-sm leading-6 text-[var(--muted)]">{reminder.summary}</p>
                        <button
                          type="button"
                          onClick={() =>
                            commit("Toggled reminder pin", (draft) => {
                              const target = draft.reminders.find((item) => item.id === reminder.id);
                              if (target) target.pinned = !target.pinned;
                            })
                          }
                          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm md:justify-self-end"
                        >
                          Unpin
                        </button>
                      </div>
                    ))}
                  </div>
                </ShellCard>

                <ShellCard title="Quick Decision Prompts" subtitle="Still collapsible, but written as compact table-note prompts instead of oversized cards.">
                  <button
                    type="button"
                    onClick={() =>
                      commit("Toggled decision prompts", (draft) => {
                        draft.decisionPrompts.expanded = !draft.decisionPrompts.expanded;
                      })
                    }
                    className="mb-4 min-h-11 rounded-2xl border border-[var(--line)] bg-white px-4 text-left"
                  >
                    {character.decisionPrompts.expanded ? "Collapse prompts" : "Expand prompts"}
                  </button>
                  {character.decisionPrompts.expanded ? (
                    <div className="space-y-4">
                      <PromptBlock title="Before Acting" prompts={character.decisionPrompts.beforeActing} />
                      <PromptBlock title="When a Roll Happens" prompts={character.decisionPrompts.whenRollHappens} accent="orange" />
                    </div>
                  ) : null}
                </ShellCard>
              </div>
            </div>
          ) : null}

          {character.ui.activeView === "combat" ? (
            <div className="space-y-4">
              <ActionTable title="Actions" rows={buildActionRows("action")} feedback={feedback} onUse={(row) => handleActionRowUse(row, "action")} />
              <ActionTable title="Bonus Actions" rows={buildActionRows("bonus")} feedback={feedback} onUse={(row) => handleActionRowUse(row, "bonus")} />
              <ActionTable title="Reactions" rows={buildActionRows("reaction")} feedback={feedback} onUse={(row) => handleActionRowUse(row, "reaction")} />
              <ActionTable title="Passive / Triggered Benefits" rows={buildActionRows("passive")} feedback={feedback} onUse={(row) => handleActionRowUse(row, "passive")} />
            </div>
          ) : null}

          {character.ui.activeView === "spells" ? (
            <div className="space-y-4">
              <ShellCard title="Spell Filters">
                <div className="flex flex-wrap gap-2">
                  {spellFilters.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() =>
                        setCharacter((current) => ({
                          ...current,
                          ui: {
                            ...current.ui,
                            spellFilter: filter,
                          },
                        }))
                      }
                      className={cx(
                        "min-h-11 rounded-full px-4 text-sm",
                        character.ui.spellFilter === filter ? "bg-[var(--green)] text-white" : "border border-[var(--line)] bg-white/80",
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </ShellCard>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <ShellCard title="Spells">
                  <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                    {filteredSpells.map((spell) => (
                      <div key={spell.id} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 first:border-t-0 md:grid-cols-[0.95fr_1.65fr_0.8fr] md:items-start md:gap-3">
                        <div>
                          <h3 className="font-semibold">{spell.name}</h3>
                          <p className="text-sm text-[var(--muted)]">
                            Level {spell.level} • {spell.actionType} • {spell.range}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm leading-6 text-[var(--muted)]">{spell.summary}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-[var(--green-soft)] px-3 py-1 text-[var(--green)]">{spell.saveOrAttack}</span>
                            {spell.tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[var(--muted)]">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 md:justify-self-end">
                          <button type="button" onClick={() => castSpell(spell)} className="min-h-10 rounded-xl bg-[var(--green)] px-4 text-sm text-white">
                            {feedback[`spell-${spell.id}`] ?? "Cast"}
                          </button>
                          <button type="button" onClick={() => togglePrepared(spell.id)} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm">
                            {spell.prepared ? "Prepared" : "Not prepared"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ShellCard>

                <ShellCard title="Experimental Elixirs" subtitle="Long-rest and additional elixirs stay distinct in the rest and combat flows, but all active vials stay visible here.">
                  <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                    {character.elixirs.map((elixir) => (
                      <div key={elixir.id} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 first:border-t-0 md:grid-cols-[0.8fr_1.7fr_0.8fr_0.75fr] md:items-start md:gap-3">
                        <div>
                          <h3 className="font-semibold">{elixir.name}</h3>
                          <p className="text-sm text-[var(--muted)]">{elixir.source ?? "custom"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-[var(--muted)]">{elixir.effect}</p>
                          <p className="mt-1 text-sm text-[var(--muted)]">Holder: {elixir.holder}</p>
                        </div>
                        <p className="text-sm text-[var(--muted)]">{elixir.duration}</p>
                        <button type="button" onClick={() => toggleConsumeElixir(elixir.id)} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm md:justify-self-end">
                          {feedback[`elixir-${elixir.id}`] ?? (elixir.consumed ? "Mark Unused" : "Drink / Use")}
                        </button>
                      </div>
                    ))}
                  </div>
                </ShellCard>
              </div>
            </div>
          ) : null}

          {character.ui.activeView === "veech" ? (
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <ShellCard title="Veech">
                <StatTable
                  rows={[
                    { label: "Creature Type", value: character.companion.creatureType },
                    { label: "AC", value: character.companion.ac },
                    { label: "Max HP", value: character.companion.maxHp },
                    { label: "Current HP", value: character.companion.currentHp },
                    { label: "Speed", value: character.companion.speed },
                    { label: "Fly Speed", value: character.companion.flySpeed },
                  ]}
                />
                <div className="mt-4 overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                  <div className="grid grid-cols-[0.9fr_1.8fr] gap-3 px-4 py-3">
                    <p className="font-semibold">Force Strike</p>
                    <p className="text-sm text-[var(--muted)]">{character.companion.forceStrike}</p>
                  </div>
                </div>
              </ShellCard>

              <ShellCard title="Quick Commands">
                <div className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white/82">
                  {["Dodge", "Force Strike", "Help", "Deliver Touch Spell", "Move / Scout", "Custom Command"].map((command) => (
                    <button
                      key={command}
                      type="button"
                      onClick={() =>
                        performAction({
                          actionId: `veech-${command}`,
                          label: "Logged",
                          toastMessage: `Veech ${command} logged`,
                          updater: (draft) => addLog(draft, `Veech used ${command}.`),
                        })
                      }
                      className="grid min-h-12 w-full border-t border-[var(--line)] px-4 py-3 text-left first:border-t-0 hover:bg-[var(--panel-strong)]"
                    >
                      <span className="font-medium">{feedback[`veech-${command}`] ?? command}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                  {character.companion.notes.map((note) => (
                    <p key={note} className="border-t border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)] first:border-t-0">
                      {note}
                    </p>
                  ))}
                </div>
              </ShellCard>
            </div>
          ) : null}

          {character.ui.activeView === "exploration" ? (
            <div className="space-y-4">
              <ShellCard title="Tool Expertise" subtitle="Double proficiency stays visible with each tool, but the layout is denser and more sheet-like.">
                <div className="overflow-hidden rounded-[22px] border border-[var(--line)]">
                  <div className="hidden grid-cols-[1fr_1.6fr_0.8fr_0.6fr] gap-3 bg-[var(--green-soft)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] md:grid">
                    <span>Tool</span>
                    <span>Typical Uses</span>
                    <span>Ability</span>
                    <span>Modifier</span>
                  </div>
                  {character.tools.map((tool) => (
                    <div key={tool.id} className="grid gap-2 border-t border-[var(--line)] bg-white/82 px-4 py-3 first:border-t-0 md:grid-cols-[1fr_1.6fr_0.8fr_0.6fr]">
                      <p className="font-semibold">{tool.name}</p>
                      <p className="text-sm text-[var(--muted)]">{tool.uses}</p>
                      <p className="text-sm text-[var(--muted)]">{tool.suggestedAbility}</p>
                      <p className="text-sm font-semibold">{tool.modifier}</p>
                    </div>
                  ))}
                </div>
              </ShellCard>
            </div>
          ) : null}

          {character.ui.activeView === "inventory" ? (
            <div className="space-y-4">
              <ShellCard title="Active Infusions" subtitle={`Active infusions: ${activeInfusions.length} / 3`}>
                <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                  {character.infusionsActive.map((infusion) => (
                    <div key={infusion.id} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 first:border-t-0 md:grid-cols-[1fr_1.2fr_0.85fr_0.7fr] md:items-start md:gap-3">
                      <div>
                        <h3 className="font-semibold">{infusion.infusionName}</h3>
                        <p className="text-sm text-[var(--muted)]">{infusion.itemName}</p>
                      </div>
                      <p className="text-sm text-[var(--muted)]">Carrier: {infusion.carrier} • Attuned: {infusion.attunedBy}</p>
                      <p className="text-sm text-[var(--muted)]">Charges: {infusion.currentCharges}/{infusion.maxCharges} • {infusion.resetType}</p>
                      <p className="text-sm font-semibold md:text-right">{infusion.active ? "Active" : "Inactive"}</p>
                    </div>
                  ))}
                </div>
              </ShellCard>

              <ShellCard title="Important Inventory">
                <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                  {character.inventory.map((category) => (
                    <div key={category.id} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 first:border-t-0 md:grid-cols-[0.8fr_2.2fr] md:gap-3">
                      <h3 className="font-semibold">{category.name}</h3>
                      <p className="text-sm leading-6 text-[var(--muted)]">{category.items.join(", ") || "—"}</p>
                    </div>
                  ))}
                </div>
              </ShellCard>
            </div>
          ) : null}

          {character.ui.activeView === "rest" ? (
            <div className="space-y-4">
              <ShellCard title="Long Rest: Automatic Resets" subtitle="These reset automatically when you confirm the long rest.">
                <div className="rounded-[20px] border border-[var(--line)] bg-white/82 px-4 py-4 text-sm text-[var(--muted)]">
                  <p className="font-semibold text-[var(--text)]">Automatically restored on long rest</p>
                  <ul className="mt-3 grid gap-2">
                    {longRestResources.map((resource) => (
                      <li key={resource.id}>• {resource.name}: {resource.max}</li>
                    ))}
                  </ul>
                </div>
              </ShellCard>

              <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <ShellCard title="Long Rest: Brek&apos;s Preparation Tasks">
                  <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                    <div className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_1.5fr_0.8fr] md:items-start md:gap-3">
                      <div>
                        <h3 className="font-semibold">Create 2 Experimental Elixirs</h3>
                        <p className="text-sm text-[var(--muted)]">
                          Created this rest: {currentRestElixirs.length} / 2 • Empty flasks: {character.longRest.emptyFlasks}
                        </p>
                      </div>
                      <p className="text-sm text-[var(--muted)]">Roll or select a result, choose a holder, and save each vial for the current rest period.</p>
                      <button type="button" onClick={createLongRestElixir} className="min-h-10 rounded-xl bg-[var(--green)] px-4 text-sm text-white md:justify-self-end">
                        {feedback[`long-rest-elixir-${currentRestElixirs.length}`] ?? "Create Long-Rest Elixir"}
                      </button>
                    </div>
                    {currentRestElixirs.length === 0 ? (
                      <div className="border-t border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]">No long-rest elixirs created for this rest yet.</div>
                    ) : (
                      currentRestElixirs.map((elixir) => (
                        <div key={elixir.id} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 md:grid-cols-[0.8fr_1.8fr_0.7fr] md:items-start md:gap-3">
                          <div>
                            <p className="font-semibold">{elixir.name}</p>
                            <p className="text-sm text-[var(--muted)]">Holder: {elixir.holder}</p>
                          </div>
                          <p className="text-sm text-[var(--muted)]">{elixir.effect}</p>
                          <button type="button" onClick={() => toggleConsumeElixir(elixir.id)} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm md:justify-self-end">
                            {feedback[`elixir-${elixir.id}`] ?? (elixir.consumed ? "Mark Unused" : "Consume")}
                          </button>
                        </div>
                      ))
                    )}
                    <div className="grid gap-2 border-t border-[var(--line)] px-4 py-3 md:grid-cols-[1fr_1.5fr_0.6fr] md:items-start md:gap-3">
                      <div>
                        <h3 className="font-semibold">Prepared Spells</h3>
                        <p className="text-sm text-[var(--muted)]">
                          Prepared now: {regularPreparedSpells.length} / 6 • Always prepared spells stay separate.
                        </p>
                      </div>
                      <p className="text-sm text-[var(--muted)]">Review prepared spells and long-rest selections from the spell screen.</p>
                      <button type="button" onClick={() => changeView("spells")} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-4 text-sm md:justify-self-end">
                        Review <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-2 border-t border-[var(--line)] px-4 py-3 md:grid-cols-[1fr_1.5fr_0.6fr] md:items-start md:gap-3">
                      <div>
                        <h3 className="font-semibold">Active Infusions</h3>
                        <p className="text-sm text-[var(--muted)]">
                          Active infusions: {activeInfusions.length} / 3
                        </p>
                      </div>
                      <p className="text-sm text-[var(--muted)]">{activeInfusions.map((item) => item.infusionName).join(", ") || "None active"}</p>
                      <button type="button" onClick={() => changeView("inventory")} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] px-4 text-sm md:justify-self-end">
                        Review <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </ShellCard>

                <ShellCard title="Equipment / Consumables Check">
                  <div className="grid gap-3">
                    <div className="rounded-[20px] border border-[var(--line)] bg-white/82 p-4 text-sm text-[var(--muted)]">
                      <p><span className="font-semibold text-[var(--text)]">Empty flasks available:</span> {character.longRest.emptyFlasks}</p>
                      <p className="mt-2"><span className="font-semibold text-[var(--text)]">Crossbow bolts:</span> {character.inventory.flatMap((item) => item.items).find((item) => item.includes("Crossbow Bolts")) || "Track in inventory"}</p>
                      <p className="mt-2"><span className="font-semibold text-[var(--text)]">Current elixir / potion inventory:</span> {character.elixirs.length}</p>
                    </div>
                    <TextArea
                      label="Long-rest notes"
                      value={character.longRest.notes}
                      onChange={(value) =>
                        commit("Updated long-rest notes", (draft) => {
                          draft.longRest.notes = value;
                        })
                      }
                      rows={5}
                    />
                    <button type="button" onClick={completeLongRest} className="min-h-12 rounded-2xl bg-[var(--green)] text-white">
                      Complete Long Rest
                    </button>
                  </div>
                </ShellCard>
              </div>

              <ShellCard title="Session Log">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={startNewSession} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white px-4">
                    Start New Session
                  </button>
                  <div className="flex-1">
                    <TextInput label="Manual log note" value={manualLog} onChange={setManualLog} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!manualLog.trim()) return;
                      commit("Added manual log", (draft) => addLog(draft, manualLog.trim()));
                      showToast("Manual note added.");
                      setManualLog("");
                    }}
                    className="min-h-11 rounded-2xl bg-[var(--orange)] px-4 text-white"
                  >
                    Add Note
                  </button>
                </div>
                <div className="mt-4 overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
                  {character.eventLog.map((entry) => (
                    <div key={entry.id} className="grid gap-2 border-t border-[var(--line)] px-4 py-3 first:border-t-0 md:grid-cols-[0.8fr_0.7fr_2fr] md:items-start md:gap-3">
                      <p className="text-sm font-medium">{entry.sessionLabel}</p>
                      <p className="text-sm text-[var(--muted)]">{formatTime(entry.timestamp)}</p>
                      <p className="text-sm leading-6 text-[var(--text)]">{entry.text}</p>
                    </div>
                  ))}
                </div>
              </ShellCard>
            </div>
          ) : null}

          {character.ui.activeView === "setup" ? (
            <div className="space-y-4">
              <ShellCard title="Core Character Data">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <TextInput label="Name" value={character.core.name} onChange={(value) => commit("Updated core data", (draft) => void (draft.core.name = value))} />
                  <TextInput label="Class" value={character.core.className} onChange={(value) => commit("Updated core data", (draft) => void (draft.core.className = value))} />
                  <TextInput label="Subclass" value={character.core.subclass} onChange={(value) => commit("Updated core data", (draft) => void (draft.core.subclass = value))} />
                  <TextInput label="Level" type="number" value={character.core.level} onChange={(value) => commit("Updated core data", (draft) => void (draft.core.level = numberValue(value)))} />
                  <TextInput label="Species" value={character.core.species} onChange={(value) => commit("Updated core data", (draft) => void (draft.core.species = value))} />
                  <TextInput label="Background" value={character.core.background} onChange={(value) => commit("Updated core data", (draft) => void (draft.core.background = value))} />
                </div>
              </ShellCard>

              <ShellCard title="Stats, Resources, and Notes">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-4">
                    <TextInput label="AC" type="number" value={character.stats.ac} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.ac = numberValue(value)))} />
                    <TextInput label="Max HP" type="number" value={character.stats.maxHp} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.maxHp = numberValue(value)))} />
                    <TextInput label="Spell Save DC" type="number" value={character.stats.spellSaveDc} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.spellSaveDc = numberValue(value)))} />
                    <TextInput label="Empty Flasks" type="number" value={character.longRest.emptyFlasks} onChange={(value) => commit("Updated long-rest prep", (draft) => void (draft.longRest.emptyFlasks = numberValue(value)))} />
                    {character.resources.map((resource) => (
                      <div key={resource.id} className="rounded-[20px] border border-[var(--line)] bg-white/82 p-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <TextInput label={`${resource.name} current`} type="number" value={resource.current} onChange={(value) => commit("Updated resource", (draft) => {
                            const target = draft.resources.find((item) => item.id === resource.id);
                            if (target) target.current = numberValue(value);
                          })} />
                          <TextInput label={`${resource.name} max`} type="number" value={resource.max} onChange={(value) => commit("Updated resource", (draft) => {
                            const target = draft.resources.find((item) => item.id === resource.id);
                            if (target) target.max = numberValue(value);
                          })} />
                          <TextInput label={`${resource.name} reset`} value={resource.resetType} onChange={(value) => commit("Updated resource", (draft) => {
                            const target = draft.resources.find((item) => item.id === resource.id);
                            if (target) target.resetType = value as Resource["resetType"];
                          })} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-4">
                    <TextArea label="Campaign notes" value={character.notes} onChange={(value) => commit("Updated notes", (draft) => void (draft.notes = value))} rows={6} />
                    {ABILITY_ORDER.map((ability) => (
                      <div key={ability} className="rounded-[20px] border border-[var(--line)] bg-white/82 p-4">
                        <p className="font-semibold">{ability}</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <TextInput label="Score" type="number" value={character.abilities[ability].score} onChange={(value) => commit("Updated ability", (draft) => void (draft.abilities[ability].score = numberValue(value)))} />
                          <TextInput label="Modifier" type="number" value={character.abilities[ability].modifier} onChange={(value) => commit("Updated ability", (draft) => void (draft.abilities[ability].modifier = numberValue(value)))} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ShellCard>

              <ShellCard title="Spell and Inventory Editing">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-4">
                    {character.spells.map((spell) => (
                      <div key={spell.id} className="rounded-[20px] border border-[var(--line)] bg-white/82 p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <TextInput label="Spell name" value={spell.name} onChange={(value) => commit("Updated spell", (draft) => {
                            const target = draft.spells.find((item) => item.id === spell.id);
                            if (target) target.name = value;
                          })} />
                          <TextInput label="Level" type="number" value={spell.level} onChange={(value) => commit("Updated spell", (draft) => {
                            const target = draft.spells.find((item) => item.id === spell.id);
                            if (target) target.level = numberValue(value);
                          })} />
                          <TextInput label="Range" value={spell.range} onChange={(value) => commit("Updated spell", (draft) => {
                            const target = draft.spells.find((item) => item.id === spell.id);
                            if (target) target.range = value;
                          })} />
                          <TextInput label="Action Type" value={spell.actionType} onChange={(value) => commit("Updated spell", (draft) => {
                            const target = draft.spells.find((item) => item.id === spell.id);
                            if (target) target.actionType = value as Spell["actionType"];
                          })} />
                        </div>
                        <div className="mt-3">
                          <TextArea label="Summary" value={spell.summary} onChange={(value) => commit("Updated spell", (draft) => {
                            const target = draft.spells.find((item) => item.id === spell.id);
                            if (target) target.summary = value;
                          })} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {character.inventory.map((category) => (
                      <div key={category.id} className="rounded-[20px] border border-[var(--line)] bg-white/82 p-4">
                        <TextInput label="Category" value={category.name} onChange={(value) => commit("Updated inventory", (draft) => {
                          const target = draft.inventory.find((item) => item.id === category.id);
                          if (target) target.name = value;
                        })} />
                        <div className="mt-3">
                          <TextArea label="Items (one per line)" value={category.items.join("\n")} onChange={(value) => commit("Updated inventory", (draft) => {
                            const target = draft.inventory.find((item) => item.id === category.id);
                            if (target) target.items = value.split("\n").map((item) => item.trim()).filter(Boolean);
                          })} rows={6} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ShellCard>
            </div>
          ) : null}
        </section>
      </div>

      {toast ? (
        <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[rgba(27,34,29,0.96)] px-4 py-3 text-sm text-white shadow-[var(--shadow)]">
          <div className="flex items-center gap-2">
            {toast.tone === "success" ? <Check className="h-4 w-4" /> : null}
            <span>{toast.message}</span>
          </div>
          {toast.undoable && undoState ? (
            <button type="button" onClick={undoLastAction} className="rounded-xl border border-white/20 px-3 py-1 text-sm">
              Undo
            </button>
          ) : null}
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[rgba(248,244,236,0.98)] p-2 shadow-[0_-8px_30px_rgba(56,46,28,0.08)] lg:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-4 gap-2 overflow-x-auto">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => changeView(id)}
              className={cx(
                "flex min-h-12 flex-col items-center justify-center rounded-2xl px-2 text-[11px]",
                character.ui.activeView === id ? "bg-[var(--green)] text-white" : "bg-white/80 text-[var(--muted)]",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="mt-1 text-center leading-tight">{label.replace(" & ", "\n")}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

function PromptBlock({ title, prompts, accent = "green" }: { title: string; prompts: string[]; accent?: "green" | "orange" }) {
  return (
    <div>
      <h3 className={cx("font-semibold", accent === "green" ? "text-[var(--green)]" : "text-[var(--orange)]")}>{title}</h3>
      <div className="mt-3 overflow-hidden rounded-[20px] border border-[var(--line)] bg-white/82">
        {prompts.map((prompt) => (
          <div key={prompt} className="border-t border-[var(--line)] px-4 py-3 text-sm leading-6 text-[var(--muted)] first:border-t-0">
            {prompt}
          </div>
        ))}
      </div>
    </div>
  );
}

function DenseList({
  children,
  columns,
}: {
  children: ReactNode;
  columns?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-white/82">
      {columns ? <div className={cx("hidden gap-3 bg-[var(--green-soft)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] md:grid", columns)} /> : null}
      {children}
    </div>
  );
}
