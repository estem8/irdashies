/**
 * Deep merges a saved widget config with the default config.
 * - Saved values take precedence over defaults.
 * - Missing fields are filled from the default.
 * - Nested objects are merged recursively.
 * - Arrays named "displayOrder" are merged to preserve existing order while
 *   inserting any new default items at their relative position.
 */
export function deepMergeConfig(
  defaultCfg: Record<string, unknown>,
  savedCfg: unknown
): Record<string, unknown> {
  if (!savedCfg || typeof savedCfg !== 'object' || Array.isArray(savedCfg)) {
    return { ...defaultCfg };
  }

  const saved = savedCfg as Record<string, unknown>;
  const result: Record<string, unknown> = { ...defaultCfg };

  for (const key of Object.keys(saved)) {
    const savedVal = saved[key];
    const defaultVal = result[key];

    if (savedVal === undefined) continue;

    if (
      key === 'displayOrder' &&
      Array.isArray(savedVal) &&
      Array.isArray(defaultVal)
    ) {
      result[key] = mergeDisplayOrder(
        defaultVal as string[],
        savedVal as string[]
      );
    } else if (
      savedVal !== null &&
      typeof savedVal === 'object' &&
      !Array.isArray(savedVal) &&
      defaultVal !== null &&
      typeof defaultVal === 'object' &&
      !Array.isArray(defaultVal)
    ) {
      result[key] = deepMergeConfig(
        defaultVal as Record<string, unknown>,
        savedVal
      );
    } else {
      result[key] = savedVal;
    }
  }

  return result;
}

function mergeDisplayOrder(
  defaultOrder: string[],
  savedOrder: string[]
): string[] {
  const merged = [...savedOrder];
  const missing = defaultOrder.filter((id) => !merged.includes(id));

  for (const missingId of missing) {
    const defaultIdx = defaultOrder.indexOf(missingId);
    let insertAt = merged.length;

    for (let i = defaultIdx + 1; i < defaultOrder.length; i++) {
      const afterIdx = merged.indexOf(defaultOrder[i]);
      if (afterIdx !== -1) {
        insertAt = afterIdx;
        break;
      }
    }

    merged.splice(insertAt, 0, missingId);
  }

  return merged;
}
