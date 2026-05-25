<script>
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import { api } from '../lib/api.js';
  import { currentPresentation, currentSlideIndex, settings, currentPlaylistId, currentPlaylistItems, currentItemIndex } from '../lib/stores.js';
  import { loadPresentation } from '../lib/navigation.js';

  const dispatch = createEventDispatcher();

  let playlists = [];
  let itemsByPlaylist = {};
  let loading = false;

  // The playlist currently shown in the sidebar. Independent from the
  // "active" playlist (the one driving navigation) so users can browse
  // a different list while a presentation is active — though by default
  // we follow the active playlist whenever it changes.
  let selectedPlaylistKey = null;
  // Whether the playlist picker (list of all playlists) is open.
  let pickerOpen = false;

  // Highlight whichever item matches the currently loaded presentation,
  // including when navigation auto-advances to the next presentation.
  // We prefer matching by item index (kept in sync by sync.js / loadItem),
  // which lets us highlight the active row even when no slide has been
  // selected yet and works for any row type (header, presentation, etc.).
  $: activeUuid = $currentPresentation?.uuid || null;
  $: activeItemIdx = $currentItemIndex;

  // Follow the active playlist: when navigation lands on a playlist,
  // surface it in the sidebar and fetch its items if needed.
  $: activePlaylistKey = $currentPlaylistId || null;
  $: if (activePlaylistKey && activePlaylistKey !== selectedPlaylistKey) {
    selectedPlaylistKey = activePlaylistKey;
    pickerOpen = false;
  }
  $: if (selectedPlaylistKey && !itemsByPlaylist[selectedPlaylistKey]) {
    fetchItems(selectedPlaylistKey);
  }

  $: selectedPlaylist = playlists.find((p) => idOf(p) === selectedPlaylistKey) || null;
  $: headerLabel = selectedPlaylist ? nameOf(selectedPlaylist) : 'Select Playlist';
  $: visibleItems = (selectedPlaylistKey && itemsByPlaylist[selectedPlaylistKey]) || [];
  $: itemCount = visibleItems.filter((it) => it?.type !== 'header').length;

  function libraryOf(item) {
    return (
      item?.presentation_info?.library_name ||
      item?.presentation_info?.location?.library ||
      item?.library?.name ||
      item?.library ||
      item?.location?.library ||
      ''
    );
  }

  function headerBg(item) {
    const c = item?.header_color;
    if (!c) return 'var(--panel-2)';
    // Mute the color: mix toward a dark gray and reduce saturation/brightness
    // so the header bands feel like ProPresenter's subdued tones rather than
    // fully-saturated swatches.
    const mix = 0.45; // 0 = original, 1 = fully gray
    const target = 60; // dark gray to blend toward
    const r = Math.round(((c.red || 0) * 255) * (1 - mix) + target * mix);
    const g = Math.round(((c.green || 0) * 255) * (1 - mix) + target * mix);
    const b = Math.round(((c.blue || 0) * 255) * (1 - mix) + target * mix);
    return `rgb(${r},${g},${b})`;
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
  $: scrollActiveIntoView(activeUuid, activeItemIdx, itemsByPlaylist, selectedPlaylistKey, pickerOpen);

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

  function togglePicker() {
    pickerOpen = !pickerOpen;
  }

  function selectPlaylist(pl) {
    const key = idOf(pl);
    selectedPlaylistKey = key;
    pickerOpen = false;
    if (!itemsByPlaylist[key]) fetchItems(key);
    // Tell ProPresenter to focus this playlist so subsequent next/previous
    // triggers operate within it.
    (async () => {
      try {
        await api.focusPlaylist(key);
        await api.triggerFocusedPlaylist();
      } catch (e) {
        dispatch('error', e.message);
      }
    })();
  }

  async function loadItem(pl, item, index) {
    if (item?.type && item.type !== 'presentation') {
      // Headers / media / etc. — not viewable as a slide grid.
      return;
    }
    const playlistId = idOf(pl);
    // Tell ProPresenter to trigger this item — sync will pick up the new
    // focused item / active presentation on its next poll and update the UI.
    try {
      await api.triggerPlaylistItem(playlistId, index);
    } catch (e) {
      dispatch('error', e.message);
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
  <button
    class="head-toggle"
    on:click={togglePicker}
    title={selectedPlaylist ? 'Change playlist' : 'Select a playlist'}
  >
    <span class="chev">{pickerOpen ? '▾' : '▸'}</span>
    {#if selectedPlaylist && !pickerOpen}
      <h3 class="count">{itemCount} ITEMS</h3>
      <span class="pl-sub" title={headerLabel}>{headerLabel}</span>
    {:else}
      <h3 class:placeholder={!selectedPlaylist}>{headerLabel}</h3>
    {/if}
  </button>
  <button class="icon-btn" on:click={refresh} title="Refresh" disabled={loading}>{loading ? '…' : '↻'}</button>
</div>

<div class="list scroll" bind:this={listEl}>
  {#if pickerOpen || !selectedPlaylistKey}
    {#if playlists.length === 0 && !loading}
      <div class="empty muted">No playlists found.</div>
    {/if}
    {#each playlists as pl (idOf(pl))}
      {@const key = idOf(pl)}
      <button
        class="pl-pick"
        class:active={key === selectedPlaylistKey}
        on:click={() => selectPlaylist(pl)}
      >
        <span class="pl-name">{nameOf(pl)}</span>
        {#if pl?.type}<span class="badge">{pl.type}</span>{/if}
        {#if key === activePlaylistKey}<span class="badge">active</span>{/if}
      </button>
    {/each}
  {:else}
    {@const key = selectedPlaylistKey}
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
          {@const lib = isPres ? libraryOf(item) : ''}
          <button
            class="item"
            class:header={item?.type === 'header'}
            class:active={isActiveRow}
            disabled={!isPres && item?.type !== 'media' && item?.type !== 'header'}
            on:click={() => loadItem(selectedPlaylist, item, i)}
            title={item?.type || 'presentation'}
            style:background={item?.type === 'header' ? headerBg(item) : ''}
          >
            {#if item?.type === 'header'}
              <span class="t hdr-t">{item?.id?.name || item?.name || 'Item'}</span>
            {:else}
              <span class="ico" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="13.2" width="10" height="1.4" rx="0.5"/></svg>
              </span>
              <span class="t">{item?.id?.name || item?.name || 'Item'}</span>
              <span class="meta">{lib || (item?.type && item.type !== 'presentation' ? item.type : '')}</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    gap: 8px;
  }
  .head h3 { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head h3.placeholder { color: var(--muted); font-weight: 500; }
  .head h3.count {
    font-size: 11px; font-weight: 700; letter-spacing: 0.8px;
    text-transform: uppercase; color: var(--muted);
  }
  .pl-sub {
    font-size: 12px; color: var(--text, inherit);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1; min-width: 0;
  }
  .head-toggle {
    flex: 1; min-width: 0;
    display: flex; gap: 8px; align-items: center;
    background: transparent; border: none; padding: 0;
    color: inherit; cursor: pointer; text-align: left;
  }
  .head-toggle:hover h3 { color: var(--accent, inherit); }
  .icon-btn {
    background: transparent; border: 1px solid transparent; border-radius: 6px;
    color: var(--muted); cursor: pointer; padding: 2px 8px; font-size: 16px;
    line-height: 1;
  }
  .icon-btn:hover { color: var(--text, inherit); background: var(--panel-2); }
  .list { padding: 0; flex: 1; min-height: 0; }
  .empty { padding: 16px; text-align: center; font-size: 13px; }
  .pl-pick {
    width: 100%; text-align: left;
    display: flex; gap: 8px; align-items: center;
    background: transparent; border: 1px solid transparent;
    padding: 10px 12px; margin: 0;
    color: inherit; cursor: pointer; font-size: 14px;
  }
  .pl-pick:hover { background: var(--panel-2); }
  .pl-pick.active { background: var(--panel-2); border-color: var(--accent); }
  .chev { width: 14px; color: var(--muted); flex: 0 0 auto; }
  .pl-name { flex: 1; font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .items { display: flex; flex-direction: column; gap: 0; }
  .item {
    display: flex; gap: 8px; align-items: center;
    text-align: left;
    background: transparent; border: none;
    border-bottom: 1px solid var(--border);
    padding: 10px 12px; font-size: 12.5px;
    color: inherit; cursor: pointer; width: 100%;
    min-height: 34px;
  }
  .item:disabled { cursor: default; }
  .item:not(.header):hover { background: var(--panel-2); }
  .item.active:not(.header) {
    background: rgba(255,255,255,0.10);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .ico { color: var(--muted); display: inline-flex; flex: 0 0 auto; }
  .item.active .ico { color: var(--text, inherit); }
  .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta {
    color: var(--muted); font-size: 11.5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 0 0 auto; max-width: 45%;
  }

  .item.header {
    color: #fff; font-weight: 600; font-size: 12px;
    padding: 10px 12px;
    border-bottom: none;
    min-height: 34px;
    cursor: default;
    text-shadow: 0 1px 1px rgba(0,0,0,0.35);
  }
  .hdr-t {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .small { font-size: 12px; padding: 6px 12px; }
</style>
