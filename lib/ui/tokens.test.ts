// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the contrast fixes in app/globals.css (WCAG 2.2 AA):
 * 4.5:1 for text, 3:1 for icons, focus rings and large text.
 */

type Theme = 'light' | 'dark';
type Rgb = [number, number, number];

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

function oklchToLinearRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

function token(name: string, theme: Theme): Rgb {
  const match = css.match(
    new RegExp(`--${name}:\\s*light-dark\\(\\s*oklch\\(([^)]+)\\),\\s*oklch\\(([^)]+)\\)\\s*\\)`),
  );
  if (!match) throw new Error(`Token --${name} is not a light-dark(oklch(), oklch()) pair`);
  const raw = theme === 'light' ? match[1] : match[2];
  if (!raw || raw.includes('/')) throw new Error(`--${name} (${theme}) must be opaque: ${raw}`);
  const [l = 0, c = 0, h = 0] = raw.trim().split(/\s+/).map(Number);
  return oklchToLinearRgb(l, c, h);
}

function contrast(fg: string, bg: string, theme: Theme): number {
  const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const [hi, lo] = [luminance(token(fg, theme)), luminance(token(bg, theme))].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const themes: Theme[] = ['light', 'dark'];

describe.each(themes)('token contrast (%s)', (theme) => {
  it.each([
    ['foreground', 'background'],
    ['muted-foreground', 'background'],
    ['card-foreground', 'card'],
    ['primary-foreground', 'primary'],
    ['secondary-foreground', 'secondary'],
    ['accent-foreground', 'accent'],
    ['sidebar-foreground', 'sidebar'],
    ['sidebar-accent-foreground', 'sidebar-accent'],
    ['muted-foreground', 'sidebar'],
  ])('%s on %s is readable as text (4.5:1)', (fg, bg) => {
    expect(contrast(fg, bg, theme)).toBeGreaterThanOrEqual(4.5);
  });

  it('green text uses --brand-text and passes on page and card backgrounds', () => {
    expect(contrast('brand-text', 'background', theme)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('brand-text', 'card', theme)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('brand-text', 'sidebar-accent', theme)).toBeGreaterThanOrEqual(4.5);
  });

  it('the sidebar-primary pair passes for small text', () => {
    expect(contrast('sidebar-primary-foreground', 'sidebar-primary', theme)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('the focus ring is visible against the surfaces it sits on (3:1)', () => {
    expect(contrast('ring', 'background', theme)).toBeGreaterThanOrEqual(3);
    expect(contrast('ring', 'card', theme)).toBeGreaterThanOrEqual(3);
    expect(contrast('ring', 'sidebar', theme)).toBeGreaterThanOrEqual(3);
  });
});
