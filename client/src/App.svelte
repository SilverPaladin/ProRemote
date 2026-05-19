<script>
  import { onMount } from 'svelte';
  import { settings, currentPresentation, currentSlideIndex, status } from './lib/stores.js';
  import { api } from './lib/api.js';
  import { next, previous, clearSlide } from './lib/navigation.js';
  import { startSync, stopSync } from './lib/sync.js';
  import Settings from './components/Settings.svelte';
  import Playlists from './components/Playlists.svelte';
  import SlideGrid from './components/SlideGrid.svelte';
  import Controls from './components/Controls.svelte';

  let showSettings = false;
  let connected = false;
  let version = '';

  async function testConnection() {
    status.set({ kind: 'loading', message: 'Connecting…' });
    stopSync();
    try {
      const v = await api.version();
      version = typeof v === 'object' ? (v.name || v.version || 'connected') : String(v);
      connected = true;
      status.set({ kind: 'ok', message: 'Connected' });
      startSync();
    } catch (e) {
      connected = false;
      status.set({ kind: 'error', message: e.message });
    }
  }

  onMount(() => {
    testConnection();
    return stopSync;
  });

  // Keyboard navigation
  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      previous();
    } else if (e.key === 'Escape') {
      clearSlide();
    }
  }

  function reconnect() {
    showSettings = false;
    testConnection();
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="app">
  <header class="topbar">
    <div class="brand">
      <div class="logo">PP</div>
      <div>
        <div class="title">ProPresenter Remote</div>
        <div class="sub muted">
          {#if connected}
            <span class="dot ok"></span> {$settings.host}:{$settings.port} {version ? `· ${version}` : ''}
          {:else}
            <span class="dot bad"></span> Not connected
          {/if}
        </div>
      </div>
    </div>
    <div class="actions">
      {#if $status.kind === 'error'}
        <span class="err" title={$status.message}>⚠ {$status.message}</span>
      {/if}
      <button on:click={testConnection} title="Reconnect">↻</button>
      <button class="primary" on:click={() => (showSettings = true)}>Settings</button>
    </div>
  </header>

  <main class="layout">
    <aside class="sidebar card">
      <Playlists on:error={(e) => status.set({ kind: 'error', message: e.detail })} />
    </aside>

    <section class="content card">
      {#if $currentPresentation}
        <div class="content-head">
          <div>
            <h2>{$currentPresentation.name || 'Presentation'}</h2>
            <div class="muted">
              {($currentPresentation.slides || []).length} slides ·
              Slide {($currentSlideIndex ?? 0) + 1}
            </div>
          </div>
        </div>
        <SlideGrid />
      {:else}
        <div class="empty">
          <div class="empty-icon">🎬</div>
          <h3>Select a presentation</h3>
          <p class="muted">Pick a playlist on the left, then choose a presentation to load its slides.</p>
        </div>
      {/if}
    </section>
  </main>

  <Controls />

  {#if showSettings}
    <Settings on:close={() => (showSettings = false)} on:saved={reconnect} />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 12px;
    gap: 12px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .logo {
    width: 38px; height: 38px; border-radius: 10px;
    background: linear-gradient(135deg, #4f8cff, #8b5cf6);
    display: grid; place-items: center; font-weight: 800; letter-spacing: 0.5px;
    box-shadow: var(--shadow);
  }
  .title { font-weight: 700; font-size: 16px; }
  .sub { font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .dot.ok { background: var(--success); box-shadow: 0 0 8px var(--success); }
  .dot.bad { background: var(--danger); }
  .actions { display: flex; gap: 8px; align-items: center; }
  .err {
    color: #ffb3c1; font-size: 12px;
    max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .layout {
    flex: 1;
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 12px;
    min-height: 0;
  }

  .sidebar { padding: 0; min-height: 0; display: flex; flex-direction: column; }
  .content { padding: 16px; min-height: 0; display: flex; flex-direction: column; }
  .content-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 12px; }
  .content-head h2 { margin: 0 0 4px 0; font-size: 18px; }

  .empty {
    flex: 1; display: grid; place-items: center; text-align: center;
  }
  .empty-icon { font-size: 56px; margin-bottom: 8px; }
  .empty h3 { margin: 0 0 6px 0; }

  @media (max-width: 820px) {
    .layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    .sidebar { max-height: 26vh; min-height: 0; }
    .content { min-height: 0; padding: 10px; }
    .content-head { margin-bottom: 8px; }
    .content-head h2 { font-size: 16px; }
  }
</style>
