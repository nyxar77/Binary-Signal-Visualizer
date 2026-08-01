import {
  Chart,
  type ChartConfiguration,
  type ChartDataset,
  type Plugin,
} from "chart.js/auto";

type EncodingName = "unipolar" | "nrz-l" | "nrz-i" | "manchester" | "b8zs" | "hdb3";
type ThemeName = "system" | "latte" | "frappe" | "macchiato" | "mocha";
type Level = -1 | 0 | 1;

const input = document.querySelector<HTMLInputElement>("#binary-input")!;
const error = document.querySelector<HTMLDivElement>("#input-error")!;
const encodingButtons = document.querySelector<HTMLDivElement>("#encoding-buttons")!;
const legend = document.querySelector<HTMLDivElement>("#legend")!;
const themeSelect = document.querySelector<HTMLSelectElement>("#theme-select")!;
const canvas = document.querySelector<HTMLCanvasElement>("#signal-chart")!;

if (!input || !error || !encodingButtons || !legend || !themeSelect || !canvas) {
  throw new Error("Visualizer markup is incomplete.");
}

const legends: Record<EncodingName, string> = {
  unipolar: "1 is +V and 0 is 0V.",
  "nrz-l": "1 is −V and 0 is +V. The level stays constant for the bit.",
  "nrz-i": "A 1 changes the level at the start of the bit; a 0 leaves it unchanged.",
  manchester: "1 transitions high → low; 0 transitions low → high at mid-bit.",
  b8zs: "Bipolar AMI with every run of eight zeroes replaced by 000V B0V B.",
  hdb3: "Bipolar AMI with every run of four zeroes replaced by 000V or B00V.",
};

const repeat = (levels: Level[]): Level[] => levels.flatMap((level) => [level, level]);

function ami(bits: string): Level[] {
  let polarity: Level = 1;
  const signal: Level[] = [];
  for (const bit of bits) {
    if (bit === "1") {
      signal.push(polarity, polarity);
      polarity = (polarity * -1) as Level;
    } else signal.push(0, 0);
  }
  return signal;
}

function b8zs(bits: string): Level[] {
  const levels: Level[] = [];
  let polarity: Level = 1;
  for (let index = 0; index < bits.length;) {
    if (bits.slice(index, index + 8) === "00000000") {
      const previous = (polarity * -1) as Level;
      const b = polarity;
      levels.push(0, 0, 0, previous, b, 0, previous, b);
      polarity = (b * -1) as Level;
      index += 8;
      continue;
    }
    if (bits[index] === "1") {
      levels.push(polarity);
      polarity = (polarity * -1) as Level;
    } else levels.push(0);
    index += 1;
  }
  return repeat(levels);
}

function hdb3(bits: string): Level[] {
  const levels: Level[] = [];
  let polarity: Level = 1;
  let pulseCount = 0;
  for (let index = 0; index < bits.length;) {
    if (bits.slice(index, index + 4) === "0000") {
      const previous = (polarity * -1) as Level;
      const substitution: Level[] = pulseCount % 2 === 1
        ? [0, 0, 0, previous]
        : [polarity, 0, 0, polarity];
      levels.push(...substitution);
      polarity = (substitution[3] * -1) as Level;
      pulseCount = 0;
      index += 4;
      continue;
    }
    if (bits[index] === "1") {
      levels.push(polarity);
      polarity = (polarity * -1) as Level;
      pulseCount += 1;
    } else levels.push(0);
    index += 1;
  }
  return repeat(levels);
}

const encoders: Record<EncodingName, (bits: string) => Level[]> = {
  unipolar: (bits) => repeat([...bits].map((bit) => (bit === "1" ? 1 : 0))),
  "nrz-l": (bits) => repeat([...bits].map((bit) => (bit === "1" ? -1 : 1))),
  "nrz-i": (bits) => {
    let level: Level = 1;
    return repeat([...bits].map((bit) => {
      if (bit === "1") level = (level * -1) as Level;
      return level;
    }));
  },
  manchester: (bits) => bits.split("").flatMap((bit) => bit === "1" ? [1, -1] : [-1, 1]) as Level[],
  b8zs,
  hdb3,
};

let currentEncoding: EncodingName = "nrz-l";
let chart: Chart | undefined;
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

const chartPlugin: Plugin<"line"> = {
  id: "bit-markers",
  afterDraw(currentChart: Chart) {
    const bits = input.value.trim();
    if (!bits || !currentChart.chartArea) return;
    const { ctx, chartArea, scales } = currentChart;
    const width = chartArea.right - chartArea.left;
    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--grid");
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted");
    ctx.font = "600 12px system-ui";
    ctx.textAlign = "center";
    for (let index = 0; index <= bits.length; index += 1) {
      const x = chartArea.left + (width * index) / bits.length;
      ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
    }
    for (let index = 0; index < bits.length; index += 1) {
      const x = chartArea.left + (width * (index + 0.5)) / bits.length;
      ctx.fillText(bits[index], x, scales.y.getPixelForValue(1.22));
    }
    ctx.restore();
  },
};

function theme(): void {
  const selected = themeSelect.value as ThemeName;
  document.body.dataset.theme = selected === "system"
    ? (prefersDark.matches ? "mocha" : "latte")
    : selected;
}

function render(): void {
  theme();
  const bits = input.value.trim();
  document.querySelectorAll<HTMLButtonElement>("#encoding-buttons button").forEach((button) => {
    button.classList.toggle("active", button.dataset.encoding === currentEncoding);
  });
  legend.textContent = legends[currentEncoding];
  error.textContent = bits && !/^[01]+$/.test(bits) ? "Use only 0 and 1." : "";
  error.toggleAttribute("hidden", !error.textContent);
  if (!bits || error.textContent) {
    chart?.destroy(); chart = undefined; return;
  }

  chart?.destroy();
  const styles = getComputedStyle(document.body);
  const dataset: ChartDataset<"line", number[]> = {
    label: "Signal",
    data: encoders[currentEncoding](bits),
    borderColor: styles.getPropertyValue("--accent").trim(),
    backgroundColor: styles.getPropertyValue("--accent-soft").trim(),
    borderWidth: 3,
    pointRadius: 0,
    stepped: true,
    fill: true,
  };
  const config: ChartConfiguration<"line", number[]> = {
    type: "line",
    data: { labels: dataset.data.map(() => ""), datasets: [dataset] },
    plugins: [chartPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 220 },
      scales: {
        y: { min: -1.5, max: 1.5, ticks: { stepSize: 1, color: styles.getPropertyValue("--muted"), callback: (value: string | number) => value === 1 ? "+V" : value === -1 ? "−V" : "0" }, grid: { color: styles.getPropertyValue("--grid") } },
        x: { ticks: { display: false }, grid: { display: false } },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  };
  chart = new Chart(canvas, config);
}

input.addEventListener("input", render);
encodingButtons.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-encoding]");
  if (button) { currentEncoding = button.dataset.encoding as EncodingName; render(); }
});
themeSelect.addEventListener("change", render);
prefersDark.addEventListener("change", () => { if (themeSelect.value === "system") render(); });
input.value = "10101";
themeSelect.value = localStorage.getItem("binary-viz-theme") ?? "system";
themeSelect.addEventListener("change", () => localStorage.setItem("binary-viz-theme", themeSelect.value));
render();
