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
  status
} from './stores.js';
import { suppressSync, resumeSync } from './sync.js';

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
  try {
    const data = await api.presentation(uuid);
    currentPresentation.set({
      uuid,
      name: data?.id?.name || data?.name || 'Presentation',
      slides: parseSlides(data)
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
  suppressSync();
  try {
    await api.triggerPresentation(pres.uuid, clamped);
    // Triggering a slide makes this presentation the active one in
    // ProPresenter, so it's safe to let sync take over again.
    resumeSync();
  } catch (e) {
    status.set({ kind: 'error', message: e.message });
  }
}

export async function next() {
  try {
    await api.next();
    // ProPresenter is now driving — let sync pick up whatever it advanced to
    // (possibly the next playlist item) so the sidebar highlight follows.
    resumeSync();
  } catch (e) { status.set({ kind: 'error', message: e.message }); }
}

export async function previous() {
  try {
    await api.previous();
    resumeSync();
  } catch (e) { status.set({ kind: 'error', message: e.message }); }
}

export async function clearSlide() {
  try { await api.clearSlide(); }
  catch (e) { status.set({ kind: 'error', message: e.message }); }
}
