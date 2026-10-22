// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import {
  DESIGN_FONT_FAMILIES,
  designAnimationCss,
  designCanvasStyle,
  designConfigSchema,
  designElementStyle,
  designGradientCss,
} from '../src/design.js';

const text = { id: 't', kind: 'text', text: 'Hi', x: 0, y: 0, w: 100, h: 50 };

describe('design effects', () => {
  it('keeps designs saved before effects existed valid and unchanged in look', () => {
    const config = designConfigSchema.parse({
      background: '#111827',
      elements: [
        { ...text, fontSize: 40 },
        { id: 's', kind: 'shape', x: 0, y: 0, w: 10, h: 10 },
      ],
    });
    expect(config.animate).toBe(true);
    const [t] = config.elements;
    expect(t?.kind === 'text' && t.font).toBe('heebo');
    const style = designElementStyle(t!);
    expect(style.backgroundImage).toBe('none');
    expect(style.letterSpacing).toBe('normal');
    expect(style.textShadow).toBeUndefined();
    expect(style.display).toBeUndefined(); // text stays at the top of its box
    expect(designAnimationCss(t!, true)).toBeNull();
    expect(designCanvasStyle(config).backgroundImage).toBe('none');
  });

  it('accepts colors with transparency and refuses anything that is not hex', () => {
    expect(designConfigSchema.safeParse({ background: '#00000080' }).success).toBe(true);
    for (const bad of ['#000', 'red', '#0000008', 'url(x)', '#00000080;color:red']) {
      expect(designConfigSchema.safeParse({ background: bad }).success, bad).toBe(false);
    }
  });

  it('builds gradients from 2 to 4 sorted stops', () => {
    expect(
      designGradientCss({
        type: 'linear',
        angle: 90,
        stops: [
          { color: '#ffffff', at: 100 },
          { color: '#000000', at: 0 },
        ],
      }),
    ).toBe('linear-gradient(90deg, #000000 0%, #ffffff 100%)');
    expect(
      designGradientCss({
        type: 'radial',
        angle: 0,
        stops: [
          { color: '#ff0000', at: 0 },
          { color: '#0000ff80', at: 70 },
        ],
      }),
    ).toBe('radial-gradient(circle at center, #ff0000 0%, #0000ff80 70%)');
    const gradient = (stops: number) =>
      designConfigSchema.safeParse({
        backgroundGradient: {
          stops: Array.from({ length: stops }, (_, at) => ({ color: '#000000', at })),
        },
      }).success;
    expect([gradient(1), gradient(2), gradient(4), gradient(5)]).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it('styles text with a font, spacing, outline and a shadow (letters or box)', () => {
    const [bare, boxed] = designConfigSchema.parse({
      elements: [
        {
          ...text,
          font: 'bebas-neue',
          letterSpacing: 0.1,
          uppercase: true,
          outline: { color: '#000000', width: 2 },
          shadow: { x: 1, y: 2, blur: 3, color: '#00000080' },
        },
        { ...text, id: 'b', background: '#000000b3', radius: 20, shadow: {} },
      ],
    }).elements;
    const a = designElementStyle(bare!);
    expect(a.fontFamily).toBe(DESIGN_FONT_FAMILIES['bebas-neue']);
    expect(a.fontFamily).toContain('Heebo'); // Hebrew still renders
    expect(a.letterSpacing).toBe('0.1em');
    expect(a.textTransform).toBe('uppercase');
    expect(a.WebkitTextStroke).toBe('2px #000000');
    expect(a.textShadow).toBe('1px 2px 3px #00000080');
    const b = designElementStyle(boxed!);
    expect(b.boxShadow).toBe('0px 8px 24px #00000080');
    expect(b.textShadow).toBeUndefined();
    expect(b.borderRadius).toBe('20px');
    expect(designConfigSchema.safeParse({ elements: [{ ...text, font: 'comic' }] }).success).toBe(
      false,
    );
  });

  it('animates through a wrapper: enter, then loop; off when the design turns them off', () => {
    const [element] = designConfigSchema.parse({
      elements: [
        { ...text, animation: { enter: 'pop', delay: 200, duration: 800, loop: 'pulse' } },
      ],
    }).elements;
    expect(designAnimationCss(element!, true)).toBe(
      'rd-enter-pop 800ms cubic-bezier(0.2, 0.7, 0.2, 1) 200ms both, rd-loop-pulse 1800ms ease-in-out 1000ms infinite',
    );
    expect(designAnimationCss(element!, false)).toBeNull();
    const [loopOnly] = designConfigSchema.parse({
      elements: [{ ...text, animation: { loop: 'float', delay: 500 } }],
    }).elements;
    expect(designAnimationCss(loopOnly!, true)).toBe(
      'rd-loop-float 4000ms ease-in-out 500ms infinite',
    );
    for (const animation of [{ delay: 20_000 }, { duration: 50 }, { enter: 'spin' }]) {
      expect(
        designConfigSchema.safeParse({ elements: [{ ...text, animation }] }).success,
        JSON.stringify(animation),
      ).toBe(false);
    }
  });

  it('has a keyframe for every animation name it can produce', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../design.css', import.meta.url), 'utf8');
    const { DESIGN_ENTER_ANIMATIONS, DESIGN_LOOP_ANIMATIONS } = await import('../src/design.js');
    for (const name of DESIGN_ENTER_ANIMATIONS.filter((n) => n !== 'none')) {
      expect(css, name).toContain(`@keyframes rd-enter-${name} `);
    }
    for (const name of DESIGN_LOOP_ANIMATIONS.filter((n) => n !== 'none')) {
      expect(css, name).toContain(`@keyframes rd-loop-${name} `);
    }
  });

  it('places text in the middle or at the bottom of its box', () => {
    const parse = (valign: string) =>
      designConfigSchema.parse({ elements: [{ ...text, valign }] }).elements[0]!;
    expect(designElementStyle(parse('middle'))).toMatchObject({
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    });
    expect(designElementStyle(parse('bottom')).justifyContent).toBe('flex-end');
    expect(
      designConfigSchema.safeParse({ elements: [{ ...text, valign: 'baseline' }] }).success,
    ).toBe(false);
  });
});
