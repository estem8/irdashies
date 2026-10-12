import { isValidElement, cloneElement } from 'react';
import type { CSSProperties, ReactNode, ReactElement } from 'react';
import { colorNumToHex } from '@irdashies/utils/colors';
import { PhosphorIconByName } from './PhosphorIconByName';

type IconFactory = (props: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  color?: string;
  weight?: string;
}) => ReactNode;

/**
 * Renders a driver icon from various source types:
 * - data: URL string → <img>
 * - Phosphor icon name string → Phosphor component
 * - React element → cloned with merged props
 * - Factory function → called with size/color/style/weight
 */
export function renderDriverIcon(
  icon: unknown,
  size = 24,
  className?: string,
  colorNum?: number,
  style?: CSSProperties,
  fallbackStyle?: CSSProperties,
  weight?: string
): ReactNode {
  if (icon === undefined || icon === null) return null;
  const colorHex = colorNumToHex(colorNum);

  if (typeof icon === 'string' && icon.startsWith('data:')) {
    return (
      <img
        src={icon}
        alt="icon"
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          ...(style ?? {}),
        }}
      />
    );
  }

  if (typeof icon === 'string' && icon.trim()) {
    // Resolved lazily so overlays do not load the full Phosphor icon set.
    return (
      <PhosphorIconByName
        name={icon.trim()}
        size={size}
        className={className}
        style={style}
        color={colorHex ?? undefined}
        weight={weight}
        fallbackStyle={fallbackStyle}
        fallbackText={icon}
      />
    );
  }

  if (isValidElement(icon as ReactElement)) {
    const ie = icon as ReactElement & { props?: Record<string, unknown> };
    const mergedStyle = {
      ...((ie.props?.style as CSSProperties) ?? {}),
      ...(style ?? {}),
    };
    return cloneElement(
      ie as ReactElement<Record<string, unknown>>,
      { size, color: colorHex, style: mergedStyle, weight } as Record<
        string,
        unknown
      >
    );
  }

  if (typeof icon === 'function') {
    try {
      const factory = icon as IconFactory;
      const el = factory({
        size,
        className,
        style: { width: size, height: size, ...(style ?? {}) },
        color: colorHex,
        weight,
      });
      if (isValidElement(el)) return el;
      return (
        <span
          className={className}
          style={{ color: colorHex ?? undefined, ...(fallbackStyle ?? {}) }}
        >
          {String(el)}
        </span>
      );
    } catch {
      // fall through to string rendering
    }
  }

  return (
    <span
      className={className}
      style={{ color: colorHex ?? undefined, ...(fallbackStyle ?? {}) }}
    >
      {String(icon)}
    </span>
  );
}

export default renderDriverIcon;
