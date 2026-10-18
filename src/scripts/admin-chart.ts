// Daily bar chart shared by the admin statistics views: stacked bars per UTC
// day, a legend, and a hover/focus tooltip. Rendered with DOM APIs only.

import { OTHER_SERIES, type ChartDay } from "../lib/stats";

export { OTHER_SERIES, type ChartDay };
export const SERIES_COUNT = 7;

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Series color by position in the color order; Other is always gray. */
export function seriesColor(series: string[], name: string): string {
  const index = series.indexOf(name);
  return index >= 0 && index < SERIES_COUNT
    ? `var(--series-${index + 1})`
    : "var(--series-other)";
}

/** `label` gives series a readable name; without it names are shown as code. */
export function renderChartLegend(
  container: HTMLElement,
  series: string[],
  hasOther: boolean,
  label?: (name: string) => string,
): void {
  container.replaceChildren(
    ...[...series, ...(hasOther ? [OTHER_SERIES] : [])].map((name) => {
      const item = element("li");
      const swatch = element("span", "stats-swatch");
      swatch.style.background = seriesColor(series, name);
      item.append(
        swatch,
        label
          ? element("span", undefined, label(name))
          : element("span", "mono", name),
      );
      return item;
    }),
  );
}

/** A value per day drawn as a line over the bars, on the same scale. */
export interface ChartLine {
  label: string;
  /** One value per day; null where the day has no data. */
  values: Array<number | null>;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function renderChartLine(
  container: HTMLElement,
  line: ChartLine,
  maximum: number,
): void {
  const count = line.values.length;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "stats-chart-line");
  svg.setAttribute("viewBox", `0 0 ${count} 100`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  // Separate polylines so days without data leave a gap; a lone day gets a
  // short dash so it stays visible.
  let points: Array<[number, number]> = [];
  const flush = () => {
    if (points.length === 1) {
      const [x, y] = points[0];
      points = [
        [x - 0.3, y],
        [x + 0.3, y],
      ];
    }
    if (points.length) {
      const polyline = document.createElementNS(SVG_NS, "polyline");
      polyline.setAttribute(
        "points",
        points.map(([x, y]) => `${x},${y}`).join(" "),
      );
      polyline.setAttribute("vector-effect", "non-scaling-stroke");
      svg.append(polyline);
    }
    points = [];
  };
  line.values.forEach((value, index) => {
    if (value === null) {
      flush();
      return;
    }
    points.push([index + 0.5, maximum ? 100 - (value / maximum) * 100 : 100]);
  });
  flush();
  container.append(svg);
}

export function renderUsageChart(
  container: HTMLElement,
  days: ChartDay[],
  series: string[],
  format: (value: number) => string,
  line?: ChartLine,
): void {
  const maximum = Math.max(
    ...days.map((day) => day.total),
    ...(line?.values.map((value) => value ?? 0) || []),
    0,
  );
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  container.style.setProperty("--stats-days", String(days.length));
  container.replaceChildren(
    ...days.map((day, index) => {
      const column = element("div", "stats-chart-column");
      column.tabIndex = 0;
      column.dataset.dayKey = day.dayKey;
      if (day.live) column.classList.add("is-live");
      if (!day.aggregated && !day.live) column.classList.add("is-missing");
      column.setAttribute(
        "aria-label",
        !day.aggregated && !day.live
          ? `${day.dayKey} UTC: no data`
          : `${day.dayKey} UTC${day.live ? " (incomplete day)" : ""}: ${format(day.total)}${day.unpriced ? " plus usage without price" : ""}${line && line.values[index] !== null ? `, ${line.label}: ${format(line.values[index] ?? 0)}` : ""}`,
      );
      const stack = element("div", "stats-chart-stack");
      stack.style.height = maximum ? `${(day.total / maximum) * 100}%` : "0";
      for (const segment of day.segments) {
        const bar = element("div", "stats-chart-segment");
        // Shares must add up to 1: flex-grow below 1 in total leaves the
        // rest of the stack empty.
        bar.style.flexGrow = String(segment.value / day.total);
        bar.style.background = seriesColor(series, segment.series);
        stack.append(bar);
      }
      const track = element("div", "stats-chart-track");
      track.append(stack);
      const label = element(
        "span",
        "stats-chart-label",
        index % labelEvery === 0 || index === days.length - 1
          ? day.dayKey.slice(5)
          : "",
      );
      column.append(track, label);
      return column;
    }),
  );
  if (line) renderChartLine(container, line, maximum);
  const axis =
    container.parentElement?.querySelector<HTMLElement>("[data-chart-max]");
  if (axis) axis.textContent = format(maximum);
}

export function renderChartTooltip(
  tooltip: HTMLElement,
  day: ChartDay,
  series: string[],
  format: (value: number) => string,
  label?: (name: string) => string,
  extra?: string,
): void {
  const nodes: Node[] = [element("strong", undefined, `${day.dayKey} UTC`)];
  if (day.live) nodes.push(element("span", "stats-tag", "Incomplete day"));
  else if (!day.aggregated) nodes.push(element("span", "stats-tag", "No data"));
  if (day.segments.length > 1 || series.length > 1) {
    const list = element("ul");
    for (const segment of [...day.segments].sort((a, b) => b.value - a.value)) {
      const item = element("li");
      const swatch = element("span", "stats-swatch");
      swatch.style.background = seriesColor(series, segment.series);
      item.append(
        swatch,
        label
          ? element("span", "stats-tooltip-name", label(segment.series))
          : element("span", "mono", segment.series),
        element("span", "numeric", format(segment.value)),
      );
      list.append(item);
    }
    nodes.push(list);
  }
  nodes.push(
    element(
      "p",
      "stats-tooltip-total",
      `Total: ${format(day.total)}${day.unpriced ? " + no price" : ""}`,
    ),
  );
  if (extra) nodes.push(element("p", "stats-tooltip-extra", extra));
  tooltip.replaceChildren(...nodes);
}

/** Shows the tooltip beside the hovered or focused day column. `render`
 * fills the tooltip for a day key and returns false when there is no data. */
export function attachChartTooltip(
  chart: HTMLElement,
  tooltip: HTMLElement,
  render: (dayKey: string) => boolean,
): void {
  const show = (target: EventTarget | null) => {
    const column = (target as HTMLElement | null)?.closest<HTMLElement>(
      ".stats-chart-column",
    );
    if (!column || !render(column.dataset.dayKey || "")) return;
    tooltip.hidden = false;
    const card = tooltip.offsetParent?.getBoundingClientRect();
    if (!card) return;
    const box = column.getBoundingClientRect();
    // Beside the day, flipped to the left near the right edge.
    const gap = 10;
    const right = box.right - card.left + gap;
    tooltip.style.left = `${
      right + tooltip.offsetWidth <= card.width
        ? right
        : Math.max(box.left - card.left - gap - tooltip.offsetWidth, 0)
    }px`;
    tooltip.style.top = `${Math.max(box.top - card.top, 0)}px`;
  };
  const hide = () => {
    tooltip.hidden = true;
  };
  chart.addEventListener("mouseover", (event) => show(event.target));
  chart.addEventListener("mouseleave", hide);
  chart.addEventListener("focusin", (event) => show(event.target));
  chart.addEventListener("focusout", hide);
}
