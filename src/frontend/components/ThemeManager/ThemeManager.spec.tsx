import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeManager } from './ThemeManager';
import { resolveAppTheme } from '@irdashies/types';
import { useGeneralSettings } from '@irdashies/context';

// Mock the hooks
vi.mock('@irdashies/context', () => ({
  useGeneralSettings: vi.fn(),
}));

describe('ThemeManager', () => {
  const mockChildren = <div>Test Content</div>;
  const originalHash = window.location.hash;

  beforeEach(() => {
    window.location.hash = '';
    vi.mocked(useGeneralSettings).mockReset();
  });

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it('renders children without theme wrapper when hash starts with #/settings', () => {
    window.location.hash = '#/settings/general';
    vi.mocked(useGeneralSettings).mockReturnValue({ fontSize: 'sm' });

    const { container } = render(<ThemeManager>{mockChildren}</ThemeManager>);

    // Should render children directly without the theme wrapper
    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(container.querySelector('.overlay-window')).not.toBeInTheDocument();
  });

  it('renders children with theme wrapper for non-settings paths', () => {
    window.location.hash = '';
    vi.mocked(useGeneralSettings).mockReturnValue({ fontSize: 'lg' });

    const { container } = render(<ThemeManager>{mockChildren}</ThemeManager>);

    // Should render children within the theme wrapper
    const wrapper = container.querySelector('.overlay-window');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass('overlay-theme-lg');
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('handles undefined fontSize gracefully', () => {
    window.location.hash = '';
    vi.mocked(useGeneralSettings).mockReturnValue({});

    const { container } = render(<ThemeManager>{mockChildren}</ThemeManager>);

    // Should render with default classes
    const wrapper = container.querySelector('.overlay-window');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass('overlay-theme-sm');
  });

  it('handles undefined useGeneralSettings return value', () => {
    window.location.hash = '';
    vi.mocked(useGeneralSettings).mockReturnValue(undefined);

    const { container } = render(<ThemeManager>{mockChildren}</ThemeManager>);

    // Should render with default classes
    const wrapper = container.querySelector('.overlay-window');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass('overlay-theme-sm');
  });
});

describe('app themes', () => {
  afterEach(() => {
    vi.mocked(useGeneralSettings).mockReset();
  });

  it.each(['carbon', 'red', 'classic'] as const)(
    'resolves and renders the %s theme',
    (appTheme) => {
      expect(resolveAppTheme(appTheme)).toBe(appTheme);
      vi.mocked(useGeneralSettings).mockReturnValue({
        appTheme,
        fontSize: 'lg',
        fontType: 'inter',
        fontWeight: 'bold',
      });
      const { container } = render(<ThemeManager>Overlay</ThemeManager>);
      expect(container.firstChild).toHaveClass(
        `theme-${appTheme}`,
        'overlay-theme-lg',
        'overlay-theme-font-face-inter',
        'overlay-theme-font-weight-bold'
      );
    }
  );

  it.each([
    undefined,
    null,
    '',
    'Carbon',
    'blue',
    '__proto__',
    'constructor',
    0,
    false,
    [],
    {},
  ])('falls back to Carbon for an invalid saved theme: %j', (value) => {
    expect(resolveAppTheme(value)).toBe('carbon');
  });

  it('renders the Carbon theme when settings have not loaded', () => {
    vi.mocked(useGeneralSettings).mockReturnValue(undefined);
    const { container } = render(<ThemeManager>Overlay</ThemeManager>);
    expect(container.firstChild).toHaveClass('theme-carbon');
  });

  it('replaces the previous theme when settings change', () => {
    vi.mocked(useGeneralSettings).mockReturnValue({ appTheme: 'red' });
    const { container, rerender } = render(
      <ThemeManager>Overlay</ThemeManager>
    );
    expect(container.firstChild).toHaveClass('theme-red');
    vi.mocked(useGeneralSettings).mockReturnValue({ appTheme: 'classic' });
    rerender(<ThemeManager>Overlay</ThemeManager>);
    expect(container.firstChild).toHaveClass('theme-classic');
    expect(container.firstChild).not.toHaveClass('theme-red');
  });
});
