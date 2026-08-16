import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  ArrowRightIcon,
  ChatBubbleIcon,
  CheckCircledIcon,
  Crosshair2Icon,
  ExitIcon,
  EyeOpenIcon,
  GlobeIcon,
  HomeIcon,
  ReloadIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import {
  BUILDING_ORDER,
  BUILDINGS,
  TROOPS,
  TROOP_ORDER,
  buildingCost,
  buildingDurationSeconds,
  buildingRequirementProblem,
  canAfford,
  makeCommandEnvelope,
  researchRequirementProblem,
  troopCost,
  troopRequirementProblem,
  troopResearchCost,
  type BuildingType,
  type BattleSessionState,
  type GameCommand,
  type KingdomState,
  type MarchState,
  type ScoutReportState,
  type TroopType,
  type VillageState,
  type WorldState,
} from "../../../packages/game-core/src/index";
import { KeyboardInput, MobileScroll, useKeyboard, useKeyboardInsets } from "../mobile";

type SessionPlayer = { id: string; username: string; kingdomId: string };
type ConstructionJob = {
  id: string;
  villageId: string;
  building: string;
  targetLevel: number;
  startedAt: string;
  completesAt: string;
};
type RecruitmentJob = { id: string; villageId: string; troop: TroopType; quantity: number; startedAt: string; completesAt: string };
type ResearchJob = { id: string; kingdomId: string; villageId: string; troop: TroopType; targetLevel: number; startedAt: string; completesAt: string };
type VillageEconomy = { villageId: string; productionPerHour: { wood: number; stone: number; iron: number }; storageCapacity: number; populationUsed: number; populationCapacity: number };
type KingdomNotification = { id: string; kind: "construction" | "recruitment" | "research"; message: string; createdAt: string };
type WorldChatMessage = {
  id: string;
  playerId: string;
  kingdomId: string;
  username: string;
  kingdomName: string;
  arenaTier: string;
  body: string;
  sentAt: string;
};
type WorldView = "world" | "village" | "army" | "chat";
export type WorldSnapshot = {
  snapshotVersion: number;
  serverTime: string;
  player: SessionPlayer;
  kingdom: KingdomState;
  arena: { tier: string; warVictoryPoints: number };
  world: WorldState;
  villageEconomy: VillageEconomy[];
  constructionJobs: ConstructionJob[];
  recruitmentJobs: RecruitmentJob[];
  researchJobs: ResearchJob[];
  marches: MarchState[];
  scoutReports: ScoutReportState[];
  battleSessions: BattleSessionState[];
  notifications: KingdomNotification[];
  chatMessages: WorldChatMessage[];
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload?.error ?? payload?.payload;
    throw new ApiError(error?.code ?? "REQUEST_FAILED", error?.message ?? "The shared world could not complete that request.", response.status);
  }
  return payload as T;
}

function compactNumber(value: number): string {
  return Math.floor(value).toLocaleString("en-US");
}

function formatRemaining(endsAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes) return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
  return `${remainder}s`;
}

function useSecondClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function QueueClock({ endsAt }: { endsAt: string }) {
  const now = useSecondClock();
  return <strong>{formatRemaining(endsAt, now)}</strong>;
}

function AuthGate({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const keyboard = useKeyboard();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [kingdomName, setKingdomName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    keyboard.hide();
    setSubmitting(true);
    setError("");
    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ username, password, kingdomName }),
      });
      await onAuthenticated();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Unable to enter the world.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobileScroll className="world-auth-scroll">
      <main className="world-auth">
        <div className="world-sigil" aria-hidden="true">KS</div>
        <span className="world-eyebrow">Persistent World 1</span>
        <h1>Claim your kingdom</h1>
        <p>Every ruler occupies a permanent place in Emberfall. Empty kingdoms remain clearly marked AI seats until a player claims them.</p>

        <div className="auth-tabs" role="tablist" aria-label="Account mode">
          <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => setMode("register")}>New ruler</button>
          <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}>Return</button>
        </div>

        <form className="world-auth-form" onSubmit={submit}>
          <label>Ruler name<KeyboardInput value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={24} required /></label>
          {mode === "register" ? (
            <label>Kingdom name<KeyboardInput value={kingdomName} onChange={(event) => setKingdomName(event.target.value)} autoComplete="organization" maxLength={32} required /></label>
          ) : null}
          <label>Password<KeyboardInput type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={8} required /></label>
          {error ? <p className="world-form-error" role="alert">{error}</p> : null}
          <button className="world-primary-button" type="submit" disabled={submitting}>
            {submitting ? "Opening world…" : mode === "register" ? "Claim a kingdom" : "Enter Emberfall"}<ArrowRightIcon aria-hidden="true" />
          </button>
        </form>
      </main>
    </MobileScroll>
  );
}

function WorldMap({ snapshot, selectedId, onSelect }: {
  snapshot: WorldSnapshot;
  selectedId: string;
  onSelect: (villageId: string) => void;
}) {
  const kingdoms = useMemo(() => new Map(snapshot.world.kingdoms.map((kingdom) => [kingdom.id, kingdom])), [snapshot.world.kingdoms]);
  return (
    <section className="shared-world-map" aria-label="50 by 50 persistent world map">
      <div className="map-terrain" aria-hidden="true" />
      {snapshot.world.villages.map((village) => {
        const kingdom = kingdoms.get(village.kingdomId)!;
        const isPlayer = kingdom.id === snapshot.player.kingdomId;
        return (
          <button
            key={village.id}
            type="button"
            className="world-village-marker"
            data-player={isPlayer}
            data-ai={kingdom.seatKind === "ai"}
            data-selected={selectedId === village.id}
            style={{ left: `${((village.x + 0.5) / 50) * 100}%`, top: `${((village.y + 0.5) / 50) * 100}%`, "--kingdom-color": kingdom.color } as CSSProperties}
            onClick={() => onSelect(village.id)}
            aria-label={`${village.name}, ${kingdom.seatKind === "ai" ? "AI kingdom" : kingdom.name}`}
          >
            <i aria-hidden="true" />
            <span>{isPlayer ? "You" : kingdom.seatKind === "ai" ? "AI" : kingdom.name}</span>
          </button>
        );
      })}
      <div className="map-scale">50 × 50 world</div>
    </section>
  );
}

function VillagePanel({ village, kingdom, isOwned, job, economy, onManage, onScout }: {
  village: VillageState;
  kingdom: KingdomState;
  isOwned: boolean;
  job?: ConstructionJob;
  economy?: VillageEconomy;
  onManage: () => void;
  onScout: () => void;
}) {
  return (
    <section className="world-village-panel">
      <div className="village-panel-heading">
        <div><span>{kingdom.seatKind === "ai" ? "AI kingdom" : kingdom.name}</span><h2>{village.name}</h2></div>
        <strong>{village.x}:{village.y}</strong>
      </div>
      {isOwned ? <>
        <div className="resource-strip">
          <span>Wood <strong>{compactNumber(village.resources.wood)}</strong><small>+{economy?.productionPerHour.wood ?? 0}/h</small></span>
          <span>Stone <strong>{compactNumber(village.resources.stone)}</strong><small>+{economy?.productionPerHour.stone ?? 0}/h</small></span>
          <span>Iron <strong>{compactNumber(village.resources.iron)}</strong><small>+{economy?.productionPerHour.iron ?? 0}/h</small></span>
        </div>
        <div className="village-facts">
          <span>Storage <strong>{compactNumber(economy?.storageCapacity ?? 0)}</strong></span>
          <span>Troops <strong>{Object.values(village.army).reduce((total, count) => total + count, 0)}</strong></span>
          <span>People <strong>{economy ? `${economy.populationUsed}/${economy.populationCapacity}` : "—"}</strong></span>
        </div>
      </> : <div className="foreign-intel-hidden"><EyeOpenIcon />Garrison, wall and stored resources hidden until your scout arrives.</div>}
      {isOwned ? (
        job ? (
          <div className="construction-active"><ReloadIcon aria-hidden="true" /><span>{BUILDINGS[job.building as BuildingType].name} → level {job.targetLevel}</span><QueueClock endsAt={job.completesAt} /></div>
        ) : (
          <button className="barracks-upgrade" type="button" onClick={onManage}>
            <span>Enter village</span><small>Build, recruit, research and prepare defenses</small><ArrowRightIcon aria-hidden="true" />
          </button>
        )
      ) : (
        <button className="barracks-upgrade foreign-scout-button" type="button" onClick={onScout}>
          <span>Scout this village</span><small>Send real scouts, inspect the defenses, then plan the march</small><Crosshair2Icon aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

function VillageView({ snapshot, job, onBuild, busy }: { snapshot: WorldSnapshot; job?: ConstructionJob; onBuild: (building: BuildingType) => void; busy: boolean }) {
  const village = snapshot.world.villages.find((candidate) => candidate.id === snapshot.kingdom.capitalVillageId)!;
  const economy = snapshot.villageEconomy.find((entry) => entry.villageId === village.id)!;
  const [selected, setSelected] = useState<BuildingType>("hq");
  const definition = BUILDINGS[selected];
  const level = village.buildings[selected];
  const cost = buildingCost(selected, level);
  const problem = buildingRequirementProblem(selected, village.buildings);
  const affordable = canAfford(village.resources, cost);
  const duration = buildingDurationSeconds(selected, level, village.buildings.hq);
  return (
    <MobileScroll className="world-section-scroll">
      <section className="world-section village-view">
        <div className="section-heading"><span>Living capital</span><h1>{village.name}</h1><p>Tap a structure, study what it unlocks, then commit the next order.</p></div>
        <div className="village-resource-cards gate-c-resources">
          <div><span>Wood · +{economy.productionPerHour.wood}/h</span><strong>{compactNumber(village.resources.wood)}</strong><small>of {compactNumber(economy.storageCapacity)}</small></div>
          <div><span>Stone · +{economy.productionPerHour.stone}/h</span><strong>{compactNumber(village.resources.stone)}</strong><small>of {compactNumber(economy.storageCapacity)}</small></div>
          <div><span>Iron · +{economy.productionPerHour.iron}/h</span><strong>{compactNumber(village.resources.iron)}</strong><small>of {compactNumber(economy.storageCapacity)}</small></div>
        </div>
        <div className="village-population"><span>Village population</span><strong>{economy.populationUsed} / {economy.populationCapacity}</strong><i><b style={{ width: `${Math.min(100, economy.populationUsed / economy.populationCapacity * 100)}%` }} /></i></div>

        <div className="village-scene" aria-label="Interactive village layout">
          <div className="village-road" aria-hidden="true" />
          <div className="village-river" aria-hidden="true" />
          {BUILDING_ORDER.map((building) => {
            const item = BUILDINGS[building];
            const itemLevel = village.buildings[building];
            return (
              <button key={building} type="button" className="village-building-node" data-building={building} data-selected={selected === building} data-unbuilt={itemLevel === 0} onClick={() => setSelected(building)}>
                <i aria-hidden="true">{item.icon}</i><span>{item.shortName}</span><strong>{itemLevel ? `Lv ${itemLevel}` : "+ Build"}</strong>
              </button>
            );
          })}
        </div>

        <article className="building-inspector" data-locked={Boolean(problem)}>
          <header><div><span>{definition.icon} {level ? `Level ${level}` : "Unbuilt"}</span><h2>{definition.name}</h2></div><strong>{level}/{definition.maxLevel}</strong></header>
          <p>{definition.description}</p>
          {job ? (
            <div className="gate-c-queue"><ReloadIcon /><span>{BUILDINGS[job.building as BuildingType].name} → level {job.targetLevel}<small>Construction continues if you leave.</small></span><QueueClock endsAt={job.completesAt} /></div>
          ) : (
            <>
              <div className="upgrade-cost"><span>Wood <b>{compactNumber(cost.wood)}</b></span><span>Stone <b>{compactNumber(cost.stone)}</b></span><span>Iron <b>{compactNumber(cost.iron)}</b></span><span>Time <b>{formatRemaining(new Date(Date.now() + duration * 1000).toISOString(), Date.now())}</b></span></div>
              {problem ? <p className="unlock-requirement">{problem}</p> : !affordable ? <p className="unlock-requirement">Gather more resources to commit this order.</p> : null}
              <button type="button" className="commit-upgrade" disabled={busy || Boolean(problem) || !affordable} onClick={() => onBuild(selected)}>{level ? `Upgrade to level ${level + 1}` : `Build ${definition.name}`}<ArrowRightIcon /></button>
            </>
          )}
        </article>

        {snapshot.notifications.length ? <section className="village-notifications"><span>Kingdom activity</span>{snapshot.notifications.slice(0, 3).map((notice) => <p key={notice.id}>{notice.message}</p>)}</section> : null}
      </section>
    </MobileScroll>
  );
}

function ArmyView({ snapshot, onOpenWar, onRecruit, onResearch, busy }: {
  snapshot: WorldSnapshot;
  onOpenWar: () => void;
  onRecruit: (troop: TroopType, quantity: number) => void;
  onResearch: (troop: TroopType, targetLevel: number) => void;
  busy: boolean;
}) {
  const village = snapshot.world.villages.find((candidate) => candidate.id === snapshot.kingdom.capitalVillageId)!;
  const total = Object.values(village.army).reduce((sum, count) => sum + count, 0);
  const economy = snapshot.villageEconomy.find((entry) => entry.villageId === village.id)!;
  const recruitment = snapshot.recruitmentJobs.find((job) => job.villageId === village.id);
  const research = snapshot.researchJobs.find((job) => job.kingdomId === snapshot.kingdom.id);
  const [mode, setMode] = useState<"recruit" | "research">("recruit");
  const [quantity, setQuantity] = useState(5);
  const activeMarches = snapshot.marches.filter((march) => march.status !== "complete");
  return (
    <MobileScroll className="world-section-scroll">
      <section className="world-section army-view">
        <div className="section-heading"><span>Army command</span><h1>{total} troops ready</h1><p>Recruit at home, improve a troop family for the whole kingdom, then take the army to war.</p></div>
        <div className="army-capacity"><span>Population committed</span><strong>{economy.populationUsed} / {economy.populationCapacity}</strong></div>
        {activeMarches.length ? <section className="active-marches"><span>Armies on the road</span>{activeMarches.map((march) => {
          const target = snapshot.world.villages.find((village) => village.id === march.targetVillageId);
          return <article key={march.id}><Crosshair2Icon /><div><strong>{march.status === "returning" ? "Returning home" : march.status === "awaiting_battle" ? "Awaiting your command" : `${march.kind === "scout" ? "Scouting" : "Attacking"} ${target?.name ?? "target"}`}</strong><small>{Object.values(march.army).reduce((sum, count) => sum + count, 0)} troops · {march.status.replace("_", " ")}</small></div>{march.status === "awaiting_battle" ? <b>Ready</b> : <QueueClock endsAt={march.arrivesAt} />}</article>;
        })}</section> : null}
        <div className="army-mode-tabs"><button type="button" data-active={mode === "recruit"} onClick={() => setMode("recruit")}>Recruit</button><button type="button" data-active={mode === "research"} onClick={() => setMode("research")}>Research</button></div>

        {mode === "recruit" ? <>
          <div className="recruit-quantity"><span>Order size</span>{[1, 5, 10].map((amount) => <button key={amount} type="button" data-active={quantity === amount} onClick={() => setQuantity(amount)}>×{amount}</button>)}</div>
          {recruitment ? <div className="gate-c-queue"><ReloadIcon /><span>{recruitment.quantity} {TROOPS[recruitment.troop].plural}<small>Training at {BUILDINGS[TROOPS[recruitment.troop].recruiter].name}</small></span><QueueClock endsAt={recruitment.completesAt} /></div> : null}
          <div className="army-roster gate-c-army-roster">
            {TROOP_ORDER.map((troop) => {
              const item = TROOPS[troop];
              const locked = troopRequirementProblem(troop, village.buildings);
              const cost = troopCost(troop, quantity);
              const affordable = canAfford(village.resources, cost);
              return <article key={troop} data-empty={village.army[troop] === 0} data-locked={Boolean(locked)}>
                <i>{item.icon}</i><span>{item.plural}<small>{locked ?? `${item.role} · ${item.population} pop each`}</small></span>
                <strong>{village.army[troop]}</strong><em>Lv. {snapshot.kingdom.troopLevels[troop]}</em>
                <div><small>{cost.wood}W · {cost.stone}S · {cost.iron}I</small><button type="button" disabled={busy || Boolean(recruitment) || Boolean(locked) || !affordable} onClick={() => onRecruit(troop, quantity)}>Recruit</button></div>
              </article>;
            })}
          </div>
        </> : <>
          {research ? <div className="gate-c-queue"><ReloadIcon /><span>{TROOPS[research.troop].plural} → level {research.targetLevel}<small>Kingdom-wide combat research</small></span><QueueClock endsAt={research.completesAt} /></div> : null}
          <div className="research-grid">
            {TROOP_ORDER.map((troop) => {
              const item = TROOPS[troop];
              const current = snapshot.kingdom.troopLevels[troop];
              const target = current + 1;
              const problem = current >= 10 ? "Maximum level reached." : researchRequirementProblem(troop, target, village.buildings);
              const cost = troopResearchCost(troop, Math.min(10, target));
              return <article key={troop} data-locked={Boolean(problem)}><i>{item.icon}</i><span>{item.plural}<small>{problem ?? `Next level increases battlefield power.`}</small></span><strong>Lv {current}</strong><div><small>{cost.wood}W · {cost.stone}S · {cost.iron}I</small><button type="button" disabled={busy || Boolean(research) || Boolean(problem) || !canAfford(village.resources, cost)} onClick={() => onResearch(troop, target)}>Research</button></div></article>;
            })}
          </div>
        </>}
        <button type="button" className="army-plan-button" onClick={onOpenWar}><Crosshair2Icon />Scout an enemy and plan an attack<ArrowRightIcon /></button>
      </section>
    </MobileScroll>
  );
}

function ChatView({ snapshot, onSend, busy }: { snapshot: WorldSnapshot; onSend: (body: string) => Promise<void>; busy: boolean }) {
  const keyboard = useKeyboard();
  const { bottomInset, keyboardHeight } = useKeyboardInsets();
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = message.trim();
    if (!body) return;
    keyboard.hide();
    await onSend(body);
    setMessage("");
  };
  return (
    <section className="world-chat-view" style={keyboardHeight > 0 ? { bottom: bottomInset } : undefined}>
      <div className="section-heading"><span>World channel</span><h1>Emberfall chat</h1><p>Your kingdom and arena rank come from the server.</p></div>
      <MobileScroll className="chat-message-scroll">
        <div className="chat-messages">
          {snapshot.chatMessages.length === 0 ? <p className="chat-empty">No war council messages yet. Your kingdom can speak first.</p> : null}
          {snapshot.chatMessages.map((entry) => (
            <article key={entry.id} data-own={entry.playerId === snapshot.player.id}>
              <header><strong>{entry.kingdomName}</strong><span>{entry.arenaTier}</span></header>
              <p>{entry.body}</p>
            </article>
          ))}
        </div>
      </MobileScroll>
      <form className="world-chat-composer" onSubmit={submit}>
        <KeyboardInput value={message} onChange={(event) => setMessage(event.target.value)} maxLength={280} placeholder="Message the world…" aria-label="World chat message" />
        <button type="submit" disabled={busy || !message.trim()} aria-label="Send world chat message"><ArrowRightIcon /></button>
      </form>
    </section>
  );
}

function WorldNavigation({ view, onChange, onOpenWar }: { view: WorldView; onChange: (view: WorldView) => void; onOpenWar: () => void }) {
  const keyboard = useKeyboard();
  const items: Array<[WorldView, string, typeof GlobeIcon]> = [
    ["world", "World", GlobeIcon],
    ["village", "Village", HomeIcon],
    ["army", "Army", StackIcon],
    ["chat", "Chat", ChatBubbleIcon],
  ];
  return (
    <nav className="world-bottom-nav" aria-label="Game navigation">
      {items.slice(0, 3).map(([id, label, Icon]) => <button key={id} type="button" data-active={view === id} onClick={() => { keyboard.hide(); onChange(id); }}><Icon /><span>{label}</span></button>)}
      <button type="button" className="war-nav-button" onClick={() => { keyboard.hide(); onOpenWar(); }}><Crosshair2Icon /><span>War</span></button>
      {items.slice(3).map(([id, label, Icon]) => <button key={id} type="button" data-active={view === id} onClick={() => { keyboard.hide(); onChange(id); }}><Icon /><span>{label}</span></button>)}
    </nav>
  );
}

export function SharedWorld({ onOpenWar }: { onOpenWar: (targetVillageId: string) => void }) {
  const [phase, setPhase] = useState<"loading" | "auth" | "world" | "offline">("loading");
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<WorldView>("world");
  const latestVersion = useRef(0);

  const loadSnapshot = useCallback(async () => {
    try {
      const next = await api<WorldSnapshot>("/api/world/snapshot");
      latestVersion.current = next.world.version;
      setSnapshot(next);
      setSelectedId((current) => current || next.kingdom.capitalVillageId);
      setPhase("world");
    } catch (problem) {
      if (problem instanceof ApiError && problem.status === 401) setPhase("auth");
      else setPhase("offline");
    }
  }, []);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  useEffect(() => {
    if (phase !== "world" || !snapshot) return;
    const events = new EventSource(`/api/world/stream?since=${latestVersion.current}`);
    events.onopen = () => setNotice("Live world connected");
    events.onmessage = (event) => {
      const committed = JSON.parse(event.data) as { worldVersion?: number };
      if (committed.worldVersion && committed.worldVersion > latestVersion.current) void loadSnapshot();
    };
    events.onerror = () => setNotice("Reconnecting to the world…");
    return () => events.close();
  }, [phase, snapshot?.world.id, loadSnapshot]);

  useEffect(() => {
    if (phase !== "world") return;
    const timer = window.setInterval(() => void loadSnapshot(), 30_000);
    return () => window.clearInterval(timer);
  }, [phase, loadSnapshot]);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setSnapshot(null);
    setPhase("auth");
  };

  const sendWorldCommand = async (command: GameCommand, successMessage = "Order committed to the shared world") => {
    if (!snapshot) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api<{ payload: { worldVersion: number } }>("/api/world/commands", {
        method: "POST",
        body: JSON.stringify(makeCommandEnvelope({
          commandId: crypto.randomUUID(),
          worldId: snapshot.world.id,
          actorPlayerId: snapshot.player.id,
          expectedWorldVersion: snapshot.world.version,
          issuedAt: new Date().toISOString(),
          command,
        })),
      });
      latestVersion.current = result.payload.worldVersion;
      setNotice(successMessage);
      await loadSnapshot();
    } catch (problem) {
      setNotice(problem instanceof Error ? problem.message : "The world could not commit that order.");
      await loadSnapshot();
    } finally {
      setBusy(false);
    }
  };

  const capitalVillageId = snapshot?.kingdom.capitalVillageId ?? "";
  const queueBuilding = (building: BuildingType) => void sendWorldCommand(
    { type: "village.build.queue", payload: { villageId: capitalVillageId, building } },
    `${BUILDINGS[building].name} construction started`,
  );

  const queueRecruitment = (troop: TroopType, quantity: number) => void sendWorldCommand(
    { type: "village.recruit.queue", payload: { villageId: capitalVillageId, troop, quantity } },
    `${quantity} ${quantity === 1 ? TROOPS[troop].name : TROOPS[troop].plural} entered training`,
  );

  const queueResearch = (troop: TroopType, targetLevel: number) => void sendWorldCommand(
    { type: "kingdom.research.queue", payload: { villageId: capitalVillageId, troop, targetLevel } },
    `${TROOPS[troop].plural} level ${targetLevel} research started`,
  );

  const sendChat = async (body: string) => {
    if (!snapshot) return;
    await sendWorldCommand({ type: "chat.send", payload: { channelId: `world:${snapshot.world.id}`, body } }, "Message sent to Emberfall");
  };

  if (phase === "loading") return <main className="world-loading"><div className="world-sigil">KS</div><span>Opening Emberfall…</span></main>;
  if (phase === "auth") return <AuthGate onAuthenticated={loadSnapshot} />;
  if (phase === "offline") {
    return <main className="world-offline"><div className="world-sigil">KS</div><h1>Shared world offline</h1><p>The local world service is not running.</p><button type="button" onClick={() => void loadSnapshot()}><ReloadIcon />Retry connection</button></main>;
  }
  if (!snapshot) return null;

  const selectedVillage = snapshot.world.villages.find((village) => village.id === selectedId) ?? snapshot.world.villages[0];
  const selectedKingdom = snapshot.world.kingdoms.find((kingdom) => kingdom.id === selectedVillage.kingdomId)!;
  const selectedJob = snapshot.constructionJobs.find((job) => job.villageId === selectedVillage.id);
  const capitalJob = snapshot.constructionJobs.find((job) => job.villageId === snapshot.kingdom.capitalVillageId);
  const firstForeignVillage = snapshot.world.villages.find((village) => village.kingdomId !== snapshot.kingdom.id)!;
  const openSelectedWar = () => onOpenWar(selectedVillage.kingdomId === snapshot.kingdom.id ? firstForeignVillage.id : selectedVillage.id);

  return (
    <main className="shared-world-screen">
      <header className="shared-world-header">
        <div><span>{snapshot.world.name}</span><strong>{snapshot.kingdom.name}</strong></div>
        <button type="button" onClick={() => void logout()} aria-label="Sign out"><ExitIcon /></button>
      </header>
      <div className="world-standing-bar">
        <span><CheckCircledIcon /> World v{snapshot.world.version}</span>
        <span>{snapshot.arena.tier} · {snapshot.arena.warVictoryPoints} WVP</span>
      </div>
      {view === "world" ? (
        <>
          <WorldMap snapshot={snapshot} selectedId={selectedVillage.id} onSelect={setSelectedId} />
          <VillagePanel
            village={selectedVillage}
            kingdom={selectedKingdom}
            isOwned={selectedKingdom.id === snapshot.kingdom.id}
            job={selectedJob}
            economy={snapshot.villageEconomy.find((entry) => entry.villageId === selectedVillage.id)}
            onManage={() => setView("village")}
            onScout={openSelectedWar}
          />
        </>
      ) : null}
      {view === "village" ? <VillageView snapshot={snapshot} job={capitalJob} onBuild={queueBuilding} busy={busy} /> : null}
      {view === "army" ? <ArmyView snapshot={snapshot} onOpenWar={openSelectedWar} onRecruit={queueRecruitment} onResearch={queueResearch} busy={busy} /> : null}
      {view === "chat" ? <ChatView snapshot={snapshot} onSend={sendChat} busy={busy} /> : null}
      {notice ? <div className="world-live-notice" role="status">{notice}</div> : null}
      <WorldNavigation view={view} onChange={setView} onOpenWar={openSelectedWar} />
    </main>
  );
}
