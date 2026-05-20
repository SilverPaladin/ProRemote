// Background sync: poll ProPresenter for the currently-presenting slide so
// that changes made directly inside ProPresenter (someone clicked a slide on
// the desktop) are reflected in this remote.
//
// We only update local state — we never trigger anything from here, so this
// can never feed back and cause an infinite loop.
//
// To avoid flicker right after the user triggers a slide locally (the poll
// might return a stale index from before our trigger took effect), local
// actions call suppressSync() to mute the next few polls.

import { get } from 'svelte/store';
import { api } from './api.js';
import {
  currentPresentation,
  currentSlideIndex,
  currentPlaylistItems,
  currentItemIndex
} from './stores.js';
import { loadPresentation } from './navigation.js';

let timer = null;
let inFlight = null;
let suppressUntil = 0;
let paused = false;
let backoffMs = 0;
const POLL_MS = 700;
const MAX_BACKOFF = 5000;

export function suppressSync(ms = 900) {
  suppressUntil = Math.max(suppressUntil, Date.now() + ms);
}

// Hard pause — used when the user is browsing a different presentation than
// the currently-presenting one. Resumed automatically the next time a slide
// is triggered locally (via gotoSlide / next / previous).
export function pauseSync() {
  paused = true;
}

export function resumeSync() {
  paused = false;
}

export function startSync() {
  stopSync();
  schedule(POLL_MS);
}

export function stopSync() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (inFlight) inFlight.abort();
  inFlight = null;
  backoffMs = 0;
}

function schedule(ms) {
  timer = setTimeout(tick, ms);
}

async function tick() {
  timer = null;
  if (paused || Date.now() < suppressUntil) {
    schedule(POLL_MS);
    return;
  }
  try {
    inFlight = new AbortController();
    const data = await api.activeSlideIndex(inFlight.signal);
    inFlight = null;
    backoffMs = 0;
    apply(data);
    schedule(POLL_MS);
  } catch (e) {
    inFlight = null;
    if (e?.name === 'AbortError') return;
    // Surface errors so you can spot a misconfigured endpoint or CORS issue.
    // (Uncomment in dev if needed.)
    console.warn('[sync] poll failed:', e.message);
    backoffMs = Math.min(MAX_BACKOFF, Math.max(POLL_MS * 2, backoffMs * 2 || POLL_MS * 2));
    schedule(backoffMs);
  }
}

function apply(data) {
  const idx  = extractIndex(data);
  const uuid = extractUuid(data);
  const pres = get(currentPresentation);

  // Different presentation became active in ProPresenter — load it.
  if (uuid && pres?.uuid !== uuid) {
    // If this presentation lives in the currently-loaded playlist, point
    // currentItemIndex at it so the playlist sidebar can highlight the new
    // active row immediately (e.g. after pressing next/previous past the
    // end of a presentation).
    const matchedIndex = findItemIndexByUuid(uuid);
    if (matchedIndex !== -1) currentItemIndex.set(matchedIndex);

    loadPresentation(uuid).then(() => {
      if (idx !== null) currentSlideIndex.set(idx);
    });
    return;
  }

  if (idx !== null && get(currentSlideIndex) !== idx) {
    currentSlideIndex.set(idx);
  }
}

// Locate a presentation uuid inside the currently-loaded playlist items so we
// can keep the playlist sidebar's highlight in sync with whatever ProPresenter
// advanced to. Returns -1 when there is no playlist context or no match.
function findItemIndexByUuid(uuid) {
  const items = get(currentPlaylistItems);
  if (!Array.isArray(items) || !items.length) return -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const itUuid =
      it?.presentation_info?.presentation_uuid ||
      it?.presentation?.id?.uuid ||
      it?.id?.uuid;
    if (itUuid && itUuid === uuid) return i;
  }
  return -1;
}

// ProPresenter's response shape for slide-index varies between versions.
// Handle the common variants gracefully.
function extractIndex(d) {
  if (d == null) return null;
  if (typeof d === 'number') return d;
  if (typeof d.index === 'number') return d.index;
  if (typeof d.slide_index === 'number') return d.slide_index;
  if (d.presentation_index && typeof d.presentation_index.index === 'number') {
    return d.presentation_index.index;
  }
  return null;
}

function extractUuid(d) {
  if (!d || typeof d !== 'object') return null;
  return (
    d.presentation_id?.uuid ||
    d.presentation?.id?.uuid ||
    d.presentation_index?.presentation_id?.uuid ||
    d.id?.uuid ||
    null
  );
}
