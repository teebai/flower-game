import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GrassFieldCSS } from '../lobby/GrassFieldCSS';

describe('GrassFieldCSS', () => {
  it('renders without crashing', () => {
    const { container } = render(<GrassFieldCSS />);
    expect(container.querySelector('style')).toBeInTheDocument();
  });

  it('has fixed position container covering viewport', () => {
    const { container } = render(<GrassFieldCSS />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.position).toBe('fixed');
  });

  it('renders grass blade div elements', () => {
    const { container } = render(<GrassFieldCSS />);
    // Blades have borderRadius set via inline style
    const allDivs = container.querySelectorAll('div');
    const bladeCount = Array.from(allDivs).filter(d => {
      const s = d.getAttribute('style') || '';
      return s.includes('borderRadius') && s.includes('transformOrigin');
    }).length;
    expect(bladeCount).toBeGreaterThan(0);
  });

  it('has per-blade keyframe animations in style tag', () => {
    const { container } = render(<GrassFieldCSS />);
    const style = container.querySelector('style');
    expect(style?.textContent).toContain('@keyframes grassSway');
  });

  it('does not flicker — blade count is stable across renders', () => {
    const { container: c1 } = render(<GrassFieldCSS />);
    const countBlades = (c: HTMLElement) =>
      Array.from(c.querySelectorAll('div')).filter(d => {
        const s = d.getAttribute('style') || '';
        return s.includes('borderRadius') && s.includes('transformOrigin');
      }).length;

    const firstCount = countBlades(c1);

    const { container: c2 } = render(<GrassFieldCSS />);
    const secondCount = countBlades(c2);

    expect(firstCount).toBe(secondCount);
  });
});
