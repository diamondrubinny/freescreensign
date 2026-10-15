# @rubinny/widget-sdk

Build widgets for [Rubinny](https://github.com/diamondrubinny/freescreensign), the free
and open-source digital signage platform. MIT licensed.

## A widget in 30 lines

```ts
import { defineWidget, el, every } from '@rubinny/widget-sdk';

interface CountdownConfig {
  title: string;
  target: string; // ISO date
}

export const countdown = defineWidget<CountdownConfig>({
  type: 'countdown',
  parseConfig(config) {
    const c = config as Partial<CountdownConfig>;
    if (typeof c.title !== 'string' || typeof c.target !== 'string' || Number.isNaN(Date.parse(c.target))) {
      throw new Error('invalid countdown config');
    }
    return { title: c.title.slice(0, 100), target: c.target };
  },
  render(container, config, ctx) {
    const value = el('p', { className: 'value' });
    container.append(el('h2', { text: config.title, dir: 'auto' }), value);
    const update = () => {
      const days = Math.max(0, Math.ceil((Date.parse(config.target) - ctx.now().getTime()) / 86_400_000));
      value.textContent = ctx.locale === 'he' ? `עוד ${days} ימים` : `${days} days to go`;
    };
    update();
    every(60_000, ctx.signal, update);
    return { destroy: () => container.replaceChildren() };
  },
});
```

## Rules (reviewed for every contributed widget)

1. **No HTML injection.** Never use `innerHTML`/`outerHTML`/`insertAdjacentHTML`; build DOM with
   `el()` / `textContent`. Configuration and data are untrusted.
2. **No direct network access.** Data comes from `ctx.fetchData()`, which the Rubinny server
   fetches with SSRF protection and caches (and the player keeps for offline use).
3. **Validate configuration** in `parseConfig` and fail closed.
4. **Clean up** every timer/listener: use `every()` / `ctx.signal`, and implement `destroy()`.
5. **Accessibility & motion:** respect `ctx.reducedMotion`; use `dir="auto"` for user text;
   keep contrast high (≥ 4.5:1) and avoid flashing (no more than 3 flashes per second).
6. **Scale with the zone:** the container is a CSS size container — size text with
   container query units (`cqh`, `cqw`), not pixels.
7. **Privacy:** do not collect or send personal data; no analytics or third-party scripts.

## Contributing a widget

Built-in widgets live in `apps/player/src/widgets/` and their configuration schemas in
`packages/shared/src/widgets.ts`. Open a pull request with the widget, its schema, tests, and
Hebrew + English labels. Installing third-party widgets at runtime (sandboxed) is on the roadmap.
