// Centralized slide navigation. Both keyboard handlers and the Controls bar
// call into here so the active slide is always reflected in the UI, and so we
// can hop to the next/previous presentation in the playlist when we run off
// the end of the current one.

import { get } from 'svelte/store';
import { api } from './api.js';
import {
  currentPresentation,
  currentSlideIndex,
  currentPlaylistItems,
  currentItemIndex,
  status
} from './stores.js';
import { suppressSync, resumeSync } from './sync.js';

function isPresentationItem(item) {
  return !item?.type || item.type === 'presentation';
}

function presentationUuidOf(item) {
  return item?.presentation_info?.presentation_uuid || item?.id?.uuid || null;
}

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

// Find adjacent presentation item in the current playlist (skipping headers/media).
function findAdjacentPresentation(direction) {
  const items = get(currentPlaylistItems) || [];
  const idx = get(currentItemIndex);
  if (idx == null) return null;
  for (let j = idx + direction; j >= 0 && j < items.length; j += direction) {
    if (isPresentationItem(items[j])) {
      const uuid = presentationUuidOf(items[j]);
      if (uuid) return { index: j, uuid };
    }
  }
  return null;
}

async function jumpToAdjacentPresentation(direction, slidePos) {
  const target = findAdjacentPresentation(direction);
  if (!target) return false;
  suppressSync(1500);
  try {
    const data = await api.presentation(target.uuid);
    const slides = parseSlides(data);
    currentPresentation.set({
      uuid: target.uuid,
      name: data?.id?.name || 'Presentation',
      slides
    });
    currentItemIndex.set(target.index);
    const slideIdx = slidePos === 'last' ? Math.max(0, slides.length - 1) : 0;
    currentSlideIndex.set(slideIdx);
    await api.triggerPresentation(target.uuid, slideIdx);
    resumeSync();
    return true;
  } catch (e) {
    status.set({ kind: 'error', message: e.message });
    return false;
  }
}

export async function next() {
  const pres = get(currentPresentation);
  if (!pres) return;
  const i = get(currentSlideIndex) ?? 0;
  const max = (pres.slides || []).length - 1;
  if (i < max) return gotoSlide(i + 1);
  await jumpToAdjacentPresentation(+1, 'first');
}

export async function previous() {
  const pres = get(currentPresentation);
  if (!pres) return;
  const i = get(currentSlideIndex) ?? 0;
  if (i > 0) return gotoSlide(i - 1);
  await jumpToAdjacentPresentation(-1, 'last');
}

export async function clearSlide() {
  try { await api.clearSlide(); }
  catch (e) { status.set({ kind: 'error', message: e.message }); }
}
