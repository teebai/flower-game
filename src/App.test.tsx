import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { App } from './App';

// Mock the lazy-loaded MMORPG component
vi.mock('./mmorpg/MmorpgApp', () => ({
  __esModule: true,
  default: () => <div data-testid="mmorpg-world">Mock World</div>,
}));

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
