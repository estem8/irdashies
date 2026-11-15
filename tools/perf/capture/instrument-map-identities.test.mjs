import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instrumentMapIdentities } from './instrument-map-identities.mjs';

const source = `const EMPTY_POSITIONS: readonly number[] = [];
const driverIdentities = useMemo(() => {
  if (!drivers) return [];
  return drivers.filter(d=>d.CarIdx!==paceCarIdx).map((driver) => ({driver}));
}, [drivers]);
const driversTrackData = useMemo(() => {
  return driverIdentities.map(identity=>({...identity,progress:0}));
}, [driverIdentities]);`;

test('instruments actual identity construction separately from progress work', () => {
  const output = instrumentMapIdentities(source);
  assert.ok(output.includes('identityDiagnostic.computations++;'));
  assert.ok(
    output.includes('(identityDiagnostic.identityObjects++, {driver})')
  );
  assert.ok(output.includes('identityDiagnostic.progressComputations++;'));
  assert.ok(
    output.includes(
      'driverIdentities.map(identity=>({...identity,progress:0}))'
    )
  );
});
test('reject changed or duplicated source anchors', () => {
  assert.throws(
    () =>
      instrumentMapIdentities(
        source.replace('const EMPTY_POSITIONS:', 'const CHANGED:')
      ),
    /Unexpected Map hook source/
  );
  assert.throws(
    () => instrumentMapIdentities(source + '\nconst EMPTY_POSITIONS:'),
    /Unexpected Map hook source/
  );
});
test('reject double instrumentation', () => {
  assert.throws(
    () => instrumentMapIdentities(instrumentMapIdentities(source)),
    /Unexpected Map hook source/
  );
});
