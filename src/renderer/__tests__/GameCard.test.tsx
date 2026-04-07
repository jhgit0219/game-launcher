// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Game } from '../../shared/ipc-types';
import { GameCard } from '../components/GameCard';

// Stub CSS modules — jsdom does not parse them.
vi.mock('../components/GameCard.module.css', () => ({
  default: new Proxy(
    {},
    { get: (_t, prop) => String(prop) },
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Portal 2',
    platform: 'steam',
    executablePath: null,
    installPath: 'C:/Steam/common/Portal2',
    platformId: '620',
    coverArtPath: null,
    coverArtUrl: null,
    playtimeMinutes: 0,
    lastPlayed: null,
    favorite: false,
    hidden: false,
    genre: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('GameCard', () => {
  const noop = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the game title', () => {
      render(<GameCard game={makeGame()} onClick={noop} onDoubleClick={noop} />);
      expect(screen.getAllByText('Portal 2').length).toBeGreaterThan(0);
    });

    it('renders the platform label in the overlay', () => {
      render(<GameCard game={makeGame()} onClick={noop} onDoubleClick={noop} />);
      // PLATFORM_LABELS['steam'] === 'Steam'
      expect(screen.getAllByText(/Steam/).length).toBeGreaterThan(0);
    });

    it('renders an img element when coverArtPath is set', () => {
      const game = makeGame({ coverArtPath: 'C:/covers/portal2.jpg' });
      render(<GameCard game={game} onClick={noop} onDoubleClick={noop} />);
      const img = screen.getByRole('img', { name: 'Portal 2' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'C:/covers/portal2.jpg');
    });

    it('renders placeholder text when coverArtPath is null', () => {
      render(<GameCard game={makeGame({ coverArtPath: null })} onClick={noop} onDoubleClick={noop} />);
      // The placeholder div contains the title span.
      expect(screen.getAllByText('Portal 2').length).toBeGreaterThan(0);
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('falls back to placeholder when the cover image fails to load', () => {
      const game = makeGame({ coverArtPath: 'C:/covers/broken.jpg' });
      render(<GameCard game={game} onClick={noop} onDoubleClick={noop} />);
      const img = screen.getByRole('img');
      fireEvent.error(img);
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('displays formatted playtime when playtimeMinutes > 0', () => {
      render(
        <GameCard
          game={makeGame({ playtimeMinutes: 125 })}
          onClick={noop}
          onDoubleClick={noop}
        />,
      );
      // 125 minutes → "2h 5m"
      expect(screen.getByText(/2h 5m/)).toBeInTheDocument();
    });

    it('does not display a playtime string when playtimeMinutes is 0', () => {
      render(<GameCard game={makeGame({ playtimeMinutes: 0 })} onClick={noop} onDoubleClick={noop} />);
      expect(screen.queryByText(/\d+h|\d+m/)).toBeNull();
    });

    it('renders the card with an accessible aria-label', () => {
      render(<GameCard game={makeGame()} onClick={noop} onDoubleClick={noop} />);
      expect(screen.getByRole('button', { name: /Portal 2/ })).toBeInTheDocument();
    });

    it('renders favorite button with correct label when not favorited', () => {
      render(<GameCard game={makeGame({ favorite: false })} onClick={noop} onDoubleClick={noop} />);
      expect(
        screen.getByRole('button', { name: 'Add to favorites' }),
      ).toBeInTheDocument();
    });

    it('renders favorite button with correct label when favorited', () => {
      render(<GameCard game={makeGame({ favorite: true })} onClick={noop} onDoubleClick={noop} />);
      expect(
        screen.getByRole('button', { name: 'Remove from favorites' }),
      ).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('calls onClick with the game when the card is clicked', () => {
      const onClick = vi.fn();
      const game = makeGame();
      render(<GameCard game={game} onClick={onClick} onDoubleClick={noop} />);
      fireEvent.click(screen.getByRole('button', { name: /Portal 2/ }));
      expect(onClick).toHaveBeenCalledOnce();
      expect(onClick).toHaveBeenCalledWith(game);
    });

    it('calls onDoubleClick with the game on double click', () => {
      const onDoubleClick = vi.fn();
      const game = makeGame();
      render(<GameCard game={game} onClick={noop} onDoubleClick={onDoubleClick} />);
      fireEvent.dblClick(screen.getByRole('button', { name: /Portal 2/ }));
      expect(onDoubleClick).toHaveBeenCalledOnce();
      expect(onDoubleClick).toHaveBeenCalledWith(game);
    });

    it('calls onClick when Enter is pressed on the card', () => {
      const onClick = vi.fn();
      const game = makeGame();
      render(<GameCard game={game} onClick={onClick} onDoubleClick={noop} />);
      fireEvent.keyDown(screen.getByRole('button', { name: /Portal 2/ }), {
        key: 'Enter',
      });
      expect(onClick).toHaveBeenCalledOnce();
    });

    it('does not call onClick when a non-Enter key is pressed', () => {
      const onClick = vi.fn();
      render(<GameCard game={makeGame()} onClick={onClick} onDoubleClick={noop} />);
      fireEvent.keyDown(screen.getByRole('button', { name: /Portal 2/ }), {
        key: ' ',
      });
      expect(onClick).not.toHaveBeenCalled();
    });

    it('favorite button click does not propagate to card onClick', () => {
      const onClick = vi.fn();
      render(<GameCard game={makeGame()} onClick={onClick} onDoubleClick={noop} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
