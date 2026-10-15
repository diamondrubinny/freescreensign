/**
 * Applies a widget's colors. The flat color always works; browsers that support
 * color-mix() add a subtle gradient (see player.css).
 */
export function applyColors(element: HTMLElement, colors: { text: string; background: string }) {
  element.style.color = colors.text;
  element.style.backgroundColor = colors.background;
  element.style.setProperty('--w-bg', colors.background);
  element.style.setProperty('--w-fg', colors.text);
}
