import {
  designConfigSchema,
  designElementStyle,
  designFit,
  type DesignConfig,
} from '@rubinny/shared';
import { defineWidget, el } from '@rubinny/widget-sdk';
import { onLayout } from './fit';

/**
 * Free-form slide: the canvas is laid out at its design size and scaled to the
 * zone (aspect ratio kept). Styles come from @rubinny/shared, like in the editor.
 */
export const designWidget = defineWidget<DesignConfig>({
  type: 'design',
  parseConfig: (config) => designConfigSchema.parse(config),
  render(container, config, ctx) {
    const canvas = el('div', { className: 'w-design-canvas' });
    Object.assign(canvas.style, {
      width: `${String(config.width)}px`,
      height: `${String(config.height)}px`,
      backgroundColor: config.background,
    });
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
      Object.assign(node.style, designElementStyle(element));
      if (element.kind === 'text') {
        node.dir = 'auto';
        node.textContent = element.text;
      } else if (element.kind === 'image') {
        node.append(image(element.mediaId, element.fit));
      }
      canvas.append(node);
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
