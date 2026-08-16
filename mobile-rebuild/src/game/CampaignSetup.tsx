import { useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  Crosshair2Icon,
  ExitIcon,
  EyeOpenIcon,
  ExclamationTriangleIcon,
  TargetIcon,
} from "@radix-ui/react-icons";

import { MobileScroll, useFlow } from "../mobile";
import { TROOP_ORDER, TROOPS, type ScoutReportState } from "../../../packages/game-core/src/index";
import {
  battleScenes,
  entryOptions,
  getPlanRating,
  getPlanSummary,
  scoutIntel,
  scoutLanes,
  styleOptions,
  timeOptions,
  troopOptions,
  type Plan,
  type ScoutReport,
} from "./prototype-data";

type CampaignSetupProps = {
  renderBattle: (plan: Plan) => ReactNode;
  onExit?: () => void;
  authoritativeReport?: ScoutReportState;
};

export function ScoutScreen({ renderBattle, onExit, authoritativeReport }: CampaignSetupProps) {
  const flow = useFlow();
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [activeIntel, setActiveIntel] = useState<(typeof scoutIntel)[number]["id"]>(scoutIntel[0].id);
  const [recommendedEntry, setRecommendedEntry] = useState<Plan["entry"]>("West Ridge");
  const selectedIntel = scoutIntel.find((intel) => intel.id === activeIntel) ?? scoutIntel[0];
  const scanComplete = discovered.length === scoutIntel.length;

  const inspect = (id: (typeof scoutIntel)[number]["id"]) => {
    setActiveIntel(id);
    setDiscovered((current) => current.includes(id) ? current : [...current, id]);
  };

  const report: ScoutReport = { recommendedEntry, discovered };

  return (
    <main className="scout-screen" data-testid="scout-screen">
      <section
        className="scout-map"
        style={{ backgroundImage: `url(${battleScenes[0].image})` }}
        aria-label="Outer Wall scouting map"
      >
        <header className="scout-header" data-has-exit={onExit ? "true" : "false"}>
          {onExit ? <button type="button" className="scout-exit" onClick={onExit} aria-label="Return to shared world"><ExitIcon /></button> : null}
          <div>
            <span>Live scout report · {authoritativeReport?.targetKingdomName ?? "Ironwatch"}</span>
            <h1>{authoritativeReport?.targetVillageName ?? "Scout the Outer Wall"}</h1>
            <p>Inspect every marked defense before committing the army.</p>
          </div>
          <div className="scan-counter" aria-label={`${discovered.length} of ${scoutIntel.length} defenses identified`}>
            <EyeOpenIcon aria-hidden="true" />
            <strong>{discovered.length}/{scoutIntel.length}</strong>
          </div>
        </header>

        {scoutIntel.map((intel, index) => {
          const isDiscovered = discovered.includes(intel.id);
          return (
            <button
              key={intel.id}
              type="button"
              className="intel-marker"
              data-active={activeIntel === intel.id ? "true" : "false"}
              data-discovered={isDiscovered ? "true" : "false"}
              style={{ left: `${intel.x}%`, top: `${intel.y}%` }}
              onClick={() => inspect(intel.id)}
              aria-label={`Inspect ${intel.label}`}
            >
              {isDiscovered ? <CheckIcon aria-hidden="true" /> : <Crosshair2Icon aria-hidden="true" />}
              <span>{index + 1}</span>
            </button>
          );
        })}

        <div className="scout-instruction">
          <Crosshair2Icon aria-hidden="true" />
          Tap each defense marker
        </div>

          <section className="scout-dossier" aria-live="polite">
          {authoritativeReport ? (
            <div className="server-intel-strip">
              <span>Wall <strong>Lv {authoritativeReport.observedBuildings.wall}</strong></span>
              <span>Garrison <strong>{TROOP_ORDER.reduce((total, troop) => total + authoritativeReport.observedArmy[troop], 0)}</strong></span>
              <span>Loot seen <strong>{Object.values(authoritativeReport.observedResources).reduce((total, amount) => total + amount, 0).toLocaleString()}</strong></span>
              <small>{TROOP_ORDER.filter((troop) => authoritativeReport.observedArmy[troop] > 0).map((troop) => `${authoritativeReport.observedArmy[troop]} ${TROOPS[troop].plural}`).join(" · ")}</small>
            </div>
          ) : null}
          <div className="intel-readout" data-discovered={discovered.includes(selectedIntel.id) ? "true" : "false"}>
            <div className="intel-title">
              <span>{discovered.includes(selectedIntel.id) ? "Defense identified" : "Unconfirmed position"}</span>
              <strong>{discovered.includes(selectedIntel.id) ? selectedIntel.label : "Tap marker to investigate"}</strong>
            </div>
            {discovered.includes(selectedIntel.id) ? (
              <>
                <div className="threat-level"><ExclamationTriangleIcon aria-hidden="true" />{selectedIntel.threat} threat</div>
                <p>{selectedIntel.detail} <b>{selectedIntel.counter}</b></p>
              </>
            ) : <p>Scouting reveals troop strength, firing lanes, and the best counter.</p>}
          </div>

          <fieldset className="lane-selector">
            <legend>Choose the lane to take into planning</legend>
            <div>
              {scoutLanes.map((lane) => (
                <button
                  type="button"
                  key={lane.name}
                  data-selected={recommendedEntry === lane.name ? "true" : "false"}
                  onClick={() => setRecommendedEntry(lane.name)}
                  aria-pressed={recommendedEntry === lane.name}
                >
                  <span>{lane.name}</span><strong>{lane.risk}</strong><small>{lane.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            className="continue-to-plan"
            disabled={!scanComplete}
            onClick={() => flow.push({ id: "war-table", render: () => <PlanningScreen report={report} renderBattle={renderBattle} /> })}
          >
            {scanComplete ? "Open attack plan" : `Identify ${scoutIntel.length - discovered.length} more defenses`}
            {scanComplete ? <ArrowRightIcon aria-hidden="true" /> : null}
          </button>
        </section>
      </section>
    </main>
  );
}
function OptionRow<TValue extends string>({ label, options, value, onChange }: {
  label: string;
  options: readonly TValue[];
  value: TValue;
  onChange: (value: TValue) => void;
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

function PlanningScreen({ report, renderBattle }: { report: ScoutReport; renderBattle: CampaignSetupProps["renderBattle"] }) {
  const flow = useFlow();
  const [entry, setEntry] = useState<Plan["entry"]>(report.recommendedEntry);
  const [troops, setTroops] = useState<Plan["troops"]>("Balanced Army");
  const [time, setTime] = useState<Plan["time"]>("Dawn");
  const [style, setStyle] = useState<Plan["style"]>("Flanking Strike");
  const plan: Plan = { entry, troops, time, style };
  const rating = getPlanRating(plan);

  return (
    <MobileScroll className="planning-screen" data-testid="planning-screen">
      <main className="planning-content">
        <header className="campaign-header">
          <div className="campaign-kicker">Scout report complete</div>
          <h1>Plan the first strike</h1>
          <p>The Outer Wall is mapped. Build the assault around the defenses and lane you identified.</p>
        </header>

        <section className="scout-report-summary" aria-label="Scouting intelligence">
          <div><EyeOpenIcon aria-hidden="true" /><span>Intelligence</span><strong>{report.discovered.length} defenses mapped</strong></div>
          <div><TargetIcon aria-hidden="true" /><span>Selected lane</span><strong>{report.recommendedEntry}</strong></div>
          <button type="button" onClick={() => flow.pop()}>Review battlefield</button>
        </section>

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
          onClick={() => flow.push({ id: "battle-campaign", render: () => renderBattle(plan) })}
        >
          Begin the assault <ArrowRightIcon aria-hidden="true" />
        </button>
      </main>
    </MobileScroll>
  );
}
