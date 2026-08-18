"use strict";

/* ============================================================================
   Paddy Field Scout · static GitHub Pages build
   1. Constants and ontology
   2. Application state
   3. Persistence
   4. DOM utilities
   5. Image loading
   6. Feature extraction
   7. Image hash / duplicate detection
   8. Quality gate
   9. ONNX runtime
   10. Cloud / demo inference
   11. Result resolution
   12. Frame management
   13. Agronomist review
   14. Plot roll-up
   15. CSV export
   16. Rendering
   17. Event listeners / responsive behaviour
   ============================================================================ */

/* 1. Constants and ontology -------------------------------------------------- */
const CROPIN_LOGO = "https://www.cropin.com/wp-content/uploads/2025/07/CropinLogo.svg";
const ORT_CDN = "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.19.2/ort.min.js";
const CLOUD_INFERENCE_ENDPOINT = ""; // Configure in Setup. Never put an API key in this file.
const MIN_PLOT_FRAMES = 5;
const ABSTAIN_AT = 0.55;

const CLASSES = [
  { id: "normal", name: "Normal leaf", sci: "—", cat: "healthy", kind: "healthy", release: "both" },
  { id: "bacterial_leaf_blight", name: "Bacterial leaf blight", sci: "Xanthomonas oryzae pv. oryzae", cat: "bacterial", kind: "disease", release: "both" },
  { id: "bacterial_leaf_streak", name: "Bacterial leaf streak", sci: "X. oryzae pv. oryzicola", cat: "bacterial", kind: "disease", release: "both" },
  { id: "bacterial_panicle_blight", name: "Bacterial panicle blight", sci: "Burkholderia glumae", cat: "bacterial", kind: "disease", release: "both" },
  { id: "blast", name: "Blast", sci: "Pyricularia oryzae", cat: "fungal", kind: "disease", release: "both" },
  { id: "brown_spot", name: "Brown spot", sci: "Bipolaris oryzae", cat: "fungal", kind: "disease", release: "both" },
  { id: "downy_mildew", name: "Downy mildew", sci: "Sclerophthora macrospora", cat: "oomycete", kind: "disease", release: "both" },
  { id: "tungro", name: "Tungro", sci: "RTBV / RTSV complex", cat: "viral", kind: "disease", release: "both", note: "Vectored by green leafhopper (Nephotettix spp.)" },
  { id: "hispa", name: "Hispa", sci: "Dicladispa armigera", cat: "insect", kind: "pest", release: "both", damage: "Scraped upper epidermis, white parallel streaks, mined blades" },
  { id: "leaf_roller", name: "Leaf roller", sci: "Cnaphalocrocis medinalis", cat: "insect", kind: "pest", release: "both", damage: "Longitudinally rolled leaves with white scraped stripes" },
  { id: "yellow_stem_borer", name: "Yellow stem borer", sci: "Scirpophaga incertulas", cat: "insect", kind: "pest", release: "full", damage: "Dead heart at tillering, whitehead at panicle" },
  { id: "white_stem_borer", name: "White stem borer", sci: "Scirpophaga innotata", cat: "insect", kind: "pest", release: "full", damage: "Dead heart at tillering, whitehead at panicle" },
  { id: "black_stem_borer", name: "Black stem borer", sci: "Chilo polychrysus", cat: "insect", kind: "pest", release: "full", damage: "Dead heart at tillering, whitehead at panicle" },
  {
    id: "dead_heart", name: "Dead heart", sci: "—", cat: "insect", kind: "symptom", release: "subset",
    causedBy: ["yellow_stem_borer", "white_stem_borer", "black_stem_borer"],
    note: "A symptom, not an organism. Three borer species produce it identically; species separation needs larval examination inside the culm."
  },
];

const VISITS = [
  { n: 1, label: "Establishment", bbch: "00–13" },
  { n: 2, label: "Tillering", bbch: "21–29" },
  { n: 3, label: "Panicle initiation", bbch: "30–49" },
  { n: 4, label: "Heading", bbch: "51–69" },
  { n: 5, label: "Grain fill", bbch: "71–89" },
];

const SEVERITY = [
  { v: 0, label: "Clean", range: "0%" },
  { v: 1, label: "Trace", range: "<5%" },
  { v: 2, label: "Mild", range: "5–15%" },
  { v: 3, label: "Moderate", range: "15–40%" },
  { v: 4, label: "Severe", range: ">40%" },
];

const GATE = {
  minMegapixels: 0.3,
  minSharpness: 60,
  exposureLow: 45,
  exposureHigh: 210,
  maxClipped: 0.15,
  minVegFraction: 0.05,
  dupHamming: 5,
};

const NAV_DESKTOP = [
  ["analyze", "Analyze", "scan-search"],
  ["frames", "Frames", "layers"],
  ["plot", "Plot Insights", "chart"],
  ["review", "Review", "clipboard-check"],
  ["setup", "Setup", "settings"],
];
const NAV_MOBILE = [
  ["analyze", "Capture", "camera"],
  ["frames", "Frames", "layers"],
  ["plot", "Plot", "chart"],
  ["setup", "Setup", "settings"],
];

const ICONS = {
  "monitor": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  "smartphone": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  "sprout": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 20h10M12 20v-8M12 12C8 12 5 9 5 5c4 0 7 3 7 7Zm0 0c4 0 7-3 7-7-4 0-7 3-7 7Z"/></svg>',
  "scan-search": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3"/><circle cx="11" cy="11" r="4"/><path d="m14 14 3 3"/></svg>',
  "camera": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2h5Z"/><circle cx="12" cy="12" r="3"/></svg>',
  "image": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  "upload": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  "layers": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>',
  "chart": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
  "clipboard-check": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 13l2 2 4-4"/></svg>',
  "settings": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  "wifi": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0"/></svg>',
  "wifi-off": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M8.5 16a5 5 0 0 1 5.2-1.2M5 12.5a10 10 0 0 1 4.6-2.5M2 9a15 15 0 0 1 3.3-1.9M14.5 9.8A10 10 0 0 1 19 12.5M12 20h.01M13 6.1A15 15 0 0 1 22 9"/></svg>',
  "cpu": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
  "shield": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  "alert": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  "check": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  "x": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  "download": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>',
  "copy": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  "trash": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>',
  "eye": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  "rotate": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0-2 5.3M20 4v7h-7"/></svg>',
  "microscope": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 18 3-3M3 21h18M13 6l4 4M11 8l4 4M8 3l8 8-3 3-8-8 3-3Z"/><path d="M12 19a6 6 0 0 0 6-6"/></svg>',
  "chevron": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>',
};

/* 2. Application state ------------------------------------------------------ */
const state = {
  tab: "analyze",
  mode: null,
  plotId: "NLR-001",
  district: "SPSR Nellore",
  visit: 2,
  demoMode: false,
  modelUrl: "",
  metadataUrl: "",
  cloudEndpoint: CLOUD_INFERENCE_ENDPOINT,
  items: [],
  selectedFrameId: null,
  online: navigator.onLine,
  engine: { mode: "browser", status: "Browser feature analysis active", session: null, meta: null },
  processing: null,
};

const dom = {};
let ortPromise = null;

/* 3. Persistence ------------------------------------------------------------ */
const STORAGE_KEY = "cropin_paddy_scout_v2";
function loadPreferences() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (_) { saved = {}; }
  state.plotId = typeof saved.plotId === "string" ? saved.plotId : state.plotId;
  state.district = typeof saved.district === "string" ? saved.district : state.district;
  state.visit = VISITS.some(v => v.n === Number(saved.visit)) ? Number(saved.visit) : state.visit;
  state.demoMode = Boolean(saved.demoMode);
  state.modelUrl = typeof saved.modelUrl === "string" ? saved.modelUrl : "";
  state.metadataUrl = typeof saved.metadataUrl === "string" ? saved.metadataUrl : "";
  state.cloudEndpoint = typeof saved.cloudEndpoint === "string" ? saved.cloudEndpoint : CLOUD_INFERENCE_ENDPOINT;
  state.mode = saved.mode === "desktop" || saved.mode === "mobile"
    ? saved.mode
    : (window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop");
}
function savePreferences() {
  const payload = {
    plotId: state.plotId,
    district: state.district,
    visit: state.visit,
    demoMode: state.demoMode,
    modelUrl: state.modelUrl,
    metadataUrl: state.metadataUrl,
    cloudEndpoint: state.cloudEndpoint,
    mode: state.mode,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/* 4. DOM utilities ---------------------------------------------------------- */
function icon(name) { return ICONS[name] || ICONS.sprout; }
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}
function fmtPct(n, digits = 0) {
  return n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : `${(Number(n) * 100).toFixed(digits)}%`;
}
function cls(id) {
  return CLASSES.find(c => c.id === id) || { id, name: id === "unlisted" ? "Outside class set" : (id || "Unknown"), sci: "—", cat: "abiotic", kind: "unknown" };
}
function sevInfo(v) { return SEVERITY.find(s => s.v === Number(v)) || SEVERITY[0]; }
function badge(text, kind = "neutral") { return `<span class="status-badge badge-${kind}">${escapeHTML(text)}</span>`; }
function gateBadge(gate) { return badge(gate.decision.toUpperCase(), gate.decision); }
function sourceLabel(source) {
  if (source === "device") return "On-device ONNX";
  if (source === "cloud") return "Cloud endpoint";
  if (source === "demo") return "Demo inference";
  return "No inference";
}
function currentEngineLabel() {
  if (state.engine.mode === "device" && state.engine.session) return "On-device ONNX";
  if (state.demoMode) return "Demo inference";
  if (state.cloudEndpoint) return "Cloud endpoint";
  return "Browser analysis";
}
function showToast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " error" : ""}`;
  el.textContent = message;
  dom.toastRegion.appendChild(el);
  setTimeout(() => el.remove(), 3300);
}
function setBusy(on, title = "Analyzing image", detail = "Running local feature extraction…") {
  dom.busyOverlay.hidden = !on;
  dom.busyTitle.textContent = title;
  dom.busyDetail.textContent = detail;
}
function nextPaint() { return new Promise(resolve => requestAnimationFrame(() => resolve())); }
function safeDate(ts) {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts)); }
  catch (_) { return new Date(ts).toLocaleString(); }
}
function bytesLabel(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
function setProcessing(frameId, step, label) {
  state.processing = { frameId, step, label };
  renderHeader();
  if (state.tab === "analyze") renderMain();
}

/* 5. Image loading ---------------------------------------------------------- */
function isSupportedImage(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const extOk = /\.(jpe?g|png|webp)$/i.test(file.name || "");
  return allowedTypes.includes(file.type) || (!file.type && extOk);
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}
function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The selected image could not be decoded."));
    img.src = dataUrl;
  });
}
function scaledCanvas(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(8, Math.round((img.naturalWidth || img.width) * scale));
  c.height = Math.max(8, Math.round((img.naturalHeight || img.height) * scale));
  c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/* 6. Feature extraction ----------------------------------------------------- */
function extractFeatures(canvas) {
  const { width: W, height: H } = canvas;
  const px = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  let lum = 0, clip = 0, veg = 0, exgS = 0, chl = 0, nec = 0;
  const n = W * H;
  const gray = new Float32Array(n);

  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[p] = L;
    lum += L;
    if (L < 8 || L > 247) clip++;
    const s = r + g + b || 1;
    const exg = 2 * (g / s) - r / s - b / s;
    exgS += exg;
    if (exg > 0.05) {
      veg++;
      if (r > g * 0.85 && g > b * 1.2 && L > 90) chl++;
      if (r > g * 1.05 && L < 130) nec++;
    }
  }

  let s1 = 0, s2 = 0, count = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const v = gray[i - W] + gray[i + W] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      s1 += v;
      s2 += v * v;
      count++;
    }
  }
  const mean = count ? s1 / count : 0;
  return {
    sharpness: +(count ? (s2 / count - mean * mean) : 0).toFixed(1),
    exposure: +(lum / n).toFixed(1),
    clippedFrac: +(clip / n).toFixed(3),
    vegFraction: +(veg / n).toFixed(3),
    exg: +(exgS / n).toFixed(4),
    chlorosisFrac: veg ? +(chl / veg).toFixed(3) : 0,
    necrosisFrac: veg ? +(nec / veg).toFixed(3) : 0,
  };
}

/* 7. Image hash / duplicate detection -------------------------------------- */
function aHash(src) {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 8;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  const values = [];
  for (let i = 0; i < d.length; i += 4) values.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.map(v => v >= mean ? "1" : "0").join("");
}
function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/* 8. Quality gate ----------------------------------------------------------- */
function curationGate(f, dupOf) {
  const reasons = [];
  let decision = "accept";
  if (dupOf) { reasons.push(`Duplicate of ${dupOf}`); decision = "reject"; }
  if (f.megapixels < GATE.minMegapixels) { reasons.push(`${f.megapixels} MP too low`); decision = "reject"; }
  if (f.sharpness < GATE.minSharpness) { reasons.push(`Sharpness ${f.sharpness} — too blurred`); decision = "reject"; }
  if (f.vegFraction < GATE.minVegFraction) { reasons.push(`Only ${(f.vegFraction * 100).toFixed(0)}% vegetation`); decision = "reject"; }
  if (decision !== "reject") {
    if (f.exposure < GATE.exposureLow) { reasons.push(`Too dark (${f.exposure})`); decision = "review"; }
    else if (f.exposure > GATE.exposureHigh) { reasons.push(`Too bright (${f.exposure})`); decision = "review"; }
    if (f.clippedFrac > GATE.maxClipped) { reasons.push(`${(f.clippedFrac * 100).toFixed(0)}% clipped`); decision = "review"; }
  }
  if (!reasons.length) reasons.push("All gates passed");
  return { decision, reasons };
}

/* 9. ONNX runtime ----------------------------------------------------------- */
function loadOrt() {
  if (window.ort) return Promise.resolve(window.ort);
  if (ortPromise) return ortPromise;
  ortPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = ORT_CDN;
    s.async = true;
    s.onload = () => window.ort ? resolve(window.ort) : reject(new Error("ONNX Runtime loaded but did not attach to window."));
    s.onerror = () => reject(new Error("Could not load onnxruntime-web from the CDN."));
    document.head.appendChild(s);
  });
  return ortPromise;
}
function preprocess(img, size, mean, std) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = (size * 1.15) / Math.min(iw, ih);
  const w = Math.round(iw * scale), h = Math.round(ih * scale);
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  c.getContext("2d", { willReadFrequently: true }).drawImage(img, (w - size) / -2, (h - size) / -2, w, h);
  const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, size, size).data;
  const out = new Float32Array(3 * size * size);
  const n = size * size;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    out[p] = (d[i] / 255 - mean[0]) / std[0];
    out[n + p] = (d[i + 1] / 255 - mean[1]) / std[1];
    out[2 * n + p] = (d[i + 2] / 255 - mean[2]) / std[2];
  }
  return out;
}
function softmax(logits, temperature = 1) {
  const z = logits.map(v => v / temperature);
  const max = Math.max(...z);
  const exps = z.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}
async function connectModel() {
  if (!state.modelUrl || !state.metadataUrl) {
    showToast("Enter both the ONNX model URL and metadata URL.", "error");
    return;
  }
  setBusy(true, "Loading ONNX model", "Loading browser runtime and model metadata…");
  try {
    const ort = await loadOrt();
    const metaResponse = await fetch(state.metadataUrl);
    if (!metaResponse.ok) throw new Error(`Metadata request returned HTTP ${metaResponse.status}.`);
    const meta = await metaResponse.json();
    if (!Array.isArray(meta.classes) || !meta.classes.length) throw new Error("Metadata does not contain a classes array.");
    const session = await ort.InferenceSession.create(state.modelUrl, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    state.engine = { mode: "device", status: `ONNX model loaded · ${meta.backbone || "model"} · ${meta.classes.length} classes`, session, meta };
    showToast("ONNX model loaded. Inference can now run on this device.");
  } catch (err) {
    state.engine = { mode: "browser", status: `ONNX load failed · ${err.message}`, session: null, meta: null };
    showToast(`Model load failed: ${err.message}`, "error");
  } finally {
    setBusy(false);
    renderAll();
  }
}
async function inferOnDevice(item) {
  const ort = await loadOrt();
  const { session, meta } = state.engine;
  const size = Number(meta.input_size || 320);
  const normalisation = meta.normalisation || {};
  const mean = normalisation.mean || [0.485, 0.456, 0.406];
  const std = normalisation.std || [0.229, 0.224, 0.225];
  const data = preprocess(item.img, size, mean, std);
  const tensor = new ort.Tensor("float32", data, [1, 3, size, size]);
  const inputName = session.inputNames?.[0] || "input";
  const output = await session.run({ [inputName]: tensor });
  const first = output[Object.keys(output)[0]];
  const logits = Array.from(first.data);
  const probs = softmax(logits, Number(meta.temperature || 1));
  const order = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
  const [topP, topI] = order[0];
  const area = Math.min(100, Math.round((item.features.necrosisFrac + item.features.chlorosisFrac) * 100));
  const severity = severityFromArea(area);
  const classId = meta.classes[topI] || "unlisted";
  const visit = VISITS.find(v => v.n === item.visit);
  return {
    usable: true,
    crop_ok: true,
    source: "device",
    stage: {
      observed_label: visit?.label || "—",
      bbch: visit?.bbch || "—",
      confidence: null,
      matches_expected: null,
      evidence: "Stage head not configured; visit prior shown unconfirmed."
    },
    primary: {
      class_id: classId,
      agent_class_id: null,
      agent_note: "",
      confidence: topP,
      severity_class: classId === "normal" ? 0 : severity,
      affected_pct: classId === "normal" ? 0 : area,
      evidence: "Classifier output; severity estimated from measured symptomatic area."
    },
    secondary: order.slice(1, 3).map(([p, i]) => ({ class_id: meta.classes[i] || "unlisted", confidence: p })),
    differentials: [],
    abstain: topP < ABSTAIN_AT,
    abstain_reason: `Top confidence ${fmtPct(topP)} is below the ${Math.round(ABSTAIN_AT * 100)}% inference threshold. Route to agronomist review.`,
    advisory: null,
  };
}

/* 10. Cloud / demo inference ----------------------------------------------- */
function severityFromArea(area) {
  const a = Number(area || 0);
  return a < 1 ? 0 : a < 5 ? 1 : a < 15 ? 2 : a < 40 ? 3 : 4;
}
function hashSeed(hash) {
  let n = 2166136261;
  for (const ch of hash || "0") {
    n ^= ch.charCodeAt(0);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}
function demoInference(item) {
  const seed = hashSeed(item.hash + item.visit);
  const pool = [
    "normal", "bacterial_leaf_blight", "blast", "brown_spot", "tungro", "hispa", "leaf_roller", "dead_heart",
    "bacterial_leaf_streak", "downy_mildew"
  ];
  let classId = pool[seed % pool.length];
  const symptomArea = Math.min(78, Math.round((item.features.chlorosisFrac + item.features.necrosisFrac) * 100));
  if (item.features.vegFraction > 0.65 && symptomArea < 3 && (seed % 3 === 0)) classId = "normal";
  const rawConfidence = 0.48 + ((seed >>> 8) % 46) / 100;
  const confidence = Math.min(0.94, Number(rawConfidence.toFixed(2)));
  const area = classId === "normal" ? 0 : Math.max(2, symptomArea || (5 + (seed % 24)));
  const severity = classId === "normal" ? 0 : severityFromArea(area);
  const currentVisit = VISITS.find(v => v.n === item.visit);
  const offSchedule = (seed % 9 === 0 && item.visit > 1);
  const observedVisit = offSchedule ? VISITS[Math.max(0, item.visit - 2)] : currentVisit;
  const primary = {
    class_id: classId,
    agent_class_id: null,
    agent_note: "",
    confidence,
    severity_class: severity,
    affected_pct: area,
    evidence: classId === "normal" ? "Demo label generated deterministically; local tissue measurements remain real." : "Deterministic demo classification; verify with a trained production model or agronomist."
  };
  if (classId === "dead_heart") {
    primary.agent_class_id = null;
    primary.agent_note = "Borer species is intentionally unresolved from the photograph alone.";
  }
  const advisoryMap = {
    normal: { urgency: "routine", actions: ["Continue scheduled scouting and maintain the current sampling pattern."], moa: [] },
    bacterial_leaf_blight: { urgency: severity >= 3 ? "act_now" : "monitor", actions: ["Inspect adjacent plants and confirm lesion progression before intervention."], moa: [] },
    blast: { urgency: severity >= 3 ? "act_now" : "monitor", actions: ["Confirm lesion morphology across multiple leaves and check field-level spread."], moa: ["FRAC group selection only after agronomic confirmation"] },
    brown_spot: { urgency: "monitor", actions: ["Check whether symptoms are consistent across the canopy and assess field nutrition context."], moa: [] },
    tungro: { urgency: "act_now", actions: ["Inspect for vector pressure and map symptomatic clusters for agronomist review."], moa: [] },
    hispa: { urgency: "monitor", actions: ["Inspect leaf scraping and adult presence across additional plants."], moa: ["IRAC group selection only after pest confirmation"] },
    leaf_roller: { urgency: "monitor", actions: ["Open rolled leaves to confirm larvae and assess spread across sampled plants."], moa: ["IRAC group selection only after pest confirmation"] },
    dead_heart: { urgency: "act_now", actions: ["Open affected culms to confirm larval presence and resolve the causal borer species."], moa: [] },
  };
  const abstain = confidence < ABSTAIN_AT;
  return {
    usable: true,
    crop_ok: true,
    crop_note: "",
    source: "demo",
    stage: {
      observed_label: observedVisit?.label || currentVisit?.label || "—",
      bbch: observedVisit?.bbch || currentVisit?.bbch || "—",
      confidence: Number((0.72 + (seed % 19) / 100).toFixed(2)),
      matches_expected: !offSchedule,
      evidence: offSchedule ? "Demo stage output is earlier than the configured visit expectation." : "Demo stage output aligns with the configured visit expectation."
    },
    primary,
    secondary: [],
    differentials: classId === "bacterial_leaf_blight" ? [{ class_id: "bacterial_leaf_streak", how_to_confirm: "Compare lesion width and streak pattern on additional leaves." }] : [],
    abstain,
    abstain_reason: abstain ? `Demo confidence ${fmtPct(confidence)} is below the ${Math.round(ABSTAIN_AT * 100)}% threshold. Prediction withheld.` : "",
    advisory: advisoryMap[classId] || { urgency: "monitor", actions: ["Route the observation for agronomist confirmation."], moa: [] },
  };
}
async function inferCloud(item) {
  if (!state.cloudEndpoint) throw new Error("No cloud inference endpoint is configured.");
  const payload = {
    image: item.preview.split(",")[1],
    media_type: "image/jpeg",
    features: item.features,
    plot_id: item.plotId,
    district: item.district,
    visit: item.visit,
    metadata: { filename: item.name, width: item.width, height: item.height, gate: item.gate },
    ontology: CLASSES.map(({ id, name, sci, cat, kind, causedBy }) => ({ id, name, sci, cat, kind, causedBy })),
    constraints: { abstain_at: ABSTAIN_AT, chemistry: "FRAC/IRAC groups only" },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(state.cloudEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Inference endpoint returned HTTP ${response.status}: ${text.slice(0, 180)}`);
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new Error("Inference endpoint returned invalid JSON."); }
    const result = data.result || data;
    validateInferenceResult(result);
    result.source = "cloud";
    return result;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Inference endpoint timed out after 25 seconds.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
function validateInferenceResult(r) {
  if (!r || typeof r !== "object") throw new Error("Inference response is empty.");
  if (!r.primary || typeof r.primary.class_id !== "string") throw new Error("Inference response is missing primary.class_id.");
  if (typeof r.primary.confidence !== "number") throw new Error("Inference response is missing numeric primary.confidence.");
  if (!Array.isArray(r.secondary)) r.secondary = [];
  if (!Array.isArray(r.differentials)) r.differentials = [];
}
async function runInference(item) {
  if (item.gate.decision === "reject") return;
  item.status = "running";
  item.error = null;
  item.errorDetail = null;
  renderAll();
  setProcessing(item.id, 5, "Disease & pest analysis");
  setBusy(true, "Analyzing crop image", currentEngineLabel());
  try {
    let result = null;
    if (state.engine.mode === "device" && state.engine.session) result = await inferOnDevice(item);
    else if (state.demoMode) result = demoInference(item);
    else if (state.cloudEndpoint) result = await inferCloud(item);
    else {
      item.status = "curated";
      item.result = null;
      showToast("Local analysis complete. Enable Demo Mode, load ONNX, or configure a cloud endpoint for diagnosis.");
      return;
    }
    setProcessing(item.id, 6, "Severity estimation");
    await nextPaint();
    item.result = result;
    item.status = "done";
    setProcessing(item.id, 7, "Result ready");
  } catch (err) {
    item.status = "error";
    item.error = state.engine.mode === "device" ? "On-device inference failed for this frame." : "Inference did not return a usable result. Local quality measurements are still valid.";
    item.errorDetail = String(err?.message || err);
    showToast(item.error, "error");
  } finally {
    state.processing = null;
    setBusy(false);
    renderAll();
  }
}

/* 11. Result resolution ----------------------------------------------------- */
function resolveFinding(result) {
  if (!result?.primary) return null;
  const primary = cls(result.primary.class_id);
  const secondaries = result.secondary || [];
  if (primary.kind === "symptom") {
    const explicit = result.primary.agent_class_id;
    const fromSecondary = secondaries.find(s => (primary.causedBy || []).includes(s.class_id));
    const agentId = explicit || fromSecondary?.class_id || null;
    return {
      symptom: { ...primary, confidence: result.primary.confidence },
      agent: agentId ? { ...cls(agentId), confidence: explicit ? null : fromSecondary?.confidence } : null,
      agentResolved: Boolean(agentId),
      candidates: primary.causedBy || [],
      consumedIds: agentId ? [agentId] : [],
    };
  }
  if (primary.kind === "pest") {
    return {
      symptom: primary.damage ? { name: primary.damage, kind: "symptom" } : null,
      agent: { ...primary, confidence: result.primary.confidence },
      agentResolved: true,
      candidates: [],
      consumedIds: secondaries.filter(s => cls(s.class_id).kind === "symptom" && (cls(s.class_id).causedBy || []).includes(primary.id)).map(s => s.class_id),
    };
  }
  return { symptom: { ...primary, confidence: result.primary.confidence }, agent: null, agentResolved: true, candidates: [], consumedIds: [] };
}

/* 12. Frame management ------------------------------------------------------ */
async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  for (const file of files) {
    if (!isSupportedImage(file)) {
      showToast(`${file.name || "File"} is not a supported JPG, PNG or WEBP image.`, "error");
      continue;
    }
    try { await processFile(file); }
    catch (err) { showToast(`${file.name}: ${err.message}`, "error"); }
  }
  renderAll();
}
async function processFile(file) {
  setBusy(true, "Reading crop image", "Decoding image locally in your browser…");
  const dataUrl = await fileToDataUrl(file);
  const img = await dataUrlToImage(dataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const mp = (width * height) / 1e6;
  const analysisCanvas = scaledCanvas(img, 512);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setProcessing(id, 2, "Quality validation");
  await nextPaint();
  const features = { ...extractFeatures(analysisCanvas), megapixels: +mp.toFixed(2) };
  setProcessing(id, 3, "Feature extraction");
  const hash = aHash(analysisCanvas);
  const dup = state.items.find(p => p.hash && hamming(p.hash, hash) <= GATE.dupHamming);
  const gate = curationGate(features, dup ? dup.name : null);
  const previewCanvas = scaledCanvas(img, 1280);
  const preview = previewCanvas.toDataURL("image/jpeg", 0.88);
  const item = {
    id,
    name: file.name || `frame_${Date.now()}.jpg`,
    timestamp: Date.now(),
    preview,
    img,
    width,
    height,
    fileSize: file.size || 0,
    visit: state.visit,
    plotId: state.plotId,
    district: state.district,
    hash,
    features,
    gate,
    status: gate.decision === "reject" ? "rejected" : "curated",
    result: null,
    review: null,
  };
  state.items.unshift(item);
  state.selectedFrameId = item.id;
  setProcessing(id, 4, "Crop verification");
  renderAll();
  setBusy(false);
  if (gate.decision === "reject") {
    state.processing = null;
    showToast(`Rejected before model inference: ${gate.reasons.join(" · ")}`, "error");
    return;
  }
  await runInference(item);
}
function selectedFrame() {
  return state.items.find(i => i.id === state.selectedFrameId) || state.items[0] || null;
}
function viewFrame(id) {
  state.selectedFrameId = id;
  state.tab = "analyze";
  renderAll();
  dom.mainContent.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function removeFrame(id) {
  state.items = state.items.filter(i => i.id !== id);
  if (state.selectedFrameId === id) state.selectedFrameId = state.items[0]?.id || null;
  renderAll();
  showToast("Frame removed from this session.");
}
function clearFrames() {
  state.items = [];
  state.selectedFrameId = null;
  renderAll();
  showToast("Session frames cleared.");
}
function retryFrame(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  if (item.gate.decision === "reject") {
    showToast("This frame failed the curation gate. Recapture a suitable image rather than bypassing the gate.", "error");
    return;
  }
  runInference(item);
}

/* 13. Agronomist review ----------------------------------------------------- */
function setReview(id, classId, severity) {
  const item = state.items.find(i => i.id === id);
  if (!item || !item.result) return;
  const previous = item.review || {};
  item.review = {
    classId: classId || previous.classId || item.result.primary?.class_id || "unlisted",
    severity: Number.isFinite(Number(severity)) ? Number(severity) : (previous.severity ?? item.result.primary?.severity_class ?? 0),
    timestamp: Date.now(),
  };
  renderAll();
  showToast(previous.timestamp ? "Agronomist review updated." : "Agronomist review confirmed.");
}
function reviewNeedsAttention(item) {
  if (!item) return false;
  if (item.gate.decision === "review") return true;
  if (item.result?.abstain) return true;
  if (item.result?.primary?.class_id === "unlisted") return true;
  const fin = resolveFinding(item.result);
  if (fin?.candidates?.length && !fin.agentResolved) return true;
  if (item.review && item.result && (item.review.classId !== item.result.primary.class_id || item.review.severity !== item.result.primary.severity_class)) return true;
  return false;
}

/* 14. Plot roll-up ---------------------------------------------------------- */
function plotRollup() {
  const scored = state.items.filter(i => i.result?.usable && !i.result.abstain);
  if (!scored.length) return null;
  const severities = scored.map(i => i.review ? i.review.severity : (i.result.primary?.severity_class ?? 0));
  const mck = (severities.reduce((a, b) => a + Number(b || 0), 0) / (scored.length * 4)) * 100;
  const tally = {};
  scored.forEach(i => {
    const name = cls(i.review ? i.review.classId : i.result.primary?.class_id).name;
    tally[name] = (tally[name] || 0) + 1;
  });
  const dominant = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const accepted = state.items.filter(i => i.gate.decision === "accept").length;
  const rejected = state.items.filter(i => i.gate.decision === "reject").length;
  const withheld = state.items.filter(i => i.result?.abstain).length;
  const reviewed = state.items.filter(i => i.review).length;
  return {
    n: scored.length,
    reportable: scored.length >= MIN_PLOT_FRAMES,
    incidence: severities.filter(s => s >= 1).length / scored.length * 100,
    mck,
    dominant: dominant ? `${dominant[0]} (${dominant[1]}/${scored.length})` : "—",
    tally,
    accepted,
    rejected,
    withheld,
    reviewed,
    priority: mck >= 25 ? "Act Now" : mck >= 8 ? "Monitor" : "Routine",
  };
}

/* 15. CSV export ------------------------------------------------------------ */
function csvRows() {
  const head = [
    "timestamp", "image", "plot_id", "district", "visit", "gate", "gate_reason", "megapixels", "sharpness", "exposure",
    "vegetation_fraction", "exg", "chlorosis", "necrosis", "inference_source", "predicted_class", "model_confidence", "model_severity",
    "affected_pct", "abstained", "reviewer_class", "reviewer_severity"
  ];
  const rows = [head];
  state.items.forEach(i => {
    const f = i.features, r = i.result, v = i.review;
    rows.push([
      new Date(i.timestamp).toISOString(), i.name, i.plotId, i.district, i.visit, i.gate.decision, i.gate.reasons.join("; "),
      f.megapixels, f.sharpness, f.exposure, f.vegFraction, f.exg, f.chlorosisFrac, f.necrosisFrac,
      r?.source || "", r?.primary?.class_id || "", r?.primary?.confidence ?? "", r?.primary?.severity_class ?? "",
      r?.primary?.affected_pct ?? "", r?.abstain ? "yes" : "no", v?.classId || "", v?.severity ?? ""
    ]);
  });
  return rows;
}
function csvText() {
  return csvRows().map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}
function downloadCsv() {
  if (!state.items.length) { showToast("No frame records to export.", "error"); return; }
  const blob = new Blob([csvText()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paddy-field-scout-${state.plotId || "plot"}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("CSV downloaded.");
}
async function copyCsv() {
  if (!state.items.length) { showToast("No frame records to copy.", "error"); return; }
  try { await navigator.clipboard.writeText(csvText()); showToast("CSV copied to clipboard."); }
  catch (_) { showToast("Clipboard access is unavailable in this browser.", "error"); }
}

/* 16. Rendering ------------------------------------------------------------- */
function renderAll() {
  document.getElementById("app").classList.toggle("mode-mobile", state.mode === "mobile");
  renderHeader();
  renderNav();
  renderMobileTopbar();
  renderMain();
  bindPageEvents();
}
function renderHeader() {
  dom.headerPlot.textContent = state.plotId || "—";
  dom.headerDistrict.textContent = state.district || "—";
  dom.headerVisit.textContent = `V${state.visit}`;
  dom.headerNetwork.textContent = state.online ? "Online" : "Offline";
  dom.headerEngine.textContent = currentEngineLabel();
  dom.demoBadge.hidden = !state.demoMode;
  document.querySelectorAll(".view-switch__button").forEach(btn => {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}
function renderNav() {
  const attention = state.items.filter(reviewNeedsAttention).length;
  dom.desktopNav.innerHTML = NAV_DESKTOP.map(([key, label, ico]) => {
    let count = "";
    if (key === "frames" && state.items.length) count = `<span class="nav-count">${state.items.length}</span>`;
    if (key === "review" && attention) count = `<span class="nav-count">${attention}</span>`;
    return `<button class="nav-button ${state.tab === key ? "active" : ""}" data-tab="${key}" type="button"><span class="icon">${icon(ico)}</span><span class="nav-label">${label}</span>${count}</button>`;
  }).join("");
  dom.mobileNav.innerHTML = NAV_MOBILE.map(([key, label, ico]) => {
    const count = key === "frames" && state.items.length ? `<span class="mobile-nav-count">${state.items.length}</span>` : "";
    return `<button class="mobile-nav-btn ${state.tab === key || (key === "analyze" && state.tab === "review") ? "active" : ""}" data-tab="${key}" type="button"><span class="icon">${icon(ico)}</span><span>${label}</span>${count}</button>`;
  }).join("");
}
function renderMobileTopbar() {
  dom.mobileTopbar.innerHTML = `
    <div class="mobile-topbar-row">
      <div class="min-w-0">
        <strong>Paddy Field Scout</strong>
        <p>${escapeHTML(state.plotId)} · V${state.visit} · ${escapeHTML(state.district)}</p>
      </div>
      <div class="mobile-topbar-actions">
        <span title="${state.online ? "Online" : "Offline"}" class="icon">${icon(state.online ? "wifi" : "wifi-off")}</span>
        <button class="mobile-mode-mini" id="mobileDesktopSwitch" type="button" title="Switch to desktop layout"><span class="icon">${icon("monitor")}</span></button>
      </div>
    </div>`;
}
function renderMain() {
  if (state.tab === "frames") dom.mainContent.innerHTML = renderFramesPage();
  else if (state.tab === "plot") dom.mainContent.innerHTML = renderPlotPage();
  else if (state.tab === "review") dom.mainContent.innerHTML = renderReviewPage();
  else if (state.tab === "setup") dom.mainContent.innerHTML = renderSetupPage();
  else dom.mainContent.innerHTML = renderAnalyzePage();
}
function pageHead(title, description, actions = "") {
  return `<div class="page-head"><div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
}
function renderAnalyzePage() {
  const item = selectedFrame();
  const head = pageHead(
    "Analyze",
    "Curate each crop image locally before inference. Quality measurements and duplicate checks run in the browser.",
    item ? `<button class="btn btn-secondary" id="analyzeNewSingle" type="button"><span class="icon">${icon("upload")}</span> New image</button><button class="btn btn-secondary" id="analyzeNewMulti" type="button">Multiple images</button>` : ""
  );
  const main = item ? renderImageWorkspace(item) : renderUploadZone();
  const side = item ? renderResultSide(item) : renderSystemCard();
  let below = "";
  if (item) {
    below = `${renderQualityCard(item)}${item.result ? renderStageCard(item) : ""}${renderFeatureCard(item)}${item.result?.advisory && !item.result.abstain ? renderAdvisoryCard(item) : ""}${item.result ? renderReviewCard(item) : ""}`;
  }
  return `${head}<div class="analyze-grid"><div class="analysis-main">${main}${below}</div><div class="analysis-side">${side}</div></div>`;
}
function renderUploadZone() {
  return `<section class="upload-zone" id="uploadZone" aria-label="Upload crop image">
    <div>
      <div class="upload-hero-icon"><span class="icon">${icon("upload")}</span></div>
      <h3>Analyze a Paddy Crop Image</h3>
      <p>Upload a field photograph to evaluate image quality, extract visual features and run AI-assisted crop-health analysis.</p>
      <div class="upload-actions">
        <button class="btn btn-primary" id="chooseSingle" type="button"><span class="icon">${icon("image")}</span><span class="desktop-upload-label">${state.mode === "mobile" ? "Choose from Gallery" : "Choose Image"}</span></button>
        <button class="btn btn-secondary" id="chooseMultiple" type="button"><span class="icon">${icon("layers")}</span> Choose Multiple Images</button>
        <button class="btn btn-primary mobile-camera-action" id="takePhoto" type="button"><span class="icon">${icon("camera")}</span> Take Photograph</button>
      </div>
      <div class="file-types">JPG · JPEG · PNG · WEBP · Drag &amp; drop supported</div>
      <div class="capability-row">
        ${["Quality Gate", "Feature Extraction", "Disease Detection", "Crop Stage", "Severity", "Human Review"].map(x => `<span class="capability-chip">${x}</span>`).join("")}
      </div>
    </div>
  </section>`;
}
function renderSystemCard() {
  const steps = ["Image received", "Quality validation", "Feature extraction", "Crop verification", "Disease & pest analysis", "Severity estimation", "Result ready"];
  return `<section class="card system-card">
    <div class="card-header"><h3>Analysis Pipeline</h3>${badge(currentEngineLabel(), state.demoMode ? "demo" : "neutral")}</div>
    <div class="card-body">
      <div class="status-line"><div class="status-line__icon"><span class="icon">${icon("shield")}</span></div><div><strong>Local curation is always active</strong><span>Sharpness, exposure, vegetation, symptomatic fractions and duplicate detection are calculated before inference.</span></div></div>
      <div class="pipeline">${steps.map((s, i) => `<div class="pipeline-step"><span class="pipeline-index">${i + 1}</span><span>${s}</span></div>`).join("")}</div>
      <div class="status-line"><div class="status-line__icon"><span class="icon">${icon(state.online ? "wifi" : "wifi-off")}</span></div><div><strong>${state.online ? "Network available" : "Browser offline"}</strong><span>${state.online ? "Cloud/remote resources can be used if configured." : "Local feature extraction and a loaded ONNX model can continue offline."}</span></div></div>
    </div>
  </section>`;
}
function renderImageWorkspace(item) {
  return `<section class="card image-stage">
    <div class="image-stage__preview"><img src="${item.preview}" alt="Uploaded paddy field frame ${escapeHTML(item.name)}" /></div>
    <div class="image-meta-bar">
      <div class="image-meta"><span>Filename</span><strong title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</strong></div>
      <div class="image-meta"><span>Dimensions</span><strong>${item.width} × ${item.height}</strong></div>
      <div class="image-meta"><span>Megapixels</span><strong>${item.features.megapixels} MP</strong></div>
      <div class="image-meta"><span>File size</span><strong>${bytesLabel(item.fileSize)}</strong></div>
      <div class="image-meta"><span>Quality gate</span><strong>${item.gate.decision.toUpperCase()}</strong></div>
    </div>
  </section>`;
}
function renderPipelineCard(item) {
  const steps = ["Image received", "Quality validation", "Feature extraction", "Crop verification", "Disease & pest analysis", "Severity estimation", "Result ready"];
  const current = state.processing?.frameId === item.id ? state.processing.step : (item.status === "done" ? 7 : item.gate.decision === "reject" ? 3 : item.status === "curated" ? 4 : 1);
  return `<section class="card system-card"><div class="card-header"><h3>Analysis Pipeline</h3>${badge(item.status === "done" ? "Complete" : item.status, item.status === "error" ? "danger" : "neutral")}</div><div class="card-body"><div class="pipeline">${steps.map((s, i) => { const n = i + 1; const c = n < current ? "done" : n === current && item.status === "running" ? "active" : (n <= current ? "done" : ""); return `<div class="pipeline-step ${c}"><span class="pipeline-index">${n}</span><span>${s}</span></div>`; }).join("")}</div></div></section>`;
}
function renderResultSide(item) {
  if (item.gate.decision === "reject") {
    return `<section class="card result-card"><div class="withheld"><strong>Rejected before model inference</strong><p>${escapeHTML(item.gate.reasons.join(" · "))}</p></div><div class="card-body"><p class="small muted">No model or cloud inference call was spent on this frame. Recapture an image that passes the curation gate.</p></div></section>${renderPipelineCard(item)}`;
  }
  if (item.status === "error") {
    return `<section class="card result-card"><div class="withheld"><strong>Inference unavailable</strong><p>${escapeHTML(item.error || "The inference step failed.")}</p></div><div class="card-body"><details><summary class="eyebrow">Technical Details</summary><pre class="small mono">${escapeHTML(item.errorDetail || "No details")}</pre></details><button class="btn btn-secondary btn-block" data-retry="${item.id}" type="button"><span class="icon">${icon("rotate")}</span> Retry inference</button></div></section>${renderPipelineCard(item)}`;
  }
  if (!item.result) {
    return `<section class="card result-card"><div class="card-header"><h3>Diagnosis</h3>${badge("Local analysis complete", "info")}</div><div class="card-body"><div class="empty-card" style="padding:24px 12px"><div class="empty-icon"><span class="icon">${icon("microscope")}</span></div><h3>No inference result yet</h3><p>Enable Demo Mode, load a browser ONNX model, or configure a secure cloud inference endpoint in Setup.</p><button class="btn btn-primary" data-tab="setup" type="button" style="margin-top:14px">Open Setup</button></div></div></section>${renderPipelineCard(item)}`;
  }
  const r = item.result;
  const primary = cls(r.primary?.class_id);
  const fin = resolveFinding(r);
  const conf = Number(r.primary?.confidence || 0);
  const confKind = conf < ABSTAIN_AT ? "danger" : conf < 0.8 ? "warning" : "";
  const sev = sevInfo(r.primary?.severity_class ?? 0);
  let detail = "";
  if (!r.abstain) {
    const symptomName = fin?.symptom?.name || primary.name;
    const symptomSci = primary.kind === "disease" && primary.sci !== "—" ? primary.sci : "";
    let agentBlock = "";
    if (fin?.agent) {
      agentBlock = `<strong>${escapeHTML(fin.agent.name)}</strong>${fin.agent.sci && fin.agent.sci !== "—" ? `<p><em>${escapeHTML(fin.agent.sci)}</em></p>` : ""}`;
    } else if (fin?.candidates?.length) {
      agentBlock = `<strong>Not reliably resolvable from photograph</strong><p>Possible candidates: ${fin.candidates.map(id => escapeHTML(cls(id).name)).join(", ")}. Species-level identification may require examination of the insect/larva inside the culm.</p>`;
    } else if (symptomSci) {
      agentBlock = `<strong><em>${escapeHTML(symptomSci)}</em></strong><p>Scientific / pathogen name associated with the primary finding.</p>`;
    } else {
      agentBlock = `<strong>—</strong><p>No separate causal-agent field is required for this finding.</p>`;
    }
    detail = `<div class="finding-details"><div class="finding-box"><span class="eyebrow">Observed Symptom / Finding</span><strong>${escapeHTML(symptomName)}</strong>${primary.kind === "disease" ? `<p>${escapeHTML(primary.cat)} disease</p>` : `<p>${escapeHTML(primary.kind)}</p>`}</div><div class="finding-box"><span class="eyebrow">Causal Agent</span>${agentBlock}</div></div>`;
  }
  return `<section class="card result-card">
    <div class="result-hero">
      <div class="result-title-row"><div><span class="eyebrow">Primary Finding</span><h3 class="result-title">${r.abstain ? "Prediction Withheld" : escapeHTML(primary.name)}</h3>${!r.abstain && primary.sci !== "—" ? `<div class="scientific">${escapeHTML(primary.sci)}</div>` : ""}</div>${badge(sourceLabel(r.source), r.source === "demo" ? "demo" : "info")}</div>
      <div class="result-source">${badge(primary.cat || "unknown", "neutral")}${item.review ? badge("Reviewed", "reviewed") : ""}</div>
      <div class="confidence-wrap"><div class="confidence-head"><span>Confidence</span><strong>${fmtPct(conf)}</strong></div><div class="progress ${confKind}"><span style="width:${Math.max(0, Math.min(100, conf * 100))}%"></span></div></div>
    </div>
    ${r.abstain ? `<div class="withheld"><strong>Prediction Withheld</strong><p>${escapeHTML(r.abstain_reason || "Model confidence is below the accepted inference threshold. Route this observation for agronomist review.")}</p></div>` : ""}
    ${!r.abstain ? `<div class="result-kpis"><div class="result-kpi"><span>Severity</span><strong>${escapeHTML(sev.label)} · Level ${sev.v}</strong></div><div class="result-kpi"><span>Estimated affected area</span><strong>${escapeHTML(r.primary?.affected_pct ?? "—")}%</strong></div></div>` : ""}
    ${detail}
    ${r.primary?.evidence ? `<div class="result-evidence">${escapeHTML(r.primary.evidence)}</div>` : ""}
  </section>${renderPipelineCard(item)}`;
}
function metricStatus(name, item) {
  const f = item.features;
  if (name === "Resolution") return f.megapixels >= GATE.minMegapixels ? ["Pass", "pass"] : ["Fail", "fail"];
  if (name === "Sharpness") return f.sharpness >= GATE.minSharpness ? ["Pass", "pass"] : ["Fail", "fail"];
  if (name === "Exposure") return f.exposure < GATE.exposureLow || f.exposure > GATE.exposureHigh ? ["Review", "review"] : ["Pass", "pass"];
  if (name === "Vegetation") return f.vegFraction >= GATE.minVegFraction ? ["Pass", "pass"] : ["Fail", "fail"];
  if (name === "Clipped Pixels") return f.clippedFrac <= GATE.maxClipped ? ["Pass", "pass"] : ["Review", "review"];
  if (name === "Duplicate Check") return item.gate.reasons.some(x => x.startsWith("Duplicate")) ? ["Fail", "fail"] : ["Pass", "pass"];
  return ["", "pass"];
}
function renderQualityCard(item) {
  const metrics = [
    ["Resolution", `${item.features.megapixels} MP`],
    ["Sharpness", item.features.sharpness],
    ["Exposure", item.features.exposure],
    ["Vegetation", fmtPct(item.features.vegFraction)],
    ["Clipped Pixels", fmtPct(item.features.clippedFrac)],
    ["Duplicate Check", item.gate.reasons.some(x => x.startsWith("Duplicate")) ? "Duplicate" : "Unique"],
  ];
  return `<section class="card"><div class="card-header"><h3>Image Quality Assessment</h3>${gateBadge(item.gate)}</div><div class="card-body"><div class="metric-grid">${metrics.map(([name, value]) => { const [status, kind] = metricStatus(name, item); return `<div class="metric"><div class="metric-top"><span class="metric-label">${name}</span><span class="metric-status ${kind}">${status}</span></div><div class="metric-value">${escapeHTML(value)}</div></div>`; }).join("")}</div><div class="gate-summary ${item.gate.decision}"><div><span class="eyebrow">Curation Decision</span><p>${escapeHTML(item.gate.reasons.join(" · "))}</p></div>${gateBadge(item.gate)}</div></div></section>`;
}
function renderStageCard(item) {
  const r = item.result;
  const observedLabel = r.stage?.observed_label || "";
  const observedIndex = VISITS.findIndex(v => v.label.toLowerCase() === observedLabel.toLowerCase());
  return `<section class="card"><div class="card-header"><h3>Crop Stage</h3>${r.stage?.matches_expected === false ? badge("Off schedule", "review") : r.stage?.matches_expected === true ? badge("On schedule", "accept") : badge("Unconfirmed", "neutral")}</div><div class="card-body"><div class="visit-timeline">${VISITS.map((v, i) => `<div class="visit-node ${v.n === item.visit ? "current" : ""} ${i === observedIndex ? (r.stage?.matches_expected === false ? "off" : "observed") : ""}"><span class="vnum">V${v.n}</span><strong>${v.label}</strong><span>BBCH ${v.bbch}</span></div>`).join("")}</div><p class="help" style="margin-top:10px"><strong class="mono">Observed: ${escapeHTML(r.stage?.observed_label || "—")} · BBCH ${escapeHTML(r.stage?.bbch || "—")}</strong> — ${escapeHTML(r.stage?.evidence || "No stage evidence supplied.")}</p></div></section>`;
}
function renderFeatureCard(item) {
  const f = item.features;
  const rows = [
    ["Sharpness", f.sharpness], ["Exposure", f.exposure], ["Vegetation", fmtPct(f.vegFraction)], ["Excess Green / ExG", f.exg],
    ["Chlorosis", fmtPct(f.chlorosisFrac)], ["Necrosis", fmtPct(f.necrosisFrac)], ["Clipped pixels", fmtPct(f.clippedFrac)], ["Megapixels", f.megapixels],
  ];
  return `<details class="card"><summary class="card-header" style="cursor:pointer;list-style:none"><h3>Image-derived Features</h3><span class="small muted">Local browser measurements</span></summary><div class="card-body"><div class="metric-grid">${rows.map(([label, value]) => `<div class="metric"><span class="metric-label">${label}</span><div class="metric-value">${escapeHTML(value)}</div></div>`).join("")}</div></div></details>`;
}
function renderAdvisoryCard(item) {
  const a = item.result?.advisory;
  if (!a) return "";
  const kind = a.urgency === "act_now" ? "act" : a.urgency === "monitor" ? "monitor" : "accept";
  return `<section class="card"><div class="card-header"><h3>Recommendation</h3>${badge(String(a.urgency || "routine").replace("_", " "), kind)}</div><div class="card-body"><span class="eyebrow">Priority</span><ul class="advisory-list">${(a.actions || []).map(x => `<li>${escapeHTML(x)}</li>`).join("")}</ul>${(a.moa || []).length ? `<div class="result-evidence" style="margin:12px -16px -16px">Mode of action references: <span class="mono">${a.moa.map(escapeHTML).join(" · ")}</span></div>` : ""}</div></section>`;
}
function classOptions(selected) {
  return `${CLASSES.map(c => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${escapeHTML(c.name)}</option>`).join("")}<option value="unlisted" ${selected === "unlisted" ? "selected" : ""}>Outside class set</option>`;
}
function severityOptions(selected) {
  return SEVERITY.map(s => `<option value="${s.v}" ${Number(selected) === s.v ? "selected" : ""}>${s.v} — ${s.label} (${s.range})</option>`).join("");
}
function renderReviewCard(item) {
  const aiClass = item.result?.primary?.class_id || "unlisted";
  const aiSeverity = item.result?.primary?.severity_class ?? 0;
  const selectedClass = item.review?.classId || aiClass;
  const selectedSeverity = item.review?.severity ?? aiSeverity;
  return `<section class="card"><div class="card-header"><div><h3>Agronomist Review</h3><span class="small muted">AI prediction remains preserved separately in the export.</span></div>${item.review ? badge("Reviewed", "reviewed") : badge("Pending", "neutral")}</div><div class="card-body"><div class="review-form" data-review-form="${item.id}"><div class="form-field"><label>Diagnosis / Class</label><select class="select review-class">${classOptions(selectedClass)}</select><div class="help">AI Prediction: <strong>${escapeHTML(cls(aiClass).name)}</strong></div></div><div class="form-field"><label>Severity</label><select class="select review-severity">${severityOptions(selectedSeverity)}</select><div class="help">AI severity: <strong>${sevInfo(aiSeverity).label} · ${aiSeverity}</strong></div></div><button class="btn btn-primary save-review" type="button">${item.review ? "Update Review" : "Confirm Review"}</button></div></div></section>`;
}
function renderFramesPage() {
  const head = pageHead("Frames", "Session observations with image quality, inference and review status.", `<button class="btn btn-secondary" id="copyCsv" type="button"><span class="icon">${icon("copy")}</span> Copy CSV</button><button class="btn btn-primary" id="downloadCsv" type="button"><span class="icon">${icon("download")}</span> Download CSV</button><button class="btn btn-danger" id="clearFrames" type="button">Clear All</button>`);
  if (!state.items.length) return `${head}<section class="card empty-card"><div class="empty-icon"><span class="icon">${icon("layers")}</span></div><h3>No frames yet</h3><p>Capture or upload crop images from Analyze. Frames remain session-only and are not stored in localStorage.</p></section>`;
  const rows = state.items.map(i => {
    const r = i.result;
    const review = i.review;
    return `<tr>
      <td><img class="frame-thumb" src="${i.preview}" alt="Thumbnail for ${escapeHTML(i.name)}" /></td>
      <td><div class="filename" title="${escapeHTML(i.name)}">${escapeHTML(i.name)}</div><div class="small muted mono">${escapeHTML(i.plotId)} · V${i.visit}</div></td>
      <td>${safeDate(i.timestamp)}</td>
      <td>${gateBadge(i.gate)}</td>
      <td>${r ? escapeHTML(cls(r.primary?.class_id).name) : "—"}</td>
      <td class="mono">${r ? fmtPct(r.primary?.confidence) : "—"}</td>
      <td>${r ? `${escapeHTML(sevInfo(r.primary?.severity_class).label)} · ${r.primary?.severity_class}` : "—"}</td>
      <td>${r ? badge(sourceLabel(r.source), r.source === "demo" ? "demo" : "info") : badge("None", "neutral")}</td>
      <td>${review ? badge("Reviewed", "reviewed") : reviewNeedsAttention(i) ? badge("Attention", "review") : badge("Pending", "neutral")}</td>
      <td><div class="table-actions"><button class="icon-btn" data-view="${i.id}" title="View" type="button"><span class="icon">${icon("eye")}</span></button><button class="icon-btn" data-review-jump="${i.id}" title="Review" type="button"><span class="icon">${icon("clipboard-check")}</span></button><button class="icon-btn" data-retry="${i.id}" title="Retry" type="button"><span class="icon">${icon("rotate")}</span></button><button class="icon-btn" data-remove="${i.id}" title="Remove" type="button"><span class="icon">${icon("trash")}</span></button></div></td>
    </tr>`;
  }).join("");
  return `${head}<div class="table-wrap"><table class="data-table"><thead><tr><th>Image</th><th>Frame / Plot</th><th>Timestamp</th><th>Quality</th><th>Diagnosis</th><th>Confidence</th><th>Severity</th><th>Source</th><th>Review</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderPlotPage() {
  const roll = plotRollup();
  const head = pageHead("Plot Insights", "Plot-level roll-up applies only to valid, non-abstained frames and requires a consistent sampling pattern.");
  if (!roll) return `${head}<section class="card empty-card"><div class="empty-icon"><span class="icon">${icon("chart")}</span></div><h3>No scored frames yet</h3><p>Collect valid frames before plot-level incidence or severity can be evaluated.</p></section>`;
  const insufficient = !roll.reportable ? `<section class="card insufficient"><div class="insufficient-icon"><span class="icon">${icon("alert")}</span></div><div><h3>Insufficient Sampling</h3><p>Plot-level incidence and severity are withheld until at least five valid frames have been collected using a consistent sampling pattern. A severity estimate from one photograph is a property of that frame, not of the entire plot.</p></div></section>` : "";
  const kpis = `<div class="kpi-grid" style="margin-top:${roll.reportable ? 0 : 12}px"><section class="card kpi-card"><div class="kpi-label">Frames Scored</div><div class="kpi-value">${roll.n}</div><div class="kpi-foot">${MIN_PLOT_FRAMES} minimum</div></section><section class="card kpi-card"><div class="kpi-label">Disease Incidence</div><div class="kpi-value">${roll.reportable ? `${roll.incidence.toFixed(0)}%` : "—"}</div><div class="kpi-foot">${roll.reportable ? "valid frames affected" : "withheld"}</div></section><section class="card kpi-card"><div class="kpi-label">Severity Index</div><div class="kpi-value">${roll.reportable ? roll.mck.toFixed(1) : "—"}</div><div class="kpi-foot">${roll.reportable ? "McKinney 0–100" : "withheld"}</div></section><section class="card kpi-card"><div class="kpi-label">Plot Priority</div><div class="kpi-value" style="font-size:19px">${roll.reportable ? escapeHTML(roll.priority) : "—"}</div><div class="kpi-foot">${roll.reportable ? "plot action" : "withheld"}</div></section></div>`;
  const distEntries = Object.entries(roll.tally).sort((a,b) => b[1]-a[1]);
  const max = Math.max(...distEntries.map(x=>x[1]), 1);
  const analytics = `<div class="analytics-grid"><section class="card"><div class="card-header"><h3>Finding Distribution</h3></div><div class="card-body"><div class="bar-list">${distEntries.map(([name, count]) => `<div class="bar-row"><span>${escapeHTML(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${count / max * 100}%"></div></div><span class="bar-count">${count}</span></div>`).join("")}</div></div></section><section class="card"><div class="card-header"><h3>Sampling Summary</h3></div><div class="card-body"><div class="status-grid"><div class="status-tile"><span>Dominant Finding</span><strong>${escapeHTML(roll.dominant)}</strong></div><div class="status-tile"><span>Accepted</span><strong>${roll.accepted}</strong></div><div class="status-tile"><span>Rejected</span><strong>${roll.rejected}</strong></div><div class="status-tile"><span>Withheld</span><strong>${roll.withheld}</strong></div><div class="status-tile"><span>Reviewed</span><strong>${roll.reviewed}</strong></div><div class="status-tile"><span>Sampling rule</span><strong>Fixed pattern required</strong></div></div><p class="help" style="margin-top:10px">If only visibly affected plants are photographed, incidence and severity are biased upward and are not representative of the plot.</p></div></section></div>`;
  return `${head}${insufficient}${kpis}${analytics}`;
}
function attentionReasonList(item) {
  const reasons = [];
  if (item.gate.decision === "review") reasons.push("Quality gate review");
  if (item.result?.abstain) reasons.push("Low confidence / withheld");
  if (item.result?.primary?.class_id === "unlisted") reasons.push("Outside class set");
  const fin = resolveFinding(item.result);
  if (fin?.candidates?.length && !fin.agentResolved) reasons.push("Causal agent unresolved");
  if (item.review && item.result && item.review.classId !== item.result.primary.class_id) reasons.push("AI / human disagreement");
  if (item.review && item.result && item.review.severity !== item.result.primary.severity_class) reasons.push("Severity adjusted");
  return reasons;
}
function renderReviewPage() {
  let attention = state.items.filter(reviewNeedsAttention);
  const selected = selectedFrame();
  if (selected?.result && !attention.some(i => i.id === selected.id)) attention = [selected, ...attention];
  const head = pageHead("Review", "Human validation queue for low confidence, quality concerns, unresolved causal agents and AI/human disagreements.");
  if (!attention.length) return `${head}<section class="card empty-card"><div class="empty-icon"><span class="icon">${icon("clipboard-check")}</span></div><h3>No observations require attention</h3><p>Frames with REVIEW quality gates, withheld predictions, unresolved agents or reviewer disagreement will appear here.</p></section>`;
  return `${head}<div class="review-list">${attention.map(item => {
    const r = item.result;
    const aiClass = r?.primary?.class_id || "unlisted";
    const aiSeverity = r?.primary?.severity_class ?? 0;
    const selectedClass = item.review?.classId || aiClass;
    const selectedSeverity = item.review?.severity ?? aiSeverity;
    return `<section class="card review-card"><div class="review-card-top"><img src="${item.preview}" alt="Review frame ${escapeHTML(item.name)}"/><div class="review-card-meta"><span class="eyebrow">${escapeHTML(item.plotId)} · V${item.visit}</span><h3>${r ? escapeHTML(cls(aiClass).name) : "No inference result"}</h3><div class="review-reasons">${attentionReasonList(item).map(x => badge(x, "review")).join("")}</div></div></div>${r ? `<div class="review-form" data-review-form="${item.id}"><div class="form-field"><label>Diagnosis / Class</label><select class="select review-class">${classOptions(selectedClass)}</select></div><div class="form-field"><label>Severity</label><select class="select review-severity">${severityOptions(selectedSeverity)}</select></div><button class="btn btn-primary save-review" type="button">${item.review ? "Update Review" : "Confirm Review"}</button></div>` : `<div class="card-body"><button class="btn btn-secondary" data-view="${item.id}" type="button">View observation</button></div>`}</section>`;
  }).join("")}</div>`;
}
function renderSetupPage() {
  const visit = VISITS.find(v => v.n === state.visit);
  const head = pageHead("Setup", "Configure plot context and choose how diagnosis is produced. Browser feature analysis always runs locally.");
  return `${head}<div class="setup-grid">
    <section class="card"><div class="card-header"><h3>Plot Configuration</h3></div><div class="card-body form-stack"><div class="form-field"><label>Plot ID</label><input class="input" id="plotIdInput" value="${escapeHTML(state.plotId)}" /></div><div class="form-field"><label>District</label><input class="input" id="districtInput" value="${escapeHTML(state.district)}" /></div><div class="form-field"><label>Visit</label><select class="select" id="visitInput">${VISITS.map(v => `<option value="${v.n}" ${v.n === state.visit ? "selected" : ""}>V${v.n} — ${v.label} (BBCH ${v.bbch})</option>`).join("")}</select><div class="help">Current expected phenology: ${escapeHTML(visit?.label)} · BBCH ${escapeHTML(visit?.bbch)}</div></div><button class="btn btn-primary" id="savePlotConfig" type="button">Save Plot Configuration</button></div></section>

    <section class="card"><div class="card-header"><h3>Analysis Configuration</h3></div><div class="card-body form-stack"><div class="toggle-row"><div><strong>Demo Mode</strong><p>Local quality analysis remains real. Diagnosis uses deterministic sample output and is clearly labelled.</p></div><label class="switch"><input id="demoModeInput" type="checkbox" ${state.demoMode ? "checked" : ""}/><span></span></label></div><div class="form-field"><label>Cloud Inference Endpoint</label><input class="input" id="cloudEndpointInput" type="url" placeholder="https://your-secure-proxy.example/infer" value="${escapeHTML(state.cloudEndpoint)}"/><div class="help">Do not put API keys in this repository. The endpoint should securely call your AI service server-side.</div></div><button class="btn btn-secondary" id="saveAnalysisConfig" type="button">Save Analysis Configuration</button></div></section>

    <section class="card"><div class="card-header"><h3>On-device ONNX</h3>${state.engine.mode === "device" ? badge("Loaded", "accept") : badge("Optional", "neutral")}</div><div class="card-body form-stack"><div class="form-field"><label>Model URL (.onnx)</label><input class="input" id="modelUrlInput" type="url" placeholder="https://…/model.int8.onnx" value="${escapeHTML(state.modelUrl)}"/></div><div class="form-field"><label>Metadata URL (.json)</label><input class="input" id="metadataUrlInput" type="url" placeholder="https://…/model_meta.json" value="${escapeHTML(state.metadataUrl)}"/></div><button class="btn btn-primary" id="loadModel" type="button"><span class="icon">${icon("cpu")}</span> Load Model on this Device</button><div class="help">Once loaded, ONNX inference runs in the browser. The source model must allow cross-origin access (CORS).</div></div></section>

    <section class="card"><div class="card-header"><h3>Device / System Status</h3></div><div class="card-body"><div class="status-grid"><div class="status-tile"><span>Network</span><strong>${state.online ? "Online" : "Offline"}</strong></div><div class="status-tile"><span>Browser processing</span><strong>Active</strong></div><div class="status-tile"><span>ONNX status</span><strong>${state.engine.mode === "device" ? "Model loaded" : "Not loaded"}</strong></div><div class="status-tile"><span>Cloud endpoint</span><strong>${state.cloudEndpoint ? "Configured" : "Not configured"}</strong></div><div class="status-tile"><span>Current engine</span><strong>${escapeHTML(currentEngineLabel())}</strong></div><div class="status-tile"><span>Frame storage</span><strong>Session only</strong></div></div></div></section>

    <section class="card"><div class="card-header"><h3>Curation Gate Thresholds</h3></div><div class="card-body"><div class="threshold-grid"><span>Resolution ≥ ${GATE.minMegapixels} MP</span><span>Sharpness ≥ ${GATE.minSharpness}</span><span>Exposure ${GATE.exposureLow}–${GATE.exposureHigh}</span><span>Clipped ≤ ${GATE.maxClipped * 100}%</span><span>Vegetation ≥ ${GATE.minVegFraction * 100}%</span><span>Duplicate ≤ ${GATE.dupHamming}/64</span></div><p class="help" style="margin-top:10px">The sharpness floor is provisional and should be calibrated using representative field captures.</p></div></section>

    <section class="card"><div class="card-header"><h3>Security &amp; Data Handling</h3></div><div class="card-body"><div class="status-line"><div class="status-line__icon"><span class="icon">${icon("shield")}</span></div><div><strong>No client-side secret is required</strong><span>Feature extraction, curation and Demo Mode run locally. Cloud inference should be routed through your own secure backend/proxy.</span></div></div><div class="status-line" style="margin-top:12px"><div class="status-line__icon"><span class="icon">${icon("image")}</span></div><div><strong>Photos are not stored in localStorage</strong><span>Frame images remain in memory for the current session and disappear on page reload.</span></div></div></div></section>
  </div>`;
}

/* 17. Event listeners / responsive behaviour ------------------------------- */
function bindStaticEvents() {
  document.querySelectorAll(".view-switch__button").forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
  dom.singleFileInput.addEventListener("change", e => { handleFiles(e.target.files); e.target.value = ""; });
  dom.multiFileInput.addEventListener("change", e => { handleFiles(e.target.files); e.target.value = ""; });
  dom.cameraFileInput.addEventListener("change", e => { handleFiles(e.target.files); e.target.value = ""; });
  window.addEventListener("online", () => { state.online = true; renderAll(); showToast("Network connection restored."); });
  window.addEventListener("offline", () => { state.online = false; renderAll(); showToast("Browser is offline. Local processing remains available."); });
  window.addEventListener("resize", () => {
    if (window.matchMedia("(max-width: 767px)").matches && !localStorage.getItem(STORAGE_KEY)) setMode("mobile");
  });
  dom.cropinLogo.addEventListener("error", () => { dom.cropinLogo.hidden = true; dom.logoFallback.hidden = false; });
}
function bindPageEvents() {
  document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => { state.tab = btn.dataset.tab; renderAll(); window.scrollTo({ top: 0, behavior: "smooth" }); }));
  document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => viewFrame(btn.dataset.view)));
  document.querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => removeFrame(btn.dataset.remove)));
  document.querySelectorAll("[data-retry]").forEach(btn => btn.addEventListener("click", () => retryFrame(btn.dataset.retry)));
  document.querySelectorAll("[data-review-jump]").forEach(btn => btn.addEventListener("click", () => { state.selectedFrameId = btn.dataset.reviewJump; state.tab = "review"; renderAll(); window.scrollTo({ top:0, behavior:"smooth" }); }));
  document.querySelectorAll(".save-review").forEach(btn => btn.addEventListener("click", () => {
    const form = btn.closest("[data-review-form]");
    if (!form) return;
    const id = form.dataset.reviewForm;
    setReview(id, form.querySelector(".review-class")?.value, Number(form.querySelector(".review-severity")?.value));
  }));

  const chooseSingle = document.getElementById("chooseSingle");
  const chooseMultiple = document.getElementById("chooseMultiple");
  const takePhoto = document.getElementById("takePhoto");
  const analyzeNewSingle = document.getElementById("analyzeNewSingle");
  const analyzeNewMulti = document.getElementById("analyzeNewMulti");
  chooseSingle?.addEventListener("click", () => dom.singleFileInput.click());
  chooseMultiple?.addEventListener("click", () => dom.multiFileInput.click());
  takePhoto?.addEventListener("click", () => dom.cameraFileInput.click());
  analyzeNewSingle?.addEventListener("click", () => dom.singleFileInput.click());
  analyzeNewMulti?.addEventListener("click", () => dom.multiFileInput.click());

  const zone = document.getElementById("uploadZone");
  if (zone) {
    ["dragenter", "dragover"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add("dragover"); }));
    ["dragleave", "drop"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove("dragover"); }));
    zone.addEventListener("drop", e => handleFiles(e.dataTransfer?.files));
  }

  document.getElementById("downloadCsv")?.addEventListener("click", downloadCsv);
  document.getElementById("copyCsv")?.addEventListener("click", copyCsv);
  document.getElementById("clearFrames")?.addEventListener("click", clearFrames);
  document.getElementById("mobileDesktopSwitch")?.addEventListener("click", () => setMode("desktop"));

  document.getElementById("savePlotConfig")?.addEventListener("click", () => {
    state.plotId = document.getElementById("plotIdInput").value.trim() || "UNSET-PLOT";
    state.district = document.getElementById("districtInput").value.trim() || "Unspecified";
    state.visit = Number(document.getElementById("visitInput").value) || 1;
    savePreferences(); renderAll(); showToast("Plot configuration saved.");
  });
  document.getElementById("saveAnalysisConfig")?.addEventListener("click", () => {
    state.demoMode = document.getElementById("demoModeInput").checked;
    state.cloudEndpoint = document.getElementById("cloudEndpointInput").value.trim();
    savePreferences(); renderAll(); showToast(`Analysis configuration saved. ${state.demoMode ? "Demo inference is ON." : "Demo inference is OFF."}`);
  });
  document.getElementById("demoModeInput")?.addEventListener("change", e => {
    state.demoMode = e.target.checked;
    savePreferences(); renderHeader();
  });
  document.getElementById("loadModel")?.addEventListener("click", async () => {
    state.modelUrl = document.getElementById("modelUrlInput").value.trim();
    state.metadataUrl = document.getElementById("metadataUrlInput").value.trim();
    savePreferences();
    await connectModel();
  });
}
function setMode(mode) {
  if (mode !== "desktop" && mode !== "mobile") return;
  state.mode = mode;
  savePreferences();
  renderAll();
}
function initDom() {
  dom.headerPlot = document.getElementById("headerPlot");
  dom.headerDistrict = document.getElementById("headerDistrict");
  dom.headerVisit = document.getElementById("headerVisit");
  dom.headerNetwork = document.getElementById("headerNetwork");
  dom.headerEngine = document.getElementById("headerEngine");
  dom.demoBadge = document.getElementById("demoBadge");
  dom.desktopNav = document.getElementById("desktopNav");
  dom.mobileNav = document.getElementById("mobileNav");
  dom.mobileTopbar = document.getElementById("mobileTopbar");
  dom.mainContent = document.getElementById("mainContent");
  dom.singleFileInput = document.getElementById("singleFileInput");
  dom.multiFileInput = document.getElementById("multiFileInput");
  dom.cameraFileInput = document.getElementById("cameraFileInput");
  dom.toastRegion = document.getElementById("toastRegion");
  dom.busyOverlay = document.getElementById("busyOverlay");
  dom.busyTitle = document.getElementById("busyTitle");
  dom.busyDetail = document.getElementById("busyDetail");
  dom.cropinLogo = document.getElementById("cropinLogo");
  dom.logoFallback = document.getElementById("logoFallback");
}

loadPreferences();
window.addEventListener("DOMContentLoaded", () => {
  initDom();
  bindStaticEvents();
  renderAll();
});
