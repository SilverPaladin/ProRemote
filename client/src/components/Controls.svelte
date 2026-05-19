<script>
  import { next, previous, clearSlide } from '../lib/navigation.js';
</script>

<div class="bar card">
  <button class="ctl" on:click={previous} aria-label="Previous slide">
    <span class="big">‹</span>
  </button>
  <button class="ctl clear" on:click={clearSlide} aria-label="Clear slide">
    <span class="big sq">■</span>
  </button>
  <button class="ctl primary" on:click={next} aria-label="Next slide">
    <span class="big">›</span>
  </button>
</div>

<style>
  .bar {
    display: grid;
    grid-template-columns: 1fr 1fr 1.4fr;
    gap: 8px;
    padding: 6px;
    flex-shrink: 0;
  }
  .ctl {
    display: flex; align-items: center; justify-content: center;
    padding: 8px 12px;
    border-radius: 10px;
    min-height: 44px;
  }
  .big { font-size: 28px; line-height: 1; font-weight: 700; }
  .big.sq { font-size: 18px; }
  .ctl.clear { background: #2a1c2c; border-color: #4a2840; color: #ffb3c1; }
  .ctl.clear:hover { background: #371f33; }

  @media (max-width: 560px) {
    .bar { padding: 4px; gap: 6px; }
    .ctl { min-height: 38px; padding: 6px 10px; }
    .big { font-size: 24px; }
    .big.sq { font-size: 14px; }
  }
</style>
