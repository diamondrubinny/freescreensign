import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Button } from '../src/components/Button';
import { Field } from '../src/components/Field';
import { LanguageSwitcher } from '../src/components/LanguageSwitcher';
import { AccessibilityMenu } from '../src/components/AccessibilityMenu';
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
