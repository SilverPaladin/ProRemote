// Background sync: poll ProPresenter for the currently-focused playlist,
// item and slide, and mirror them into local state. The UI simply reflects
// whatever ProPresenter says is focused — when the user issues a command
// (focus playlist, trigger item, trigger slide, next, previous), the next
// poll surfaces the result.
//
// We only update local state — we never trigger anything from here, so this
// can never feed back and cause an infinite loop.

import { get } from 'svelte/store';
import { api } from './api.js';
import {
  currentPresentation,
  currentSlideIndex,
  currentPlaylistId,
  currentPlaylistItems,
  currentItemIndex
} from './stores.js';
import { loadPresentation } from './navigation.js';

let timer = null;
let inFlight = null;
let backoffMs = 0;
let cachedPlaylistId = null;
const POLL_MS = 700;
const MAX_BACKOFF = 5000;

export function startSync() {
  stopSync();
  // First tick runs immediately so the UI snaps to ProPresenter's current
  // state as soon as we connect.
  schedule(0);
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
  try {
    inFlight = new AbortController();
    const signal = inFlight.signal;
    const [focused, slide] = await Promise.all([
      api.focusedPlaylist().catch((e) => { if (e?.name === 'AbortError') throw e; return null; }),
      api.activeSlideIndex(signal).catch((e) => { if (e?.name === 'AbortError') throw e; return null; })
    ]);
    inFlight = null;
    backoffMs = 0;
    await applyFocused(focused);
    await applySlide(slide);
    schedule(POLL_MS);
  } catch (e) {
    inFlight = null;
    if (e?.name === 'AbortError') return;
    console.warn('[sync] poll failed:', e.message);
    backoffMs = Math.min(MAX_BACKOFF, Math.max(POLL_MS * 2, backoffMs * 2 || POLL_MS * 2));
    schedule(backoffMs);
  }
}

async function applyFocused(focused) {
  if (!focused) return;
  const plUuid = focused?.playlist?.uuid;
  const itemIdx = focused?.item?.index;
  if (!plUuid) return;

  // Focused playlist changed in ProPresenter — refetch its items.
  if (plUuid !== cachedPlaylistId) {
    cachedPlaylistId = plUuid;
    currentPlaylistId.set(plUuid);
    try {
      const res = await api.playlist(plUuid);
      const items = Array.isArray(res) ? res : (res?.items || res?.data || []);
      currentPlaylistItems.set(items);
    } catch {
      currentPlaylistItems.set([]);
    }
  }

  if (typeof itemIdx === 'number' && get(currentItemIndex) !== itemIdx) {
    currentItemIndex.set(itemIdx);
  }

  // Mirror the focused item's presentation in the slide grid, so moving focus
  // between presentations in ProPresenter updates the slide area immediately —
  // without waiting for the operator to trigger anything.
  if (typeof itemIdx === 'number') {
    const items = get(currentPlaylistItems) || [];
    const cur = items[itemIdx];
    const isPres = !cur?.type || cur.type === 'presentation';
    if (isPres) {
      const presUuid = cur?.presentation_info?.presentation_uuid || cur?.id?.uuid;
      const loaded = get(currentPresentation);
      if (presUuid && loaded?.uuid !== presUuid) {
        await loadPresentation(presUuid, itemIdx);
      }
    }
  }
}

async function applySlide(data) {
  const idx = extractIndex(data);
  const uuid = extractUuid(data);
  const pres = get(currentPresentation);

  // Only reflect the active slide highlight when the actively-presenting
  // presentation matches what the operator currently has focused. Otherwise
  // leave the slide grid uncoloured — the user is browsing, not presenting.
  if (!uuid || pres?.uuid !== uuid) return;

  if (idx !== null && get(currentSlideIndex) !== idx) {
    currentSlideIndex.set(idx);
  }
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
