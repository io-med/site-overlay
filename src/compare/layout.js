/** Sizes and places the two frames and the address captions under them. */
import { $, frames } from './dom.js';
import { LAYERS, settings, state } from './state.js';

const SIDE_GAP = 16;
const CAPTION_MIN_WIDTH = 260;
const TOOLBAR_TOGGLE_WIDTH = 36; // the button in the footer's right corner

/** The opacity slider applies to the two overlay modes only. */
export function topLayerOpacity() {
  return state.mode === 'overlay' || state.mode === 'highlight' ? state.opacity / 100 : 1;
}

export function layoutStage() {
  const viewport = $('viewport');
  const stage = $('stage');
  const { width, mode } = state;
  const side = mode === 'side';
  const stageWidth = side ? width * 2 + SIDE_GAP : width;
  const fit = state.fit || side; // side by side always fits the window
  const scale = fit ? Math.min(1, viewport.clientWidth / stageWidth) : 1;
  const height = Math.floor(viewport.clientHeight / scale);

  viewport.style.overflow = fit ? 'hidden' : 'auto';
  if (fit) viewport.scrollLeft = 0; // an offset scrolled to before fitting would otherwise stay
  stage.style.width = `${stageWidth}px`;
  stage.style.height = `${height}px`;
  stage.style.transform = scale < 1 ? `scale(${scale})` : '';
  stage.style.marginLeft = `${Math.max(0, (viewport.clientWidth - stageWidth * scale) / 2)}px`;

  for (const layer of LAYERS) {
    frames[layer].style.width = `${width}px`;
    frames[layer].style.height = `${height}px`;
  }

  const top = frames.B;
  const shifted = !side && settings.offset;
  top.style.left = side ? `${width + SIDE_GAP}px` : '0';
  top.style.transform = shifted ? `translate(${state.offX}px, ${state.offY}px)` : '';
  top.style.opacity = topLayerOpacity();
  top.style.visibility = state.hideB && !side ? 'hidden' : 'visible';
  top.style.pointerEvents = side || (state.active === 'B' && !state.hideB) ? 'auto' : 'none';
  top.classList.toggle('diff', mode === 'difference');

  placeCaptions();
}

/** The first load replaces the start screen with the stage. */
export function showStage() {
  if (!$('stage').hidden) return;
  $('welcome').hidden = true;
  $('stage').hidden = false;
  layoutStage(); // nothing could be measured while the stage was hidden
}

/**
 * Each layer's address sits under its own screen: under each frame in side by side,
 * A under the left half of the stage and B under the right half in the other modes.
 */
export function placeCaptions() {
  const viewport = $('viewport').getBoundingClientRect();
  const rightEdge = viewport.right - TOOLBAR_TOGGLE_WIDTH;
  const clip = (left, right) => [Math.max(viewport.left, left), Math.min(rightEdge, right)];

  let spans;
  if (state.mode === 'side') {
    spans = LAYERS.map((layer) => {
      const rect = frames[layer].getBoundingClientRect();
      return clip(rect.left, rect.right);
    });
  } else {
    const stage = $('stage').getBoundingClientRect();
    const [left, right] = clip(stage.left, stage.right);
    const middle = (left + right) / 2;
    // A narrow stage would squeeze the addresses to a few letters, so the captions may reach past it.
    const half = Math.max((right - left) / 2, CAPTION_MIN_WIDTH);
    spans = [clip(middle - half, middle), clip(middle, middle + half)];
  }

  LAYERS.forEach((layer, i) => {
    const [left, right] = spans[i];
    const caption = $(`cap${layer}`);
    caption.style.left = `${left}px`;
    caption.style.width = `${Math.max(0, right - left)}px`;
  });
}
