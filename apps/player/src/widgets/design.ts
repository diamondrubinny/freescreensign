// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  designAnimationCss,
  designCanvasStyle,
  designConfigSchema,
  designElementStyle,
  designFit,
  type DesignConfig,
} from '@rubinny/shared';
import { defineWidget, el } from '@rubinny/widget-sdk';
import { onLayout } from './fit';

/** Sets camelCase styles as CSS properties (keeps prefixed ones such as -webkit-text-stroke). */
function applyStyle(node: HTMLElement, style: Record<string, string>) {
  for (const [key, value] of Object.entries(style)) {
    node.style.setProperty(
      key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      value,
    );
  }
}

/**
 * Free-form slide: the canvas is laid out at its design size and scaled to the
 * zone (aspect ratio kept). Styles come from @rubinny/shared, like in the editor.
 * Animations run on a wrapper around each element, so its rotation stays its own.
 */
export const designWidget = defineWidget<DesignConfig>({
  type: 'design',
  parseConfig: (config) => designConfigSchema.parse(config),
  render(container, config, ctx) {
    const canvas = el('div', { className: 'w-design-canvas' });
    applyStyle(canvas, designCanvasStyle(config));
    const root = el('div', { className: 'w-design' }, canvas);
    container.append(root);

    const image = (mediaId: string, fit: 'cover' | 'contain') => {
      const img = el('img', { className: 'w-design-img' });
      img.alt = '';
      img.style.objectFit = fit;
      void ctx.mediaUrl(mediaId).then((url) => {
        if (url && !ctx.signal.aborted) img.src = url;
      });
      return img;
    };

    if (config.backgroundMediaId) {
      const background = image(config.backgroundMediaId, 'cover');
      background.classList.add('w-design-background');
      canvas.append(background);
    }
    for (const element of config.elements) {
      const node = el('div', { className: `w-design-el w-design-${element.kind}` });
      const style = designElementStyle(element);
      if (element.kind === 'text') {
        node.dir = 'auto';
        node.textContent = element.text;
      } else if (element.kind === 'image') {
        node.append(image(element.mediaId, element.fit));
        if (element.overlay) {
          const overlay = el('div', { className: 'w-design-overlay' });
          overlay.style.backgroundColor = element.overlay;
          node.append(overlay);
        }
      }
      const animation = designAnimationCss(element, config.animate && !ctx.reducedMotion);
      if (animation) {
        // The wrapper takes the element's box; the element fills it.
        const wrapper = el('div', { className: 'w-design-anim' }, node);
        applyStyle(wrapper, {
          position: 'absolute',
          left: style.left ?? '0',
          top: style.top ?? '0',
          width: style.width ?? '0',
          height: style.height ?? '0',
          animation,
        });
        applyStyle(node, { ...style, left: '0', top: '0' });
        canvas.append(wrapper);
      } else {
        applyStyle(node, style);
        canvas.append(node);
      }
    }

    onLayout(ctx.signal, () => {
      const { scale, left, top } = designFit(config, {
        width: root.clientWidth,
        height: root.clientHeight,
      });
      canvas.style.transform = `translate(${String(left)}px, ${String(top)}px) scale(${String(scale)})`;
    });
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
