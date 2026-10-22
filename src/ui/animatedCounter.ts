export function animateCounter(el: HTMLElement, targetValue: number, duration = 600): void {
  const startValue = parseInt(el.textContent || '0', 10) || 0;
  if (startValue === targetValue) return;

  const startTime = performance.now();
  const diff = targetValue - startValue;

  function tick(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startValue + diff * eased);
    el.textContent = String(current);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}
