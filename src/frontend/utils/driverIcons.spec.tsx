import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderDriverIcon } from './driverIcons';
import { resolvePhosphorIcon } from './PhosphorIconByName';

// The placeholder test must run first: the Phosphor module is cached after
// the first load, and that cache lives for the whole file.
describe('renderDriverIcon phosphor names', () => {
  it('renders an empty placeholder, not the raw name, before the icon set loads', () => {
    const { container } = render(<>{renderDriverIcon('Car', 24)}</>);
    expect(screen.queryByText('Car')).toBeNull();
    expect(container.querySelector('span[aria-hidden]')).not.toBeNull();
  });

  it('renders an svg for a known name', async () => {
    const { container } = render(<>{renderDriverIcon('Car', 24)}</>);
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
  });

  it('accepts the export name with the Icon suffix', async () => {
    const { container } = render(<>{renderDriverIcon('CarIcon', 24)}</>);
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
  });

  it('renders the original text for an unknown name', async () => {
    render(<>{renderDriverIcon('NotARealIconName', 24)}</>);
    expect(await screen.findByText('NotARealIconName')).toBeTruthy();
  });

  it('renders an img for a data: URL', () => {
    const src = 'data:image/png;base64,AAAA';
    const { container } = render(<>{renderDriverIcon(src, 24)}</>);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(src);
  });
});

describe('resolvePhosphorIcon', () => {
  const fakeComp = () => null;
  const mod = { CarIcon: fakeComp, Icon: fakeComp, Foo: 1 };

  it('resolves a display name to its Icon export', () => {
    expect(resolvePhosphorIcon(mod, 'Car')).toBe(fakeComp);
  });

  it('resolves an export name with the Icon suffix', () => {
    expect(resolvePhosphorIcon(mod, 'CarIcon')).toBe(fakeComp);
  });

  it('trims whitespace around the name', () => {
    expect(resolvePhosphorIcon(mod, '  Car  ')).toBe(fakeComp);
  });

  it('ignores exports that are not icon components', () => {
    expect(resolvePhosphorIcon(mod, 'Foo')).toBeUndefined();
  });

  it('ignores the bare Icon export', () => {
    expect(resolvePhosphorIcon(mod, 'Icon')).toBeUndefined();
  });

  it('returns undefined for unknown names', () => {
    expect(resolvePhosphorIcon(mod, 'Missing')).toBeUndefined();
  });
});
