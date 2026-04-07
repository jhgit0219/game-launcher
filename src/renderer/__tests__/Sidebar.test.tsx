// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';
import { LibraryProvider } from '../context/LibraryContext';

// Stub CSS modules.
vi.mock('../components/Sidebar.module.css', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

// Stub the scan progress hook so the Sidebar renders without IPC setup.
vi.mock('../hooks/useScanProgress', () => ({
  useScanProgress: vi.fn(() => ({
    scanning: false,
    progress: null,
    summary: null,
    error: null,
    startScan: vi.fn(),
    cancelScan: vi.fn(),
    clearSummary: vi.fn(),
  })),
}));

// ── Helper ────────────────────────────────────────────────────────────────

function renderSidebar() {
  return render(
    <LibraryProvider>
      <Sidebar />
    </LibraryProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search input', () => {
    it('renders the search input', () => {
      renderSidebar();
      expect(screen.getByRole('textbox', { name: 'Search games' })).toBeInTheDocument();
    });

    it('reflects typed text in the search input', () => {
      renderSidebar();
      const input = screen.getByRole('textbox', { name: 'Search games' });
      fireEvent.change(input, { target: { value: 'Half-Life' } });
      expect((input as HTMLInputElement).value).toBe('Half-Life');
    });

    it('shows a clear button once a search term is entered', () => {
      renderSidebar();
      const input = screen.getByRole('textbox', { name: 'Search games' });
      fireEvent.change(input, { target: { value: 'Query' } });
      expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    });

    it('clears the search field when the clear button is clicked', () => {
      renderSidebar();
      const input = screen.getByRole('textbox', { name: 'Search games' });
      fireEvent.change(input, { target: { value: 'Query' } });
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
      expect((input as HTMLInputElement).value).toBe('');
    });

    it('does not render the clear button when search is empty', () => {
      renderSidebar();
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    });
  });

  describe('navigation', () => {
    it('renders Library, Apps, and Settings nav items', () => {
      renderSidebar();
      expect(screen.getByRole('button', { name: /Library/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Apps/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Settings/ })).toBeInTheDocument();
    });
  });

  describe('filter toggles', () => {
    it('renders the Favorites checkbox', () => {
      renderSidebar();
      expect(screen.getByRole('checkbox', { name: /Favorites/ })).toBeInTheDocument();
    });

    it('renders the Recently Played checkbox', () => {
      renderSidebar();
      expect(screen.getByRole('checkbox', { name: /Recently Played/ })).toBeInTheDocument();
    });

    it('toggles the Favorites checkbox on click', () => {
      renderSidebar();
      const checkbox = screen.getByRole('checkbox', { name: /Favorites/ });
      expect((checkbox as HTMLInputElement).checked).toBe(false);
      fireEvent.click(checkbox);
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    });

    it('toggles the Recently Played checkbox on click', () => {
      renderSidebar();
      const checkbox = screen.getByRole('checkbox', { name: /Recently Played/ });
      fireEvent.click(checkbox);
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    });

    it('renders platform filter checkboxes for all supported platforms', () => {
      renderSidebar();
      const platformLabels = ['Steam', 'Epic Games', 'GOG Galaxy', 'Origin / EA', 'Battle.net', 'Registry', 'Custom'];
      for (const label of platformLabels) {
        expect(
          screen.getByRole('checkbox', { name: label }),
          `expected platform checkbox for "${label}"`,
        ).toBeInTheDocument();
      }
    });

    it('checking a platform checkbox marks it checked', () => {
      renderSidebar();
      const steamCheckbox = screen.getByRole('checkbox', { name: 'Steam' });
      fireEvent.click(steamCheckbox);
      expect((steamCheckbox as HTMLInputElement).checked).toBe(true);
    });

    it('unchecking a platform checkbox marks it unchecked', () => {
      renderSidebar();
      const steamCheckbox = screen.getByRole('checkbox', { name: 'Steam' });
      fireEvent.click(steamCheckbox); // check
      fireEvent.click(steamCheckbox); // uncheck
      expect((steamCheckbox as HTMLInputElement).checked).toBe(false);
    });

    it('shows a "Clear filters" button once at least one filter is active', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('checkbox', { name: /Favorites/ }));
      expect(
        screen.getByRole('button', { name: /Clear filters/ }),
      ).toBeInTheDocument();
    });

    it('does not show "Clear filters" when no filters are active', () => {
      renderSidebar();
      expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
    });

    it('resets all filters when "Clear filters" is clicked', () => {
      renderSidebar();

      const favCheckbox = screen.getByRole('checkbox', { name: /Favorites/ });
      const steamCheckbox = screen.getByRole('checkbox', { name: 'Steam' });

      fireEvent.click(favCheckbox);
      fireEvent.click(steamCheckbox);

      fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));

      expect((favCheckbox as HTMLInputElement).checked).toBe(false);
      expect((steamCheckbox as HTMLInputElement).checked).toBe(false);
      expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
    });

    it('reports the correct active filter count label', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('checkbox', { name: /Favorites/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Steam' }));
      expect(screen.getByRole('button', { name: /Clear filters \(2\)/ })).toBeInTheDocument();
    });

    it('hides platform filters when the Apps view is active', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Apps/ }));
      expect(screen.queryByRole('checkbox', { name: 'Steam' })).toBeNull();
    });
  });

  describe('scan button', () => {
    it('renders a "Scan for Games" button when not scanning', () => {
      renderSidebar();
      expect(screen.getByRole('button', { name: 'Scan for Games' })).toBeInTheDocument();
    });
  });
});
