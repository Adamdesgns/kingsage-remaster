import { useMemo, useState, type MouseEvent } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  Cross2Icon,
  ExitIcon,
  PauseIcon,
  ResumeIcon,
  TargetIcon,
} from "@radix-ui/react-icons";
import { FlowStack, MobileScroll, useFlow, type FlowControls } from "./mobile";

type TroopId = "vanguard" | "archers" | "riders";
type Plan = { entry: string; troops: string; time: string; style: string };
type Formation = {
  id: TroopId;
  label: string;
  count: number;
  portrait: string;
  x: number;
  y: number;
};

const troopDetails: Record<TroopId, Omit<Formation, "x" | "y">> = {
  vanguard: { id: "vanguard", label: "Vanguard", count: 120, portrait: "/art/vanguard-portrait.png" },
  archers: { id: "archers", label: "Archers", count: 90, portrait: "/art/archers-portrait.png" },
  riders: { id: "riders", label: "Riders", count: 48, portrait: "/art/riders-portrait.png" },
};

const battleScenes = [
  {
    name: "Outer Wall",
    objective: "Break the gate",
    image: "/art/battle-1-outer-wall.png",
    enemy: "Ironwatch Garrison",
    positions: { vanguard: [30, 54], archers: [18, 78], riders: [70, 68] },
  },
  {
    name: "Lower Ward",
    objective: "Take the crossroads",
    image: "/art/battle-2-lower-ward.png",
    enemy: "Ward Defenders",
    positions: { vanguard: [31, 54], archers: [18, 79], riders: [67, 69] },
  },
  {
    name: "Citadel Keep",
    objective: "Capture the keep",
    image: "/art/battle-3-citadel.png",
    enemy: "The King’s Guard",
    positions: { vanguard: [48, 55], archers: [20, 70], riders: [73, 73] },
  },
] as const;

const entryOptions = ["West Ridge", "Main Breach", "East Woods"];
const troopOptions = ["Vanguard Heavy", "Balanced Army", "Cavalry Wing"];
const timeOptions = ["Dawn", "Midday", "Night"];
const styleOptions = ["Siege Push", "Flanking Strike", "Full Assault"];

function getPlanScore(plan: Plan) {
  return Number(plan.entry === "West Ridge")
    + Number(plan.troops === "Balanced Army")
    + Number(plan.time === "Dawn")
    + Number(plan.style === "Flanking Strike");
}

function getPlanRating(plan: Plan) {
  const score = getPlanScore(plan);
  if (score >= 4) return { label: "High", orders: 3, losses: 4 };
  if (score >= 2) return { label: "Steady", orders: 4, losses: 7 };
  return { label: "Risky", orders: 5, losses: 11 };
}

function getPlanSummary(plan: Plan) {
  return `${plan.time} timing from the ${plan.entry.toLowerCase()} sets up a ${plan.style.toLowerCase()} with a ${plan.troops.toLowerCase()}.`;
}

function OptionRow({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="plan-fieldset">
      <legend>{label}</legend>
      <div className="plan-option-row">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="plan-option"
            data-selected={value === option ? "true" : "false"}
            onClick={() => onChange(option)}
            aria-pressed={value === option}
          >
            <span>{option}</span>
            {value === option ? <CheckIcon aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PlanningScreen() {
  const flow = useFlow();
  const [entry, setEntry] = useState("West Ridge");
  const [troops, setTroops] = useState("Balanced Army");
  const [time, setTime] = useState("Dawn");
  const [style, setStyle] = useState("Flanking Strike");
  const plan: Plan = { entry, troops, time, style };
  const rating = getPlanRating(plan);

  return (
    <MobileScroll className="planning-screen" data-testid="planning-screen">
      <main className="planning-content">
        <header className="campaign-header">
          <div className="campaign-kicker">Campaign 01</div>
          <h1>Plan the first strike</h1>
          <p>Choose how the army enters the field. Your decisions carry through all three battles.</p>
        </header>

        <section className="battle-route" aria-label="Battle route">
          {battleScenes.map((scene, index) => (
            <div className="route-stop" key={scene.name}>
              <span>{index + 1}</span>
              <div><strong>{scene.name}</strong><small>{scene.objective}</small></div>
              {index < battleScenes.length - 1 ? <ChevronRightIcon aria-hidden="true" /> : null}
            </div>
          ))}
        </section>

        <section className="war-table" aria-label="Attack plan">
          <OptionRow label="Entry position" options={entryOptions} value={entry} onChange={setEntry} />
          <OptionRow label="Troop formation" options={troopOptions} value={troops} onChange={setTroops} />
          <OptionRow label="Time of attack" options={timeOptions} value={time} onChange={setTime} />
          <OptionRow label="Attack style" options={styleOptions} value={style} onChange={setStyle} />
        </section>

        <section className="plan-summary" aria-label="Planned assault summary">
          <div><span>Command strength</span><strong>{rating.label}</strong></div>
          <p>{getPlanSummary(plan)} Stronger plans need fewer field orders and cost fewer troops.</p>
        </section>

        <button
          type="button"
          className="launch-attack"
          onClick={() => flow.push({ id: "battle-campaign", render: () => <BattleCampaign plan={plan} /> })}
        >
          Begin the assault <ArrowRightIcon aria-hidden="true" />
        </button>
      </main>
    </MobileScroll>
  );
}

function createFormations(sceneIndex: number, plan: Plan): Formation[] {
  const scene = battleScenes[sceneIndex];
  const rating = getPlanRating(plan);
  return (Object.keys(troopDetails) as TroopId[]).map((id) => ({
    ...troopDetails[id],
    count: Math.max(
      18,
      troopDetails[id].count
        + (plan.troops === "Vanguard Heavy" && id === "vanguard" ? 30 : 0)
        + (plan.troops === "Vanguard Heavy" && id === "archers" ? -15 : 0)
        + (plan.troops === "Vanguard Heavy" && id === "riders" ? -8 : 0)
        + (plan.troops === "Cavalry Wing" && id === "riders" ? 20 : 0)
        + (plan.troops === "Cavalry Wing" && id === "vanguard" ? -20 : 0)
        - sceneIndex * rating.losses,
    ),
    x: scene.positions[id][0],
    y: scene.positions[id][1],
  }));
}

function BattleCampaign({ plan }: { plan: Plan }) {
  const flow = useFlow();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selected, setSelected] = useState<TroopId | null>(null);
  const [formations, setFormations] = useState<Formation[]>(() => createFormations(0, plan));
  const [orders, setOrders] = useState(0);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);
  const [paused, setPaused] = useState(false);

  const scene = battleScenes[sceneIndex];
  const rating = getPlanRating(plan);
  const secured = orders >= rating.orders;
  const progress = Math.min(100, 28 + Math.round((orders / rating.orders) * 72));
  const selectedFormation = formations.find((formation) => formation.id === selected);
  const planReadout = useMemo(() => `${plan.time} · ${plan.style} · ${plan.entry}`, [plan.entry, plan.style, plan.time]);

  const moveFormation = (event: MouseEvent<HTMLDivElement>) => {
    if (!selected || secured || paused) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(8, Math.min(92, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(18, Math.min(82, ((event.clientY - bounds.top) / bounds.height) * 100));
    setMarker({ x, y });
    setFormations((current) => current.map((formation) => formation.id === selected ? { ...formation, x, y } : formation));
    setOrders((current) => Math.min(rating.orders, current + 1));
  };

  const advanceScene = () => {
    if (sceneIndex === battleScenes.length - 1) {
      flow.push({ id: "campaign-won", render: () => <CampaignWon plan={plan} /> });
      return;
    }
    const nextScene = sceneIndex + 1;
    setSceneIndex(nextScene);
    setFormations(createFormations(nextScene, plan));
    setSelected(null);
    setMarker(null);
    setOrders(0);
  };

  return (
    <main className="battle-screen" data-testid="battle-screen">
      <div
        className="battlefield"
        style={{ backgroundImage: `url(${scene.image})` }}
        onClick={moveFormation}
        role="application"
        aria-label={`${scene.name} battlefield. Select a formation, then tap a destination.`}
      >
        <header className="battle-hud">
          <div className="scene-status">
            <span>Battle {sceneIndex + 1} of {battleScenes.length}</span>
            <strong>{scene.name}</strong>
            <small>{scene.objective}</small>
          </div>
          <div className="battle-progress" aria-label={`${progress} percent secured`}><strong>{progress}%</strong><span>secured</span></div>
          <button type="button" className="hud-icon-button" onClick={() => setPaused(true)} aria-label="Pause battle"><PauseIcon aria-hidden="true" /></button>
        </header>

        <div className="plan-ribbon"><span>Orders active</span><strong>{planReadout}</strong></div>
        <div className="objective-banner"><TargetIcon aria-hidden="true" /><div><span>Enemy</span><strong>{scene.enemy}</strong></div></div>

        {formations.map((formation) => (
          <button
            type="button"
            key={formation.id}
            className="formation-hotspot"
            data-selected={selected === formation.id ? "true" : "false"}
            style={{ left: `${formation.x}%`, top: `${formation.y}%` }}
            onClick={() => setSelected(formation.id)}
            aria-label={`Select ${formation.label} formation`}
          >
            <img src={formation.portrait} alt="" /><span>{formation.count}</span>
          </button>
        ))}

        {marker ? <div className="rally-marker" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-hidden="true"><TargetIcon /></div> : null}

        <div className="command-prompt" data-ready={selected ? "true" : "false"}>
          {selectedFormation ? `${selectedFormation.label} selected — tap where they move next` : "Tap a formation to select it"}
        </div>

        <nav className="troop-command-bar" aria-label="Army formations">
          <div className="troop-grid">
            {formations.map((formation) => (
              <button type="button" key={formation.id} className="troop-command" data-selected={selected === formation.id ? "true" : "false"} onClick={() => setSelected(formation.id)}>
                <img src={formation.portrait} alt="" /><span>{formation.label}</span><strong>{formation.count}</strong>
              </button>
            ))}
          </div>
          <button type="button" className="retreat-button" onClick={() => flow.pop()}><ExitIcon aria-hidden="true" />Retreat</button>
        </nav>

        {secured ? (
          <section className="scene-victory" aria-live="polite">
            <div className="victory-mark"><CheckIcon aria-hidden="true" /></div>
            <span>Battle {sceneIndex + 1} won</span>
            <h2>{scene.name} secured</h2>
            <p>Your formations completed the objective. The surviving army advances together.</p>
            <button type="button" onClick={advanceScene}>
              {sceneIndex === battleScenes.length - 1 ? "Claim the citadel" : "Advance to next battle"}<ArrowRightIcon aria-hidden="true" />
            </button>
          </section>
        ) : null}

        {paused ? (
          <section className="pause-panel" aria-label="Battle paused">
            <button className="pause-close" type="button" onClick={() => setPaused(false)} aria-label="Close pause menu"><Cross2Icon aria-hidden="true" /></button>
            <span>Battle paused</span><h2>{scene.name}</h2><p>{planReadout}</p>
            <button type="button" className="resume-button" onClick={() => setPaused(false)}><ResumeIcon aria-hidden="true" />Resume command</button>
            <button type="button" className="pause-retreat" onClick={() => flow.pop()}>Retreat to war table</button>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function CampaignWon({ plan }: { plan: Plan }) {
  const flow = useFlow();
  return (
    <MobileScroll className="campaign-won-screen">
      <main className="campaign-won-content">
        <div className="victory-crest"><CheckIcon aria-hidden="true" /></div>
        <span className="campaign-kicker">Campaign complete</span>
        <h1>The citadel is yours</h1>
        <p>You planned the first strike, steered the formations, and won all three battle scenes.</p>
        <dl>
          <div><dt>Entry</dt><dd>{plan.entry}</dd></div>
          <div><dt>Army</dt><dd>{plan.troops}</dd></div>
          <div><dt>Attack</dt><dd>{plan.time} · {plan.style}</dd></div>
        </dl>
        <button type="button" onClick={() => flow.replace({ id: "new-plan", render: () => <PlanningScreen /> })}>Plan another campaign</button>
      </main>
    </MobileScroll>
  );
}

export default function Prototype() {
  const initial = useMemo(() => ({ id: "war-table", render: (_flow: FlowControls) => <PlanningScreen /> }), []);
  return <FlowStack initial={initial} />;
}
