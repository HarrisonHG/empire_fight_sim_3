import "./styles.css";

import { COMBAT_REPLAY_SCENARIOS } from "./combatReplayScenarios";
import { recordCombatReplayScenario } from "./recordCombatReplay";
import { renderCombatReplay } from "./renderCombatReplay";
import type {
  CombatReplayFrame,
  CombatReplayRecord,
} from "./combatReplayTypes";

const app = requireElement("app");

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <h1>Combat Replay</h1>
      </div>
      <label class="field">
        <span>Scenario</span>
        <select id="scenario"></select>
      </label>
    </header>

    <section class="controls" aria-label="Replay controls">
      <button id="playPause" type="button">Play</button>
      <button id="stepBack" type="button">Back</button>
      <button id="stepForward" type="button">Step</button>
      <button id="reset" type="button">Reset</button>
      <label class="field range-field">
        <span>Tick <strong id="tickLabel">0</strong></span>
        <input id="tickSlider" type="range" min="0" value="0" />
      </label>
      <label class="field">
        <span>Speed</span>
        <select id="speed">
          <option value="800">Slow</option>
          <option value="400" selected>Normal</option>
          <option value="180">Fast</option>
        </select>
      </label>
      <label class="toggle"><input id="showThreat" type="checkbox" checked /> Threat</label>
      <label class="toggle"><input id="showContact" type="checkbox" checked /> Contact</label>
      <label class="toggle"><input id="showLabels" type="checkbox" checked /> Labels</label>
    </section>

    <section class="workspace">
      <div id="viewport" class="viewport"></div>
      <aside class="inspector">
        <section>
          <h2 id="scenarioName"></h2>
          <p id="scenarioDescription" class="description"></p>
        </section>
        <section>
          <h2>Pipeline</h2>
          <div id="pipelineSummary" class="summary-grid"></div>
        </section>
        <section>
          <h2>Units</h2>
          <div id="unitList" class="table-list"></div>
        </section>
        <section>
          <h2>Last Application</h2>
          <div id="applicationSummary" class="table-list"></div>
        </section>
        <section>
          <h2>Tick Log</h2>
          <ol id="logList" class="event-list"></ol>
        </section>
      </aside>
    </section>
  </section>
`;

const scenarioSelect = requireElement("scenario") as HTMLSelectElement;
const playPauseButton = requireElement("playPause") as HTMLButtonElement;
const stepBackButton = requireElement("stepBack") as HTMLButtonElement;
const stepForwardButton = requireElement("stepForward") as HTMLButtonElement;
const resetButton = requireElement("reset") as HTMLButtonElement;
const tickSlider = requireElement("tickSlider") as HTMLInputElement;
const tickLabel = requireElement("tickLabel");
const speedSelect = requireElement("speed") as HTMLSelectElement;
const showThreat = requireElement("showThreat") as HTMLInputElement;
const showContact = requireElement("showContact") as HTMLInputElement;
const showLabels = requireElement("showLabels") as HTMLInputElement;
const viewport = requireElement("viewport");
const scenarioName = requireElement("scenarioName");
const scenarioDescription = requireElement("scenarioDescription");
const pipelineSummary = requireElement("pipelineSummary");
const unitList = requireElement("unitList");
const applicationSummary = requireElement("applicationSummary");
const logList = requireElement("logList");

let replay = recordCombatReplayScenario(COMBAT_REPLAY_SCENARIOS[0]!);
let currentTick = 0;
let playbackTimer: number | undefined;

for (const scenario of COMBAT_REPLAY_SCENARIOS) {
  const option = document.createElement("option");
  option.value = scenario.id;
  option.textContent = scenario.name;
  scenarioSelect.append(option);
}

scenarioSelect.addEventListener("change", () => {
  const nextScenario = COMBAT_REPLAY_SCENARIOS.find(
    (scenario) => scenario.id === scenarioSelect.value,
  );
  if (nextScenario === undefined) {
    return;
  }
  stopPlayback();
  replay = recordCombatReplayScenario(nextScenario);
  currentTick = 0;
  render();
});

playPauseButton.addEventListener("click", () => {
  if (playbackTimer === undefined) {
    startPlayback();
  } else {
    stopPlayback();
  }
});

stepBackButton.addEventListener("click", () => {
  stopPlayback();
  setTick(currentTick - 1);
});

stepForwardButton.addEventListener("click", () => {
  stopPlayback();
  setTick(currentTick + 1);
});

resetButton.addEventListener("click", () => {
  stopPlayback();
  setTick(0);
});

tickSlider.addEventListener("input", () => {
  stopPlayback();
  setTick(Number(tickSlider.value));
});

for (const toggle of [showThreat, showContact, showLabels]) {
  toggle.addEventListener("change", render);
}

speedSelect.addEventListener("change", () => {
  if (playbackTimer !== undefined) {
    stopPlayback();
    startPlayback();
  }
});

render();

function startPlayback(): void {
  playPauseButton.textContent = "Pause";
  playbackTimer = window.setInterval(() => {
    if (currentTick >= replay.frames.length - 1) {
      stopPlayback();
      return;
    }
    setTick(currentTick + 1);
  }, Number(speedSelect.value));
}

function stopPlayback(): void {
  if (playbackTimer !== undefined) {
    window.clearInterval(playbackTimer);
    playbackTimer = undefined;
  }
  playPauseButton.textContent = "Play";
}

function setTick(nextTick: number): void {
  const lastTick = replay.frames.length - 1;
  currentTick = Math.max(0, Math.min(lastTick, nextTick));
  render();
}

function render(): void {
  const frame = replay.frames[currentTick]!;
  const lastTick = replay.frames.length - 1;
  tickSlider.max = String(lastTick);
  tickSlider.value = String(currentTick);
  tickLabel.textContent = `${currentTick} / ${lastTick}`;
  stepBackButton.disabled = currentTick === 0;
  stepForwardButton.disabled = currentTick === lastTick;
  resetButton.disabled = currentTick === 0;

  scenarioName.textContent = replay.scenario.name;
  scenarioDescription.textContent = replay.scenario.description;
  renderCombatReplay(viewport, replay, frame, {
    showContactRanges: showContact.checked,
    showLabels: showLabels.checked,
    showThreatRanges: showThreat.checked,
  });
  renderPipelineSummary(frame);
  renderUnitList(replay, frame);
  renderApplicationSummary(frame);
  renderLogList(frame);
}

function renderPipelineSummary(frame: CombatReplayFrame): void {
  pipelineSummary.replaceChildren();
  const values = [
    ["Opportunities", frame.counts.opportunities],
    ["Strikes", frame.counts.strikes],
    ["Applications", frame.counts.applications],
    ["Formation events", frame.formationEvents.length],
  ] as const;
  for (const [label, value] of values) {
    const item = document.createElement("div");
    item.className = "metric";
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    pipelineSummary.append(item);
  }
}

function renderUnitList(
  activeReplay: CombatReplayRecord,
  frame: CombatReplayFrame,
): void {
  unitList.replaceChildren();
  for (const unit of frame.units) {
    const sourceUnit = activeReplay.units.find(
      (candidate) => candidate.unitId === unit.unitId,
    );
    const members = sourceUnit?.memberEntityIds.join(", ") ?? "";
    const row = document.createElement("div");
    row.className = `info-row unit-row ${unit.side}`;
    row.innerHTML = `
      <strong>U${unit.unitId}</strong>
      <span>${unit.label}</span>
      <span>${unit.movementStyle}</span>
      <span>${unit.engagementState}</span>
      <span>${unit.weaponReachBand}</span>
      <span>target ${formatTarget(unit.primaryTargetUnitId)}</span>
      <span>cooldown ${unit.attackCooldownTicks}</span>
      <span>damage ${unit.accumulatedDamage}/${unit.maxDamageCapacity}</span>
      <span>capacity ${unit.capacityReached}</span>
      <span>members ${members}</span>
    `;
    unitList.append(row);
  }
}

function renderApplicationSummary(frame: CombatReplayFrame): void {
  applicationSummary.replaceChildren();
  const application = frame.lastApplication;
  const row = document.createElement("div");
  row.className = "info-row application-row";
  if (application === undefined) {
    row.innerHTML = `<strong>None</strong><span>No application this tick</span>`;
  } else {
    row.innerHTML = `
      <strong>U${application.sourceUnitId}->U${application.targetUnitId}</strong>
      <span>incoming ${application.incomingDamageValue}</span>
      <span>armour ${application.armourReduction}</span>
      <span>shield ${application.shieldReduction}</span>
      <span>applied ${application.appliedDamageValue}</span>
      <span>total ${application.accumulatedDamageBefore}->${application.accumulatedDamageAfter}</span>
      <span>capacity ${application.capacityReached}</span>
    `;
  }
  applicationSummary.append(row);
}

function renderLogList(frame: CombatReplayFrame): void {
  logList.replaceChildren();
  if (frame.logLines.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-event";
    empty.textContent = "No records";
    logList.append(empty);
    return;
  }

  for (const line of frame.logLines) {
    const item = document.createElement("li");
    item.textContent = line;
    logList.append(item);
  }
}

function formatTarget(targetUnitId: number | undefined): string {
  return targetUnitId === undefined ? "-" : `U${targetUnitId}`;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}
