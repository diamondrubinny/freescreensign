import type { TFunction } from 'i18next';
import { CANVAS_PRESETS, newId, type Design, type Element } from './model';

export const DESIGN_TEMPLATES = [
  'blank',
  'welcome',
  'sale',
  'event',
  'special',
  'premiere',
] as const;
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
    font: 'heebo',
    letterSpacing: 0,
    uppercase: false,
    radius: 0,
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

/** Ready-made starting points (text and shapes only; images are added by the user or a kit). */
export function designTemplate(template: DesignTemplate, t: TFunction): Design {
  const { width, height } = CANVAS_PRESETS.landscape;
  const canvas = { width, height, elements: [] as Element[], animate: true };
  const enter = (kind: 'fade' | 'slide-up' | 'zoom' | 'pop', delay: number) => ({
    animation: { enter: kind, delay, duration: 800, loop: 'none' as const },
  });
  switch (template) {
    case 'blank':
      return { ...canvas, background: '#111827' };
    case 'welcome':
      return {
        ...canvas,
        background: '#1e1b4b',
        backgroundGradient: {
          type: 'linear',
          angle: 135,
          stops: [
            { color: '#1e1b4b', at: 0 },
            { color: '#312e81', at: 60 },
            { color: '#4c1d95', at: 100 },
          ],
        },
        elements: [
          shape({
            shape: 'ellipse',
            x: 1300,
            y: -250,
            w: 900,
            h: 900,
            fill: '#4338ca',
            gradient: {
              type: 'radial',
              angle: 0,
              stops: [
                { color: '#818cf8cc', at: 0 },
                { color: '#4338ca00', at: 70 },
              ],
            },
            opacity: 0.8,
            animation: { enter: 'fade', delay: 0, duration: 1500, loop: 'float' },
          }),
          shape({
            shape: 'ellipse',
            x: -200,
            y: 700,
            w: 600,
            h: 600,
            fill: '#7c3aed00',
            gradient: {
              type: 'radial',
              angle: 0,
              stops: [
                { color: '#a78bfacc', at: 0 },
                { color: '#7c3aed00', at: 70 },
              ],
            },
            animation: { enter: 'fade', delay: 300, duration: 1500, loop: 'float' },
          }),
          text({
            text: t('designer.samples.welcomeTitle'),
            x: 160,
            y: 330,
            w: 1600,
            h: 220,
            fontSize: 150,
            font: 'secular-one',
            shadow: { x: 0, y: 10, blur: 40, color: '#00000080' },
            ...enter('zoom', 200),
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
            ...enter('slide-up', 700),
          }),
        ],
      };
    case 'sale':
      return {
        ...canvas,
        background: '#7f1d1d',
        backgroundGradient: {
          type: 'linear',
          angle: 160,
          stops: [
            { color: '#991b1b', at: 0 },
            { color: '#450a0a', at: 100 },
          ],
        },
        elements: [
          shape({
            shape: 'ellipse',
            x: 1200,
            y: 180,
            w: 620,
            h: 620,
            fill: '#facc15',
            gradient: {
              type: 'radial',
              angle: 0,
              stops: [
                { color: '#fde047', at: 0 },
                { color: '#eab308', at: 100 },
              ],
            },
            shadow: { x: 0, y: 24, blur: 60, color: '#00000099' },
            animation: { enter: 'pop', delay: 300, duration: 900, loop: 'pulse' },
          }),
          text({
            text: '-50%',
            x: 1200,
            y: 360,
            w: 620,
            h: 240,
            fontSize: 190,
            color: '#7f1d1d',
            font: 'bebas-neue',
            fontWeight: 400,
            animation: { enter: 'pop', delay: 300, duration: 900, loop: 'pulse' },
          }),
          text({
            text: t('designer.samples.saleTitle'),
            x: 120,
            y: 260,
            w: 1000,
            h: 200,
            fontSize: 140,
            align: 'start',
            font: 'secular-one',
            shadow: { x: 0, y: 8, blur: 30, color: '#00000080' },
            ...enter('slide-up', 0),
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
            ...enter('fade', 600),
          }),
        ],
      };
    case 'event':
      return {
        ...canvas,
        background: '#0f172a',
        elements: [
          shape({
            x: 0,
            y: 0,
            w: 1920,
            h: 160,
            fill: '#0369a1', // white text: 5.9:1
            shadow: { x: 0, y: 8, blur: 30, color: '#00000066' },
          }),
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
            font: 'frank-ruhl',
            ...enter('zoom', 200),
          }),
          shape({
            x: 760,
            y: 580,
            w: 400,
            h: 8,
            fill: '#38bdf8',
            radius: 4,
            ...enter('fade', 600),
          }),
          text({
            text: t('designer.samples.eventText'),
            x: 260,
            y: 640,
            w: 1400,
            h: 200,
            fontSize: 60,
            fontWeight: 400,
            color: '#bae6fd',
            ...enter('slide-up', 800),
          }),
        ],
      };
    case 'special':
      // Dish of the day: warm, dark, a serif title and a price badge.
      return {
        ...canvas,
        background: '#1c1210',
        backgroundGradient: {
          type: 'radial',
          angle: 0,
          stops: [
            { color: '#3b2418', at: 0 },
            { color: '#120b08', at: 100 },
          ],
        },
        elements: [
          shape({
            shape: 'ellipse',
            x: 1060,
            y: 140,
            w: 800,
            h: 800,
            fill: '#00000000',
            stroke: '#d4a373',
            strokeWidth: 6,
            ...enter('zoom', 0),
          }),
          text({
            text: t('designer.samples.specialBadge'),
            x: 120,
            y: 200,
            w: 820,
            h: 80,
            fontSize: 44,
            fontWeight: 600,
            color: '#d4a373',
            align: 'start',
            letterSpacing: 0.2,
            uppercase: true,
            ...enter('fade', 0),
          }),
          text({
            text: t('designer.samples.specialTitle'),
            x: 120,
            y: 300,
            w: 900,
            h: 300,
            fontSize: 120,
            align: 'start',
            font: 'frank-ruhl',
            color: '#fdf6ec',
            lineHeight: 1.05,
            ...enter('slide-up', 200),
          }),
          text({
            text: t('designer.samples.specialText'),
            x: 120,
            y: 630,
            w: 860,
            h: 160,
            fontSize: 44,
            fontWeight: 400,
            align: 'start',
            color: '#e7d7c1',
            ...enter('fade', 600),
          }),
          text({
            text: t('designer.samples.specialPrice'),
            x: 1300,
            y: 760,
            w: 320,
            h: 140,
            fontSize: 84,
            color: '#1c1210',
            background: '#d4a373',
            radius: 70,
            shadow: { x: 0, y: 14, blur: 40, color: '#000000aa' },
            animation: { enter: 'pop', delay: 900, duration: 800, loop: 'pulse' },
          }),
        ],
      };
    case 'premiere':
      // Cinema premiere: a spotlight on black, a gold title and the date.
      return {
        ...canvas,
        background: '#05050a',
        backgroundGradient: {
          type: 'radial',
          angle: 0,
          stops: [
            { color: '#1f2a44', at: 0 },
            { color: '#05050a', at: 75 },
          ],
        },
        elements: [
          shape({
            x: 0,
            y: 0,
            w: 1920,
            h: 70,
            fill: '#111111',
            gradient: {
              type: 'linear',
              angle: 90,
              stops: [
                { color: '#b8860b', at: 0 },
                { color: '#fde68a', at: 50 },
                { color: '#b8860b', at: 100 },
              ],
            },
            opacity: 0.9,
          }),
          shape({
            x: 0,
            y: 1010,
            w: 1920,
            h: 70,
            fill: '#111111',
            gradient: {
              type: 'linear',
              angle: 90,
              stops: [
                { color: '#b8860b', at: 0 },
                { color: '#fde68a', at: 50 },
                { color: '#b8860b', at: 100 },
              ],
            },
            opacity: 0.9,
          }),
          text({
            text: t('designer.samples.premiereBadge'),
            x: 160,
            y: 250,
            w: 1600,
            h: 90,
            fontSize: 56,
            fontWeight: 600,
            color: '#fde68a',
            letterSpacing: 0.3,
            uppercase: true,
            ...enter('fade', 0),
          }),
          text({
            text: t('designer.samples.premiereTitle'),
            x: 60,
            y: 360,
            w: 1800,
            h: 300,
            fontSize: 230,
            font: 'bebas-neue',
            fontWeight: 400,
            color: '#fff7d6',
            letterSpacing: 0.05,
            shadow: { x: 0, y: 0, blur: 50, color: '#f59e0b99' },
            ...enter('zoom', 300),
          }),
          text({
            text: t('designer.samples.premiereText'),
            x: 260,
            y: 700,
            w: 1400,
            h: 120,
            fontSize: 60,
            fontWeight: 400,
            color: '#e5e7eb',
            ...enter('slide-up', 900),
          }),
        ],
      };
  }
}
