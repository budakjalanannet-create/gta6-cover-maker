// Neon Shores — Cover Maker: the pure cover renderer.
//
// drawCover(ctx, W, H, state) paints one finished cover at W x H pixels and
// nothing else: no DOM, no state of its own, so the editor preview, the PNG
// export and the screenshot scenes all draw through this one function and
// always agree with each other.
//
// state = {
//   layout:  'cover-grid' | 'triptych' | 'hero-strip' | 'full-bleed',
//   grade:   'vice-sunset' | 'neon-night' | 'golden-hour' | 'clean',
//   gradeStrength: 0..1, how hard the colour grade leans on the photos,
//   title:   the big caption line (drawn uppercase),
//   tagline: the smaller line under the title,
//   panels:  [{ photo, zoom, ox, oy }, ...] one entry per layout panel;
//            photo is an image or null, zoom >= 1, ox/oy pan it in -1..1.
// }

// Panel shapes are polygons in canvas-normalised coordinates, so one layout
// works at every output size. The cuts are the poster's panel cuts: straight
// for the grid layouts, diagonal for the triptych.
export const LAYOUTS = {
  'cover-grid': {
    label: 'Cover Grid',
    panels: [
      [[0, 0], [0.52, 0], [0.52, 0.72], [0, 0.72]], // tall hero, left
      [[0.52, 0], [1, 0], [1, 0.36], [0.52, 0.36]], // top right
      [[0.52, 0.36], [1, 0.36], [1, 0.72], [0.52, 0.72]], // middle right
      [[0, 0.72], [1, 0.72], [1, 1], [0, 1]], // wide strip along the foot
    ],
  },
  'triptych': {
    label: 'Triptych',
    panels: [
      [[0, 0], [0.38, 0], [0.30, 1], [0, 1]],
      [[0.38, 0], [0.70, 0], [0.62, 1], [0.30, 1]],
      [[0.70, 0], [1, 0], [1, 1], [0.62, 1]],
    ],
  },
  'hero-strip': {
    label: 'Hero Strip',
    panels: [
      [[0, 0], [1, 0], [1, 0.62], [0, 0.62]], // wide hero on top
      [[0, 0.62], [0.34, 0.62], [0.34, 1], [0, 1]],
      [[0.34, 0.62], [0.67, 0.62], [0.67, 1], [0.34, 1]],
      [[0.67, 0.62], [1, 0.62], [1, 1], [0.67, 1]],
    ],
  },
  'full-bleed': {
    label: 'Full Bleed',
    panels: [
      [[0, 0], [1, 0], [1, 1], [0, 1]], // one photo spread over everything
    ],
  },
};

// The colour grades. `filter` is interpolated toward neutral by the strength
// slider; `washes` are gradient overlays painted over each photo, their alpha
// scaled by the strength. Stops are [offset, css colour] pairs over the
// panel's own box, top to bottom.
export const GRADES = {
  'vice-sunset': {
    label: 'Vice Sunset',
    filter: { saturate: 1.38, contrast: 1.12, brightness: 1.03 },
    washes: [
      [[0, 'rgba(255, 64, 160, 0.30)'], [0.5, 'rgba(255, 138, 61, 0.10)'], [1, 'rgba(64, 8, 92, 0.38)']],
    ],
    empty: ['#3a1145', '#c22a72'],
  },
  'neon-night': {
    label: 'Neon Night',
    filter: { saturate: 1.5, contrast: 1.2, brightness: 0.96 },
    washes: [
      [[0, 'rgba(0, 224, 255, 0.20)'], [0.55, 'rgba(20, 0, 60, 0.08)'], [1, 'rgba(255, 0, 122, 0.30)']],
    ],
    empty: ['#062a3d', '#7a1048'],
  },
  'golden-hour': {
    label: 'Golden Hour',
    filter: { saturate: 1.22, contrast: 1.06, brightness: 1.08 },
    washes: [
      [[0, 'rgba(255, 186, 73, 0.22)'], [0.6, 'rgba(255, 120, 40, 0.08)'], [1, 'rgba(96, 32, 8, 0.26)']],
    ],
    empty: ['#4a2408', '#b35c17'],
  },
  'clean': {
    label: 'Clean',
    filter: { saturate: 1.06, contrast: 1.03, brightness: 1.01 },
    washes: [
      [[0, 'rgba(255, 255, 255, 0.05)'], [1, 'rgba(10, 10, 30, 0.10)']],
    ],
    empty: ['#232333', '#4c4c66'],
  },
};

export const CAPTION_FONT = "'Anton', 'Arial Narrow Bold', 'Arial Narrow', sans-serif";

/** The polygon of layout panel `index`, in canvas pixels. */
export function panelPolygon(layoutId, index, W, H) {
  const shape = LAYOUTS[layoutId].panels[index];
  return shape.map(([x, y]) => [x * W, y * H]);
}

/** True when the canvas point (x, y) falls inside the polygon. */
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function tracePath(ctx, polygon) {
  ctx.beginPath();
  polygon.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function polygonBox(polygon) {
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Paints one panel: the photo cover-fit into the panel's box with its zoom
// and pan, the grade's filter on the photo itself, then the grade's washes
// over it — all clipped to the panel's polygon.
function paintPanel(ctx, polygon, panel, grade, strength) {
  const box = polygonBox(polygon);
  ctx.save();
  tracePath(ctx, polygon);
  ctx.clip();
  const photo = panel?.photo ?? null;
  if (photo) {
    const iw = photo.naturalWidth || photo.width;
    const ih = photo.naturalHeight || photo.height;
    const zoom = Math.max(1, panel.zoom ?? 1);
    const scale = Math.max(box.w / iw, box.h / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    const slackX = Math.max(0, dw - box.w);
    const slackY = Math.max(0, dh - box.h);
    const dx = box.x - slackX / 2 + (panel.ox ?? 0) * (slackX / 2);
    const dy = box.y - slackY / 2 + (panel.oy ?? 0) * (slackY / 2);
    const mix = (target) => 1 + (target - 1) * strength;
    ctx.filter =
      `saturate(${mix(grade.filter.saturate)}) contrast(${mix(grade.filter.contrast)}) ` +
      `brightness(${mix(grade.filter.brightness)})`;
    ctx.drawImage(photo, dx, dy, dw, dh);
    ctx.filter = 'none';
  } else {
    const fill = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    fill.addColorStop(0, grade.empty[0]);
    fill.addColorStop(1, grade.empty[1]);
    ctx.fillStyle = fill;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  if (strength > 0) {
    for (const stops of grade.washes) {
      const wash = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
      for (const [at, colour] of stops) wash.addColorStop(at, colour);
      ctx.globalAlpha = strength;
      ctx.fillStyle = wash;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// The printed-poster keyline: a thick white line with a thin dark edge on
// both sides, stroked over the panel cuts.
function strokeKeyline(ctx, polygon, W) {
  const white = Math.max(3, W * 0.0055);
  tracePath(ctx, polygon);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#16101d';
  ctx.lineWidth = white + Math.max(2, W * 0.0022);
  ctx.stroke();
  tracePath(ctx, polygon);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = white;
  ctx.stroke();
}

// For full-bleed, the cover-grid cuts drawn over the single photo, softer
// than real panel borders so the spread still reads as one picture.
function strokeFrameLines(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (const [, shape] of LAYOUTS['cover-grid'].panels.entries()) {
    const polygon = shape.map(([x, y]) => [x * W, y * H]);
    tracePath(ctx, polygon);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, W * 0.003);
    ctx.stroke();
  }
  ctx.restore();
}

// The caption block: a soft dark band rising from the foot, the title in big
// condensed capitals with a heavy dark outline, drop shadow and a slight
// italic skew, and the tagline spaced out underneath it.
function paintCaption(ctx, W, H, state) {
  const title = (state.title ?? '').trim().toUpperCase();
  const tagline = (state.tagline ?? '').trim().toUpperCase();
  if (!title && !tagline) return;

  const bandTop = H * 0.58;
  const band = ctx.createLinearGradient(0, bandTop, 0, H);
  band.addColorStop(0, 'rgba(8, 4, 16, 0)');
  band.addColorStop(0.55, 'rgba(8, 4, 16, 0.42)');
  band.addColorStop(1, 'rgba(8, 4, 16, 0.72)');
  ctx.fillStyle = band;
  ctx.fillRect(0, bandTop, W, H - bandTop);

  const margin = W * 0.045;
  const maxTextWidth = W - margin * 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  let taglineSize = 0;
  if (tagline) {
    taglineSize = H * 0.030;
    ctx.font = `${taglineSize}px ${CAPTION_FONT}`;
    while (ctx.measureText(tagline).width > maxTextWidth && taglineSize > 8) {
      taglineSize -= 1;
      ctx.font = `${taglineSize}px ${CAPTION_FONT}`;
    }
  }
  const taglineBaseline = H * 0.962;
  const titleBaseline = tagline ? taglineBaseline - taglineSize * 1.55 : H * 0.945;

  if (title) {
    let size = H * 0.118;
    ctx.font = `${size}px ${CAPTION_FONT}`;
    while (ctx.measureText(title).width > maxTextWidth && size > 10) {
      size -= 2;
      ctx.font = `${size}px ${CAPTION_FONT}`;
    }
    ctx.save();
    ctx.translate(margin, titleBaseline);
    ctx.transform(1, 0, -0.055, 1, 0, 0); // the poster's slight italic lean
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#150a1e';
    ctx.lineWidth = size * 0.17;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = size * 0.10;
    ctx.shadowOffsetY = size * 0.045;
    ctx.strokeText(title, 0, 0);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const face = ctx.createLinearGradient(0, -size, 0, size * 0.15);
    face.addColorStop(0, '#ffffff');
    face.addColorStop(0.72, '#ffeef7');
    face.addColorStop(1, '#ffb9d9');
    ctx.fillStyle = face;
    ctx.fillText(title, 0, 0);
    ctx.restore();
  }

  if (tagline) {
    ctx.save();
    ctx.translate(margin + 2, taglineBaseline);
    ctx.transform(1, 0, -0.055, 1, 0, 0);
    ctx.font = `${taglineSize}px ${CAPTION_FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = taglineSize * 0.3;
    drawSpacedText(ctx, tagline, taglineSize * 0.32);
    ctx.restore();
  }
}

// fillText with manual letter spacing (canvas letterSpacing is not set
// everywhere), drawn at the current origin.
function drawSpacedText(ctx, text, spacing) {
  let x = 0;
  for (const ch of text) {
    ctx.fillText(ch, x, 0);
    x += ctx.measureText(ch).width + spacing;
  }
}

// A small original badge in the top-left corner: the maker's own name in a
// dark pill. No ratings, no borrowed logos.
function paintBadge(ctx, W, H) {
  const size = H * 0.026;
  ctx.font = `${size}px ${CAPTION_FONT}`;
  const text = 'NEON SHORES';
  const padX = size * 0.7;
  const width = ctx.measureText(text).width + padX * 2 + size * 0.9;
  const height = size * 1.9;
  const x = W * 0.028;
  const y = H * 0.032;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
  ctx.fillStyle = 'rgba(10, 6, 20, 0.66)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, H * 0.0022);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + padX + size * 0.28, y + height / 2, size * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#ff2e88';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX + size * 0.85, y + height / 2 + size * 0.04);
  ctx.restore();
}

/** Paints the whole cover described by `state` onto `ctx` at W x H. */
export function drawCover(ctx, W, H, state) {
  const layout = LAYOUTS[state.layout] ?? LAYOUTS['cover-grid'];
  const grade = GRADES[state.grade] ?? GRADES['vice-sunset'];
  const strength = Math.min(1, Math.max(0, state.gradeStrength ?? 0.85));

  ctx.fillStyle = '#12081f';
  ctx.fillRect(0, 0, W, H);

  layout.panels.forEach((shape, i) => {
    const polygon = shape.map(([x, y]) => [x * W, y * H]);
    paintPanel(ctx, polygon, state.panels?.[i], grade, strength);
  });

  if (state.layout === 'full-bleed') strokeFrameLines(ctx, W, H);
  layout.panels.forEach((shape) => {
    const polygon = shape.map(([x, y]) => [x * W, y * H]);
    strokeKeyline(ctx, polygon, W);
  });

  // A gentle vignette settles the edges before the caption goes on.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(5, 2, 12, 0.30)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  paintBadge(ctx, W, H);
  paintCaption(ctx, W, H, state);
}
