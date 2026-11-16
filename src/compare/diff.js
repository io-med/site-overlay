/**
 * "Overlay + difference": a pulsing mask over the places where the two sites differ.
 *
 * The page cannot read the pixels of cross-origin frames, so the mask comes from two screenshots
 * of the tab, one showing only A and one showing only B. Screenshots are taken only after
 * something changed. The mask is drawn once; the pulse is a compositor-only opacity animation.
 */
import { t } from '../shared/i18n.js';
import { $, frames, showStatus } from './dom.js';
import { alive } from './frames.js';
import { topLayerOpacity } from './layout.js';
import { settings, state } from './state.js';

// Chrome allows two captureVisibleTab calls per second.
const CAPTURE_INTERVAL_MS = 550;

const mask = $('diffLayer');
const difference = new OffscreenCanvas(1, 1); // |A − B| of the visible part of the stage
let hasDifference = false;

let timer;
let run = 0; // bumped by every reschedule; a capture still in flight for an older run gives up
let lastCaptureAt = 0;

const wanted = () => state.mode === 'highlight' && !state.hideB;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** Recomputes the mask after `delayMs` of quiet. `hide` takes the current mask off right away. */
export function scheduleDiff(delayMs, { hide = false } = {}) {
  clearTimeout(timer);
  run++;
  if (hide || !wanted()) mask.hidden = true;
  if (wanted()) timer = setTimeout(refresh, delayMs);
}

async function capture(topOpacity, thisRun, windowId) {
  const cancelled = () => thisRun !== run || document.hidden;
  await sleep(lastCaptureAt + CAPTURE_INTERVAL_MS - performance.now());
  if (cancelled()) return null;
  try {
    frames.B.style.opacity = topOpacity;
    await nextPaint();
    if (cancelled()) return null;
    lastCaptureAt = performance.now();
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    return await createImageBitmap(await (await fetch(dataUrl)).blob());
  } finally {
    frames.B.style.opacity = topLayerOpacity();
  }
}

async function refresh() {
  if (!wanted() || !alive.A || !alive.B || document.hidden) return;
  const thisRun = ++run;
  mask.hidden = true;
  let onlyA;
  let onlyB;
  try {
    const { windowId } = await chrome.tabs.getCurrent();
    onlyA = await capture(0, thisRun, windowId);
    onlyB = onlyA && (await capture(1, thisRun, windowId));
    if (!onlyB || thisRun !== run) return;
    computeDifference(onlyA, onlyB);
    redrawMask();
    mask.hidden = false;
  } catch (error) {
    showStatus(t('diffFailed', error.message), { warn: true });
  } finally {
    onlyA?.close();
    onlyB?.close();
  }
}

function computeDifference(onlyA, onlyB) {
  const viewport = $('viewport');
  const view = viewport.getBoundingClientRect();
  const stage = $('stage').getBoundingClientRect();
  // The visible part of the stage, without the viewport's scrollbars.
  const left = Math.max(view.left, stage.left);
  const top = Math.max(view.top, stage.top);
  const right = Math.min(view.left + viewport.clientWidth, stage.right);
  const bottom = Math.min(view.top + viewport.clientHeight, stage.bottom);

  const pixelRatio = onlyA.width / window.innerWidth;
  const sx = Math.round(left * pixelRatio);
  const sy = Math.round(top * pixelRatio);
  const width = Math.round((right - left) * pixelRatio);
  const height = Math.round((bottom - top) * pixelRatio);

  difference.width = width;
  difference.height = height;
  const ctx = difference.getContext('2d');
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(onlyA, sx, sy, width, height, 0, 0, width, height);
  ctx.globalCompositeOperation = 'difference';
  ctx.drawImage(onlyB, sx, sy, width, height, 0, 0, width, height);
  hasDifference = true;

  mask.width = width;
  mask.height = height;
  Object.assign(mask.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${right - left}px`,
    height: `${bottom - top}px`,
  });
}

/**
 * Turns the difference into the coloured mask with the #diffMask SVG filter.
 * Tolerance: erode removes strokes thinner than 2r + 1 px, dilate gives the rest its shape back.
 * It works on the stored difference, so moving the slider takes no new screenshots.
 */
export function redrawMask() {
  if (!hasDifference) return;
  $('diffErode').setAttribute('radius', state.tolerance);
  $('diffDilate').setAttribute('radius', state.tolerance + 1);
  const ctx = mask.getContext('2d');
  ctx.filter = 'none';
  ctx.clearRect(0, 0, mask.width, mask.height);
  ctx.filter = 'url(#diffMask)';
  ctx.drawImage(difference, 0, 0);
}

/** Applies the highlight colour and the pulse on/off from the settings. */
export function styleMask() {
  const [r, g, b] = [1, 3, 5].map((i) => (parseInt(settings.diffColor.slice(i, i + 2), 16) / 255).toFixed(3));
  // Every pixel gets the colour; its alpha is the sum of the difference channels.
  $('diffColor').setAttribute('values', `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  1 1 1 0 0`);
  mask.classList.toggle('still', !settings.pulse);
  redrawMask();
}
