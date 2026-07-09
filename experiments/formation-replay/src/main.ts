import "./styles.css";

import { FORMATION_REPLAY_SCENARIOS } from "./scenarios";
import { recordFormationReplay } from "./replayRecorder";
import { renderReplay } from "./renderReplay";
import type { FormationReplay } from "./replayTypes";

const app = requireElement("app");

app.innerHTML = `
  <section class="shell">
    <header class="topbar">
      <div>
        <h1>Formation Replay</h1>
        <p class="subtle">Developer inspection harness. Vitest remains the source of correctness.</p>
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
      <label class="toggle"><input id="showSlots" type="checkbox" checked /> Slots</label>
      <label class="toggle"><input id="showAnchors" type="checkbox" checked /> Anchors</label>
      <label class="toggle"><input id="showEntityIds" type="checkbox" checked /> Entity IDs</label>
    </section>

    <section class="workspace">
      <div id="viewport" class="viewport"></div>
      <aside class="inspector">
        <section>
          <h2 id="scenarioName"></h2>
          <p id="scenarioDescription" class="description"></p>
        </section>
        <section>
          <h2>Units</h2>
          <div id="unitList" class="table-list"></div>
        </section>
        <section>
          <h2>Entities</h2>
          <div id="entityList" class="table-list"></div>
        </section>
        <section>
          <h2>Events This Tick</h2>
          <ol id="eventList" class="event-list"></ol>
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
const showSlots = requireElement("showSlots") as HTMLInputElement;
const showAnchors = requireElement("showAnchors") as HTMLInputElement;
const showEntityIds = requireElement("showEntityIds") as HTMLInputElement;
const viewport = requireElement("viewport");
const scenarioName = requireElement("scenarioName");
const scenarioDescription = requireElement("scenarioDescription");
const unitList = requireElement("unitList");
const entityList = requireElement("entityList");
const eventList = requireElement("eventList");

let replay = recordFormationReplay(FORMATION_REPLAY_SCENARIOS[0]!);
let currentTick = 0;
let playbackTimer: number | undefined;

for (const scenario of FORMATION_REPLAY_SCENARIOS) {
  const option = document.createElement("option");
  option.value = scenario.id;
  option.textContent = scenario.name;
  scenarioSelect.append(option);
}

scenarioSelect.addEventListener("change", () => {
  const nextScenario = FORMATION_REPLAY_SCENARIOS.find(
    (scenario) => scenario.id === scenarioSelect.value,
  );
  if (nextScenario === undefined) {
    return;
  }
  stopPlayback();
  replay = recordFormationReplay(nextScenario);
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

for (const toggle of [showSlots, showAnchors, showEntityIds]) {
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
  renderReplay(viewport, replay, frame, {
    showAnchors: showAnchors.checked,
    showEntityIds: showEntityIds.checked,
    showSlots: showSlots.checked,
  });
  renderUnitList(replay, frame);
  renderEntityList(frame);
  renderEventList(frame);
}

function renderUnitList(
  activeReplay: FormationReplay,
  frame: FormationReplay["frames"][number],
): void {
  unitList.replaceChildren();
  for (const unit of frame.units) {
    const sourceUnit = activeReplay.units.find(
      (candidate) => candidate.unitId === unit.unitId,
    );
    const members = sourceUnit?.memberEntityIds.join(", ") ?? "";
    const row = document.createElement("div");
    row.className = "info-row unit-row";
    row.innerHTML = `
      <strong>U${unit.unitId}</strong>
      <span>${unit.style}</span>
      <span>${unit.order}</span>
      <span>cohesion ${unit.cohesion}</span>
      <span>anchor ${unit.anchorX}, ${unit.anchorY}</span>
      <span>members ${members}</span>
    `;
    unitList.append(row);
  }
}

function renderEntityList(frame: FormationReplay["frames"][number]): void {
  entityList.replaceChildren();
  for (const entity of frame.entities) {
    const row = document.createElement("div");
    row.className = "info-row entity-row";
    row.innerHTML = `
      <strong>E${entity.entityId}</strong>
      <span>U${entity.unitId}</span>
      <span>${entity.movementMode}</span>
      <span>pressure ${entity.pressure}</span>
      <span>pos ${entity.x}, ${entity.y}</span>
    `;
    entityList.append(row);
  }
}

function renderEventList(frame: FormationReplay["frames"][number]): void {
  eventList.replaceChildren();
  if (frame.events.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-event";
    empty.textContent = "No events";
    eventList.append(empty);
    return;
  }

  for (const event of frame.events) {
    const item = document.createElement("li");
    item.textContent = formatEvent(event);
    eventList.append(item);
  }
}

function formatEvent(event: FormationReplay["frames"][number]["events"][number]): string {
  switch (event.kind) {
    case "unit_movement_choice":
      return `Unit ${event.unitId}: ${event.style}`;
    case "individual_movement_mode":
      return `Entity ${event.entityId}: ${event.mode}`;
    case "stuck_entered":
      return `Entity ${event.entityId}: stuck entered`;
    case "stuck_recovered":
      return `Entity ${event.entityId}: stuck recovered`;
  }
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}
