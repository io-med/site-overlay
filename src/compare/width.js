/**
 * Width controls: the breakpoint buttons, the slider under them and the number field.
 *
 * The slider is as wide as the row of buttons. When the width equals a breakpoint, the thumb
 * sits under the centre of that button; between two buttons the width changes linearly.
 */
import { $ } from './dom.js';
import { clampWidth, settings, state, update } from './state.js';

const SNAP_PX = 5;

const slider = $('widthSlider');
const presets = $('presets');

// Thumb position (0..1) of every button; measured lazily, dropped when the buttons change size.
let anchors = null;

function measureAnchors() {
  const row = presets.getBoundingClientRect();
  const thumb = parseFloat(getComputedStyle(slider).getPropertyValue('--thumb'));
  const travel = row.width - thumb;
  if (travel <= 0 || presets.children.length < 2) return null;
  const points = [...presets.children].map((button) => {
    const rect = button.getBoundingClientRect();
    return {
      position: (rect.left + rect.width / 2 - row.left - thumb / 2) / travel,
      width: Number(button.dataset.w),
    };
  });
  return { points, travel };
}

function getAnchors() {
  anchors ??= measureAnchors();
  return anchors;
}

/** Piecewise-linear map between two keys of the points; the end segments extend past the ends. */
function interpolate(points, value, from, to) {
  let i = points.findIndex((point) => point[from] >= value);
  if (i === -1) i = points.length - 1;
  else if (i === 0) i = 1;
  const a = points[i - 1];
  const b = points[i];
  return a[to] + ((b[to] - a[to]) * (value - a[from])) / (b[from] - a[from]);
}

function widthAt(position) {
  const { points, travel } = getAnchors();
  const snapped = points.find((point) => Math.abs(point.position - position) * travel <= SNAP_PX);
  return snapped ? snapped.width : clampWidth(interpolate(points, position, 'position', 'width'));
}

export function renderWidth() {
  $('width').value = state.width;
  for (const button of presets.children)
    button.classList.toggle('on', Number(button.dataset.w) === state.width);

  const known = getAnchors();
  slider.hidden = !known;
  if (!known || slider.matches(':active')) return; // do not fight the user's drag
  const position = interpolate(known.points, state.width, 'width', 'position');
  slider.value = Math.round(Math.min(1, Math.max(0, position)) * slider.max);
}

export function renderPresets() {
  presets.replaceChildren(
    ...settings.presets.map((width) => {
      const button = document.createElement('button');
      button.textContent = width;
      button.dataset.w = width;
      return button;
    }),
  );
  presets.hidden = !settings.presets.length;
  anchors = null;
  renderWidth();
}

export function bindWidthControls() {
  presets.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) update({ width: Number(button.dataset.w) });
  });
  $('width').addEventListener('change', (event) => update({ width: clampWidth(event.target.value) }));
  slider.addEventListener('input', () => {
    if (getAnchors()) update({ width: widthAt(slider.value / slider.max) });
  });
  // On release the thumb settles exactly under the button it snapped to.
  slider.addEventListener('change', renderWidth);
  new ResizeObserver(() => {
    anchors = null;
    renderWidth();
  }).observe(presets);
}
