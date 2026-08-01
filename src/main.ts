import {
  Chart,
  type ChartConfiguration,
  type ChartDataset,
  type Plugin,
} from "chart.js/auto";

type EncodingName = "unipolar" | "unipolar-rz" | "nrz-l" | "nrz-i" | "polar-rz" | "manchester" | "differential-manchester" | "bipolar-ami" | "b8zs" | "hdb3";
type ThemeName = "system" | "latte" | "frappe" | "macchiato" | "mocha";
type Level = -1 | 0 | 1;
type ConventionName = "thomas" | "ieee8023" | "biphase-s" | "biphase-m";

const input = document.querySelector<HTMLInputElement>("#binary-input")!;
const error = document.querySelector<HTMLDivElement>("#input-error")!;
const encodingButtons = document.querySelector<HTMLDivElement>("#encoding-buttons")!;
const legend = document.querySelector<HTMLDivElement>("#legend")!;
const flavourButtons = document.querySelector<HTMLDivElement>("#flavour-buttons")!;
const accentSwatches = document.querySelector<HTMLDivElement>("#accent-swatches")!;
const activeTheme = document.querySelector<HTMLElement>("#active-theme")!;
const themeControl = document.querySelector<HTMLDivElement>("#theme-control")!;
const themeButton = document.querySelector<HTMLButtonElement>("#theme-button")!;
const themePopover = document.querySelector<HTMLDivElement>("#theme-popover")!;
const themeButtonLabel = document.querySelector<HTMLElement>("#theme-button-label")!;
const themeDot = document.querySelector<HTMLElement>("#theme-dot")!;
const shareButton = document.querySelector<HTMLButtonElement>("#share-button")!;
const shareStatus = document.querySelector<HTMLDivElement>("#share-status")!;
const canvas = document.querySelector<HTMLCanvasElement>("#signal-chart")!;
const conventionControl = document.querySelector<HTMLLabelElement>("#convention-control")!;
const conventionSelect = document.querySelector<HTMLSelectElement>("#convention-select")!;
const standardNote = document.querySelector<HTMLSpanElement>("#standard-note")!;

if (!input || !error || !encodingButtons || !legend || !flavourButtons || !accentSwatches || !activeTheme || !themeControl || !themeButton || !themePopover || !themeButtonLabel || !themeDot || !shareButton || !shareStatus || !conventionControl || !conventionSelect || !standardNote || !canvas) {
  throw new Error("Visualizer markup is incomplete.");
}

const legends: Record<EncodingName, string> = {
  unipolar: "1 is +V and 0 is 0V. The level stays constant for the bit.",
  "unipolar-rz": "1 is +V for the first half, then returns to 0V; 0 stays at 0V.",
  "nrz-l": "1 is −V and 0 is +V. The level stays constant for the bit.",
  "nrz-i": "A 1 changes the level at the start of the bit; a 0 leaves it unchanged.",
  "polar-rz": "1 is +V for the first half and 0 is −V for the first half; both return to 0V.",
  manchester: "1 transitions high → low; 0 transitions low → high at mid-bit. The convention can be inverted.",
  "differential-manchester": "There is always a mid-bit transition. The convention controls which bit adds the boundary transition.",
  "bipolar-ami": "0 is 0V. Each 1 alternates between +V and −V.",
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
  "unipolar-rz": (bits) => bits.split("").flatMap((bit) => bit === "1" ? [1, 0] : [0, 0]) as Level[],
  "nrz-l": (bits) => repeat([...bits].map((bit) => (bit === "1" ? -1 : 1))),
  "nrz-i": (bits) => {
    let level: Level = 1;
    return repeat([...bits].map((bit) => {
      if (bit === "1") level = (level * -1) as Level;
      return level;
    }));
  },
  "polar-rz": (bits) => bits.split("").flatMap((bit) => bit === "1" ? [1, 0] : [-1, 0]) as Level[],
  manchester: (bits) => bits.split("").flatMap((bit) => {
    const one = currentConvention === "ieee8023" ? [-1, 1] : [1, -1];
    return bit === "1" ? one : [one[1], one[0]];
  }) as Level[],
  "differential-manchester": (bits) => {
    let level: Level = 1;
    return bits.split("").flatMap((bit) => {
      const boundaryTransition = currentConvention === "biphase-m" ? bit === "1" : bit === "0";
      if (boundaryTransition) level = (level * -1) as Level;
      const firstHalf = level;
      level = (level * -1) as Level;
      return [firstHalf, level];
    }) as Level[];
  },
  "bipolar-ami": ami,
  b8zs,
  hdb3,
};

let currentEncoding: EncodingName = "nrz-l";
let currentConvention: ConventionName = "thomas";
let chart: Chart | undefined;
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
const palettes = {
  latte: [["Rosewater", "#dc8a78"], ["Flamingo", "#dd7878"], ["Pink", "#ea76cb"], ["Mauve", "#8839ef"], ["Red", "#d20f39"], ["Peach", "#fe640b"], ["Yellow", "#df8e1d"], ["Green", "#40a02b"], ["Teal", "#179299"], ["Sky", "#04a5e5"], ["Sapphire", "#209fb5"], ["Blue", "#1e66f5"]],
  frappe: [["Rosewater", "#f2d5cf"], ["Flamingo", "#eebebe"], ["Pink", "#f4b8e4"], ["Mauve", "#ca9ee6"], ["Red", "#e78284"], ["Peach", "#ef9f76"], ["Yellow", "#e5c890"], ["Green", "#a6d189"], ["Teal", "#81c8be"], ["Sky", "#99d1db"], ["Sapphire", "#85c1dc"], ["Blue", "#8caaee"]],
  macchiato: [["Rosewater", "#f4dbd6"], ["Flamingo", "#f0c6c6"], ["Pink", "#f5bde6"], ["Mauve", "#c6a0f6"], ["Red", "#ed8796"], ["Peach", "#f5a97f"], ["Yellow", "#eed49f"], ["Green", "#a6da95"], ["Teal", "#8bd5ca"], ["Sky", "#91d7e3"], ["Sapphire", "#7dc4e4"], ["Blue", "#8aadf4"]],
  mocha: [["Rosewater", "#f5e0e6"], ["Flamingo", "#f2cdcd"], ["Pink", "#f5c2e7"], ["Mauve", "#cba6f7"], ["Red", "#f38ba8"], ["Peach", "#fab387"], ["Yellow", "#f9e2af"], ["Green", "#a6e3a1"], ["Teal", "#94e2d5"], ["Sky", "#89dceb"], ["Sapphire", "#74c7ec"], ["Blue", "#89b4fa"]],
} as const;
const conventionOptions: Partial<Record<EncodingName, readonly (readonly [ConventionName, string])[]>> = {
  manchester: [["thomas", "G.E. Thomas"], ["ieee8023", "IEEE 802.3"]],
  "differential-manchester": [["biphase-s", "Biphase-S · 0 transition"], ["biphase-m", "Biphase-M · 1 transition"]],
};
const fixedStandards: Partial<Record<EncodingName, string>> = {
  b8zs: "ANSI T1 / North America",
  hdb3: "ITU-T G.703 / E1",
};
let currentFlavour: ThemeName = "system";
let currentAccent = "Mauve";

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
  const selected = currentFlavour;
  const resolved = selected === "system"
    ? (prefersDark.matches ? "mocha" : "latte")
    : selected;
  document.body.dataset.theme = resolved;
  const accents = palettes[resolved];
  const accent = accents.find(([name]) => name === currentAccent)?.[1] ?? accents[3][1];
  document.body.style.setProperty("--accent", accent);
  const resolvedLabel = `${resolved[0].toUpperCase()}${resolved.slice(1)}`;
  activeTheme.textContent = `${resolvedLabel} · ${currentAccent}`;
  themeButtonLabel.textContent = resolvedLabel;
  themeDot.style.backgroundColor = accent;
  flavourButtons.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.flavour === currentFlavour));
  });
  renderAccentSwatches(accents);
}

function renderAccentSwatches(accents: readonly (readonly [string, string])[]): void {
  accentSwatches.replaceChildren(...accents.map(([name, color]) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.dataset.accent = name;
    swatch.title = name;
    swatch.setAttribute("aria-label", `${name} accent`);
    swatch.classList.toggle("active", name === currentAccent);
    swatch.style.setProperty("--swatch", color);
    return swatch;
  }));
}

function renderConventionControl(): void {
  const options = conventionOptions[currentEncoding] ?? [];
  conventionControl.hidden = options.length === 0;
  standardNote.textContent = fixedStandards[currentEncoding] ?? "";
  conventionSelect.replaceChildren(...options.map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === currentConvention;
    return option;
  }));
  conventionSelect.value = currentConvention;
}

function render(): void {
  theme();
  const bits = input.value.trim();
  renderConventionControl();
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
  if (button) {
    currentEncoding = button.dataset.encoding as EncodingName;
    currentConvention = currentEncoding === "differential-manchester" ? "biphase-s" : currentEncoding === "manchester" ? "thomas" : currentConvention;
    render();
  }
});
conventionSelect.addEventListener("change", () => {
  currentConvention = conventionSelect.value as ConventionName;
  localStorage.setItem("binary-viz-convention", currentConvention);
  render();
});
flavourButtons.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-flavour]");
  if (button) { currentFlavour = button.dataset.flavour as ThemeName; render(); saveTheme(); closeThemePopover(); }
});
accentSwatches.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-accent]");
  if (button) { currentAccent = button.dataset.accent ?? "Mauve"; render(); saveTheme(); closeThemePopover(); }
});
prefersDark.addEventListener("change", () => { if (currentFlavour === "system") render(); });
function closeThemePopover(): void {
  themePopover.hidden = true;
  themeButton.setAttribute("aria-expanded", "false");
}

themeButton.addEventListener("click", () => {
  const isOpen = !themePopover.hidden;
  themePopover.hidden = isOpen;
  themeButton.setAttribute("aria-expanded", String(!isOpen));
});
document.addEventListener("pointerdown", (event) => {
  if (!themeControl.contains(event.target as Node)) closeThemePopover();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeThemePopover();
});

const url = new URL(window.location.href);
const sharedEncoding = url.searchParams.get("encoding") as EncodingName | null;
input.value = url.searchParams.get("bits") ?? "10101";
if (sharedEncoding && sharedEncoding in encoders) currentEncoding = sharedEncoding;
const savedTheme = JSON.parse(localStorage.getItem("binary-viz-theme") ?? "null") as { flavour?: ThemeName; accent?: string } | null;
currentFlavour = savedTheme?.flavour ?? "system";
currentAccent = savedTheme?.accent ?? "Mauve";
currentConvention = (localStorage.getItem("binary-viz-convention") as ConventionName | null) ?? "thomas";
function saveTheme(): void {
  localStorage.setItem("binary-viz-theme", JSON.stringify({ flavour: currentFlavour, accent: currentAccent }));
}
shareButton.addEventListener("click", async () => {
  const shareUrl = new URL(window.location.href);
  shareUrl.search = new URLSearchParams({ bits: input.value.trim(), encoding: currentEncoding }).toString();
  try {
    await navigator.clipboard.writeText(shareUrl.toString());
    shareStatus.textContent = "Link copied.";
  } catch {
    shareStatus.textContent = "Copy failed — use the page URL after entering a sequence.";
  }
  window.setTimeout(() => { shareStatus.textContent = ""; }, 2200);
});
render();
