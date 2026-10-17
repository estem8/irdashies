import type { INativeSDK, TelemetryLayoutEntry } from '../../native';
import type {
  TelemetryVarList,
  TelemetryVariable,
  BroadcastMessages,
  CameraState,
  ReplayPositionCommand,
  ReplaySearchCommand,
  ReplayStateCommand,
  ReloadTexturesCommand,
  ChatCommand,
  PitCommand,
  TelemetryCommand,
  FFBCommand,
  VideoCaptureCommand,
} from '../../types';

import { loadMockSessionData, loadMockTelemetry } from './mock-data/loader';
import logger from '../../../logger';

let mockTelemetry: TelemetryVarList | null = null;
let MOCK_SESSION: string | null = null;

/** Bytes per value for the native variable types 1 to 5 (bool, int, bitfield, float, double). */
const VAR_TYPE_BYTES: Record<number, number> = { 1: 1, 2: 4, 3: 4, 4: 4, 5: 8 };

interface MockRow {
  buffer: ArrayBuffer;
  layout: TelemetryLayoutEntry[];
}

/**
 * Lays the mock variables out as one raw row, the way the native module copies
 * it, so the row-buffer read path runs against the mock as it does against the
 * SDK. Each variable is aligned to its value size.
 */
function buildMockRow(telemetry: TelemetryVarList): MockRow {
  const layout: TelemetryLayoutEntry[] = [];
  let end = 0;
  for (const [name, variable] of Object.entries(telemetry)) {
    const bytes = VAR_TYPE_BYTES[variable.varType];
    if (!bytes || !Array.isArray(variable.value)) continue;
    const offset = Math.ceil(end / bytes) * bytes;
    layout.push({
      name,
      varType: variable.varType,
      count: variable.value.length,
      offset,
    });
    end = offset + variable.value.length * bytes;
  }

  const buffer = new ArrayBuffer(end);
  const view = new DataView(buffer);
  for (const { name, varType, count, offset } of layout) {
    const values = telemetry[name as keyof TelemetryVarList].value as ArrayLike<
      number | boolean
    >;
    for (let i = 0; i < count; i++) {
      const value = Number(values[i]);
      if (varType === 1) view.setUint8(offset + i, value);
      else if (varType === 4) view.setFloat32(offset + i * 4, value, true);
      else if (varType === 5) view.setFloat64(offset + i * 8, value, true);
      else view.setInt32(offset + i * 4, value, true);
    }
  }
  return { buffer, layout };
}

export class MockSDK implements INativeSDK {
  public currDataVersion: number;

  public enableLogging: boolean;

  private _isRunning: boolean;

  private _row: MockRow | null = null;

  private _rowSource: TelemetryVarList | null = null;

  constructor() {
    this.currDataVersion = 1;
    this.enableLogging = false;
    this._isRunning = false;
    void this._loadMockData();
    logger.warn(
      'Attempting to access iRacing SDK on unsupported platform!',
      '\nReturning mock SDK for testing purposes. (Only win32 supported)'
    );
  }

  private async _loadMockData(): Promise<void> {
    const [session, telemetry] = await Promise.all([
      !MOCK_SESSION ? loadMockSessionData() : Promise.resolve(MOCK_SESSION),
      !mockTelemetry ? loadMockTelemetry() : Promise.resolve(mockTelemetry),
    ]);
    MOCK_SESSION = session;
    mockTelemetry = telemetry;
  }

  public startSDK(): boolean {
    this._isRunning = true;
    return true;
  }

  public stopSDK(): void {
    this._isRunning = false;
  }

  public isRunning(): boolean {
    return this._isRunning && MOCK_SESSION !== null && mockTelemetry !== null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public waitForData(_timeout?: number): boolean {
    return this._isRunning;
  }

  public getSessionData(): string {
    return MOCK_SESSION ?? '';
  }

  public getTelemetryData(): TelemetryVarList {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return mockTelemetry!;
  }

  /** Row-buffer read, as on the native module: bytes copied, 0 without data, minus the needed size when target is too small. */
  public copyTelemetryBuffer(target: ArrayBuffer): number {
    const row = this._mockRow();
    if (!row) return 0;
    if (target.byteLength < row.buffer.byteLength) {
      return -row.buffer.byteLength;
    }
    new Uint8Array(target).set(new Uint8Array(row.buffer));
    return row.buffer.byteLength;
  }

  public getTelemetryLayout(): TelemetryLayoutEntry[] {
    return this._mockRow()?.layout ?? [];
  }

  /** The mock layout never changes once the data is loaded. */
  public getTelemetryLayoutVersion(): number {
    return this._mockRow() ? 1 : 0;
  }

  private _mockRow(): MockRow | null {
    if (!mockTelemetry) return null;
    if (this._rowSource !== mockTelemetry) {
      this._row = buildMockRow(mockTelemetry);
      this._rowSource = mockTelemetry;
    }
    return this._row;
  }

  public getTelemetryVariable<T extends boolean | number | string>(
    name: number | string
  ): TelemetryVariable<T[]> {
    if (typeof name === 'number') {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return Object.values(mockTelemetry!)[name] as TelemetryVariable<T[]>;
    }
    return mockTelemetry?.[name as keyof TelemetryVarList] as TelemetryVariable<
      T[]
    >;
  }

  public broadcast(
    message:
      BroadcastMessages.CameraSwitchPos | BroadcastMessages.CameraSwitchNum,
    driverOrPos: number,
    group: number,
    camera: number
  ): void;

  public broadcast(
    message: BroadcastMessages.CameraSetState,
    state: CameraState
  ): void;

  public broadcast(
    message: BroadcastMessages.ReplaySetPlayPosition,
    pos: ReplayPositionCommand,
    frame: number
  ): void;

  public broadcast(
    message: BroadcastMessages.ReplaySearch,
    mode: ReplaySearchCommand
  ): void;

  public broadcast(
    message: BroadcastMessages.ReplaySetState,
    state: ReplayStateCommand
  ): void;

  public broadcast(
    message: BroadcastMessages.ReloadTextures,
    command: ReloadTexturesCommand,
    carIndex?: number
  ): void;

  public broadcast(
    message: BroadcastMessages.ChatCommand,
    command: ChatCommand,
    macro?: number
  ): void;

  public broadcast(
    message: BroadcastMessages.PitCommand,
    command: PitCommand,
    param?: number
  ): void;

  public broadcast(
    message: BroadcastMessages.TelemCommand,
    command: TelemetryCommand
  ): void;

  public broadcast(
    message: BroadcastMessages.FFBCommand,
    command: FFBCommand,
    value: number
  ): void;

  public broadcast(
    message:
      | BroadcastMessages.ReplaySearchSessionTime
      | BroadcastMessages.ReplaySetPlaySpeed,
    session: number,
    time: number
  ): void;

  public broadcast(
    message: BroadcastMessages.VideoCapture,
    command: VideoCaptureCommand
  ): void;

  public broadcast(...args: number[]): void {
    logger.info('Pretending to trigger SDK call:', ...args);
  }
}
