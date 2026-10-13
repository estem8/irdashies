import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { IRacingSDK } from './irsdk-node';
import { getSdkOrMock } from './get-sdk';
import type { INativeSDK, TelemetryLayoutEntry } from '../native';
import type { TelemetryVarList } from '../types';

// Mock the getSdkOrMock module
vi.mock('./get-sdk', () => ({
  getSdkOrMock: vi.fn().mockResolvedValue({
    startSDK: vi.fn(),
    getSessionData: vi.fn(),
    currDataVersion: 0,
    enableLogging: false,
    stopSDK: vi.fn(),
    isRunning: vi.fn().mockReturnValue(true),
    waitForData: vi.fn().mockReturnValue(true),
    getTelemetryData: vi.fn().mockReturnValue({}),
    getTelemetryVariable: vi.fn(),
    broadcast: vi.fn(),
  } as INativeSDK),
}));

const sessionFixtureDirectories = [
  '1731390354633',
  '1731390745335',
  '1731391056221',
  '1731392546947',
  '1731637331038',
  '1731639076383',
  '1731639563794',
  '1731641231325',
  '1731649593423',
  '1731663455602',
  '1731663749009',
  '1731667156475',
  '1731732047131',
  '1731750041464',
  '1732260478001',
  '1732274253573',
  '1732355190142',
  '1732359661942',
  '1733030013074',
  '1735296198162',
  '1747384033336',
  '1752616787255',
  '1752616787256',
  '1762367281467',
  '1762563786057',
  '1762565848348',
  '1762847139582',
  '1763227688917',
  '1763228431951',
  '1763241199586',
  '1763752236492',
  '1767346240219',
  '1769296540072',
  '1769296545517',
  '1770713899767',
  '1770713906135',
  '1770713920383',
  '1772216560572',
  '1772788167371',
  '1781323503005',
  '1783998516193',
  'GT3 Sprint Arrays',
] as const;

describe('irsdk-node', () => {
  let sdk: IRacingSDK;
  let mockSdk: INativeSDK;

  beforeEach(async () => {
    sdk = new IRacingSDK();
    // Wait for SDK to be ready
    await sdk.ready();
    // Get the mock SDK instance
    mockSdk = await getSdkOrMock();
  });

  it.each(sessionFixtureDirectories)(
    'should round-trip tracked session data fixture %s',
    async (directory) => {
      const fixturePath = resolve('test-data', directory, 'session.json');
      const fixture = JSON.parse(
        await readFile(fixturePath, 'utf8')
      ) as unknown;

      vi.mocked(mockSdk.getSessionData).mockReturnValue(
        yaml.dump(fixture, { lineWidth: -1 })
      );

      expect(sdk.getSessionData()).toEqual(fixture);
    }
  );

  it('should handle malformed YAML with trailing commas', () => {
    const malformedYaml = `
WeekendInfo:
  TrackName: test track
  TrackID: 123
DriverInfo:
  Drivers:
    - CarIdx: 1
      UserName: test
      AbbrevName: test,  # Trailing comma
      Initials: T
      UserID: 12345
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.WeekendInfo).toBeDefined();
    expect(result?.WeekendInfo?.TrackName).toBe('test track');
    expect(result?.DriverInfo?.Drivers[0]?.UserName).toBe('test');
  });

  it('should handle empty or null values', () => {
    const malformedYaml = `
WeekendInfo:
  TrackName: test track
  TrackID: 123
DriverInfo:
  Drivers:
    - CarIdx: 1
      UserName:     # Empty value
      AbbrevName:   # Empty value
      Initials:     # Empty value
      UserID: 12345
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.DriverInfo?.Drivers[0]?.UserName).toBe(null);
    expect(result?.DriverInfo?.Drivers[0]?.AbbrevName).toBe(null);
    expect(result?.DriverInfo?.Drivers[0]?.Initials).toBe(null);
  });

  it('should handle empty value with trailing comma', () => {
    const malformedYaml = `
WeekendInfo:
  TrackName: navarra speedlong
  TrackID: 515
DriverInfo:
  Drivers:
    - CarIdx: 11
      UserName:     
      AbbrevName:  ,  
      Initials:   
      UserID: 1195427
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.DriverInfo?.Drivers[0]?.UserName).toBe(null);
    expect(result?.DriverInfo?.Drivers[0]?.AbbrevName).toBe(null);
    expect(result?.DriverInfo?.Drivers[0]?.Initials).toBe(null);
    expect(result?.DriverInfo?.Drivers[0]?.UserID).toBe(1195427);
  });

  it('should handle values containing a literal newline (corrupted DriverSetupName)', () => {
    const malformedYaml = `
WeekendInfo:
  TrackName: nurburgring combinedlong
  TrackID: 264
DriverInfo:
  DriverCarIdx: 44
  DriverCarEstLapTime: 494.6636
  DriverSetupName: setupRoot\\folderA
folderB\\carSetupDir\\setup_name.sto
  DriverSetupIsModified: 0
  DriverSetupLoadTypeName: user
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.WeekendInfo?.TrackName).toBe('nurburgring combinedlong');
    expect(result?.DriverInfo?.DriverSetupName).toContain('setupRoot');
    expect(result?.DriverInfo?.DriverSetupName).toContain('setup_name.sto');
    expect(result?.DriverInfo?.DriverSetupIsModified).toBe(0);
    expect(result?.DriverInfo?.DriverSetupLoadTypeName).toBe('user');
  });

  it('should handle quotes in names', () => {
    const malformedYaml = `
WeekendInfo:
  TrackName: navarra speedlong
  TrackID: 515
DriverInfo:
  Drivers:
    - CarIdx: 11
      TeamName: Mike's Team
      UserName: Coolio O'Brien
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.DriverInfo?.Drivers[0]?.TeamName).toBe("Mike's Team");
    expect(result?.DriverInfo?.Drivers[0]?.UserName).toBe("Coolio O'Brien");
  });

  it('should handle names beginning with a YAML mapping indicator', () => {
    const malformedYaml = `
DriverInfo:
  Drivers:
    - CarIdx: 13
      UserName: ? ?
      AbbrevName:
      Initials:
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.DriverInfo?.Drivers[0]?.UserName).toBe('? ?');
    expect(result?.DriverInfo?.Drivers[0]?.AbbrevName).toBe(null);
  });

  it('should handle the anonymous driver name from irdashies.log', () => {
    const malformedYaml = `
DriverInfo:
  Drivers:
    - CarIdx: 18
      UserName: ? ?
      AbbrevName: ?? ?
      Initials: ?
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.DriverInfo?.Drivers[0]?.UserName).toBe('? ?');
    expect(result?.DriverInfo?.Drivers[0]?.AbbrevName).toBe('?? ?');
    expect(result?.DriverInfo?.Drivers[0]?.Initials).toBe('?');
  });

  it('should handle a team name beginning with a YAML sequence indicator', () => {
    const malformedYaml = `
DriverInfo:
  Drivers:
    - CarIdx: 1
      UserName: L M
      TeamID: 469539
      TeamName: - BLACKSUIT - Catteam Agency
      CarNumber: "1"
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.DriverInfo?.Drivers[0]?.TeamName).toBe(
      '- BLACKSUIT - Catteam Agency'
    );
    expect(result?.DriverInfo?.Drivers[0]?.CarNumber).toBe('1');
  });

  it('should not consume the next key after a bare mapping indicator', () => {
    const malformedYaml = `
DriverInfo:
  Drivers:
    - CarIdx: 13
      UserName: ?
      AbbrevName: Anonymous
      Initials: A
`;

    vi.mocked(mockSdk.getSessionData).mockReturnValue(malformedYaml);

    const result = sdk.getSessionData();

    expect(result).toBeDefined();
    expect(result?.DriverInfo?.Drivers[0]?.UserName).toBe('?');
    expect(result?.DriverInfo?.Drivers[0]?.AbbrevName).toBe('Anonymous');
    expect(result?.DriverInfo?.Drivers[0]?.Initials).toBe('A');
  });

  describe('row-buffer telemetry read', () => {
    // Synthetic row with unaligned offsets: bools at 0, int at 3, floats at 7,
    // double at 23, bitfield at 31 and chars at 39 (row is 44 bytes).
    const ROW_LENGTH = 44;
    const ROW_TYPE_BYTES = [1, 1, 4, 4, 4, 8];
    const ROW_LAYOUT: TelemetryLayoutEntry[] = [
      { name: 'BoolArray', varType: 1, count: 3, offset: 0 },
      { name: 'IntValue', varType: 2, count: 1, offset: 3 },
      { name: 'FloatArray', varType: 4, count: 4, offset: 7 },
      { name: 'DoubleValue', varType: 5, count: 1, offset: 23 },
      { name: 'BitField', varType: 3, count: 2, offset: 31 },
      { name: 'CharText', varType: 0, count: 5, offset: 39 },
    ];

    interface RowValues {
      bools: number[];
      int: number;
      floats: number[];
      double: number;
      bits: number[];
      chars: string;
    }

    const ROW_ONE: RowValues = {
      bools: [1, 0, 2],
      int: -12345,
      floats: [0.1, -2.5, 1000000, 0.3],
      double: Math.PI,
      bits: [-1, 0x0f0f],
      chars: 'ABCDE',
    };

    const ROW_TWO: RowValues = {
      bools: [0, 1, 0],
      int: 42,
      floats: [0.7, 0.2, -0.9, 3.25],
      double: -0.5,
      bits: [5, -7],
      chars: 'VWXYZ',
    };

    function writeRow(values: RowValues): ArrayBuffer {
      const row = new ArrayBuffer(ROW_LENGTH);
      const view = new DataView(row);
      values.bools.forEach((value, i) => view.setUint8(i, value));
      view.setInt32(3, values.int, true);
      values.floats.forEach((value, i) =>
        view.setFloat32(7 + i * 4, value, true)
      );
      view.setFloat64(23, values.double, true);
      values.bits.forEach((value, i) => view.setInt32(31 + i * 4, value, true));
      for (let i = 0; i < 5; i++) {
        view.setUint8(39 + i, values.chars.charCodeAt(i));
      }
      return row;
    }

    // Legacy getTelemetryData shape: one ArrayBuffer slice per variable
    function legacyTelemetry(row: ArrayBuffer): TelemetryVarList {
      const telemetry: Record<string, unknown> = {};
      for (const { name, varType, count, offset } of ROW_LAYOUT) {
        telemetry[name] = {
          name,
          description: '',
          unit: '',
          countAsTime: false,
          length: count,
          varType,
          value: row.slice(offset, offset + count * ROW_TYPE_BYTES[varType]),
        };
      }
      return telemetry as unknown as TelemetryVarList;
    }

    function createFakeNative(rowApi: boolean) {
      const state = { row: writeRow(ROW_ONE), layoutVersion: 1, hasData: true };
      const copy = vi.fn((target: ArrayBuffer): number => {
        if (!state.hasData) return 0;
        if (target.byteLength < state.row.byteLength)
          return -state.row.byteLength;
        new Uint8Array(target).set(new Uint8Array(state.row));
        return state.row.byteLength;
      });
      const base = {
        startSDK: vi.fn(),
        stopSDK: vi.fn(),
        isRunning: vi.fn().mockReturnValue(true),
        waitForData: vi.fn().mockReturnValue(true),
        getSessionData: vi.fn(),
        currDataVersion: 0,
        enableLogging: false,
        getTelemetryData: vi.fn(() => legacyTelemetry(state.row)),
        getTelemetryVariable: vi.fn(),
        broadcast: vi.fn(),
      };
      const native = rowApi
        ? {
            ...base,
            copyTelemetryBuffer: copy,
            getTelemetryLayout: vi.fn(() =>
              ROW_LAYOUT.map((entry) => ({ ...entry }))
            ),
            getTelemetryLayoutVersion: vi.fn(() => state.layoutVersion),
          }
        : base;
      return { native: native as INativeSDK, copy, state };
    }

    async function createSdk(native: INativeSDK): Promise<IRacingSDK> {
      vi.mocked(getSdkOrMock).mockResolvedValueOnce(native);
      const instance = new IRacingSDK();
      await instance.ready();
      return instance;
    }

    const valueOf = (telemetry: unknown, name: string): unknown =>
      (telemetry as Record<string, { value: unknown } | undefined>)[name]
        ?.value;

    it('matches the legacy getTelemetryData path for consecutive rows', async () => {
      const fast = createFakeNative(true);
      const legacy = createFakeNative(false);
      const fastSdk = await createSdk(fast.native);
      const legacySdk = await createSdk(legacy.native);

      for (const values of [ROW_ONE, ROW_TWO]) {
        fast.state.row = writeRow(values);
        legacy.state.row = writeRow(values);
        const fastTelemetry = fastSdk.getTelemetry();
        expect(fastTelemetry).toEqual(legacySdk.getTelemetry());
        expect(
          Array.from(
            new Uint8Array(valueOf(fastTelemetry, 'CharText') as ArrayBuffer)
          )
        ).toEqual(Array.from(values.chars, (c) => c.charCodeAt(0)));
      }

      const decoded = fastSdk.getTelemetry();
      expect(valueOf(decoded, 'BoolArray')).toEqual([false, true, false]);
      expect(valueOf(decoded, 'IntValue')).toEqual([42]);
      expect(valueOf(decoded, 'FloatArray')).toEqual(
        [0.7, 0.2, -0.9, 3.25].map((v) => Math.fround(v))
      );
      expect(valueOf(decoded, 'DoubleValue')).toEqual([-0.5]);
      expect(valueOf(decoded, 'BitField')).toEqual([5, -7]);
    });

    it('reuses per-variable arrays while the layout version is unchanged', async () => {
      const fake = createFakeNative(true);
      const sdk = await createSdk(fake.native);

      const first = sdk.getTelemetry();
      const firstFloats = valueOf(first, 'FloatArray');

      fake.state.row = writeRow(ROW_TWO);
      const second = sdk.getTelemetry();
      expect(valueOf(second, 'FloatArray')).toBe(firstFloats);

      fake.state.layoutVersion = 2;
      const third = sdk.getTelemetry();
      expect(valueOf(third, 'FloatArray')).not.toBe(firstFloats);
      expect(valueOf(third, 'FloatArray')).toEqual(
        [0.7, 0.2, -0.9, 3.25].map((v) => Math.fround(v))
      );
    });

    it('grows the row buffer when native reports a larger size', async () => {
      const fake = createFakeNative(true);
      const sdk = await createSdk(fake.native);

      const telemetry = sdk.getTelemetry();

      expect(fake.copy).toHaveBeenCalledTimes(2);
      expect(fake.copy.mock.results[0]?.value).toBe(-ROW_LENGTH);
      expect(fake.copy.mock.results[1]?.value).toBe(ROW_LENGTH);
      expect(valueOf(telemetry, 'IntValue')).toEqual([-12345]);
    });

    it('keeps the grown buffer when the retry finds no row', async () => {
      const fake = createFakeNative(true);
      const sdk = await createSdk(fake.native);
      fake.copy
        .mockImplementationOnce(() => -ROW_LENGTH)
        .mockImplementationOnce(() => 0);

      expect(sdk.getTelemetry()).toEqual({});
      const telemetry = sdk.getTelemetry();

      expect(fake.copy).toHaveBeenCalledTimes(3);
      expect(fake.copy.mock.calls[2]?.[0].byteLength).toBe(ROW_LENGTH);
      expect(valueOf(telemetry, 'IntValue')).toEqual([-12345]);
    });

    it('returns an empty object when native has no row', async () => {
      const fake = createFakeNative(true);
      fake.state.hasData = false;
      const sdk = await createSdk(fake.native);

      expect(sdk.getTelemetry()).toEqual({});
    });
  });
});
