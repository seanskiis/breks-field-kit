export type NavView =
  | "dashboard"
  | "combat"
  | "spells"
  // | "veech"
  | "exploration"
  | "inventory"
  | "rest"
  | "setup";

export type ResetType = "short-rest" | "long-rest" | "dawn" | "manual" | "none";
export type ActionType = "action" | "bonus" | "reaction" | "passive" | "utility";

export type Resource = {
  id: string;
  name: string;
  current: number;
  max: number;
  resetType: ResetType;
  notes?: string;
};

export type Reminder = {
  id: string;
  title: string;
  summary: string;
  pinned: boolean;
};

export type SavingThrow = {
  value: number;
  proficient: boolean;
};

export type Attack = {
  id: string;
  name: string;
  attackBonus: string;
  damage: string;
  damageType: string;
  range: string;
  traits: string[];
  equipped?: boolean;
};

export type Spell = {
  id: string;
  name: string;
  level: number;
  school?: string;
  prepared: boolean;
  alwaysPrepared?: boolean;
  actionType: ActionType;
  range: string;
  concentration: boolean;
  saveOrAttack: string;
  summary: string;
  tags: string[];
  notes?: string;
  castingTime?: string;
  hitDc?: string;
  effectText?: string;
  components?: string;
  areaOfEffect?: string;
};

export type Elixir = {
  id: string;
  name: string;
  effect: string;
  holder: string;
  consumed: boolean;
  duration: string;
  notes?: string;
  source?: "inventory" | "long-rest" | "additional";
  expiresOnLongRest?: boolean;
  createdDuringRestId?: string;
};

export type Feature = {
  id: string;
  name: string;
  category: ActionType;
  trigger: string;
  effect: string;
  resourceId?: string;
  range?: string;
};

export type ToolEntry = {
  id: string;
  name: string;
  uses: string;
  suggestedAbility: string;
  modifier: string;
  notes?: string;
};

export type Infusion = {
  id: string;
  name: string;
  itemType: string;
  attunement: string;
  summary: string;
  notes?: string;
};

export type ActiveInfusion = {
  id: string;
  infusionName: string;
  itemName: string;
  carrier: string;
  attunedBy: string;
  currentCharges: number;
  maxCharges: number;
  resetType: ResetType;
  notes?: string;
  active: boolean;
};

export type InventoryCategory = {
  id: string;
  name: string;
  items: string[];
};

export type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
};

export type EventLogEntry = {
  id: string;
  timestamp: string;
  text: string;
  sessionLabel: string;
};

export type Companion = {
  name: string;
  creatureType: string;
  ac: number;
  maxHp: number;
  currentHp: number;
  speed: string;
  flySpeed: string;
  forceStrike: string;
  notes: string[];
};

export type CharacterData = {
  id: string;
  core: {
    name: string;
    className: string;
    subclass: string;
    level: number;
    species: string;
    background: string;
    alignment: string;
    avatarUrl?: string;
  };
  abilities: Record<string, { score: number; modifier: number }>;
  stats: {
    ac: number;
    maxHp: number;
    currentHp: number;
    tempHp: number;
    speed: string;
    initiative: string;
    spellSaveDc: number;
    spellAttackBonus: string;
    intelligenceModifier: string;
    proficiencyBonus: string;
    darkvision: string;
    languages: string[];
  };
  savingThrows: Record<string, SavingThrow>;
  resources: Resource[];
  reminders: Reminder[];
  decisionPrompts: {
    beforeActing: string[];
    whenRollHappens: string[];
    expanded: boolean;
  };
  attacks: Attack[];
  spells: Spell[];
  elixirs: Elixir[];
  features: Feature[];
  tools: ToolEntry[];
  infusionsKnown: Infusion[];
  infusionsActive: ActiveInfusion[];
  inventory: InventoryCategory[];
  companion: Companion;
  restChecklist: ChecklistItem[];
  longRest: {
    currentPreparationId: string;
    emptyFlasks: number;
    notes: string;
  };
  eventLog: EventLogEntry[];
  currentSessionLabel: string;
  notes: string;
  ui: {
    activeView: NavView;
    spellFilter: string;
  };
};
