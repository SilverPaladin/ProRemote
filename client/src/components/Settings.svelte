<script>
  import { createEventDispatcher } from 'svelte';
  import { settings } from '../lib/stores.js';

  const dispatch = createEventDispatcher();

  let host = $settings.host;
  let port = $settings.port;
  let https = $settings.https;

  function save() {
    settings.set({ host: host.trim(), port: String(port).trim(), https: !!https });
    dispatch('saved');
  }
</script>

<div
  class="backdrop"
  role="button"
  tabindex="-1"
  aria-label="Close settings"
  on:click={() => dispatch('close')}
  on:keydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && dispatch('close')}
></div>
<div class="modal card" role="dialog" aria-modal="true">
  <header>
    <h3>Connection settings</h3>
    <button on:click={() => dispatch('close')} aria-label="Close">✕</button>
  </header>

  <div class="body">
    <p class="muted">
      Enter the IP/hostname and port of the computer running ProPresenter. The network API
      is configured in <em>Preferences → Network</em>. The default port is <strong>1025</strong>.
    </p>

    <label>
      <span>Host / IP</span>
      <input type="text" bind:value={host} placeholder="192.168.1.50" autocomplete="off" />
    </label>

    <label>
      <span>Port</span>
      <input type="number" bind:value={port} placeholder="1025" />
    </label>

    <label class="row">
      <input type="checkbox" bind:checked={https} />
      <span>Use HTTPS</span>
    </label>

    <div class="hint muted">
      <strong>Note:</strong> if you see CORS errors, enable
      "Allow Network Connections" in ProPresenter and make sure your device is on the same
      network. Your tablet/phone must be able to reach this host directly.
    </div>
  </div>

  <footer>
    <button on:click={() => dispatch('close')}>Cancel</button>
    <button class="primary" on:click={save}>Save & Reconnect</button>
  </footer>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.55);
    backdrop-filter: blur(3px); z-index: 50;
  }
  .modal {
    position: fixed;
    z-index: 51;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, calc(100vw - 32px));
    padding: 0;
    overflow: hidden;
  }
  header, footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }
  footer { border-top: 1px solid var(--border); border-bottom: none; gap: 8px; }
  h3 { margin: 0; font-size: 16px; }
  .body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
  label.row { flex-direction: row; align-items: center; color: var(--text); }
  label.row input { width: auto; }
  .hint { font-size: 12px; line-height: 1.5; }
</style>
