import assert from 'node:assert/strict';

/** Diagnostic counters only; never count these runs as CPU acceptance. */
export function instrumentMapIdentities(source) {
  const replaceOnce = (needle, replacement) => {
    assert.equal(
      source.split(needle).length,
      2,
      'Unexpected Map hook source: ' + needle
    );
    source = source.replace(needle, replacement);
  };
  replaceOnce(
    'const EMPTY_POSITIONS:',
    `declare global {
  interface Window {
    __perfMapIdentity?: {
      computations: number;
      computationsWithDrivers: number;
      identityObjects: number;
      progressComputations: number;
    };
  }
}
const identityDiagnostic = window.__perfMapIdentity ??= {
  computations: 0, computationsWithDrivers: 0,
  identityObjects: 0, progressComputations: 0,
};
const EMPTY_POSITIONS:`
  );
  replaceOnce(
    'const driverIdentities = useMemo(() => {',
    `const driverIdentities = useMemo(() => {
    identityDiagnostic.computations++;
    if (drivers) identityDiagnostic.computationsWithDrivers++;`
  );
  // Count at the actual object construction, including discarded React work.
  // Do not retain references or mutate selected input arrays/snapshots.
  replaceOnce(
    '.map((driver) => ({',
    '.map((driver) => (identityDiagnostic.identityObjects++, {'
  );
  replaceOnce(
    'const driversTrackData = useMemo(() => {',
    `const driversTrackData = useMemo(() => {
    identityDiagnostic.progressComputations++;`
  );
  return source;
}
