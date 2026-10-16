import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Button } from '../src/components/Button';
import { Field } from '../src/components/Field';
import { LanguageSwitcher } from '../src/components/LanguageSwitcher';
import { AccessibilityMenu } from '../src/components/AccessibilityMenu';
import { TableRegion } from '../src/components/TableRegion';
import { changeLocale } from '../src/i18n';

describe('Field', () => {
  it('associates label, hint and error with the input', () => {
    render(<Field label="Email" name="email" hint="We never share it" error="Required" required />);
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('We never share it Required');
    expect(input).toBeRequired();
  });

  it('is not marked invalid without an error', () => {
    render(<Field label="Name" name="name" />);
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
  });
});

describe('LanguageSwitcher', () => {
  it('switches language and document direction', async () => {
    render(<LanguageSwitcher />);
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'שפה' }), 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(window.localStorage.getItem('rubinny.locale')).toBe('en');
    await act(() => changeLocale('he'));
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });
});

describe('AccessibilityMenu', () => {
  it('is a keyboard-operable disclosure that applies options', async () => {
    const user = userEvent.setup();
    render(<AccessibilityMenu />);
    const toggle = screen.getByRole('button', { name: 'התאמות נגישות' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('checkbox', { name: 'ניגודיות גבוהה' }));
    expect(document.documentElement.classList.contains('a11y-contrast')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'הגדלת טקסט' }));
    expect(document.documentElement.style.fontSize).toBe('125%');

    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'איפוס התאמות' }));
    expect(document.documentElement.classList.contains('a11y-contrast')).toBe(false);
  });
});

describe('color transitions', () => {
  // Fading between states mixes text and background colors with too little contrast
  // (axe found it on CI): a button that becomes enabled, or the active navigation item.
  it('are not used on buttons or navigation links', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).className).not.toMatch(/transition/);
    const shell = readFileSync(resolve(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');
    expect(shell).not.toMatch(/transition-(colors|all)/);
  });
});

describe('skip link target', () => {
  // The skip link (#main) must move the keyboard focus, not only scroll: every main
  // landmark it targets is focusable by script (tabIndex -1).
  it('is focusable in every layout', () => {
    const files = [
      'src/components/AppShell.tsx',
      'src/components/PublicShell.tsx',
      'src/pages/ErrorPage.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      const main = /<main[^>]*>/s.exec(source)?.[0] ?? '';
      expect(main, file).toContain('id="main"');
      expect(main, file).toContain('tabIndex={-1}');
    }
  });
});

describe('table container', () => {
  // Screen-reader-only text in table cells is absolutely positioned; without a positioned
  // scroll container it escapes it and widens the whole page on narrow screens (RTL).
  it('contains its absolutely positioned content', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
    const rule = /\.table-wrap\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/\brelative\b/);
    expect(rule).toMatch(/\boverflow-x-auto\b/);
  });
});

describe('TableRegion', () => {
  it('is a named region that keyboard users can focus and scroll', async () => {
    render(
      <TableRegion label="Screens">
        <table>
          <tbody>
            <tr>
              <td>x</td>
            </tr>
          </tbody>
        </table>
      </TableRegion>,
    );
    const region = screen.getByRole('region', { name: 'Screens' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('table-wrap');
    await userEvent.tab();
    expect(region).toHaveFocus();
  });
});
