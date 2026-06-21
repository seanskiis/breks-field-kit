"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Backpack,
  FlaskConical,
  LogIn,
  LogOut,
  HeartPulse,
  Hammer,
  LayoutDashboard,
  MoonStar,
  Shield,
  Sparkles,
  Swords,
  WandSparkles,
} from "lucide-react";
import { createSeedCharacter } from "@/lib/seed-data";
import { getFirebaseServices, isFirebaseConfigured, listenForGoogleUser, saveCharacter, signInWithGoogle, signOutUser, subscribeToCharacter } from "@/lib/firebase";
import {
  type ActiveInfusion,
  type Attack,
  type CharacterData,
  type ChecklistItem,
  type EventLogEntry,
  type Feature,
  type InventoryCategory,
  type Reminder,
  type NavView,
  type Resource,
  type Spell,
  type ToolEntry,
} from "@/lib/types";

const LOCAL_STORAGE_KEY = "breks-field-kit-cache";

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

const spellFilters = ["Prepared", "Always Prepared", "Emergency Support", "Control", "Damage", "Mobility", "Utility", "Reaction", "Concentration", "All"];

const elixirOptions = [
  "Healing: regain 2d4 + Intelligence modifier HP",
  "Swiftness: +10 ft. walking speed for 1 hour",
  "Resilience: +1 AC for 10 minutes",
  "Boldness: add 1d4 to attack rolls and saving throws for 1 minute",
  "Flight: fly speed 10 ft. for 10 minutes",
  "Transformation: Alter Self effect for 10 minutes",
];

function getInitialCharacter() {
  if (typeof window === "undefined") {
    return createSeedCharacter();
  }

  const cached = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!cached) {
    return createSeedCharacter();
  }

  try {
    return JSON.parse(cached) as CharacterData;
  } catch {
    return createSeedCharacter();
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

function stampLog(text: string, sessionLabel: string): EventLogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    text,
    sessionLabel,
  };
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

function featureGroups(features: Feature[]) {
  return {
    action: features.filter((item) => item.category === "action"),
    bonus: features.filter((item) => item.category === "bonus"),
    reaction: features.filter((item) => item.category === "reaction"),
    passive: features.filter((item) => item.category === "passive"),
  };
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ShellCard({
  title,
  subtitle,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
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

function LabelValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
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
        className="min-h-11 rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-[var(--text)] outline-none ring-0 transition focus:border-[var(--green)]"
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
  const [sessionNote, setSessionNote] = useState("");
  const lastSavedRef = useRef("");
  const hydratedRef = useRef(false);
  const writeTimerRef = useRef<number | null>(null);

  const groups = useMemo(() => featureGroups(character.features), [character.features]);
  const filteredSpells = useMemo(
    () => character.spells.filter((spell) => matchesSpellFilter(spell, character.ui.spellFilter)),
    [character.spells, character.ui.spellFilter],
  );
  const activeInfusions = useMemo(() => character.infusionsActive.filter((item) => item.active), [character.infusionsActive]);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(character));
  }, [character]);

  useEffect(() => {
    const services = getFirebaseServices();

    if (!isFirebaseConfigured || !services) {
      hydratedRef.current = true;
      return;
    }

    const unsubscribeAuth = listenForGoogleUser(
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
        setSyncStatus(`Firebase auth failed: ${message}`);
        hydratedRef.current = true;
      },
    );

    return () => {
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    const services = getFirebaseServices();

    if (!services || !userId) {
      return;
    }

    const unsubscribeCharacter = subscribeToCharacter(
      services,
      userId,
      (data) => {
        hydratedRef.current = true;
        const serialized = JSON.stringify(data);
        lastSavedRef.current = serialized;
        setCharacter(data);
        setSyncStatus("Firestore synced.");
      },
      async () => {
        await saveCharacter(services, userId, createSeedCharacter());
      },
    );

    return () => {
      unsubscribeCharacter();
    };
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

  function commit(label: string, updater: (draft: CharacterData) => void) {
    setCharacter((current) => {
      const snapshot = cloneCharacter(current);
      const draft = cloneCharacter(current);
      updater(draft);
      setUndoState({ label, snapshot });
      return draft;
    });
  }

  function addLog(draft: CharacterData, text: string) {
    draft.eventLog.unshift(stampLog(text, draft.currentSessionLabel));
  }

  function updateResource(resourceId: string, nextValue: number, reason: string) {
    commit(reason, (draft) => {
      const resource = draft.resources.find((item) => item.id === resourceId);
      if (!resource) return;
      resource.current = Math.max(0, Math.min(resource.max, nextValue));
      if (resourceId === "veech-hp") {
        draft.companion.currentHp = resource.current;
      }
      addLog(draft, `${reason}: ${resource.name} is now ${resource.current}/${resource.max}.`);
    });
  }

  function spendResource(resourceId: string, delta: number, actionLabel: string) {
    const resource = character.resources.find((item) => item.id === resourceId);
    if (!resource) return;
    if (!window.confirm(`${actionLabel}\n\n${resource.name}: ${resource.current}/${resource.max}`)) return;
    updateResource(resourceId, resource.current + delta, actionLabel);
  }

  function castSpell(spell: Spell) {
    if (!window.confirm(`Cast ${spell.name}?`)) return;
    commit(`Cast ${spell.name}`, (draft) => {
      if (spell.level > 0) {
        const slotId = spell.level === 1 ? "slot1" : "slot2";
        const slot = draft.resources.find((item) => item.id === slotId);
        if (slot && slot.current > 0) {
          slot.current -= 1;
        }
      }
      addLog(draft, `Cast ${spell.name}${spell.level > 0 ? ` using a level ${spell.level} slot` : ""}.`);
    });
  }

  function consumeElixir(elixirId: string) {
    commit("Consumed elixir", (draft) => {
      const elixir = draft.elixirs.find((item) => item.id === elixirId);
      if (!elixir) return;
      elixir.consumed = !elixir.consumed;
      addLog(draft, `${elixir.consumed ? "Used" : "Restored"} ${elixir.name}.`);
    });
  }

  function createElixir() {
    const effect = window.prompt(`Which elixir effect?\n\n${elixirOptions.join("\n")}`, elixirOptions[0]);
    if (!effect) return;
    const holder = window.prompt("Who is holding it?", "Brek") ?? "Brek";
    const slotLevel = window.prompt("Spend which slot level? (1 or 2)", "1") ?? "1";
    commit("Created elixir", (draft) => {
      const slot = draft.resources.find((item) => item.id === `slot${slotLevel}`);
      if (slot && slot.current > 0) {
        slot.current -= 1;
      }
      const resource = draft.resources.find((item) => item.id === "elixirs");
      if (resource) {
        resource.current = Math.min(resource.max + 20, resource.current + 1);
      }
      draft.elixirs.unshift({
        id: crypto.randomUUID(),
        name: effect.split(":")[0],
        effect,
        holder,
        consumed: false,
        duration: effect.includes("1 hour") ? "1 hour" : effect.includes("10 minutes") ? "10 minutes" : "Instant",
      });
      addLog(draft, `Created an additional elixir: ${effect}.`);
    });
  }

  function runReset(resetType: "short-rest" | "long-rest" | "dawn") {
    const label = resetType === "long-rest" ? "Complete long rest" : resetType === "short-rest" ? "Complete short rest" : "Run dawn reset";
    if (!window.confirm(`${label}?`)) return;

    commit(label, (draft) => {
      draft.resources.forEach((resource) => {
        if (resetType === "long-rest" && (resource.resetType === "long-rest" || resource.resetType === "short-rest")) {
          resource.current = resource.max;
        }
        if (resetType === "short-rest" && resource.resetType === "short-rest") {
          resource.current = resource.max;
        }
        if (resetType === "dawn" && resource.resetType === "dawn") {
          resource.current = resource.max;
        }
      });

      if (resetType === "long-rest") {
        draft.stats.currentHp = draft.stats.maxHp;
        draft.stats.tempHp = 0;
        draft.companion.currentHp = draft.companion.maxHp;
        draft.resources.find((item) => item.id === "veech-hp")!.current = draft.companion.maxHp;
        draft.restChecklist.forEach((item) => {
          item.checked = false;
        });
      }

      addLog(draft, `${label}.`);
      if (sessionNote.trim()) {
        addLog(draft, `Session note: ${sessionNote.trim()}`);
      }
    });
    setSessionNote("");
  }

  function updateHp(field: "currentHp" | "tempHp", amount: number, mode: "delta" | "set") {
    commit(`Updated ${field === "currentHp" ? "current HP" : "temp HP"}`, (draft) => {
      const currentValue = draft.stats[field];
      draft.stats[field] = mode === "delta" ? Math.max(0, currentValue + amount) : Math.max(0, amount);
      addLog(draft, `${field === "currentHp" ? "Current HP" : "Temp HP"} set to ${draft.stats[field]}.`);
    });
  }

  function updateCompanionHp(amount: number, mode: "delta" | "set") {
    commit("Updated Veech HP", (draft) => {
      const currentValue = draft.companion.currentHp;
      draft.companion.currentHp = mode === "delta" ? Math.max(0, Math.min(draft.companion.maxHp, currentValue + amount)) : Math.max(0, Math.min(draft.companion.maxHp, amount));
      const veechResource = draft.resources.find((item) => item.id === "veech-hp");
      if (veechResource) {
        veechResource.current = draft.companion.currentHp;
      }
      addLog(draft, `Veech HP is now ${draft.companion.currentHp}/${draft.companion.maxHp}.`);
    });
  }

  function addManualLog() {
    if (!manualLog.trim()) return;
    commit("Added manual log", (draft) => {
      addLog(draft, manualLog.trim());
    });
    setManualLog("");
  }

  function startNewSession() {
    const label = window.prompt("New session label", `Session ${character.eventLog.length + 1}`);
    if (!label) return;
    commit("Started new session", (draft) => {
      draft.currentSessionLabel = label;
      addLog(draft, `Started ${label}.`);
    });
  }

  function undoLastAction() {
    if (!undoState) return;
    setCharacter(undoState.snapshot);
    setUndoState(null);
    setSyncStatus(`Undid: ${undoState.label}`);
  }

  function updateAttack(index: number, updater: (attack: Attack) => void) {
    commit("Updated attack", (draft) => {
      const target = draft.attacks[index];
      if (target) updater(target);
    });
  }

  function updateSpell(index: number, updater: (spell: Spell) => void) {
    commit("Updated spell", (draft) => {
      const target = draft.spells[index];
      if (target) updater(target);
    });
  }

  function updateResourceRow(index: number, updater: (resource: Resource) => void) {
    commit("Updated resource", (draft) => {
      const target = draft.resources[index];
      if (target) updater(target);
    });
  }

  function updateTool(index: number, updater: (tool: ToolEntry) => void) {
    commit("Updated tool entry", (draft) => {
      const target = draft.tools[index];
      if (target) updater(target);
    });
  }

  function updateInventory(index: number, updater: (category: InventoryCategory) => void) {
    commit("Updated inventory", (draft) => {
      const target = draft.inventory[index];
      if (target) updater(target);
    });
  }

  function updateChecklist(index: number, updater: (item: ChecklistItem) => void) {
    commit("Updated checklist", (draft) => {
      const target = draft.restChecklist[index];
      if (target) updater(target);
    });
  }

  function updateActiveInfusion(index: number, updater: (item: ActiveInfusion) => void) {
    commit("Updated active infusion", (draft) => {
      const target = draft.infusionsActive[index];
      if (target) updater(target);
    });
  }

  function updateReminder(index: number, updater: (item: Reminder) => void) {
    commit("Updated reminder", (draft) => {
      const target = draft.reminders[index];
      if (target) updater(target);
    });
  }

  const pinnedReminders = character.reminders.filter((item) => item.pinned);

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
    if (!services) {
      return;
    }

    try {
      await signOutUser(services);
      setSyncStatus("Signed out.");
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Sign-out failed: ${error.message}` : "Sign-out failed.");
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
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--green)] px-5 text-white"
              >
                <LogIn className="h-5 w-5" />
                Sign in with Google
              </button>
            </div>
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
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Brek&rsquo;s Field Kit</p>
                  <h1 className="text-3xl leading-none">Session Dashboard</h1>
                </div>
              </div>
              <nav className="mt-5 grid gap-2">
                {navItems.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => commit("Changed view", (draft) => void (draft.ui.activeView = id))}
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
                {firebaseMode === "connected" ? `Firestore active${userLabel ? ` • ${userLabel}` : userId ? ` • ${userId.slice(0, 8)}` : ""}` : "Local cache only"}
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
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
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

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <LabelValue label="AC" value={character.stats.ac} />
                  <LabelValue label="Initiative" value={character.stats.initiative} />
                  <LabelValue label="Spell Save DC" value={character.stats.spellSaveDc} />
                  <LabelValue label="Spell Attack" value={character.stats.spellAttackBonus} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <LabelValue label="Speed" value={character.stats.speed} />
                  <LabelValue label="Int Mod" value={character.stats.intelligenceModifier} />
                  <LabelValue label="Prof Bonus" value={character.stats.proficiencyBonus} />
                  <LabelValue label="Darkvision" value={character.stats.darkvision} />
                </div>
              </div>

              <div className="grid gap-3 rounded-[28px] border border-[var(--line)] bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-5 w-5 text-[var(--red)]" />
                  <h2 className="text-lg font-semibold">Vital Tracker</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabelValue label="Max HP" value={character.stats.maxHp} />
                  <LabelValue label="Current HP" value={character.stats.currentHp} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => updateHp("currentHp", -1, "delta")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white/90">
                    Current HP -1
                  </button>
                  <button type="button" onClick={() => updateHp("currentHp", 1, "delta")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white/90">
                    Current HP +1
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = window.prompt("Set current HP", String(character.stats.currentHp));
                    if (next === null) return;
                    updateHp("currentHp", numberValue(next), "set");
                  }}
                  className="min-h-11 rounded-2xl bg-[var(--green)] px-4 text-white"
                >
                  Set Current HP
                </button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => updateHp("tempHp", -1, "delta")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white/90">
                    Temp HP -1
                  </button>
                  <button type="button" onClick={() => updateHp("tempHp", 1, "delta")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white/90">
                    Temp HP +1
                  </button>
                </div>
                <p className="text-sm text-[var(--muted)]">Temporary HP: {character.stats.tempHp}</p>
              </div>
            </div>
          </ShellCard>

          {character.ui.activeView === "dashboard" ? (
            <div className="space-y-4">
              <ShellCard title="Quick Resource Strip" subtitle="Click into the counters only when you mean it. Spend and restore both ask for confirmation.">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {character.resources.map((resource) => (
                    <div key={resource.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{resource.name}</h3>
                          <p className="text-sm text-[var(--muted)]">{resource.resetType}</p>
                        </div>
                        <span className="rounded-full bg-[var(--green-soft)] px-3 py-1 text-sm font-semibold text-[var(--green)]">
                          {resource.current}/{resource.max}
                        </span>
                      </div>
                      {resource.notes ? <p className="mt-3 text-sm text-[var(--muted)]">{resource.notes}</p> : null}
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => spendResource(resource.id, -1, `Spent 1 ${resource.name}`)} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white">
                          Spend
                        </button>
                        <button type="button" onClick={() => spendResource(resource.id, 1, `Restored 1 ${resource.name}`)} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white">
                          Restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ShellCard>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <ShellCard title="Do Not Forget" subtitle="Pinned reminders stay surfaced until you unpin or edit them in setup.">
                  <div className="grid gap-3">
                    {pinnedReminders.map((reminder) => (
                      <div key={reminder.id} className="rounded-[24px] border border-[var(--line)] bg-white/75 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-semibold">{reminder.title}</h3>
                          <button
                            type="button"
                            onClick={() =>
                              commit("Toggled reminder pin", (draft) => {
                                const target = draft.reminders.find((item) => item.id === reminder.id);
                                if (target) target.pinned = !target.pinned;
                              })
                            }
                            className="min-h-11 rounded-2xl border border-[var(--line)] px-3 text-sm"
                          >
                            {reminder.pinned ? "Unpin" : "Pin"}
                          </button>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{reminder.summary}</p>
                      </div>
                    ))}
                  </div>
                </ShellCard>

                <ShellCard title="Quick Decision Prompts" subtitle="Expanded by default so the good ideas are already on the table.">
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
                    <div className="grid gap-4">
                      <div>
                        <h3 className="font-semibold text-[var(--green)]">Before acting</h3>
                        <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--muted)]">
                          {character.decisionPrompts.beforeActing.map((prompt) => (
                            <li key={prompt} className="rounded-2xl border border-[var(--line)] bg-white/75 px-4 py-3">
                              {prompt}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--orange)]">When a roll happens</h3>
                        <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--muted)]">
                          {character.decisionPrompts.whenRollHappens.map((prompt) => (
                            <li key={prompt} className="rounded-2xl border border-[var(--line)] bg-white/75 px-4 py-3">
                              {prompt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </ShellCard>
              </div>
            </div>
          ) : null}

          {character.ui.activeView === "combat" ? (
            <div className="space-y-4">
              <ShellCard title="Action">
                <div className="grid gap-3 lg:grid-cols-2">
                  {character.attacks.map((attack) => (
                    <div key={attack.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold">{attack.name}</h3>
                        <button
                          type="button"
                          onClick={() =>
                            commit(`Used ${attack.name}`, (draft) => {
                              addLog(draft, `Used ${attack.name}: ${attack.attackBonus} to hit, ${attack.damage} ${attack.damageType}.`);
                            })
                          }
                          className="min-h-11 rounded-2xl bg-[var(--green)] px-4 text-white"
                        >
                          Use
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
                        <p>Attack bonus: {attack.attackBonus}</p>
                        <p>Damage: {attack.damage} {attack.damageType}</p>
                        <p>Range: {attack.range}</p>
                        <p>Traits: {attack.traits.join(", ")}</p>
                      </div>
                    </div>
                  ))}
                  {groups.action.map((feature) => (
                    <FeatureCard key={feature.id} feature={feature} onUse={() => commit(`Used ${feature.name}`, (draft) => addLog(draft, feature.name))} />
                  ))}
                </div>
              </ShellCard>

              <div className="grid gap-4 xl:grid-cols-2">
                <ShellCard title="Bonus Action">
                  <div className="grid gap-3">
                    {groups.bonus.map((feature) => (
                      <FeatureCard key={feature.id} feature={feature} onUse={() => commit(`Used ${feature.name}`, (draft) => addLog(draft, feature.name))} />
                    ))}
                  </div>
                </ShellCard>

                <ShellCard title="Reaction" subtitle="Reaction options stay loud on purpose.">
                  <div className="grid gap-3">
                    {groups.reaction.map((feature) => (
                      <FeatureCard
                        key={feature.id}
                        feature={feature}
                        emphasize
                        onUse={() => {
                          if (feature.resourceId) {
                            spendResource(feature.resourceId, -1, `Used ${feature.name}`);
                            return;
                          }
                          commit(`Used ${feature.name}`, (draft) => addLog(draft, feature.name));
                        }}
                      />
                    ))}
                  </div>
                </ShellCard>
              </div>

              <ShellCard title="Passive / Triggered Benefits">
                <div className="grid gap-3 lg:grid-cols-2">
                  {groups.passive.map((feature) => (
                    <div key={feature.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <h3 className="font-semibold">{feature.name}</h3>
                      <p className="mt-2 text-sm text-[var(--muted)]">Trigger: {feature.trigger}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{feature.effect}</p>
                    </div>
                  ))}
                </div>
              </ShellCard>
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
                        commit("Changed spell filter", (draft) => {
                          draft.ui.spellFilter = filter;
                        })
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

              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <ShellCard title="Spells" subtitle="Purpose-first scanning with prepared state, cast actions, and quick notes.">
                  <div className="grid gap-3">
                    {filteredSpells.map((spell) => (
                      <div key={spell.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">{spell.name}</h3>
                            <p className="text-sm text-[var(--muted)]">
                              Level {spell.level} • {spell.actionType} • {spell.range}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => castSpell(spell)} className="min-h-11 rounded-2xl bg-[var(--green)] px-4 text-white">
                              Cast
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                commit("Toggled prepared spell", (draft) => {
                                  const target = draft.spells.find((item) => item.id === spell.id);
                                  if (target && !target.alwaysPrepared) target.prepared = !target.prepared;
                                })
                              }
                              className="min-h-11 rounded-2xl border border-[var(--line)] px-4"
                            >
                              {spell.prepared ? "Prepared" : "Not prepared"}
                            </button>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{spell.summary}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-[var(--green-soft)] px-3 py-1 text-[var(--green)]">{spell.saveOrAttack}</span>
                          {spell.concentration ? <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">Concentration</span> : null}
                          {spell.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-white px-3 py-1 text-[var(--muted)] ring-1 ring-[var(--line)]">
                              {tag}
                            </span>
                          ))}
                        </div>
                        {spell.notes ? <p className="mt-3 text-sm text-[var(--muted)]">Notes: {spell.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                </ShellCard>

                <ShellCard title="Experimental Elixirs" subtitle="Current vials, potions, and created extras live here as table-ready inventory.">
                  <div className="flex justify-end">
                    <button type="button" onClick={createElixir} className="min-h-11 rounded-2xl bg-[var(--orange)] px-4 text-white">
                      Create Additional Elixir
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {character.elixirs.map((elixir) => (
                      <div key={elixir.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">{elixir.name}</h3>
                            <p className="mt-1 text-sm text-[var(--muted)]">{elixir.effect}</p>
                          </div>
                          <button type="button" onClick={() => consumeElixir(elixir.id)} className="min-h-11 rounded-2xl border border-[var(--line)] px-4">
                            {elixir.consumed ? "Mark Unused" : "Drink / Use"}
                          </button>
                        </div>
                        <p className="mt-3 text-sm text-[var(--muted)]">Holder: {elixir.holder} • Duration: {elixir.duration}</p>
                        {elixir.notes ? <p className="mt-2 text-sm text-[var(--muted)]">Notes: {elixir.notes}</p> : null}
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabelValue label="Creature Type" value={character.companion.creatureType} />
                  <LabelValue label="AC" value={character.companion.ac} />
                  <LabelValue label="Max HP" value={character.companion.maxHp} />
                  <LabelValue label="Current HP" value={character.companion.currentHp} />
                  <LabelValue label="Speed" value={character.companion.speed} />
                  <LabelValue label="Fly Speed" value={character.companion.flySpeed} />
                </div>
                <p className="mt-4 rounded-2xl border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">{character.companion.forceStrike}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => updateCompanionHp(-1, "delta")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white">
                    Veech HP -1
                  </button>
                  <button type="button" onClick={() => updateCompanionHp(1, "delta")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white">
                    Veech HP +1
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = window.prompt("Set Veech HP", String(character.companion.currentHp));
                      if (next === null) return;
                      updateCompanionHp(numberValue(next), "set");
                    }}
                    className="min-h-11 rounded-2xl bg-[var(--green)] px-4 text-white sm:col-span-2"
                  >
                    Set Veech HP
                  </button>
                </div>
              </ShellCard>

              <ShellCard title="Quick Commands">
                <div className="grid gap-3 sm:grid-cols-2">
                  {["Dodge", "Force Strike", "Help", "Deliver Touch Spell", "Move / Scout", "Custom Command"].map((command) => (
                    <button
                      key={command}
                      type="button"
                      onClick={() =>
                        commit(`Veech used ${command}`, (draft) => {
                          addLog(draft, `Veech used ${command}.`);
                        })
                      }
                      className="min-h-12 rounded-[22px] border border-[var(--line)] bg-white/85 px-4 text-left"
                    >
                      {command}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-2">
                  {character.companion.notes.map((note) => (
                    <p key={note} className="rounded-2xl border border-[var(--line)] bg-white/75 px-4 py-3 text-sm text-[var(--muted)]">
                      {note}
                    </p>
                  ))}
                </div>
              </ShellCard>
            </div>
          ) : null}

          {character.ui.activeView === "exploration" ? (
            <div className="space-y-4">
              <ShellCard title="Tool Expertise" subtitle="Brek's proficiency bonus is doubled for any ability check that uses a proficient tool.">
                <div className="grid gap-3 lg:grid-cols-2">
                  {character.tools.map((tool) => (
                    <div key={tool.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">{tool.name}</h3>
                        <button
                          type="button"
                          onClick={() =>
                            commit(`Logged ${tool.name} check`, (draft) => {
                              addLog(draft, `Attempted a ${tool.name} check (${tool.modifier}).`);
                            })
                          }
                          className="min-h-11 rounded-2xl border border-[var(--line)] px-4"
                        >
                          Make a tool check
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-[var(--muted)]">Typical uses: {tool.uses}</p>
                      <p className="mt-2 text-sm text-[var(--muted)]">Suggested ability: {tool.suggestedAbility}</p>
                      <p className="mt-2 text-sm text-[var(--muted)]">Modifier: {tool.modifier}</p>
                    </div>
                  ))}
                </div>
              </ShellCard>

              <ShellCard title="Other Exploration Features">
                <div className="grid gap-3 lg:grid-cols-2">
                  {["Magical Tinkering", "The Right Tool for the Job", "Ritual casting", "Darkvision", "Fey Ancestry"].map((item) => (
                    <div key={item} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <h3 className="font-semibold">{item}</h3>
                    </div>
                  ))}
                  <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 lg:col-span-2">
                    <h3 className="font-semibold">Languages</h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">{character.stats.languages.join(", ")}</p>
                  </div>
                </div>
              </ShellCard>
            </div>
          ) : null}

          {character.ui.activeView === "inventory" ? (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <ShellCard title="Known Infusions">
                  <div className="grid gap-3">
                    {character.infusionsKnown.map((infusion) => (
                      <div key={infusion.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                        <h3 className="font-semibold">{infusion.name}</h3>
                        <p className="mt-2 text-sm text-[var(--muted)]">Eligible item: {infusion.itemType}</p>
                        <p className="mt-2 text-sm text-[var(--muted)]">Attunement: {infusion.attunement}</p>
                        <p className="mt-2 text-sm text-[var(--muted)]">{infusion.summary}</p>
                      </div>
                    ))}
                  </div>
                </ShellCard>

                <ShellCard title="Active Infusions" subtitle={`Maximum infused items: 3 • Currently active: ${activeInfusions.length}`}>
                  <div className="grid gap-3">
                    {character.infusionsActive.map((infusion, index) => (
                      <div key={infusion.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">{infusion.infusionName}</h3>
                            <p className="text-sm text-[var(--muted)]">
                              {infusion.itemName} • Carrier: {infusion.carrier}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateActiveInfusion(index, (item) => void (item.active = !item.active))}
                            className="min-h-11 rounded-2xl border border-[var(--line)] px-4"
                          >
                            {infusion.active ? "Active" : "Inactive"}
                          </button>
                        </div>
                        <p className="mt-3 text-sm text-[var(--muted)]">
                          Charges: {infusion.currentCharges}/{infusion.maxCharges} • Reset: {infusion.resetType}
                        </p>
                      </div>
                    ))}
                  </div>
                </ShellCard>
              </div>

              <ShellCard title="Important Inventory">
                <div className="grid gap-3 lg:grid-cols-2">
                  {character.inventory.map((category) => (
                    <div key={category.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <h3 className="font-semibold">{category.name}</h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {category.items.map((item) => (
                          <span key={item} className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-sm text-[var(--muted)]">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ShellCard>
            </div>
          ) : null}

          {character.ui.activeView === "rest" ? (
            <div className="space-y-4">
              <ShellCard title="Long Rest Checklist">
                <div className="grid gap-2">
                  {character.restChecklist.map((item, index) => (
                    <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/75 px-4 py-3">
                      <input
                        aria-label={item.label}
                        type="checkbox"
                        checked={item.checked}
                        onChange={(event) => updateChecklist(index, (draft) => void (draft.checked = event.target.checked))}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => runReset("short-rest")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white">
                    Short Rest
                  </button>
                  <button type="button" onClick={() => runReset("dawn")} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white">
                    Dawn Reset
                  </button>
                  <button type="button" onClick={() => runReset("long-rest")} className="min-h-11 rounded-2xl bg-[var(--green)] text-white">
                    Long Rest
                  </button>
                </div>
                <div className="mt-4">
                  <TextArea label="Optional session note" value={sessionNote} onChange={setSessionNote} />
                </div>
              </ShellCard>

              <ShellCard title="Session Log">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={startNewSession} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white px-4">
                    Start New Session
                  </button>
                  <div className="flex-1">
                    <TextInput label="Manual log note" value={manualLog} onChange={setManualLog} />
                  </div>
                  <button type="button" onClick={addManualLog} className="min-h-11 rounded-2xl bg-[var(--orange)] px-4 text-white">
                    Add Note
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  {character.eventLog.map((entry) => (
                    <div key={entry.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
                        <span>{entry.sessionLabel}</span>
                        <div className="flex items-center gap-2">
                          <span>{formatTime(entry.timestamp)}</span>
                          <button
                            type="button"
                            onClick={() =>
                              commit("Edited log entry", (draft) => {
                                const target = draft.eventLog.find((item) => item.id === entry.id);
                                if (!target) return;
                                const next = window.prompt("Edit log entry", target.text);
                                if (next === null || !next.trim()) return;
                                target.text = next.trim();
                              })
                            }
                            className="rounded-full border border-[var(--line)] px-3 py-1"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              commit("Deleted log entry", (draft) => {
                                draft.eventLog = draft.eventLog.filter((item) => item.id !== entry.id);
                              })
                            }
                            className="rounded-full border border-[var(--line)] px-3 py-1"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--text)]">{entry.text}</p>
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
                  <TextInput label="Alignment" value={character.core.alignment} onChange={(value) => commit("Updated core data", (draft) => void (draft.core.alignment = value))} />
                </div>
              </ShellCard>

              <ShellCard title="Stats and Abilities">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <TextInput label="AC" type="number" value={character.stats.ac} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.ac = numberValue(value)))} />
                  <TextInput label="Max HP" type="number" value={character.stats.maxHp} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.maxHp = numberValue(value)))} />
                  <TextInput label="Current HP" type="number" value={character.stats.currentHp} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.currentHp = numberValue(value)))} />
                  <TextInput label="Temp HP" type="number" value={character.stats.tempHp} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.tempHp = numberValue(value)))} />
                  <TextInput label="Speed" value={character.stats.speed} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.speed = value))} />
                  <TextInput label="Initiative" value={character.stats.initiative} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.initiative = value))} />
                  <TextInput label="Spell Save DC" type="number" value={character.stats.spellSaveDc} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.spellSaveDc = numberValue(value)))} />
                  <TextInput label="Spell Attack Bonus" value={character.stats.spellAttackBonus} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.spellAttackBonus = value))} />
                  <TextInput label="Intelligence Modifier" value={character.stats.intelligenceModifier} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.intelligenceModifier = value))} />
                  <TextInput label="Proficiency Bonus" value={character.stats.proficiencyBonus} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.proficiencyBonus = value))} />
                  <TextInput label="Darkvision" value={character.stats.darkvision} onChange={(value) => commit("Updated stats", (draft) => void (draft.stats.darkvision = value))} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(character.abilities).map(([name, score]) => (
                    <div key={name} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <p className="font-semibold">{name}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <TextInput
                          label="Score"
                          type="number"
                          value={score.score}
                          onChange={(value) => commit("Updated ability", (draft) => void (draft.abilities[name].score = numberValue(value)))}
                        />
                        <TextInput
                          label="Modifier"
                          type="number"
                          value={score.modifier}
                          onChange={(value) => commit("Updated ability", (draft) => void (draft.abilities[name].modifier = numberValue(value)))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </ShellCard>

              <ShellCard title="Attacks, Resources, and Spells">
                <div className="grid gap-4">
                  {character.attacks.map((attack, index) => (
                    <div key={attack.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <TextInput label="Attack name" value={attack.name} onChange={(value) => updateAttack(index, (draft) => void (draft.name = value))} />
                        <TextInput label="Attack bonus" value={attack.attackBonus} onChange={(value) => updateAttack(index, (draft) => void (draft.attackBonus = value))} />
                        <TextInput label="Damage" value={attack.damage} onChange={(value) => updateAttack(index, (draft) => void (draft.damage = value))} />
                        <TextInput label="Damage type" value={attack.damageType} onChange={(value) => updateAttack(index, (draft) => void (draft.damageType = value))} />
                        <TextInput label="Range" value={attack.range} onChange={(value) => updateAttack(index, (draft) => void (draft.range = value))} />
                        <TextInput
                          label="Traits"
                          value={attack.traits.join(", ")}
                          onChange={(value) => updateAttack(index, (draft) => void (draft.traits = value.split(",").map((item) => item.trim()).filter(Boolean)))}
                        />
                      </div>
                    </div>
                  ))}

                  {character.resources.map((resource, index) => (
                    <div key={resource.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <TextInput label="Resource name" value={resource.name} onChange={(value) => updateResourceRow(index, (draft) => void (draft.name = value))} />
                        <TextInput label="Current" type="number" value={resource.current} onChange={(value) => updateResourceRow(index, (draft) => void (draft.current = numberValue(value)))} />
                        <TextInput label="Max" type="number" value={resource.max} onChange={(value) => updateResourceRow(index, (draft) => void (draft.max = numberValue(value)))} />
                        <label className="grid gap-2 text-sm text-[var(--muted)]">
                          <span>Reset type</span>
                          <select
                            aria-label="Reset type"
                            className="min-h-11 rounded-2xl border border-[var(--line)] bg-white px-3"
                            value={resource.resetType}
                            onChange={(event) => updateResourceRow(index, (draft) => void (draft.resetType = event.target.value as Resource["resetType"]))}
                          >
                            <option value="short-rest">short-rest</option>
                            <option value="long-rest">long-rest</option>
                            <option value="dawn">dawn</option>
                            <option value="manual">manual</option>
                            <option value="none">none</option>
                          </select>
                        </label>
                        <TextInput label="Notes" value={resource.notes ?? ""} onChange={(value) => updateResourceRow(index, (draft) => void (draft.notes = value))} />
                      </div>
                    </div>
                  ))}

                  {character.spells.map((spell, index) => (
                    <div key={spell.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <TextInput label="Spell name" value={spell.name} onChange={(value) => updateSpell(index, (draft) => void (draft.name = value))} />
                        <TextInput label="Level" type="number" value={spell.level} onChange={(value) => updateSpell(index, (draft) => void (draft.level = numberValue(value)))} />
                        <TextInput label="Range" value={spell.range} onChange={(value) => updateSpell(index, (draft) => void (draft.range = value))} />
                        <TextInput label="Action type" value={spell.actionType} onChange={(value) => updateSpell(index, (draft) => void (draft.actionType = value as Spell["actionType"]))} />
                        <TextInput label="Save / attack" value={spell.saveOrAttack} onChange={(value) => updateSpell(index, (draft) => void (draft.saveOrAttack = value))} />
                        <TextInput label="Tags" value={spell.tags.join(", ")} onChange={(value) => updateSpell(index, (draft) => void (draft.tags = value.split(",").map((item) => item.trim()).filter(Boolean)))} />
                        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--muted)]">
                          <input
                            aria-label={`Prepared ${spell.name}`}
                            type="checkbox"
                            checked={spell.prepared}
                            onChange={(event) => updateSpell(index, (draft) => void (draft.prepared = event.target.checked))}
                          />
                          Prepared
                        </label>
                        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--muted)]">
                          <input
                            aria-label={`Concentration ${spell.name}`}
                            type="checkbox"
                            checked={spell.concentration}
                            onChange={(event) => updateSpell(index, (draft) => void (draft.concentration = event.target.checked))}
                          />
                          Concentration
                        </label>
                      </div>
                      <div className="mt-3">
                        <TextArea label="Summary" value={spell.summary} onChange={(value) => updateSpell(index, (draft) => void (draft.summary = value))} />
                      </div>
                    </div>
                  ))}
                </div>
              </ShellCard>

              <ShellCard title="Reminders, Features, Elixirs, Companion, and Inventory">
                <div className="grid gap-4">
                  {character.reminders.map((reminder, index) => (
                    <div key={reminder.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <TextInput label="Reminder title" value={reminder.title} onChange={(value) => updateReminder(index, (draft) => void (draft.title = value))} />
                        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--muted)]">
                          <input
                            aria-label={`Pinned ${reminder.title}`}
                            type="checkbox"
                            checked={reminder.pinned}
                            onChange={(event) => updateReminder(index, (draft) => void (draft.pinned = event.target.checked))}
                          />
                          Pinned
                        </label>
                      </div>
                      <div className="mt-3">
                        <TextArea label="Reminder text" value={reminder.summary} onChange={(value) => updateReminder(index, (draft) => void (draft.summary = value))} />
                      </div>
                    </div>
                  ))}

                  {character.features.map((feature, index) => (
                    <div key={feature.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <TextInput label="Feature name" value={feature.name} onChange={(value) => commit("Updated feature", (draft) => void (draft.features[index].name = value))} />
                        <TextInput label="Category" value={feature.category} onChange={(value) => commit("Updated feature", (draft) => void (draft.features[index].category = value as Feature["category"]))} />
                        <TextInput label="Trigger" value={feature.trigger} onChange={(value) => commit("Updated feature", (draft) => void (draft.features[index].trigger = value))} />
                        <TextInput label="Range" value={feature.range ?? ""} onChange={(value) => commit("Updated feature", (draft) => void (draft.features[index].range = value))} />
                      </div>
                      <div className="mt-3">
                        <TextArea label="Effect" value={feature.effect} onChange={(value) => commit("Updated feature", (draft) => void (draft.features[index].effect = value))} />
                      </div>
                    </div>
                  ))}

                  {character.elixirs.map((elixir, index) => (
                    <div key={elixir.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <TextInput label="Elixir name" value={elixir.name} onChange={(value) => commit("Updated elixir", (draft) => void (draft.elixirs[index].name = value))} />
                        <TextInput label="Holder" value={elixir.holder} onChange={(value) => commit("Updated elixir", (draft) => void (draft.elixirs[index].holder = value))} />
                        <TextInput label="Duration" value={elixir.duration} onChange={(value) => commit("Updated elixir", (draft) => void (draft.elixirs[index].duration = value))} />
                        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--muted)]">
                          <input
                            aria-label={`Consumed ${elixir.name}`}
                            type="checkbox"
                            checked={elixir.consumed}
                            onChange={(event) => commit("Updated elixir", (draft) => void (draft.elixirs[index].consumed = event.target.checked))}
                          />
                          Consumed
                        </label>
                      </div>
                      <div className="mt-3 grid gap-3">
                        <TextArea label="Effect" value={elixir.effect} onChange={(value) => commit("Updated elixir", (draft) => void (draft.elixirs[index].effect = value))} />
                        <TextInput label="Notes" value={elixir.notes ?? ""} onChange={(value) => commit("Updated elixir", (draft) => void (draft.elixirs[index].notes = value))} />
                      </div>
                    </div>
                  ))}
                </div>
              </ShellCard>

              <ShellCard title="Companion, Tools, Inventory, and Notes">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-4">
                    <TextInput label="Companion name" value={character.companion.name} onChange={(value) => commit("Updated companion", (draft) => void (draft.companion.name = value))} />
                    <TextInput label="Companion AC" type="number" value={character.companion.ac} onChange={(value) => commit("Updated companion", (draft) => void (draft.companion.ac = numberValue(value)))} />
                    <TextInput label="Companion max HP" type="number" value={character.companion.maxHp} onChange={(value) => commit("Updated companion", (draft) => void (draft.companion.maxHp = numberValue(value)))} />
                    <TextArea label="Companion notes" value={character.companion.notes.join("\n")} onChange={(value) => commit("Updated companion", (draft) => void (draft.companion.notes = value.split("\n").map((item) => item.trim()).filter(Boolean)))} />
                    {character.tools.map((tool, index) => (
                      <div key={tool.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                        <TextInput label="Tool name" value={tool.name} onChange={(value) => updateTool(index, (draft) => void (draft.name = value))} />
                        <div className="mt-3 grid gap-3">
                          <TextInput label="Suggested ability" value={tool.suggestedAbility} onChange={(value) => updateTool(index, (draft) => void (draft.suggestedAbility = value))} />
                          <TextInput label="Modifier" value={tool.modifier} onChange={(value) => updateTool(index, (draft) => void (draft.modifier = value))} />
                          <TextArea label="Typical uses" value={tool.uses} onChange={(value) => updateTool(index, (draft) => void (draft.uses = value))} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {character.inventory.map((category, index) => (
                      <div key={category.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                        <TextInput label="Category name" value={category.name} onChange={(value) => updateInventory(index, (draft) => void (draft.name = value))} />
                        <div className="mt-3">
                          <TextArea label="Items (one per line)" value={category.items.join("\n")} onChange={(value) => updateInventory(index, (draft) => void (draft.items = value.split("\n").map((item) => item.trim()).filter(Boolean)))} rows={5} />
                        </div>
                      </div>
                    ))}

                    {character.infusionsActive.map((infusion, index) => (
                      <div key={infusion.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                        <TextInput label="Infusion name" value={infusion.infusionName} onChange={(value) => updateActiveInfusion(index, (draft) => void (draft.infusionName = value))} />
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <TextInput label="Item name" value={infusion.itemName} onChange={(value) => updateActiveInfusion(index, (draft) => void (draft.itemName = value))} />
                          <TextInput label="Carrier" value={infusion.carrier} onChange={(value) => updateActiveInfusion(index, (draft) => void (draft.carrier = value))} />
                          <TextInput label="Attuned by" value={infusion.attunedBy} onChange={(value) => updateActiveInfusion(index, (draft) => void (draft.attunedBy = value))} />
                          <TextInput label="Notes" value={infusion.notes ?? ""} onChange={(value) => updateActiveInfusion(index, (draft) => void (draft.notes = value))} />
                        </div>
                      </div>
                    ))}

                    <TextArea label="Campaign notes" value={character.notes} onChange={(value) => commit("Updated notes", (draft) => void (draft.notes = value))} rows={6} />
                  </div>
                </div>
              </ShellCard>
            </div>
          ) : null}
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[rgba(248,244,236,0.98)] p-2 shadow-[0_-8px_30px_rgba(56,46,28,0.08)] lg:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-4 gap-2 overflow-x-auto">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => commit("Changed view", (draft) => void (draft.ui.activeView = id))}
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

function FeatureCard({
  feature,
  onUse,
  emphasize = false,
}: {
  feature: Feature;
  onUse: () => void;
  emphasize?: boolean;
}) {
  return (
    <div className={cx("rounded-[24px] border p-4", emphasize ? "border-[var(--orange)] bg-orange-50/80" : "border-[var(--line)] bg-white/80")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{feature.name}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">Trigger: {feature.trigger}</p>
        </div>
        <button type="button" onClick={onUse} className="min-h-11 rounded-2xl border border-[var(--line)] bg-white px-4">
          Use
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{feature.effect}</p>
      {feature.range ? <p className="mt-2 text-sm text-[var(--muted)]">Range: {feature.range}</p> : null}
    </div>
  );
}
