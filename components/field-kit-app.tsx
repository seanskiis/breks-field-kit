"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler, type ReactNode } from "react";
import {
  Backpack,
  Check,
  ChevronRight,
  FlaskConical,
  Hammer,
  LayoutDashboard,
  LogIn,
  LogOut,
  MoonStar,
  Pencil,
  Plus,
  Shield,
  // Sparkles,
  Swords,
  Trash2,
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
const SKILL_DEFINITIONS = [
  { ability: "Dexterity", label: "Acrobatics", proficient: false },
  { ability: "Wisdom", label: "Animal Handling", proficient: false },
  { ability: "Intelligence", label: "Arcana", proficient: true },
  { ability: "Strength", label: "Athletics", proficient: false },
  { ability: "Charisma", label: "Deception", proficient: false },
  { ability: "Intelligence", label: "History", proficient: false },
  { ability: "Wisdom", label: "Insight", proficient: true },
  { ability: "Charisma", label: "Intimidation", proficient: false },
  { ability: "Intelligence", label: "Investigation", proficient: true },
  { ability: "Wisdom", label: "Medicine", proficient: false },
  { ability: "Intelligence", label: "Nature", proficient: false },
  { ability: "Wisdom", label: "Perception", proficient: false },
  { ability: "Charisma", label: "Performance", proficient: false },
  { ability: "Charisma", label: "Persuasion", proficient: true },
  { ability: "Intelligence", label: "Religion", proficient: false },
  { ability: "Dexterity", label: "Sleight of Hand", proficient: false },
  { ability: "Dexterity", label: "Stealth", proficient: false },
  { ability: "Wisdom", label: "Survival", proficient: false },
] as const;
const LONG_REST_ELIXIRS = ["Healing", "Swiftness", "Resilience", "Boldness", "Flight", "Transformation"];
const navItems: Array<{ id: NavView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "combat", label: "Combat", icon: Swords },
  { id: "spells", label: "Spells", icon: WandSparkles },
  // { id: "veech", label: "Veech", icon: Sparkles },
  { id: "exploration", label: "Exploration & Tools", icon: Hammer },
  { id: "inventory", label: "Inventory & Infusions", icon: Backpack },
  { id: "rest", label: "Rest & Session", icon: MoonStar },
  { id: "setup", label: "Character Setup", icon: Shield },
];

const SPELL_DISPLAY_OVERRIDES: Record<string, Partial<Spell>> = {
  guidance: { castingTime: "1 Action", components: "V, S", areaOfEffect: "—", effectText: "Add 1d4 to one ability check." },
  mending: { castingTime: "1 Minute", components: "V, S, M", areaOfEffect: "—", effectText: "Repairs a break or tear in an object." },
  "healing-word": { castingTime: "1 Bonus Action", hitDc: "—", components: "V", areaOfEffect: "—", effectText: "2d4 + INT ❤ at range for an ally." },
  "ray-of-sickness": { castingTime: "1 Action", components: "V, S", areaOfEffect: "—", effectText: "2d8 ☠ and can poison the target." },
  "flaming-sphere": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "5 ft. sphere", effectText: "2d6 🔥 in a movable sphere." },
  "melfs-acid-arrow": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "4d4 🧪 now and 2d4 🧪 next turn." },
  "faerie-fire": { castingTime: "1 Action", components: "V", areaOfEffect: "20 ft. cube", effectText: "Outlined targets lose invisibility and grant advantage." },
  snare: { castingTime: "1 Minute", components: "S, M", areaOfEffect: "5 ft. radius", effectText: "Hidden magical trap restrains and suspends a creature." },
  "tashas-caustic-brew": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "30 ft. line", effectText: "2d4 🧪 and pressures targets to spend actions." },
  "false-life": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Gain temporary HP ❤ before danger." },
  grease: { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "10 ft. square", effectText: "Creates slippery terrain and can knock creatures prone." },
  identify: { castingTime: "1 Minute", components: "V, S, M", areaOfEffect: "—", effectText: "Reveal item or magic properties." },
  alarm: { castingTime: "1 Minute", components: "V, S, M", areaOfEffect: "20 ft. cube", effectText: "Protect a campsite or room with an alarm ward." },
  "cure-wounds": { castingTime: "1 Action", components: "V, S", areaOfEffect: "—", effectText: "1d8 + INT ❤ to a touched creature." },
  "detect-magic": { castingTime: "1 Action", components: "V, S", areaOfEffect: "Self, 30 ft. radius", effectText: "Sense nearby magic while exploring." },
  "disguise-self": { castingTime: "1 Action", components: "V, S", areaOfEffect: "—", effectText: "Change appearance for infiltration." },
  "expeditious-retreat": { castingTime: "1 Bonus Action", components: "V, S", areaOfEffect: "—", effectText: "Dash every turn for repositioning." },
  "feather-fall": { castingTime: "1 Reaction", components: "V, M", areaOfEffect: "Up to 5 creatures", effectText: "Slow falling creatures before impact." },
  heroism: { castingTime: "1 Bonus Action", components: "V, S", areaOfEffect: "—", effectText: "A creature gains temporary HP ❤ and ignores fear." },
  jump: { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Triple jump distance for 1 minute." },
  longstrider: { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "+10 ft. speed for 1 hour." },
  "purify-food-and-drink": { castingTime: "1 Action", components: "V, S", areaOfEffect: "5 ft. sphere", effectText: "Makes suspicious provisions safe." },
  sanctuary: { castingTime: "1 Bonus Action", components: "V, S, M", areaOfEffect: "—", effectText: "Protect a creature unless attackers pass a WIS save." },
  "absorb-elements": { castingTime: "1 Reaction", components: "S", areaOfEffect: "—", effectText: "Gain resistance and store elemental energy." },
  catapult: { castingTime: "1 Action", components: "S", areaOfEffect: "—", effectText: "3d8 ✦ by launching an object at a target." },
  aid: { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "Up to 3 creatures", effectText: "Raise max and current HP ❤ for allies." },
  "alter-self": { castingTime: "1 Action", components: "V, S", areaOfEffect: "—", effectText: "Adapt body for disguise, mobility, or natural weapons." },
  "arcane-lock": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Seal a door or container against intrusion." },
  blur: { castingTime: "1 Action", components: "V", areaOfEffect: "—", effectText: "Attacks against you have disadvantage." },
  "continual-flame": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Create a permanent magical flame." },
  darkvision: { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Grant 60 ft. darkvision." },
  "enhance-ability": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Advantage and rider benefits for one ability." },
  "enlarge-reduce": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Change a creature's size and combat profile." },
  "heat-metal": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "2d8 🔥 and ongoing pressure against metal-wearers." },
  invisibility: { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "A creature becomes invisible." },
  "lesser-restoration": { castingTime: "1 Action", components: "V, S", areaOfEffect: "—", effectText: "End blindness, deafness, paralysis, or poison." },
  levitate: { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Raise a creature or object vertically." },
  "magic-mouth": { castingTime: "1 Minute", components: "V, S, M", areaOfEffect: "—", effectText: "Leave a magical spoken message or warning." },
  "magic-weapon": { castingTime: "1 Bonus Action", components: "V, S", areaOfEffect: "—", effectText: "Buff a weapon for harder fights." },
  "misty-step": { castingTime: "1 Bonus Action", components: "V", areaOfEffect: "Self", effectText: "Teleport up to 30 ft. ➜" },
  "protection-from-poison": { castingTime: "1 Action", components: "V, S", areaOfEffect: "—", effectText: "Neutralize poison and grant poison resistance." },
  "rope-trick": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Create a temporary extradimensional hideaway." },
  "see-invisibility": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "Self", effectText: "See invisible creatures and objects." },
  "spider-climb": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "—", effectText: "Move across walls and ceilings." },
  web: { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "20 ft. cube", effectText: "Create restraining webs over an area." },
  pyrotechnics: { castingTime: "1 Action", components: "V, S", areaOfEffect: "10 ft. radius", effectText: "Burst flame into fireworks or smoke." },
  skywrite: { castingTime: "1 Action", components: "V, S", areaOfEffect: "Sight", effectText: "Write a message in the sky." },
  "tortoise-shell": { castingTime: "1 Action", components: "V, S, M", areaOfEffect: "Self", effectText: "Harden into a defensive shell." },
};

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

  migrateCharacter(hydrated);
  syncDerivedState(hydrated);
  return hydrated;
}

function upsertResource(resources: Resource[], next: Resource) {
  const existing = resources.find((resource) => resource.id === next.id);
  if (existing) {
    existing.name = next.name;
    existing.max = next.max;
    existing.resetType = next.resetType;
    existing.notes = next.notes;
    if (existing.current > existing.max) {
      existing.current = existing.max;
    }
    return;
  }

  resources.push(next);
}

function upsertSpell(spells: Spell[], next: Spell) {
  const existing = spells.find((spell) => spell.id === next.id);
  if (existing) {
    existing.name = next.name;
    existing.level = next.level;
    existing.prepared = next.prepared;
    existing.alwaysPrepared = next.alwaysPrepared;
    existing.actionType = next.actionType;
    existing.range = next.range;
    existing.concentration = next.concentration;
    existing.saveOrAttack = next.saveOrAttack;
    existing.summary = next.summary;
    existing.tags = next.tags;
    existing.notes = next.notes;
    return;
  }

  spells.push(next);
}

function upsertFeature(features: Feature[], next: Feature) {
  const existing = features.find((feature) => feature.id === next.id);
  if (existing) {
    existing.name = next.name;
    existing.category = next.category;
    existing.trigger = next.trigger;
    existing.effect = next.effect;
    existing.resourceId = next.resourceId;
    existing.range = next.range;
    return;
  }

  features.push(next);
}

function migrateCharacter(draft: CharacterData) {
  if (draft.core.level < 8) {
    draft.core.level = 8;
  }

  if (draft.abilities.Intelligence) {
    draft.abilities.Intelligence.score = Math.max(draft.abilities.Intelligence.score, 17);
    draft.abilities.Intelligence.modifier = 3;
  }

  upsertResource(draft.resources, {
    id: "misty-step",
    name: "Misty Step",
    current: 2,
    max: 2,
    resetType: "long-rest",
    notes: "Fey Ancestry charges",
  });
  upsertResource(draft.resources, {
    id: "heroism",
    name: "Heroism",
    current: 1,
    max: 1,
    resetType: "long-rest",
    notes: "Fey Ancestry charge",
  });

  upsertSpell(draft.spells, {
    id: "heroism",
    name: "Heroism",
    level: 1,
    prepared: true,
    alwaysPrepared: true,
    actionType: "bonus",
    range: "Touch",
    concentration: true,
    saveOrAttack: "Support",
    summary: "Bolster a creature with temporary hit points and fear resistance.",
    tags: ["support", "bonus", "concentration"],
  });
  upsertSpell(draft.spells, {
    id: "misty-step",
    name: "Misty Step",
    level: 2,
    prepared: true,
    alwaysPrepared: true,
    actionType: "bonus",
    range: "Self",
    concentration: false,
    saveOrAttack: "Mobility",
    summary: "Teleport up to 30 feet to reposition or escape.",
    tags: ["mobility", "escape", "bonus"],
  });

  upsertFeature(draft.features, {
    id: "passive-fey",
    name: "Fey Ancestry",
    category: "passive",
    trigger: "Charm effects and fey magic",
    effect: "Advantage on saves against charm effects, plus 2 charges of Misty Step and 1 charge of Heroism each long rest.",
  });

  if ((draft.ui.activeView as string) === "veech") {
    draft.ui.activeView = "dashboard";
  }

  draft.resources = draft.resources.filter((item) => item.id !== "veech-hp");
  draft.reminders = draft.reminders.filter((item) => item.id !== "veech-default");
  draft.features = draft.features.filter((item) => item.id !== "action-veech" && item.id !== "bonus-command");
  draft.restChecklist = draft.restChecklist.filter((item) => item.id !== "veech-hp-check");
  draft.decisionPrompts.beforeActing = draft.decisionPrompts.beforeActing.filter((item) => !item.includes("Veech"));
  draft.decisionPrompts.whenRollHappens = draft.decisionPrompts.whenRollHappens.filter((item) => !item.includes("Veech"));

  const cureWounds = draft.spells.find((item) => item.id === "cure-wounds");
  if (cureWounds?.summary.includes("Veech")) {
    cureWounds.summary = "Strong single-target healing at touch range.";
  }
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

function syncDerivedState(draft: CharacterData) {
  const elixirResource = draft.resources.find((item) => item.id === "elixirs");
  if (elixirResource) {
    elixirResource.current = draft.elixirs.filter((item) => !item.consumed).length;
  }

  // const veechResource = draft.resources.find((item) => item.id === "veech-hp");
  // if (veechResource) {
  //   veechResource.current = draft.companion.currentHp;
  // }
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
  compact = false,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section className={cx("kit-frame border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]", compact ? "p-3 sm:p-3.5" : "p-4 sm:p-5", className)}>
      {(title || subtitle) && (
        <header className={compact ? "mb-3" : "mb-4"}>
          {title ? <h2 className={cx("font-semibold text-[var(--text)]", compact ? "text-lg" : "text-xl")}>{title}</h2> : null}
          {subtitle ? <p className={cx("mt-1 text-[var(--muted)]", compact ? "text-xs leading-5" : "text-sm")}>{subtitle}</p> : null}
        </header>
      )}
      {children}
    </section>
  );
}

function TableSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("kit-surface overflow-hidden border border-[var(--line)] bg-white/82", className)}>{children}</div>;
}

function TableHeaderRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("hidden bg-[var(--green-soft)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] md:grid", className)}>{children}</div>;
}

function TableBodyRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative px-4 py-3 before:absolute before:left-4 before:right-4 before:top-0 before:border-t before:border-[color:rgba(216,154,54,0.65)] first:before:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

function StatTable({
  rows,
  compact = false,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
  compact?: boolean;
}) {
  return (
    <TableSurface>
      {rows.map((row) => (
        <TableBodyRow key={row.label} className={cx("grid grid-cols-[1.2fr_0.9fr] items-center gap-3", compact ? "px-3 py-2.5" : "")}>
          <p className={cx("uppercase tracking-[0.22em] text-[var(--muted)]", compact ? "text-[10px]" : "text-[11px]")}>{row.label}</p>
          <p className="text-right text-[24px] font-bold leading-none">{row.value}</p>
        </TableBodyRow>
      ))}
    </TableSurface>
  );
}

function ProficiencyBubble({
  filled,
}: {
  filled: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "kit-bubble inline-flex h-4 w-4 items-center justify-center border border-[var(--line)]",
        filled ? "bg-[var(--brass)] shadow-[0_0_0_1px_rgba(240,176,67,0.18)]" : "bg-transparent",
      )}
    />
  );
}

function AbilitySaveTable({
  rows,
}: {
  rows: Array<{
    keyLabel: string;
    abilityProficient: boolean;
    modifier: number;
    score: number;
    saveModifier: number;
    saveProficient: boolean;
  }>;
}) {
  return (
    <TableSurface>
      <div className="hidden grid-cols-[0.35fr_1.2fr_0.36fr_0.3fr_0.28fr_0.68fr_0.12fr] gap-4 bg-[var(--green-soft)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] md:grid">
        <span className="text-center">Prof</span>
        <span>Ability</span>
        <span className="text-right">Mod</span>
        <span className="text-right">Score</span>
        <span className="justify-self-center">|</span>
        <span className="text-right">Save Mod</span>
        <span className="text-center">Prof</span>
      </div>
      {rows.map((row) => (
        <TableBodyRow
          key={row.keyLabel}
          className="grid grid-cols-[auto_1fr_0.8fr] gap-x-3 gap-y-2 text-sm md:grid-cols-[0.35fr_1.2fr_0.36fr_0.3fr_0.28fr_0.68fr_0.12fr] md:gap-x-4 md:items-center"
        >
          <span className="flex items-center justify-center">
            <ProficiencyBubble filled={row.abilityProficient} />
          </span>
          <p className="font-semibold uppercase tracking-[0.12em] md:tracking-[0.16em]">{row.keyLabel}</p>
          <p className="text-right text-[24px] font-bold leading-none">{formatSigned(row.modifier)}</p>
          <p className="col-start-2 text-sm text-[var(--muted)] md:col-auto md:text-right md:text-base">{row.score}</p>
          <span className="hidden h-full w-px justify-self-center bg-[color:rgba(216,154,54,0.65)] md:block" />
          <p className="text-right text-[24px] font-bold leading-none">{formatSigned(row.saveModifier)}</p>
          <span className="flex items-center justify-center">
            <ProficiencyBubble filled={row.saveProficient} />
          </span>
        </TableBodyRow>
      ))}
    </TableSurface>
  );
}

function SkillsTable({
  rows,
}: {
  rows: Array<{
    abilityLabel: string;
    skillLabel: string;
    proficient: boolean;
    bonus: number;
  }>;
}) {
  return (
    <TableSurface>
      <TableHeaderRow className="grid-cols-[0.35fr_0.6fr_1.35fr_0.7fr] gap-3">
        <span className="text-center">Prof</span>
        <span>Mod</span>
        <span>Skill</span>
        <span className="text-right">Bonus</span>
      </TableHeaderRow>
      {rows.map((row) => (
        <TableBodyRow key={row.skillLabel} className="grid grid-cols-[auto_0.7fr_1fr_0.8fr] gap-x-3 gap-y-2 text-sm md:grid-cols-[0.35fr_0.6fr_1.35fr_0.7fr] md:items-center">
          <span className="flex items-center justify-center">
            <ProficiencyBubble filled={row.proficient} />
          </span>
          <p className="font-semibold uppercase tracking-[0.12em] text-[var(--muted)] md:tracking-[0.16em]">{row.abilityLabel}</p>
          <p className="font-semibold">{row.skillLabel}</p>
          <p className="text-right text-[24px] font-bold leading-none">{formatSigned(row.bonus)}</p>
        </TableBodyRow>
      ))}
    </TableSurface>
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
    <div className="kit-frame border border-[var(--line)] bg-white/82 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">{label}</p>
      <div className="mt-3 flex items-end gap-3">
        <input
          aria-label={label}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="kit-control min-w-0 border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-center text-4xl font-bold outline-none transition focus:border-[var(--green)]"
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
  compact = false,
}: {
  fieldKey: string;
  label: string;
  initialValue: number;
  denominator?: string;
  onCommit: (value: string) => void;
  compact?: boolean;
}) {
  const [value, setValue] = useState(String(initialValue));

  return (
    <div className={cx("grid grid-cols-[1.1fr_1fr] items-center gap-3 border-t border-[var(--line)] first:border-t-0", compact ? "px-3 py-2.5" : "px-4 py-3")}>
      <p className={cx("uppercase tracking-[0.22em] text-[var(--muted)]", compact ? "text-[10px]" : "text-[11px]")}>{label}</p>
      <div className={cx("justify-self-end", denominator ? "flex w-full items-center justify-end gap-2" : "flex items-center justify-end")}>
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
          className={cx("kit-control border border-[var(--line)] bg-[var(--panel-strong)] text-right font-bold outline-none transition focus:border-[var(--green)]", compact ? "w-[4.5rem] px-2.5 py-1.5 text-lg" : "w-24 px-3 py-2 text-xl")}
        />
        {denominator ? <span className={cx("shrink-0 text-left font-semibold leading-none text-[var(--muted)]", compact ? "text-xs" : "text-sm")}>/ {denominator}</span> : null}
      </div>
    </div>
  );
}

function buildPrimaryStatRows(character: CharacterData) {
  return [
    { label: "AC", value: character.stats.ac },
    { label: "Initiative", value: character.stats.initiative },
    { label: "Spell Save DC", value: character.stats.spellSaveDc },
    { label: "Spell Attack", value: character.stats.spellAttackBonus },
    { label: "Speed", value: character.stats.speed },
    { label: "Intelligence Modifier", value: character.stats.intelligenceModifier },
    { label: "Proficiency Bonus", value: character.stats.proficiencyBonus },
    { label: "Darkvision", value: character.stats.darkvision },
  ];
}

function VitalTrackerCard({
  character,
  onCommitHp,
}: {
  character: CharacterData;
  onCommitHp: (field: "currentHp" | "tempHp", raw: string) => void;
}) {
  return (
    <ShellCard title="Vital Tracker" compact className="bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,242,233,0.88))]">
      <TableSurface className="rounded-[20px]">
        <TableBodyRow className="grid grid-cols-[1.1fr_1fr] items-center gap-3 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Max HP</p>
          <p className="text-right text-[24px] font-bold leading-none">{character.stats.maxHp}</p>
        </TableBodyRow>
        <EditableNumberRow fieldKey={`current-row-${character.stats.currentHp}`} label="Current HP" initialValue={character.stats.currentHp} denominator={String(character.stats.maxHp)} onCommit={(value) => onCommitHp("currentHp", value)} compact />
        <EditableNumberRow fieldKey={`temp-row-${character.stats.tempHp}`} label="Temp HP" initialValue={character.stats.tempHp} onCommit={(value) => onCommitHp("tempHp", value)} compact />
      </TableSurface>
    </ShellCard>
  );
}

function RightRail({
  character,
  onCommitHp,
  className,
}: {
  character: CharacterData;
  onCommitHp: (field: "currentHp" | "tempHp", raw: string) => void;
  className?: string;
}) {
  return (
    <div className={cx("space-y-3 lg:flex lg:h-[calc(100vh-1rem)] lg:flex-col lg:overflow-hidden", className)}>
      <VitalTrackerCard character={character} onCommitHp={onCommitHp} />
      <ShellCard title="Field Snapshot" subtitle="Shared combat stats stay visible while the center column scrolls." compact className="lg:min-h-0 lg:flex-1">
        <StatTable rows={buildPrimaryStatRows(character)} compact />
      </ShellCard>
    </div>
  );
}

function matchesPreparedFilter(spell: Spell, filter: string) {
  if (filter === "Prepared") return spell.prepared;
  if (filter === "Not prepared") return !spell.prepared;
  return true;
}

function getCastingTime(spell: Spell) {
  if (spell.castingTime) return spell.castingTime;
  const override = SPELL_DISPLAY_OVERRIDES[spell.id];
  if (override?.castingTime) return override.castingTime;
  if (spell.actionType === "action") return "1 Action";
  if (spell.actionType === "bonus") return "1 Bonus Action";
  if (spell.actionType === "reaction") return "1 Reaction";
  return "Utility";
}

function getHitDc(spell: Spell) {
  if (spell.hitDc) return spell.hitDc;
  const override = SPELL_DISPLAY_OVERRIDES[spell.id];
  if (override?.hitDc) return override.hitDc;
  const match = spell.saveOrAttack.match(/^([A-Za-z]+)\s+save\s+(\d+)$/i);
  if (match) return `${match[1].slice(0, 3).toUpperCase()} ${match[2]}`;
  const attackMatch = spell.saveOrAttack.match(/^([+-]\d+)\s+attack$/i);
  if (attackMatch) return `${attackMatch[1]} to hit`;
  return "—";
}

function getEffectText(spell: Spell) {
  if (spell.effectText) return spell.effectText;
  const override = SPELL_DISPLAY_OVERRIDES[spell.id];
  if (override?.effectText) return override.effectText;
  return spell.summary;
}

function getEffectIcon(spell: Spell) {
  if (spell.tags.includes("healing")) return "❤";
  if (spell.tags.includes("poison")) return "☠";
  if (spell.tags.includes("acid")) return "🧪";
  if (spell.tags.includes("fire")) return "🔥";
  if (spell.tags.includes("damage")) return "✦";
  if (spell.tags.includes("control")) return "◎";
  if (spell.tags.includes("escape") || spell.tags.includes("mobility")) return "➜";
  if (spell.tags.includes("support")) return "✚";
  return "•";
}

function getAreaOfEffect(spell: Spell) {
  if (spell.areaOfEffect) return spell.areaOfEffect;
  const override = SPELL_DISPLAY_OVERRIDES[spell.id];
  if (override?.areaOfEffect) return override.areaOfEffect;
  const selfAreaMatch = spell.range.match(/^Self \((.+)\)$/i);
  if (selfAreaMatch) return selfAreaMatch[1];
  return "—";
}

function getComponents(spell: Spell) {
  if (spell.components) return spell.components;
  const override = SPELL_DISPLAY_OVERRIDES[spell.id];
  if (override?.components) return override.components;
  return "—";
}

function SpellSlotTracker({
  current,
  max,
  onChange,
}: {
  current: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const used = Math.max(0, max - current);

  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: max }, (_, index) => {
        const checked = index < used;
        return (
          <button
            key={index}
            type="button"
            onClick={() => {
              if (checked) {
                onChange(Math.min(max, current + 1));
              } else {
                onChange(Math.max(0, current - 1));
              }
            }}
            className={cx(
              "flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-semibold transition",
              checked ? "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green)]" : "border-[var(--line)] bg-white text-[var(--muted)]",
            )}
            aria-label={`Spell slot ${index + 1} ${checked ? "spent" : "available"}`}
          >
            {checked ? "X" : ""}
          </button>
        );
      })}
    </div>
  );
}

function SpellLevelSection({
  title,
  spells,
  slotCurrent,
  slotMax,
  onTogglePrepared,
  onSlotChange,
  editing = false,
  onUpdateSpell,
  onDeleteSpell,
  showSlotTracker = true,
}: {
  title: string;
  spells: Spell[];
  slotCurrent?: number;
  slotMax?: number;
  onTogglePrepared: (spellId: string) => void;
  onSlotChange?: (next: number) => void;
  editing?: boolean;
  onUpdateSpell?: (spellId: string, field: keyof Spell, value: string | number | boolean) => void;
  onDeleteSpell?: (spellId: string) => void;
  showSlotTracker?: boolean;
}) {
  return (
    <ShellCard title={title} subtitle={showSlotTracker && slotMax ? `${slotCurrent}/${slotMax} slots left` : undefined}>
      {showSlotTracker && slotMax && onSlotChange ? (
        <div className="mb-4">
          <SpellSlotTracker current={slotCurrent ?? 0} max={slotMax} onChange={onSlotChange} />
        </div>
      ) : null}
      <TableSurface className="rounded-[20px]">
        {spells.length === 0 ? (
          <div className="px-4 py-4 text-sm text-[var(--muted)]">No spells in this section.</div>
        ) : (
          spells.map((spell) => (
            <TableBodyRow key={spell.id} className="grid gap-3 md:grid-cols-[0.85fr_2fr_0.7fr] md:items-start md:gap-4">
              {editing && onUpdateSpell ? (
                <>
                  <div className="space-y-3">
                    <TextInput label="Name" value={spell.name} onChange={(value) => onUpdateSpell(spell.id, "name", value)} />
                    <TextInput label="Casting Time" value={spell.castingTime ?? getCastingTime(spell)} onChange={(value) => onUpdateSpell(spell.id, "castingTime", value)} />
                    <TextInput label="Range" value={spell.range} onChange={(value) => onUpdateSpell(spell.id, "range", value)} />
                    <TextInput label="Hit / DC" value={spell.hitDc ?? getHitDc(spell)} onChange={(value) => onUpdateSpell(spell.id, "hitDc", value)} />
                    <TextInput label="Components" value={spell.components ?? getComponents(spell)} onChange={(value) => onUpdateSpell(spell.id, "components", value)} />
                    <TextInput label="Area of Effect" value={spell.areaOfEffect ?? getAreaOfEffect(spell)} onChange={(value) => onUpdateSpell(spell.id, "areaOfEffect", value)} />
                  </div>
                  <div className="space-y-3">
                    <TextInput label="Level" type="number" value={spell.level} onChange={(value) => onUpdateSpell(spell.id, "level", numberValue(value))} />
                    <TextInput label="Action Type" value={spell.actionType} onChange={(value) => onUpdateSpell(spell.id, "actionType", value)} />
                    <TextArea label="Effect" value={spell.effectText ?? getEffectText(spell)} onChange={(value) => onUpdateSpell(spell.id, "effectText", value)} rows={5} />
                    <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <input type="checkbox" checked={spell.alwaysPrepared ?? false} onChange={(event) => onUpdateSpell(spell.id, "alwaysPrepared", event.target.checked)} />
                      Always prepared
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <input type="checkbox" checked={spell.concentration} onChange={(event) => onUpdateSpell(spell.id, "concentration", event.target.checked)} />
                      Concentration
                    </label>
                  </div>
                  <div className="flex flex-col gap-2 md:justify-self-end">
                    <button
                      type="button"
                      disabled={spell.alwaysPrepared}
                      onClick={() => onTogglePrepared(spell.id)}
                      className={cx(
                        "min-h-10 rounded-xl border px-4 text-sm",
                        spell.alwaysPrepared
                          ? "cursor-not-allowed border-[var(--line)] bg-[var(--panel-strong)] text-[var(--muted)]"
                          : "border-[var(--line)] bg-white text-[var(--text)]",
                      )}
                    >
                      {spell.alwaysPrepared ? "Always Prepared" : spell.prepared ? "Prepared" : "Unprepared"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSpell?.(spell.id)}
                      className="flex min-h-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 text-[var(--red)]"
                      aria-label={`Delete ${spell.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold">{spell.name}</h3>
                    <div className="mt-2 grid gap-1 text-sm text-[var(--muted)]">
                      <p><span className="font-medium text-[var(--text)]">Casting Time:</span> {getCastingTime(spell)}</p>
                      <p><span className="font-medium text-[var(--text)]">Range:</span> {spell.range}</p>
                      <p><span className="font-medium text-[var(--text)]">Hit / DC:</span> {getHitDc(spell)}</p>
                      <p><span className="font-medium text-[var(--text)]">Components:</span> {getComponents(spell)}</p>
                      <p><span className="font-medium text-[var(--text)]">Area:</span> {getAreaOfEffect(spell)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm leading-6 text-[var(--muted)]">
                      <span className="mr-2 font-semibold text-[var(--text)]">{getEffectIcon(spell)}</span>
                      <span><span className="font-medium text-[var(--text)]">Effect:</span> {getEffectText(spell)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 md:justify-self-end">
                    <button
                      type="button"
                      disabled={spell.alwaysPrepared}
                      onClick={() => onTogglePrepared(spell.id)}
                      className={cx(
                        "min-h-10 rounded-xl border px-4 text-sm",
                        spell.alwaysPrepared
                          ? "cursor-not-allowed border-[var(--line)] bg-[var(--panel-strong)] text-[var(--muted)]"
                          : "border-[var(--line)] bg-white text-[var(--text)]",
                      )}
                    >
                      {spell.alwaysPrepared ? "Always Prepared" : spell.prepared ? "Prepared" : "Unprepared"}
                    </button>
                  </div>
                </>
              )}
            </TableBodyRow>
          ))
        )}
      </TableSurface>
    </ShellCard>
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

type CombatSpellRowData = {
  id: string;
  name: string;
  castingTime: string;
  range: string;
  hitDc: string;
  effect: string;
  cost: string;
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
      <TableSurface className="bg-transparent">
        <TableHeaderRow className="grid-cols-[1.1fr_0.8fr_1.6fr_0.8fr_0.5fr] gap-3">
          <span>Name</span>
          <span>Type / Trigger</span>
          <span>Summary</span>
          <span>Cost</span>
          <span className="text-right">Use</span>
        </TableHeaderRow>
        {rows.map((row) => (
          <TableBodyRow
            key={row.id}
            className="bg-white/82 transition hover:bg-[var(--panel-strong)] active:bg-[var(--green-soft)]"
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
                    "kit-action-button min-h-10 rounded-xl transition",
                    row.disabled
                      ? "cursor-not-allowed opacity-70"
                      : feedback[row.id]
                        ? "brightness-110"
                        : "",
                  )}
                >
                  {feedback[row.id] ?? "Use"}
                </button>
              </div>
            </div>
          </TableBodyRow>
        ))}
      </TableSurface>
    </ShellCard>
  );
}

function CombatSpellTable({
  title,
  rows,
  feedback,
  onCast,
  slotCurrent,
  slotMax,
  onSlotChange,
}: {
  title: string;
  rows: CombatSpellRowData[];
  feedback: Record<string, string>;
  onCast: (spellId: string) => void;
  slotCurrent?: number;
  slotMax?: number;
  onSlotChange?: (next: number) => void;
}) {
  return (
    <ShellCard title={title} subtitle={slotMax ? `${slotCurrent}/${slotMax} slots left` : "No spell slots required."}>
      {slotMax && onSlotChange ? (
        <div className="mb-4">
          <SpellSlotTracker current={slotCurrent ?? 0} max={slotMax} onChange={onSlotChange} />
        </div>
      ) : null}
      <TableSurface className="bg-transparent">
        <TableHeaderRow className="grid-cols-[1fr_0.8fr_0.75fr_0.8fr_1.5fr_0.55fr_0.45fr] gap-3">
          <span>Name</span>
          <span>Casting</span>
          <span>Range</span>
          <span>Hit / DC</span>
          <span>Effect</span>
          <span>Cost</span>
          <span className="text-right">Cast</span>
        </TableHeaderRow>
        {rows.map((row) => (
          <TableBodyRow key={row.id} className="bg-white/82 transition hover:bg-[var(--panel-strong)] active:bg-[var(--green-soft)]">
            <div className="grid gap-2 md:grid-cols-[1fr_0.8fr_0.75fr_0.8fr_1.5fr_0.55fr_0.45fr] md:items-center md:gap-3">
              <p className="font-semibold">{row.name}</p>
              <p className="text-sm text-[var(--muted)]">{row.castingTime}</p>
              <p className="text-sm text-[var(--muted)]">{row.range}</p>
              <p className="text-sm text-[var(--muted)]">{row.hitDc}</p>
              <p className="text-sm leading-6 text-[var(--muted)]">{row.effect}</p>
              <p className="text-sm text-[var(--muted)]">{row.cost}</p>
              <div className="md:text-right">
                <button
                  type="button"
                  onClick={() => onCast(row.id)}
                  className={cx(
                    "kit-action-button min-h-10 rounded-xl transition",
                    feedback[`spell-${row.id}`] ? "brightness-110" : "",
                  )}
                >
                  {feedback[`spell-${row.id}`] ?? "Cast"}
                </button>
              </div>
            </div>
          </TableBodyRow>
        ))}
      </TableSurface>
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
        className="kit-control min-h-11 border border-[var(--line)] bg-white px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--green)]"
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
        className="kit-control border border-[var(--line)] bg-white px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--green)]"
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
  const [spellEditMode, setSpellEditMode] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [sessionNote, setSessionNote] = useState("");
  const lastSavedRef = useRef("");
  const hydratedRef = useRef(false);
  const writeTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const { feedback, pulse } = useTemporaryFeedback();

  const activeInfusions = useMemo(() => character.infusionsActive.filter((item) => item.active), [character.infusionsActive]);
  const pinnedReminders = useMemo(() => character.reminders.filter((item) => item.pinned), [character.reminders]);
  const regularPreparedSpells = useMemo(
    () => character.spells.filter((spell) => spell.prepared && !spell.alwaysPrepared),
    [character.spells],
  );
  const visibleSpells = useMemo(
    () => (spellEditMode ? character.spells : character.spells.filter((spell) => matchesPreparedFilter(spell, character.ui.spellFilter))),
    [character.spells, character.ui.spellFilter, spellEditMode],
  );
  const cantrips = useMemo(() => visibleSpells.filter((spell) => spell.level === 0), [visibleSpells]);
  const firstLevelSpells = useMemo(() => visibleSpells.filter((spell) => spell.level === 1), [visibleSpells]);
  const secondLevelSpells = useMemo(() => visibleSpells.filter((spell) => spell.level === 2), [visibleSpells]);
  const currentPreparationId = character.longRest.currentPreparationId;
  const proficiencyBonusValue = Number(character.stats.proficiencyBonus) || 0;
  const skillRows = useMemo(
    () =>
      SKILL_DEFINITIONS.map((skill) => ({
        abilityLabel: skill.ability.slice(0, 3).toUpperCase(),
        skillLabel: skill.label,
        proficient: skill.proficient,
        bonus: character.abilities[skill.ability].modifier + (skill.proficient ? proficiencyBonusValue : 0),
      })),
    [character.abilities, proficiencyBonusValue],
  );
  const preparedCombatSpells = useMemo(
    () =>
      character.spells
        .filter((spell) => spell.prepared)
        .map((spell) => ({
          id: spell.id,
          name: spell.name,
          castingTime: getCastingTime(spell),
          range: spell.range,
          hitDc: getHitDc(spell),
          effect: getEffectText(spell),
          cost: spell.level === 0 ? "Cantrip" : `Lv ${spell.level}`,
        })),
    [character.spells],
  );
  const combatCantrips = useMemo(() => preparedCombatSpells.filter((spell) => spell.cost === "Cantrip"), [preparedCombatSpells]);
  const combatFirstLevelSpells = useMemo(() => preparedCombatSpells.filter((spell) => spell.cost === "Lv 1"), [preparedCombatSpells]);
  const combatSecondLevelSpells = useMemo(() => preparedCombatSpells.filter((spell) => spell.cost === "Lv 2"), [preparedCombatSpells]);
  const currentRestElixirs = useMemo(
    () => character.elixirs.filter((item) => item.source === "long-rest" && item.createdDuringRestId === currentPreparationId),
    [character.elixirs, currentPreparationId],
  );
  const expiringElixirs = useMemo(
    () => character.elixirs.filter((item) => item.expiresOnLongRest && item.createdDuringRestId && item.createdDuringRestId !== currentPreparationId),
    [character.elixirs, currentPreparationId],
  );
  const additionalElixirs = useMemo(() => character.elixirs.filter((item) => item.source !== "long-rest"), [character.elixirs]);
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

  function updateSpellSlotResource(resourceId: string, nextCurrent: number) {
    const resource = character.resources.find((item) => item.id === resourceId);
    if (!resource) return;
    const next = Math.max(0, Math.min(resource.max, nextCurrent));
    if (next === resource.current) return;

    commit(`Updated ${resource.name}`, (draft) => {
      const target = draft.resources.find((item) => item.id === resourceId);
      if (!target) return;
      const previous = target.current;
      target.current = next;
      addLog(draft, `${resource.name} changed from ${previous}/${resource.max} to ${next}/${resource.max}.`);
    });
    showToast(`${resource.name} updated to ${next}/${resource.max}.`);
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

  function updateSpellField(spellId: string, field: keyof Spell, value: string | number | boolean) {
    commit("Updated spell", (draft) => {
      const spell = draft.spells.find((item) => item.id === spellId);
      if (!spell) return;

      switch (field) {
        case "name":
        case "range":
        case "castingTime":
        case "hitDc":
        case "effectText":
        case "components":
        case "areaOfEffect":
          spell[field] = String(value);
          break;
        case "level":
          spell.level = Number(value);
          break;
        case "actionType":
          spell.actionType = String(value) as Spell["actionType"];
          break;
        case "alwaysPrepared":
          spell.alwaysPrepared = Boolean(value);
          break;
        case "concentration":
          spell.concentration = Boolean(value);
          break;
        default:
          break;
      }

      if (field === "alwaysPrepared" && value === true) {
        spell.prepared = true;
      }
    });
  }

  function addSpell(level: number) {
    commit("Added spell", (draft) => {
      draft.spells.push({
        id: crypto.randomUUID(),
        name: "New Spell",
        level,
        prepared: false,
        actionType: "action",
        range: "Self",
        concentration: false,
        saveOrAttack: "",
        summary: "",
        tags: [],
        castingTime: "1 Action",
        hitDc: "—",
        effectText: "",
        components: "V, S",
        areaOfEffect: "—",
      });
    });
    showToast("Spell added.");
  }

  function deleteSpell(spellId: string) {
    const target = character.spells.find((spell) => spell.id === spellId);
    if (!target) return;
    commit("Deleted spell", (draft) => {
      draft.spells = draft.spells.filter((spell) => spell.id !== spellId);
    });
    showToast(`${target.name} deleted.`);
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
      <div className="mx-auto grid max-w-[1440px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)_280px] lg:items-start">
        <aside className="hidden lg:block lg:self-start lg:sticky lg:top-4">
          <div className="space-y-4">
            <ShellCard>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--green-soft)] text-[var(--green)]">
                  <FlaskConical className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-3xl leading-none">{character.core.name.toUpperCase()}</h1>
                  <p className="mt-1 text-sm uppercase tracking-[0.14em] text-[var(--muted)]">
                    Level {character.core.level} {character.core.species} {character.core.subclass} {character.core.className}
                  </p>
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

        <section className="min-w-0 space-y-4">
          {character.ui.activeView === "dashboard" ? (
            <div className="space-y-4">
              <ShellCard title="Ability Scores & Saves" subtitle="Core numbers and saving throw proficiency are paired in one reference table.">
                <AbilitySaveTable
                  rows={ABILITY_ORDER.map((ability) => ({
                    keyLabel: ability.slice(0, 3).toUpperCase(),
                    abilityProficient: false,
                    modifier: character.abilities[ability].modifier,
                    score: character.abilities[ability].score,
                    saveModifier: character.savingThrows[ability].value,
                    saveProficient: character.savingThrows[ability].proficient,
                  }))}
                />
                <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                  <p><span className="font-semibold text-[var(--text)]">Fey Ancestry:</span> Advantage on charm saves, plus 2 Misty Step charges and 1 Heroism charge each long rest.</p>
                  <p><span className="font-semibold text-[var(--text)]">Tool Expertise:</span> Double proficiency bonus for ability checks using a tool Brek is proficient with.</p>
                  <p><span className="font-semibold text-[var(--text)]">Tool proficiency contribution:</span> +6 before the relevant ability modifier.</p>
                </div>
              </ShellCard>

              <ShellCard title="Skills" subtitle="Skill bonuses are grouped by governing ability, with proficiency bubbles shown on the left.">
                <SkillsTable rows={skillRows} />
              </ShellCard>

              <ShellCard title="Quick Resource Strip" subtitle="Spend and restore counters with immediate feedback instead of hunting through the log.">
                <TableSurface>
                  <TableHeaderRow className="grid-cols-[1.2fr_0.55fr_0.65fr_0.9fr_0.8fr] gap-3">
                    <span>Resource</span>
                    <span className="text-right">Current</span>
                    <span className="text-right">Max</span>
                    <span>Reset</span>
                    <span className="text-right">Actions</span>
                  </TableHeaderRow>
                  {character.resources.map((resource) => (
                    <TableBodyRow key={resource.id} className="grid gap-2 md:grid-cols-[1.2fr_0.55fr_0.65fr_0.9fr_0.8fr] md:items-center md:gap-3">
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
                    </TableBodyRow>
                  ))}
                </TableSurface>
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
              <ActionTable
                title="Weapons"
                rows={character.attacks.map((attack) => ({
                  id: attack.id,
                  name: attack.name,
                  typeOrTrigger: "Weapon",
                  summary: `${attack.attackBonus} to hit, ${attack.damage} ${attack.damageType}, ${attack.range}`,
                  cost: "—",
                  details: attack.traits.join(", "),
                }))}
                feedback={feedback}
                onUse={(row) => handleActionRowUse(row, "action")}
              />
              <CombatSpellTable title="Cantrips" rows={combatCantrips} feedback={feedback} onCast={(spellId) => {
                const spell = character.spells.find((item) => item.id === spellId);
                if (spell) castSpell(spell);
              }} />
              <CombatSpellTable
                title="Level 1 Spells"
                rows={combatFirstLevelSpells}
                slotCurrent={character.resources.find((item) => item.id === "slot1")?.current ?? 0}
                slotMax={character.resources.find((item) => item.id === "slot1")?.max ?? 0}
                onSlotChange={(next) => updateSpellSlotResource("slot1", next)}
                feedback={feedback}
                onCast={(spellId) => {
                  const spell = character.spells.find((item) => item.id === spellId);
                  if (spell) castSpell(spell);
                }}
              />
              <CombatSpellTable
                title="Level 2 Spells"
                rows={combatSecondLevelSpells}
                slotCurrent={character.resources.find((item) => item.id === "slot2")?.current ?? 0}
                slotMax={character.resources.find((item) => item.id === "slot2")?.max ?? 0}
                onSlotChange={(next) => updateSpellSlotResource("slot2", next)}
                feedback={feedback}
                onCast={(spellId) => {
                  const spell = character.spells.find((item) => item.id === spellId);
                  if (spell) castSpell(spell);
                }}
              />
              <ActionTable title="Actions" rows={buildActionRows("action")} feedback={feedback} onUse={(row) => handleActionRowUse(row, "action")} />
              <ActionTable title="Bonus Actions" rows={buildActionRows("bonus")} feedback={feedback} onUse={(row) => handleActionRowUse(row, "bonus")} />
              <ActionTable title="Reactions" rows={buildActionRows("reaction")} feedback={feedback} onUse={(row) => handleActionRowUse(row, "reaction")} />
            </div>
          ) : null}

          {character.ui.activeView === "spells" ? (
            <div className="space-y-4">
              <ShellCard title="Spells Controls" compact>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSpellEditMode((current) => !current)}
                    className={cx(
                      "flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm",
                      spellEditMode ? "bg-[var(--green)] text-white" : "border border-[var(--line)] bg-white text-[var(--text)]",
                    )}
                  >
                    <Pencil className="h-4 w-4" />
                    {spellEditMode ? "Done Editing" : "Edit Spells"}
                  </button>
                  {spellEditMode ? (
                    <>
                      <button type="button" onClick={() => addSpell(0)} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm">
                        <Plus className="h-4 w-4" />
                        Add Cantrip
                      </button>
                      <button type="button" onClick={() => addSpell(1)} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm">
                        <Plus className="h-4 w-4" />
                        Add Level 1
                      </button>
                      <button type="button" onClick={() => addSpell(2)} className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm">
                        <Plus className="h-4 w-4" />
                        Add Level 2
                      </button>
                    </>
                  ) : null}
                  {!spellEditMode
                    ? ["Prepared", "Not prepared", "All"].map((filter) => (
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
                            "min-h-10 rounded-full px-4 text-sm transition",
                            character.ui.spellFilter === filter ? "bg-[var(--green)] text-white" : "border border-[var(--line)] bg-white/80 text-[var(--text)]",
                          )}
                        >
                          {filter}
                        </button>
                      ))
                    : null}
                </div>
              </ShellCard>
              <SpellLevelSection title="Cantrips" spells={cantrips} onTogglePrepared={togglePrepared} editing={spellEditMode} onUpdateSpell={updateSpellField} onDeleteSpell={deleteSpell} showSlotTracker={false} />
              <SpellLevelSection
                title="Level 1 Spells"
                spells={firstLevelSpells}
                slotCurrent={character.resources.find((item) => item.id === "slot1")?.current ?? 0}
                slotMax={character.resources.find((item) => item.id === "slot1")?.max ?? 0}
                onTogglePrepared={togglePrepared}
                onSlotChange={(next) => updateSpellSlotResource("slot1", next)}
                editing={spellEditMode}
                onUpdateSpell={updateSpellField}
                onDeleteSpell={deleteSpell}
                showSlotTracker={false}
              />
              <SpellLevelSection
                title="Level 2 Spells"
                spells={secondLevelSpells}
                slotCurrent={character.resources.find((item) => item.id === "slot2")?.current ?? 0}
                slotMax={character.resources.find((item) => item.id === "slot2")?.max ?? 0}
                onTogglePrepared={togglePrepared}
                onSlotChange={(next) => updateSpellSlotResource("slot2", next)}
                editing={spellEditMode}
                onUpdateSpell={updateSpellField}
                onDeleteSpell={deleteSpell}
                showSlotTracker={false}
              />
            </div>
          ) : null}

          {/* {character.ui.activeView === "veech" ? (
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
          ) : null} */}

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

              <ShellCard title="Experimental Elixirs" subtitle="All active vials live in Rest alongside long-rest prep and additional elixir tracking.">
                <div className="space-y-4">
                  <TableSurface className="rounded-[20px]">
                    <div className="px-4 py-3 text-sm font-semibold text-[var(--text)]">Long-rest elixirs</div>
                    {currentRestElixirs.length === 0 ? (
                      <div className="border-t border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]">No long-rest elixirs created for this rest yet.</div>
                    ) : (
                      currentRestElixirs.map((elixir) => (
                        <TableBodyRow key={elixir.id} className="grid gap-2 md:grid-cols-[0.8fr_1.7fr_0.8fr_0.75fr] md:items-start md:gap-3">
                          <div>
                            <h3 className="font-semibold">{elixir.name}</h3>
                            <p className="text-sm text-[var(--muted)]">Holder: {elixir.holder}</p>
                          </div>
                          <div>
                            <p className="text-sm text-[var(--muted)]">{elixir.effect}</p>
                            <p className="mt-1 text-sm text-[var(--muted)]">{elixir.duration}</p>
                          </div>
                          <p className="text-sm text-[var(--muted)]">{elixir.source ?? "long-rest"}</p>
                          <button type="button" onClick={() => toggleConsumeElixir(elixir.id)} className="min-h-10 rounded-xl border border-[var(--line)] px-4 text-sm md:justify-self-end">
                            {feedback[`elixir-${elixir.id}`] ?? (elixir.consumed ? "Mark Unused" : "Consume")}
                          </button>
                        </TableBodyRow>
                      ))
                    )}
                  </TableSurface>

                  <TableSurface className="rounded-[20px]">
                    <div className="px-4 py-3 text-sm font-semibold text-[var(--text)]">Additional and inventory elixirs</div>
                    {additionalElixirs.length === 0 ? (
                      <div className="border-t border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]">No additional or carried elixirs available.</div>
                    ) : (
                      additionalElixirs.map((elixir) => (
                        <TableBodyRow key={elixir.id} className="grid gap-2 md:grid-cols-[0.8fr_1.7fr_0.8fr_0.75fr] md:items-start md:gap-3">
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
                        </TableBodyRow>
                      ))
                    )}
                  </TableSurface>
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

              <ShellCard title="Inventory Editing">
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
              </ShellCard>
            </div>
          ) : null}
        </section>

        <aside className="min-w-0 lg:block lg:self-start lg:sticky lg:top-4">
          <div>
            <RightRail character={character} onCommitHp={saveTypedHp} />
          </div>
        </aside>
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
