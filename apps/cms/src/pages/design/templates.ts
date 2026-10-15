import type { TFunction } from 'i18next';
import { CANVAS_PRESETS, newId, type Design, type Element } from './model';

export const DESIGN_TEMPLATES = ['blank', 'welcome', 'sale', 'event'] as const;
export type DesignTemplate = (typeof DESIGN_TEMPLATES)[number];

const base = { rotation: 0, opacity: 1 };
const text = (
  props: Partial<Element> & { text: string; x: number; y: number; w: number; h: number },
): Element =>
  ({
    ...base,
    id: newId(),
    kind: 'text',
    fontSize: 72,
    fontWeight: 800,
    italic: false,
    color: '#ffffff',
    align: 'center',
    lineHeight: 1.15,
    ...props,
  }) as Element;
const shape = (props: Partial<Element> & { x: number; y: number; w: number; h: number }): Element =>
  ({
    ...base,
    id: newId(),
    kind: 'shape',
    shape: 'rect',
    fill: '#4f46e5',
    radius: 0,
    strokeWidth: 0,
    ...props,
  }) as Element;

/** Ready-made starting points (text and shapes only; images are added by the user). */
export function designTemplate(template: DesignTemplate, t: TFunction): Design {
  const { width, height } = CANVAS_PRESETS.landscape;
  const canvas = { width, height, elements: [] as Element[] };
  switch (template) {
    case 'blank':
      return { ...canvas, background: '#111827' };
    case 'welcome':
      return {
        ...canvas,
        background: '#1e1b4b',
        elements: [
          shape({
            shape: 'ellipse',
            x: 1300,
            y: -250,
            w: 900,
            h: 900,
            fill: '#4338ca',
            opacity: 0.6,
          }),
          shape({
            shape: 'ellipse',
            x: -200,
            y: 700,
            w: 600,
            h: 600,
            fill: '#7c3aed',
            opacity: 0.45,
          }),
          text({
            text: t('designer.samples.welcomeTitle'),
            x: 160,
            y: 330,
            w: 1600,
            h: 220,
            fontSize: 150,
          }),
          text({
            text: t('designer.samples.welcomeText'),
            x: 260,
            y: 590,
            w: 1400,
            h: 120,
            fontSize: 56,
            fontWeight: 400,
            color: '#c7d2fe',
          }),
        ],
      };
    case 'sale':
      return {
        ...canvas,
        background: '#7f1d1d',
        elements: [
          shape({ x: 0, y: 0, w: 1920, h: 1080, fill: '#b91c1c', opacity: 0.5 }),
          shape({ shape: 'ellipse', x: 1200, y: 180, w: 620, h: 620, fill: '#facc15' }),
          text({ text: '50%', x: 1200, y: 360, w: 620, h: 240, fontSize: 200, color: '#7f1d1d' }),
          text({
            text: t('designer.samples.saleTitle'),
            x: 120,
            y: 260,
            w: 1000,
            h: 200,
            fontSize: 140,
            align: 'start',
          }),
          text({
            text: t('designer.samples.saleText'),
            x: 120,
            y: 500,
            w: 1000,
            h: 260,
            fontSize: 60,
            fontWeight: 400,
            align: 'start',
            color: '#fee2e2',
          }),
        ],
      };
    case 'event':
      return {
        ...canvas,
        background: '#0f172a',
        elements: [
          shape({ x: 0, y: 0, w: 1920, h: 160, fill: '#0369a1' }), // white text: 5.9:1
          text({
            text: t('designer.samples.eventBadge'),
            x: 0,
            y: 30,
            w: 1920,
            h: 100,
            fontSize: 64,
          }),
          text({
            text: t('designer.samples.eventTitle'),
            x: 160,
            y: 330,
            w: 1600,
            h: 200,
            fontSize: 130,
          }),
          shape({ x: 760, y: 580, w: 400, h: 8, fill: '#38bdf8', radius: 4 }),
          text({
            text: t('designer.samples.eventText'),
            x: 260,
            y: 640,
            w: 1400,
            h: 200,
            fontSize: 60,
            fontWeight: 400,
            color: '#bae6fd',
          }),
        ],
      };
  }
}
