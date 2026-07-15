import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../test/render';
import { Lobby } from './Lobby';

describe('Lobby', () => {
  it('renders the lobby with hero image and LOBBY button', () => {
    render(
      <Lobby
        onJoin={vi.fn()}
        onSpectate={vi.fn()}
        storedMatch={null}
        showBackground={false}
      />
    );

    expect(screen.getByAltText('Flower Game')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /LOBBY/i })).toBeInTheDocument();
  });

  it('shows login and guest buttons for unauthenticated users', () => {
    render(
      <Lobby
        onJoin={vi.fn()}
        onSpectate={vi.fn()}
        storedMatch={null}
        showBackground={false}
      />
    );

    expect(screen.getByRole('button', { name: /Log in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guest/i })).toBeInTheDocument();
  });

  it('opens create room form when LOBBY+ button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <Lobby
        onJoin={vi.fn()}
        onSpectate={vi.fn()}
        storedMatch={null}
        showBackground={false}
      />
    );

    const lobbyBtn = screen.getByRole('button', { name: /LOBBY/i });
    await user.click(lobbyBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Room name/i)).toBeInTheDocument();
    });
  });

  it('creates a room and calls onJoin with match details', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();

    render(
      <Lobby
        onJoin={onJoin}
        onSpectate={vi.fn()}
        storedMatch={null}
        showBackground={false}
      />
    );

    // Enter name
    const nameBtn = screen.getByRole('button', { name: /NAME/i });
    await user.click(nameBtn);

    const nameInput = screen.getByPlaceholderText(/NAME/i);
    await user.type(nameInput, 'TestPlayer');
    await user.keyboard('{Enter}');

    // Click Guest to continue as guest
    const guestBtn = screen.getByRole('button', { name: /^Guest$/i }));
    await user.click(guestBtn);

    // Open create bubble
    const lobbyBtn = screen.getByRole('button', { name: /LOBBY/i });
    await user.click(lobbyBtn);

    // Enter room name
    const roomInput = await screen.findByPlaceholderText(/Room name/i);
    await user.type(roomInput, 'Test Room');

    // Click create
    const createBtn = screen.getByRole('button', { name: /Create/i });
    await user.click(createBtn);

    // Should call onJoin with match details
    await waitFor(() => {
      expect(onJoin).toHaveBeenCalled();
    }, { timeout: 3000 });

    const call = onJoin.mock.calls[0];
    expect(call[0]).toMatch(/^mock-/); // matchID
    expect(call[1]).toBe('0');          // playerID
    expect(call[2]).toBe('TestPlayer'); // playerName
    expect(call[3]).toMatch(/^cred-/);  // credentials
  });
});
