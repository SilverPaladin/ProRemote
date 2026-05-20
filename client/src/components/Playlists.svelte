<script>
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import { api } from '../lib/api.js';
  import { currentPresentation, currentSlideIndex, settings, currentPlaylistId, currentPlaylistItems, currentItemIndex } from '../lib/stores.js';
  import { loadPresentation } from '../lib/navigation.js';
  import { pauseSync } from '../lib/sync.js';

  const dispatch = createEventDispatcher();

  let playlists = [];
  let expanded = {};
  let itemsByPlaylist = {};
  let loading = false;

  // Highlight whichever item matches the currently loaded presentation,
  // including when navigation auto-advances to the next presentation.
  // We prefer matching by item index (kept in sync by sync.js / loadItem),
  // which lets us highlight the active row even when no slide has been
  // selected yet and works for any row type (header, presentation, etc.).
  $: activeUuid = $currentPresentation?.uuid || null;
  $: activeItemIdx = $currentItemIndex;

  // When a playlist is the "active" one (its items are loaded into the
  // navigation context), keep it expanded so the user can always see where
  // they are in the playlist. We also auto-fetch its items if needed.
  $: activePlaylistKey = $currentPlaylistId || null;
  $: if (activePlaylistKey) {
    if (!expanded[activePlaylistKey]) {
      expanded = { ...expanded, [activePlaylistKey]: true };
    }
    if (!itemsByPlaylist[activePlaylistKey]) {
      fetchItems(activePlaylistKey);
    }
  }

  async function fetchItems(key) {
    try {
      const res = await api.playlist(key);
      const items = Array.isArray(res) ? res : (res?.items || res?.data || []);
      itemsByPlaylist = { ...itemsByPlaylist, [key]: items };
    } catch (e) {
      dispatch('error', e.message);
    }
  }

  let listEl;

  // Whenever the active presentation or the rendered items change, ensure the
  // highlighted item is visible inside the playlist scroll area.
  $: scrollActiveIntoView(activeUuid, activeItemIdx, itemsByPlaylist, expanded);

  async function scrollActiveIntoView(_uuid, _idx, _items, _exp) {
    if (!listEl) return;
    await tick();
    const el = listEl.querySelector('.item.active');
    if (!el) return;
    const list = listEl.getBoundingClientRect();
    const item = el.getBoundingClientRect();
    if (item.top < list.top || item.bottom > list.bottom) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  async function refresh() {
    loading = true;
    try {
      const res = await api.playlists();
      // The API returns an array of playlist objects (or an object with `playlists`).
      playlists = Array.isArray(res) ? res : (res?.playlists || res?.data || []);
    } catch (e) {
      dispatch('error', e.message);
      playlists = [];
    } finally {
      loading = false;
    }
  }

  function idOf(p) {
    return p?.id?.uuid || p?.id?.index || p?.uuid || p?.id || p?.name;
  }
  function nameOf(p) {
    return p?.id?.name || p?.name || 'Untitled';
  }

  async function toggle(pl) {
    const key = idOf(pl);
    // The active playlist stays pinned open so the user can always see where
    // they are in it. Clicking its header is a no-op.
    if (key === activePlaylistKey) {
      expanded = { ...expanded, [key]: true };
      return;
    }
    expanded[key] = !expanded[key];
    expanded = { ...expanded };
    if (expanded[key] && !itemsByPlaylist[key]) {
      try {
        const res = await api.playlist(key);
        const items = Array.isArray(res) ? res : (res?.items || res?.data || []);
        itemsByPlaylist = { ...itemsByPlaylist, [key]: items };
      } catch (e) {
        dispatch('error', e.message);
      }
    }
  }

  async function loadItem(pl, item, index) {
    if (item?.type && item.type !== 'presentation') {
      // Headers / media / etc. — not viewable as a slide grid.
      return;
    }
    // The actual presentation uuid lives in presentation_info.presentation_uuid.
    // item.id.uuid is just the playlist-item identifier and won't resolve via /v1/presentation/{uuid}.
    const uuid =
      item?.presentation_info?.presentation_uuid ||
      item?.presentation?.id?.uuid ||
      item?.id?.uuid;
    const playlistId = idOf(pl);

    // Set the playlist context so navigation helpers can advance to the next presentation.
    currentPlaylistId.set(playlistId);
    currentPlaylistItems.set(itemsByPlaylist[playlistId] || []);

    // Browsing a presentation that isn't the currently-presenting one — pause sync
    // so it doesn't fight us by reverting to whatever ProPresenter is still showing.
    // Sync will automatically resume the next time a slide is triggered locally.
    pauseSync();

    if (uuid) {
      await loadPresentation(uuid, index);
    } else {
      // Fallback: focus + trigger the item, then read active presentation.
      try {
        await api.triggerPlaylistItem(playlistId, index);
        const data = await api.activePresentation();
        const activeId = data?.id?.uuid;
        if (activeId) await loadPresentation(activeId, index);
      } catch (e) {
        dispatch('error', e.message);
      }
    }
  }

  onMount(refresh);
  // Refresh playlists when settings change.
  let firstRun = true;
  $: if ($settings) {
    if (firstRun) { firstRun = false; }
    else { refresh(); }
  }
</script>

<div class="head">
  <h3>Playlists</h3>
  <button on:click={refresh} title="Refresh" disabled={loading}>{loading ? '…' : '↻'}</button>
</div>

<div class="list scroll" bind:this={listEl}>
  {#if playlists.length === 0 && !loading}
    <div class="empty muted">No playlists found.</div>
  {/if}

  {#each playlists as pl (idOf(pl))}
    {@const key = idOf(pl)}
    <div class="pl">
      <button
        class="pl-head"
        class:active={key === activePlaylistKey}
        on:click={() => toggle(pl)}
        title={key === activePlaylistKey ? 'Active playlist (always expanded)' : ''}
      >
        <span class="chev">{(expanded[key] || key === activePlaylistKey) ? '▾' : '▸'}</span>
        <span class="pl-name">{nameOf(pl)}</span>
        {#if pl?.type}<span class="badge">{pl.type}</span>{/if}
      </button>

      {#if expanded[key]}
        <div class="items">
          {#if !itemsByPlaylist[key]}
            <div class="muted small">Loading…</div>
          {:else if itemsByPlaylist[key].length === 0}
            <div class="muted small">Empty playlist.</div>
          {:else}
            {#each itemsByPlaylist[key] as item, i}
              {@const isPres = !item?.type || item.type === 'presentation'}
              {@const presUuid = item?.presentation_info?.presentation_uuid || item?.id?.uuid}
              {@const isActiveRow =
                key === activePlaylistKey &&
                ((activeItemIdx !== null && activeItemIdx === i) ||
                 (isPres && presUuid && presUuid === activeUuid))}
              <button
                class="item"
                class:header={item?.type === 'header'}
                class:active={isActiveRow}
                disabled={!isPres && item?.type !== 'media' && item?.type !== 'header'}
                on:click={() => loadItem(pl, item, i)}
                title={item?.type || 'presentation'}
              >
                {#if item?.type === 'header'}
                  <span
                    class="hdot"
                    style:background={item?.header_color
                      ? `rgba(${Math.round((item.header_color.red||0)*255)},${Math.round((item.header_color.green||0)*255)},${Math.round((item.header_color.blue||0)*255)},1)`
                      : 'var(--muted)'}
                  ></span>
                {:else}
                  <span class="idx">{i + 1}</span>
                {/if}
                <span class="t">{item?.id?.name || item?.name || 'Item'}</span>
                {#if item?.type && item.type !== 'presentation' && item.type !== 'header'}
                  <span class="badge">{item.type}</span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .head h3 { margin: 0; font-size: 14px; }
  .list { padding: 8px; flex: 1; min-height: 0; }
  .empty { padding: 16px; text-align: center; font-size: 13px; }
  .pl { margin-bottom: 4px; }
  .pl-head {
    width: 100%; text-align: left;
    display: flex; gap: 8px; align-items: center;
    background: transparent; border: none; padding: 8px 8px;
    border-radius: 8px;
  }
  .pl-head:hover { background: var(--panel-2); }
  .pl-head.active { background: var(--panel-2); cursor: default; }
  .chev { width: 14px; color: var(--muted); }
  .pl-name { flex: 1; font-weight: 600; font-size: 14px; }
  .items { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 6px 14px; }
  .item {
    display: flex; gap: 10px; align-items: center;
    text-align: left;
    background: transparent; border: 1px solid transparent;
    padding: 8px 10px; border-radius: 8px; font-size: 13px;
  }
  .item:hover { background: var(--panel-2); }
  .item.active { background: var(--panel-2); border-color: var(--accent); }
  .item.header { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
  .item.header.active { color: var(--text, inherit); }
  .hdot { width: 10px; height: 10px; border-radius: 50%; }
  .idx {
    width: 22px; height: 22px; border-radius: 6px;
    background: var(--bg-2); color: var(--muted);
    font-size: 11px; display: grid; place-items: center;
  }
  .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .small { font-size: 12px; padding: 6px 10px; }
</style>
