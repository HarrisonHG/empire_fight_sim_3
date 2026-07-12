import type { VisualTestEntry } from "../content/visualTestRegistry";
import { buildVisualTestMenuItems } from "./visualTestMenuItems";

export function renderVisualTestMenu(
  host: HTMLElement,
  entries: readonly VisualTestEntry[],
  error?: string,
): void {
  host.classList.add("visual-test-menu-host");
  const main = document.createElement("main");
  main.className = "visual-test-menu";
  const title = document.createElement("h1");
  title.textContent = "Visual regression tests";
  const intro = document.createElement("p");
  intro.textContent =
    "Persistent human-inspection scenarios. Automated tests remain authoritative for simulation correctness.";
  main.append(title, intro);
  if (error !== undefined) {
    const errorElement = document.createElement("p");
    errorElement.className = "visual-test-error";
    errorElement.setAttribute("role", "alert");
    errorElement.textContent = error;
    main.append(errorElement);
  }
  const list = document.createElement("div");
  list.className = "visual-test-list";
  for (const item of buildVisualTestMenuItems(entries)) {
    const article = document.createElement("article");
    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.title;
    heading.append(link);
    const milestone = document.createElement("p");
    milestone.className = "visual-test-milestone";
    milestone.textContent = item.milestone;
    const purpose = document.createElement("p");
    purpose.textContent = item.purpose;
    const observations = document.createElement("ul");
    for (const observation of item.expectedObservations) {
      const listItem = document.createElement("li");
      listItem.textContent = observation;
      observations.append(listItem);
    }
    const ticks = document.createElement("p");
    ticks.textContent = `Recommended ticks: ${item.tickRangeLabel}`;
    article.append(heading, milestone, purpose, observations, ticks);
    list.append(article);
  }
  main.append(list);
  host.append(main);
}

export function createVisualTestScenarioPanel(
  entry: VisualTestEntry,
): HTMLElement {
  const panel = document.createElement("aside");
  panel.className = "visual-test-scenario-panel";
  const backLink = document.createElement("a");
  backLink.href = "/test";
  backLink.textContent = "Back to visual test menu";
  const heading = document.createElement("h1");
  heading.textContent = entry.title;
  const meta = document.createElement("p");
  meta.textContent = `${entry.milestone} · inspect ticks ${entry.recommendedTickRange.start}-${entry.recommendedTickRange.end}`;
  const observations = document.createElement("ul");
  for (const observation of entry.expectedObservations) {
    const item = document.createElement("li");
    item.textContent = observation;
    observations.append(item);
  }
  panel.append(backLink, heading, meta, observations);
  return panel;
}
