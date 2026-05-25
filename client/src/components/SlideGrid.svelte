<script>
  import { tick } from 'svelte';
  import { currentPresentation, currentSlideIndex } from '../lib/stores.js';
  import { api } from '../lib/api.js';
  import { gotoSlide } from '../lib/navigation.js';

  function thumb(i) {
    if (!$currentPresentation?.uuid) return '';
    return api.thumbnailUrl($currentPresentation.uuid, i, 320);
  }

  let gridEl;

  // Keep the active slide visible whenever the index (or the presentation)
  // changes — covers next/prev, keyboard, sync from ProPresenter, etc.
  $: scrollActiveIntoView($currentSlideIndex, $currentPresentation?.uuid);

  async function scrollActiveIntoView(_idx, _uuid) {
    if (!gridEl) return;
    await tick();
    const el = gridEl.querySelector('.slide.active');
    if (!el) return;
    const g = gridEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < g.top || r.bottom > g.bottom) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
</script>

<div class="grid scroll" bind:this={gridEl}>
  {#each ($currentPresentation?.slides || []) as slide, i (slide.uuid || i)}
    <div
      class="slide"
      class:active={i === $currentSlideIndex}
      role="button"
      tabindex="0"
      on:click={() => gotoSlide(i)}
      on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), gotoSlide(i))}
      title={slide.text}
    >
      <div class="thumb-wrap">
        <img
          src={thumb(i)}
          alt={`Slide ${i + 1}`}
          loading="lazy"
          on:error={(e) => (e.currentTarget.style.display = 'none')}
        />
        <div class="fallback">
          <div class="ftext">{slide.text || `Slide ${i + 1}`}</div>
        </div>
        <div class="idx">{i + 1}</div>
      </div>
      {#if slide.groupName}
        <div class="grp" style:--g={slide.groupColor
          ? `rgba(${Math.round((slide.groupColor.red||0)*255)}, ${Math.round((slide.groupColor.green||0)*255)}, ${Math.round((slide.groupColor.blue||0)*255)}, 1)`
          : 'var(--accent)'}>
          <span class="dot"></span>{slide.groupName}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .grid {
    flex: 1;
    min-height: 0;
    display: grid;
    /* Cap at 2 columns; tiles scale fluidly with the container width. */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: max-content; /* size each row to its content; don't squash when scrolling */
    gap: 12px;
    padding-right: 6px;
    align-content: start;
  }
  @media (max-width: 420px) {
    .grid { grid-template-columns: 1fr; gap: 8px; padding-right: 0; }
  }
  .slide {
    display: block;
    text-align: left;
    padding: 6px;
    background: var(--bg-2);
    border: 2px solid transparent;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    transition: border-color 0.15s ease, transform 0.05s ease;
  }
  .slide:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .slide:hover { border-color: #36426a; }
  .slide.active { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,140,255,0.25); }
  .slide:active { transform: translateY(1px); }

  .thumb-wrap {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    /* Belt-and-suspenders: padding-bottom fallback for browsers that ignore
       aspect-ratio in this context, plus a hard min-height floor so the row
       never collapses to zero even if both fail. */
    min-height: 80px;
    border-radius: 8px;
    overflow: hidden;
    background: #0a0f1c;
  }
  .thumb-wrap img {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    z-index: 2;
  }
  .fallback {
    position: absolute; inset: 0;
    display: grid; place-items: center; padding: 8px;
    background: linear-gradient(135deg, #1a2238, #0f1428);
    z-index: 1;
  }
  .ftext {
    font-size: 12px; text-align: center;
    color: var(--muted);
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .idx {
    position: absolute; top: 6px; left: 6px;
    background: rgba(0,0,0,0.55);
    color: white;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 6px;
    z-index: 3;
  }
  .grp {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--muted);
    margin-top: 6px;
    padding: 0 2px;
  }
  .grp .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--g, var(--accent));
  }
</style>
