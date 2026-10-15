/**
 * Shrinks `text`'s font size until `box` no longer overflows. Starts from the
 * CSS-defined size, so text never grows beyond the design.
 */
export function fitText(text: HTMLElement, box: HTMLElement): void {
  text.style.fontSize = '';
  let size = Number.parseFloat(getComputedStyle(text).fontSize);
  if (!Number.isFinite(size)) return;
  const overflowing = () =>
    box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
  for (let i = 0; i < 40 && size > 8 && overflowing(); i++) {
    size *= 0.9;
    text.style.fontSize = `${size.toFixed(1)}px`;
  }
}

/** Runs `task` after layout, and again whenever the window is resized. */
export function onLayout(signal: AbortSignal, task: () => void): void {
  requestAnimationFrame(() => {
    if (!signal.aborted) task();
  });
  // Explicit removal: older TV browsers ignore the `signal` listener option.
  window.addEventListener('resize', task);
  signal.addEventListener(
    'abort',
    () => {
      window.removeEventListener('resize', task);
    },
    { once: true },
  );
}
