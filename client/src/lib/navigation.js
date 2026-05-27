// Centralized slide navigation. Both keyboard handlers and the Controls bar
// call into here. next/previous defer to ProPresenter's own /v1/trigger/next
// and /v1/trigger/previous endpoints, which already handle wrapping into the
// next/previous playlist item, so we don't need to compute that ourselves.

import { get } from 'svelte/store';
import { api } from './api.js';
import {
  currentPresentation,
  currentSlideIndex,
  currentItemIndex,
  currentPlaylistItems,
  status
} from './stores.js';

function parseSlides(data) {
  const groups = data?.groups || data?.presentation?.groups || [];
  const slides = [];
  for (const g of groups) {
    const groupName = g?.name || g?.id?.name || '';
    const groupColor = g?.color || null;
    for (const s of (g?.slides || [])) {
      slides.push({
        uuid: s?.uuid || s?.id?.uuid,
        text: s?.text || s?.notes || '',
        groupName,
        groupColor
      });
    }
  }
  return slides;
}

export async function loadPresentation(uuid, itemIndex = null) {
  if (!uuid) return false;
  // Drop the previous presentation immediately so its thumbnails don't
  // linger on screen while we fetch the new one. Without this, the old
  // <img> tags keep their old src visible until the new fetch resolves,
  // which looks like the thumbnails are being cached across presentations.
  const prev = get(currentPresentation);
  if (prev && prev.uuid !== uuid) {
    currentPresentation.set(null);
    currentSlideIndex.set(0);
  }
  try {
    const data = await api.presentation(uuid);
    currentPresentation.set({
      uuid,
      name: data?.id?.name || data?.name || 'Presentation',
      slides: parseSlides(data),
      // Per-load nonce used to cache-bust thumbnail URLs so we never get
      // a stale image for the same (uuid, index) from the browser cache.
      loadId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
    if (itemIndex !== null) currentItemIndex.set(itemIndex);
    currentSlideIndex.set(0);
    return true;
  } catch (e) {
    status.set({ kind: 'error', message: e.message });
    return false;
  }
}

export async function gotoSlide(i) {
  const pres = get(currentPresentation);
  if (!pres) return;
  const max = (pres.slides || []).length - 1;
  if (max < 0) return;
  const clamped = Math.max(0, Math.min(max, i));
  currentSlideIndex.set(clamped);
  try {
    await api.triggerPresentation(pres.uuid, clamped);
  } catch (e) {
    status.set({ kind: 'error', message: e.message });
  }
}

// If the user is on the last slide of the current presentation and the
// following playlist item is a header, /v1/trigger/next will land focus on
// that header (which has no slides) — sync.js then has to auto-skip past it
// on the next poll, which causes a visible stutter. In that case we ask the
// focused playlist to advance by an item instead, which jumps straight to
// the next real presentation.
function nextItemIsHeader() {
  const items = get(currentPlaylistItems) || [];
  const itemIdx = get(currentItemIndex);
  if (typeof itemIdx !== 'number') return false;
  const nextItem = items[itemIdx + 1];
  return nextItem?.type === 'header';
}

function atLastSlide() {
  const pres = get(currentPresentation);
  const slides = pres?.slides || [];
  if (slides.length === 0) return false;
  return get(currentSlideIndex) >= slides.length - 1;
}

export async function next() {
  try {
    if (atLastSlide()) {
      await api.focusedNext();
    } else {
      await api.next();
    }
  } catch (e) { status.set({ kind: 'error', message: e.message }); }
}

export async function previous() {
  try {
    await api.previous();
  } catch (e) { status.set({ kind: 'error', message: e.message }); }
}

export async function clearSlide() {
  try { await api.clearSlide(); }
  catch (e) { status.set({ kind: 'error', message: e.message }); }
}
