// ProPresenter REST API client.
// Docs: https://openapi.propresenter.com/
//
// The browser talks directly to ProPresenter. The user enters host & port in Settings.
// ProPresenter's network API listens on the port configured in Preferences -> Network.

import { get } from 'svelte/store';
import { settings } from './stores.js';

function baseUrl() {
  const s = get(settings);
  const host = (s.host || '').trim();
  const port = (s.port || '').toString().trim();
  if (!host || !port) throw new Error('ProPresenter host/port not configured');
  const scheme = s.https ? 'https' : 'http';
  return `${scheme}://${host}:${port}`;
}

async function request(path, { method = 'GET', body, signal, accept = 'application/json' } = {}) {
  const url = `${baseUrl()}${path}`;
  const headers = { Accept: accept };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    mode: 'cors'
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  // Sanity check.
  version: () => request('/version'),

  // Playlists
  playlists: () => request('/v1/playlists'),
  playlist: (id) => request(`/v1/playlist/${encodeURIComponent(id)}`),
  // Returns the currently-focused playlist + item, e.g.
  // { playlist: { uuid, name, index }, item: { uuid, name, index } }
  focusedPlaylist: () => request('/v1/playlist/focused?chunked=false'),
  focusPlaylist: (id) => request(`/v1/playlist/${encodeURIComponent(id)}/focus`),
  triggerFocusedPlaylist: () => request('/v1/playlist/focused/trigger'),

  // Presentations
  presentation: (uuid) => request(`/v1/presentation/${encodeURIComponent(uuid)}`),
  activePresentation: () => request('/v1/presentation/active'),
  // Lightweight poll target: returns the currently-presenting slide index
  // (and usually the parent presentation id) without serializing the whole presentation.
  // Path differs across ProPresenter versions; try the modern path first, then fall back.
  activeSlideIndex: async (signal) => {
    try {
      return await request('/v1/presentation/slide_index', { signal });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      return await request('/v1/presentation/active/slide_index', { signal });
    }
  },

  // Triggers
  triggerPresentation: (uuid, index = 0) =>
    request(`/v1/presentation/${encodeURIComponent(uuid)}/${index}/trigger`),
  triggerPlaylistItem: (playlistId, itemIndex) =>
    request(`/v1/playlist/${encodeURIComponent(playlistId)}/${itemIndex}/trigger`),
  triggerActiveIndex: (index) => request(`/v1/presentation/active/${index}/trigger`),
  next: () => request('/v1/trigger/next'),
  previous: () => request('/v1/trigger/previous'),
  clearSlide: () => request('/v1/clear/layer/slide'),

  // Thumbnails — returns an image URL the <img> tag can load directly.
  thumbnailUrl: (uuid, index, quality = 256) =>
    `${baseUrl()}/v1/presentation/${encodeURIComponent(uuid)}/thumbnail/${index}?quality=${quality}`
};
