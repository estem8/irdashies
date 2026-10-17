import { createElement, memo, useEffect, useState } from 'react';
import type { CSSProperties, ElementType } from 'react';
import logger from '@irdashies/utils/logger';

type PhosphorModule = Record<string, unknown>;

// The Phosphor package exports every icon, so it is loaded once on first use
// rather than with the overlay bundle.
let phosphorModule: PhosphorModule | null = null;
let phosphorPromise: Promise<PhosphorModule> | null = null;

function loadPhosphor(): Promise<PhosphorModule> {
  if (!phosphorPromise) {
    phosphorPromise = import('@phosphor-icons/react').then(
      (m) => {
        phosphorModule = m as unknown as PhosphorModule;
        return phosphorModule;
      },
      (err: unknown) => {
        // Reset so a later mount can retry the import.
        phosphorPromise = null;
        logger.error('Failed to load Phosphor icons', err);
        throw err;
      }
    );
  }
  return phosphorPromise;
}

/**
 * Looks up a Phosphor component by display name ("Car") or export name
 * ("CarIcon"), matching the semantics of the former PHOSPHOR_ICON_MAP.
 */
export function resolvePhosphorIcon(
  mod: PhosphorModule,
  name: string
): ElementType | undefined {
  const trimmed = name.trim();
  const candidates = [`${trimmed}Icon`, `${trimmed.replace(/Icon$/, '')}Icon`];
  for (const key of candidates) {
    const value = mod[key];
    if (
      key.length > 4 &&
      (typeof value === 'function' ||
        (typeof value === 'object' && value !== null))
    ) {
      return value as ElementType;
    }
  }
  return undefined;
}

interface PhosphorIconByNameProps {
  name: string;
  size: number;
  className?: string;
  style?: CSSProperties;
  color?: string;
  weight?: string;
  fallbackStyle?: CSSProperties;
  fallbackText: string;
}

export const PhosphorIconByName = memo(function PhosphorIconByName({
  name,
  size,
  className,
  style,
  color,
  weight,
  fallbackStyle,
  fallbackText,
}: PhosphorIconByNameProps) {
  const [mod, setMod] = useState(phosphorModule);

  useEffect(() => {
    if (mod) return;
    let cancelled = false;
    loadPhosphor()
      .then((m) => {
        if (!cancelled) setMod(m);
      })
      // Already logged in loadPhosphor; leave the placeholder in place.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mod]);

  if (!mod) {
    return (
      <span
        aria-hidden
        className={className}
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          ...(style ?? {}),
        }}
      />
    );
  }

  const IconComp = resolvePhosphorIcon(mod, name);
  if (IconComp != null) {
    return createElement(IconComp, {
      size,
      className,
      style: { width: size, height: size, ...(style ?? {}) },
      color,
      weight,
    });
  }
  return (
    <span className={className} style={{ color, ...(fallbackStyle ?? {}) }}>
      {fallbackText}
    </span>
  );
});
