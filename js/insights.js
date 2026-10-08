(() => {
  'use strict';
  const carousel = document.querySelector('.insights-carousel');
  if (!carousel) return;
  const track = carousel.querySelector('.insights-track');
  const cards = Array.from(track.querySelectorAll('.insight-slide'));
  const controls = carousel.querySelector('.insights-controls');
  const counter = carousel.querySelector('.insights-count');
  const pause = carousel.querySelector('.insights-pause');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = reduced.matches;
  let hovering = false;
  let focused = false;
  let inView = false;
  let timer;
  let frame;

  function metrics() {
    const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth;
    const start = Math.max(0, Math.round(track.scrollLeft / step));
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const visible = Math.max(1, Math.floor((track.clientWidth + gap + 1) / step));
    return {step, start, end:Math.min(cards.length, start + visible)};
  }
  function update() {
    const {start, end} = metrics();
    const pad = (n) => String(n).padStart(2, '0');
    counter.textContent = `${pad(start + 1)}${end > start + 1 ? '–'+pad(end) : ''} / ${pad(cards.length)}`;
    counter.setAttribute('aria-label', `총 ${cards.length}개 중 ${start + 1}번째부터 ${end}번째 글`);
  }
  function schedule() {
    clearInterval(timer);
    if (userPaused || reduced.matches || hovering || focused || !inView || document.hidden || track.scrollWidth <= track.clientWidth + 2) return;
    timer = setInterval(() => move(1), 5500);
  }
  function setPaused(value) {
    userPaused = value;
    pause.setAttribute('aria-label', value ? '자동 넘김 시작' : '자동 넘김 정지');
    pause.querySelector('span').textContent = value ? '▶' : 'Ⅱ';
    schedule();
  }
  function move(direction) {
    const {step} = metrics();
    const max = track.scrollWidth - track.clientWidth;
    const left = direction > 0
      ? (track.scrollLeft >= max - 2 ? 0 : Math.min(max, track.scrollLeft + step))
      : (track.scrollLeft <= 2 ? max : Math.max(0, track.scrollLeft - step));
    track.scrollTo({left, behavior:reduced.matches ? 'instant' : 'smooth'});
  }
  carousel.querySelector('.insights-prev').addEventListener('click', () => {setPaused(true); move(-1);});
  carousel.querySelector('.insights-next').addEventListener('click', () => {setPaused(true); move(1);});
  pause.addEventListener('click', () => {
    // An explicit Play action also resumes while the control has focus.
    if (userPaused) {hovering = false; focused = false;}
    setPaused(!userPaused);
  });
  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); setPaused(true); move(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  track.addEventListener('pointerdown', () => setPaused(true), {passive:true});
  track.addEventListener('wheel', () => setPaused(true), {passive:true});
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame); frame = requestAnimationFrame(update);
  }, {passive:true});
  carousel.addEventListener('mouseenter', () => {hovering = true; schedule();});
  carousel.addEventListener('mouseleave', () => {hovering = false; schedule();});
  carousel.addEventListener('focusin', () => {focused = true; schedule();});
  carousel.addEventListener('focusout', (event) => {focused = carousel.contains(event.relatedTarget); schedule();});
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', () => {setPaused(reduced.matches);});
  new IntersectionObserver(([entry]) => {inView = entry.isIntersecting; schedule();}, {threshold:0.25}).observe(carousel);
  new ResizeObserver(() => {update(); schedule();}).observe(track);
  controls.hidden = cards.length < 2;
  setPaused(userPaused);
  update();
})();
