// Neon Shores — Cover Maker: the editor.
//
// Owns the page's state (photos, panel assignments, caption, grade), wires
// every control to it, and re-renders the live preview through cover.js's
// drawCover on each change. Export renders the same state offscreen at the
// full chosen size and downloads it as a PNG.
//
// Screenshot scenes: ?shot=cover fills the window with one finished cover;
// ?shot=editor opens this editor with a sample loaded. Both take layout,
// size, photo, title, tagline and grade parameters and set
// window.__shotReady once the scene is painted.
import { drawCover, LAYOUTS, GRADES, panelPolygon, pointInPolygon } from './cover.js';

export const SIZES = {
  '1080x1080': [1080, 1080],
  '1080x1350': [1080, 1350],
  '1920x1080': [1920, 1080],
};

const SAMPLES = ['pier', 'boulevard'];
const MAX_PANELS = 4;

// Built-in caption ideas for the Surprise-me button. Kept small and
// original — no film or game titles, just neon-city moods.
const SURPRISE_TITLES = [
  'Neon Shores',
  'Palm Avenue',
  'Midnight Coast',
  'Boulevard Queen',
  'Harbor Lights',
  'Last Ride Home',
  'Midnight Palms',
];
const SURPRISE_TAGLINES = [
  'Vice nights, bright lights',
  'One night in the neon city',
  'Golden hour on the shore',
  'Palms, chrome and midnight',
  'Where the boulevard meets the sea',
  'Drive it like the tide is out',
  'Under palms after midnight',
];

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

const state = {
  layout: 'cover-grid',
  size: '1920x1080',
  grade: 'vice-sunset',
  gradeStrength: 0.85,
  title: 'Neon Shores',
  tagline: 'Vice nights, bright lights',
  panels: Array.from({ length: MAX_PANELS }, () => ({ photoIdx: -1, zoom: 1, ox: 0, oy: 0 })),
};
let photos = []; // [{ img, name }]
let selectedPanel = 0;

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Waits for the Anton face so the caption never paints in a fallback. */
async function ensureFonts() {
  try {
    await document.fonts.load('80px Anton');
    await document.fonts.ready;
  } catch {
    // A heavy system stack in cover.js's font list takes over.
  }
}

function panelCount() {
  return LAYOUTS[state.layout].panels.length;
}

/** The drawCover state for the current editor state. */
function drawState() {
  return {
    layout: state.layout,
    grade: state.grade,
    gradeStrength: state.gradeStrength,
    title: state.title,
    tagline: state.tagline,
    panels: state.panels.map((p) => ({
      photo: p.photoIdx >= 0 ? photos[p.photoIdx]?.img ?? null : null,
      zoom: p.zoom,
      ox: p.ox,
      oy: p.oy,
    })),
  };
}

/** Preview resolution: the export aspect, capped so drags stay smooth. */
function previewDims() {
  const [w, h] = SIZES[state.size];
  const scale = Math.min(1, 1040 / Math.max(w, h));
  return [Math.round(w * scale), Math.round(h * scale)];
}

function render() {
  const [w, h] = previewDims();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  drawCover(ctx, w, h, drawState());
  // The selected panel gets a dashed neon outline in the editor only.
  const polygon = panelPolygon(state.layout, selectedPanel, w, h);
  ctx.save();
  ctx.beginPath();
  polygon.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.setLineDash([10, 7]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#00e5ff';
  ctx.stroke();
  ctx.restore();
  document.getElementById('panelLabel').textContent =
    `Panel ${selectedPanel + 1} of ${panelCount()} — click a photo to fill it, drag the cover to pan it`;
  document.getElementById('panelZoom').value = state.panels[selectedPanel].zoom;
}

function renderThumbs() {
  const thumbs = document.getElementById('thumbs');
  thumbs.replaceChildren();
  photos.forEach((photo, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb';
    btn.title = `${photo.name} — click to put it in panel ${selectedPanel + 1}`;
    const img = document.createElement('img');
    img.src = photo.img.src;
    img.alt = photo.name;
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      state.panels[selectedPanel].photoIdx = i;
      render();
    });
    thumbs.appendChild(btn);
  });
}

async function addPhoto(url, name) {
  const img = await loadImage(url);
  photos.push({ img, name });
  const panel = state.panels[selectedPanel];
  if (panel.photoIdx < 0) panel.photoIdx = photos.length - 1;
  renderThumbs();
  render();
  return img;
}

function setStatus(text) {
  status.textContent = text;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Surprise-me: a random layout, grade, title and tagline in one click.
 * Only ever runs from the button below — the ?shot= scenes never call
 * it, so screenshot rendering stays fully deterministic.
 */
function surpriseMe() {
  state.layout = pickRandom(Object.keys(LAYOUTS));
  state.grade = pickRandom(Object.keys(GRADES));
  state.title = pickRandom(SURPRISE_TITLES);
  state.tagline = pickRandom(SURPRISE_TAGLINES);
  if (selectedPanel >= panelCount()) selectedPanel = 0;
  // Reflect the new combination in every visible control.
  document.querySelectorAll('#layoutPicker .chip').forEach((c) =>
    c.classList.toggle('active', c.dataset.layout === state.layout));
  document.getElementById('gradeSelect').value = state.grade;
  document.getElementById('titleInput').value = state.title;
  document.getElementById('taglineInput').value = state.tagline;
  setStatus(`Surprise: ${LAYOUTS[state.layout].label} in ${GRADES[state.grade].label} — “${state.title}”.`);
  render();
}

// ---- Controls -----------------------------------------------------------

function buildPickers() {
  const layoutPicker = document.getElementById('layoutPicker');
  for (const [id, layout] of Object.entries(LAYOUTS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = layout.label;
    btn.dataset.layout = id;
    btn.className = id === state.layout ? 'chip active' : 'chip';
    btn.addEventListener('click', () => {
      state.layout = id;
      if (selectedPanel >= panelCount()) selectedPanel = 0;
      layoutPicker.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.layout === id));
      render();
    });
    layoutPicker.appendChild(btn);
  }
  const gradeSelect = document.getElementById('gradeSelect');
  for (const [id, grade] of Object.entries(GRADES)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = grade.label;
    gradeSelect.appendChild(opt);
  }
  gradeSelect.value = state.grade;
}

function wireControls() {
  buildPickers();
  document.getElementById('sizeSelect').addEventListener('change', (e) => {
    state.size = e.target.value;
    render();
  });
  document.getElementById('gradeSelect').addEventListener('change', (e) => {
    state.grade = e.target.value;
    render();
  });
  document.getElementById('titleInput').addEventListener('input', (e) => {
    state.title = e.target.value;
    render();
  });
  document.getElementById('taglineInput').addEventListener('input', (e) => {
    state.tagline = e.target.value;
    render();
  });
  document.getElementById('gradeStrength').addEventListener('input', (e) => {
    state.gradeStrength = Number(e.target.value);
    render();
  });
  document.getElementById('panelZoom').addEventListener('input', (e) => {
    state.panels[selectedPanel].zoom = Number(e.target.value);
    render();
  });
  document.getElementById('spreadBtn').addEventListener('click', () => {
    const from = state.panels[selectedPanel];
    if (from.photoIdx < 0) return;
    state.panels.forEach((p) => { p.photoIdx = from.photoIdx; });
    setStatus('One photo now fills every panel — try the Triptych cuts over it.');
    render();
  });
  document.getElementById('photoFiles').addEventListener('change', async (e) => {
    for (const file of e.target.files) {
      await addPhoto(URL.createObjectURL(file), file.name);
    }
    e.target.value = '';
    setStatus(`${photos.length} photo${photos.length === 1 ? '' : 's'} loaded.`);
  });
  document.getElementById('surpriseBtn').addEventListener('click', surpriseMe);
  document.getElementById('exportBtn').addEventListener('click', exportPng);

  // Drag-and-drop photos anywhere on the page.
  const hint = document.getElementById('dropHint');
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    hint.classList.add('show');
  });
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) hint.classList.remove('show');
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    hint.classList.remove('show');
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) await addPhoto(URL.createObjectURL(file), file.name);
    }
  });

  // Click a panel to select it; drag on the cover to pan its photo.
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    for (let i = panelCount() - 1; i >= 0; i--) {
      if (pointInPolygon(x, y, panelPolygon(state.layout, i, canvas.width, canvas.height))) {
        selectedPanel = i;
        break;
      }
    }
    const panel = state.panels[selectedPanel];
    drag = { x: e.clientX, y: e.clientY, ox: panel.ox, oy: panel.oy };
    canvas.setPointerCapture(e.pointerId);
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const panel = state.panels[selectedPanel];
    panel.ox = Math.min(1, Math.max(-1, drag.ox + ((e.clientX - drag.x) / rect.width) * 2));
    panel.oy = Math.min(1, Math.max(-1, drag.oy + ((e.clientY - drag.y) / rect.height) * 2));
    render();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
}

async function exportPng() {
  await ensureFonts();
  const [w, h] = SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  drawCover(off.getContext('2d'), w, h, drawState());
  off.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neon-shores-cover-${state.size}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus(`Saved neon-shores-cover-${state.size}.png`);
  }, 'image/png');
}

// ---- Screenshot scenes ----------------------------------------------------

function sampleName(raw) {
  const name = (raw ?? 'pier').replace(/\.jpe?g$/i, '');
  return SAMPLES.includes(name) ? name : 'pier';
}

function applyParams(params) {
  if (params.get('layout') && LAYOUTS[params.get('layout')]) state.layout = params.get('layout');
  if (params.get('size') && SIZES[params.get('size')]) state.size = params.get('size');
  if (params.get('grade') && GRADES[params.get('grade')]) state.grade = params.get('grade');
  if (params.get('title') !== null) state.title = params.get('title');
  if (params.get('tagline') !== null) state.tagline = params.get('tagline');
}

function signalReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}

// ?shot=cover: only the finished cover, filling the window at its own size.
async function runCoverShot(params) {
  document.body.classList.add('shot-cover');
  applyParams(params);
  const first = sampleName(params.get('photo'));
  const second = SAMPLES.find((s) => s !== first);
  const [imgA, imgB] = await Promise.all([
    loadImage(`samples/${first}.jpg`),
    loadImage(`samples/${second}.jpg`),
  ]);
  await ensureFonts();
  photos = [
    { img: imgA, name: first },
    { img: imgB, name: second },
  ];
  state.panels.forEach((p, i) => { p.photoIdx = i % 2; });
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawCover(ctx, canvas.width, canvas.height, drawState());
  signalReady();
}

// ?shot=editor: the normal editor, with the named sample in the hero panel.
async function runEditorShot(params) {
  applyParams(params);
  await startEditor(sampleName(params.get('photo')));
  // Reflect the scene's parameters in the visible controls.
  document.getElementById('sizeSelect').value = state.size;
  document.getElementById('gradeSelect').value = state.grade;
  document.getElementById('titleInput').value = state.title;
  document.getElementById('taglineInput').value = state.tagline;
  document.querySelectorAll('#layoutPicker .chip').forEach((c) =>
    c.classList.toggle('active', c.dataset.layout === state.layout));
  render();
  signalReady();
}

// ---- Start -----------------------------------------------------------------

async function startEditor(firstSample = 'pier') {
  wireControls();
  document.getElementById('sizeSelect').value = state.size;
  document.getElementById('titleInput').value = state.title;
  document.getElementById('taglineInput').value = state.tagline;
  const second = SAMPLES.find((s) => s !== firstSample);
  await ensureFonts();
  await addPhoto(`samples/${firstSample}.jpg`, `${firstSample}.jpg`);
  await addPhoto(`samples/${second}.jpg`, `${second}.jpg`);
  // A composed cover from the start: the two samples alternate over panels.
  state.panels.forEach((p, i) => { p.photoIdx = i % 2; });
  render();
}

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot === 'cover') {
  runCoverShot(params);
} else if (shot === 'editor') {
  runEditorShot(params);
} else {
  startEditor();
}
