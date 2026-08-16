import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  ArrowRightIcon,
  ChatBubbleIcon,
  CheckCircledIcon,
  Crosshair2Icon,
  ExitIcon,
  GlobeIcon,
  HomeIcon,
  ReloadIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import { makeCommandEnvelope, type KingdomState, type VillageState, type WorldState } from "../../../packages/game-core/src/contracts";
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
type WorldSnapshot = {
  snapshotVersion: number;
  player: SessionPlayer;
  kingdom: KingdomState;
  arena: { tier: string; warVictoryPoints: number };
  world: WorldState;
  constructionJobs: ConstructionJob[];
  chatMessages: WorldChatMessage[];
};

class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
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

function VillagePanel({ village, kingdom, isOwned, job, onBuild, busy }: {
  village: VillageState;
  kingdom: KingdomState;
  isOwned: boolean;
  job?: ConstructionJob;
  onBuild: () => void;
  busy: boolean;
}) {
  const barracksScale = Math.pow(1.45, Math.max(0, village.buildings.barracks - 1));
  const barracksCost = {
    wood: Math.round(180 * barracksScale),
    stone: Math.round(120 * barracksScale),
    iron: Math.round(80 * barracksScale),
  };
  return (
    <section className="world-village-panel">
      <div className="village-panel-heading">
        <div><span>{kingdom.seatKind === "ai" ? "AI kingdom" : kingdom.name}</span><h2>{village.name}</h2></div>
        <strong>{village.x}:{village.y}</strong>
      </div>
      <div className="resource-strip">
        <span>Wood <strong>{village.resources.wood}</strong></span>
        <span>Stone <strong>{village.resources.stone}</strong></span>
        <span>Iron <strong>{village.resources.iron}</strong></span>
      </div>
      <div className="village-facts">
        <span>Barracks <strong>Lv. {village.buildings.barracks}</strong></span>
        <span>Troops <strong>{Object.values(village.army).reduce((total, count) => total + count, 0)}</strong></span>
        <span>Seat <strong>{kingdom.seatKind === "ai" ? "AI" : "Human"}</strong></span>
      </div>
      {isOwned ? (
        job ? (
          <div className="construction-active"><ReloadIcon aria-hidden="true" /><span>Building {job.building} level {job.targetLevel}</span><strong>Server timed</strong></div>
        ) : (
          <button className="barracks-upgrade" type="button" onClick={onBuild} disabled={busy}>
            <span>Upgrade Barracks</span><small>{barracksCost.wood} wood · {barracksCost.stone} stone · {barracksCost.iron} iron</small><ArrowRightIcon aria-hidden="true" />
          </button>
        )
      ) : (
        <p className="foreign-village-note">This is a permanent world-map target. Scouting and attack marches connect here in Gate D.</p>
      )}
    </section>
  );
}

const buildingLabels: Array<[keyof VillageState["buildings"], string]> = [
  ["hq", "Headquarters"],
  ["timber", "Timber Camp"],
  ["quarry", "Stone Quarry"],
  ["iron", "Iron Mine"],
  ["farm", "Farm"],
  ["warehouse", "Warehouse"],
  ["barracks", "Barracks"],
  ["wall", "Wall"],
  ["stable", "Stable"],
  ["workshop", "Workshop"],
  ["smithy", "Smithy"],
  ["academy", "Academy"],
  ["market", "Market"],
];

const troopLabels: Array<[keyof VillageState["army"], string, string]> = [
  ["spear", "Spearmen", "Front-line defense"],
  ["sword", "Swordsmen", "Armored infantry"],
  ["axe", "Axemen", "Heavy assault"],
  ["archer", "Archers", "Ranged support"],
  ["scout", "Scouts", "Reconnaissance"],
  ["lightCavalry", "Light Cavalry", "Fast flanking"],
  ["ram", "Rams", "Wall breaking"],
  ["noble", "Noblemen", "Village conquest"],
];

function VillageView({ snapshot, job, onBuild, busy }: { snapshot: WorldSnapshot; job?: ConstructionJob; onBuild: () => void; busy: boolean }) {
  const village = snapshot.world.villages.find((candidate) => candidate.id === snapshot.kingdom.capitalVillageId)!;
  return (
    <MobileScroll className="world-section-scroll">
      <section className="world-section village-view">
        <div className="section-heading"><span>Capital village</span><h1>{village.name}</h1><p>Build the production base that feeds every march and battle.</p></div>
        <div className="village-resource-cards">
          <div><span>Wood</span><strong>{village.resources.wood}</strong></div>
          <div><span>Stone</span><strong>{village.resources.stone}</strong></div>
          <div><span>Iron</span><strong>{village.resources.iron}</strong></div>
        </div>
        <div className="building-grid" aria-label="Village buildings">
          {buildingLabels.map(([id, label]) => {
            const level = village.buildings[id];
            const locked = level === 0;
            return <div key={id} data-locked={locked}><span>{label}</span><strong>{locked ? "Locked" : `Level ${level}`}</strong></div>;
          })}
        </div>
        <VillagePanel village={village} kingdom={snapshot.kingdom} isOwned job={job} onBuild={onBuild} busy={busy} />
      </section>
    </MobileScroll>
  );
}

function ArmyView({ snapshot, onOpenWar }: { snapshot: WorldSnapshot; onOpenWar: () => void }) {
  const village = snapshot.world.villages.find((candidate) => candidate.id === snapshot.kingdom.capitalVillageId)!;
  const total = Object.values(village.army).reduce((sum, count) => sum + count, 0);
  return (
    <MobileScroll className="world-section-scroll">
      <section className="world-section army-view">
        <div className="section-heading"><span>Kingdom forces</span><h1>{total} troops ready</h1><p>Troop levels belong to your whole kingdom and carry into every battle.</p></div>
        <div className="army-roster">
          {troopLabels.map(([id, label, role]) => (
            <div key={id} data-empty={village.army[id] === 0}>
              <span>{label}<small>{role}</small></span>
              <strong>{village.army[id]}</strong>
              <em>Lv. {snapshot.kingdom.troopLevels[id]}</em>
            </div>
          ))}
        </div>
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

export function SharedWorld({ onOpenWar }: { onOpenWar: () => void }) {
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

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setSnapshot(null);
    setPhase("auth");
  };

  const queueBarracks = async () => {
    if (!snapshot) return;
    const village = snapshot.world.villages.find((candidate) => candidate.id === snapshot.kingdom.capitalVillageId);
    if (!village) return;
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
          command: { type: "village.build.queue", payload: { villageId: village.id, building: "barracks" } },
        })),
      });
      latestVersion.current = result.payload.worldVersion;
      setNotice("Barracks upgrade committed to the shared world");
      await loadSnapshot();
    } catch (problem) {
      setNotice(problem instanceof Error ? problem.message : "The build command failed.");
      await loadSnapshot();
    } finally {
      setBusy(false);
    }
  };

  const sendChat = async (body: string) => {
    if (!snapshot) return;
    setBusy(true);
    try {
      const result = await api<{ payload: { worldVersion: number } }>("/api/world/commands", {
        method: "POST",
        body: JSON.stringify(makeCommandEnvelope({
          commandId: crypto.randomUUID(),
          worldId: snapshot.world.id,
          actorPlayerId: snapshot.player.id,
          expectedWorldVersion: snapshot.world.version,
          issuedAt: new Date().toISOString(),
          command: { type: "chat.send", payload: { channelId: `world:${snapshot.world.id}`, body } },
        })),
      });
      latestVersion.current = result.payload.worldVersion;
      await loadSnapshot();
    } catch (problem) {
      setNotice(problem instanceof Error ? problem.message : "The message could not be sent.");
      await loadSnapshot();
    } finally {
      setBusy(false);
    }
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
            onBuild={queueBarracks}
            busy={busy}
          />
        </>
      ) : null}
      {view === "village" ? <VillageView snapshot={snapshot} job={capitalJob} onBuild={queueBarracks} busy={busy} /> : null}
      {view === "army" ? <ArmyView snapshot={snapshot} onOpenWar={onOpenWar} /> : null}
      {view === "chat" ? <ChatView snapshot={snapshot} onSend={sendChat} busy={busy} /> : null}
      {notice && view === "world" ? <div className="world-live-notice" role="status">{notice}</div> : null}
      <WorldNavigation view={view} onChange={setView} onOpenWar={onOpenWar} />
    </main>
  );
}
