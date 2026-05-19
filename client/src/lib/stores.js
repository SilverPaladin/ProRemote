import { writable } from 'svelte/store';

// Bump this key when changing defaults so previously-saved settings don't override them.
const KEY = 'pp-remote-settings-v2';

// Default to the same host the SPA was served from. Since this app is meant to
// run on the same machine as ProPresenter (or be reached from a phone via that
// machine's LAN IP), using location.hostname means the client just works on
// every device without having to enter the IP manually.
const defaultHost =
  (typeof window !== 'undefined' && window.location && window.location.hostname)
    ? window.location.hostname
    : '127.0.0.1';

const defaults = {
  host: defaultHost,
  port: '50627',
  https: false
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export const settings = writable(load());

settings.subscribe((v) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
});

// Currently-loaded presentation state
export const currentPresentation = writable(null); // { uuid, name, slides: [...] }
export const currentSlideIndex = writable(0);
export const status = writable({ kind: 'idle', message: '' }); // kind: idle|loading|error|ok

// Playlist context for the currently-loaded presentation (used for cross-presentation navigation)
export const currentPlaylistId = writable(null);
export const currentPlaylistItems = writable([]); // raw items array from /v1/playlist/{id}
export const currentItemIndex = writable(null);   // index of the active item within items
