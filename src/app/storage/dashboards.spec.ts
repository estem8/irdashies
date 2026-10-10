import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getOrCreateDefaultDashboard,
  listDashboards,
  getDashboard,
  saveDashboard,
  updateDashboardWidget,
  migrateColorPalette,
  deleteProfile,
} from './dashboards';
import { defaultDashboard } from '@irdashies/types/widgetDefaults';
import { DashboardLayout } from '@irdashies/types';

const mockReadData = vi.hoisted(() => vi.fn());
const mockWriteData = vi.hoisted(() => vi.fn());

vi.mock('./storage', () => ({
  readData: mockReadData,
  writeData: mockWriteData,
}));

describe('dashboards', () => {
  beforeEach(() => {
    mockReadData.mockReset();
    mockWriteData.mockReset();
    // Setup intelligent mock for readData that handles different keys
    mockReadData.mockImplementation((key: string) => {
      if (key === 'currentProfile') {
        return 'default'; // Always return 'default' as current profile for tests
      }
      if (key === 'profiles') {
        return { default: { id: 'default', name: 'Default' } }; // Default profile exists
      }
      // For 'dashboards' key and others, return null by default
      return null;
    });
  });

  describe('createDefaultDashboardIfNotExists', () => {
    it('should create default dashboard if none exists', () => {
      // Mock readData to return null for dashboards, but 'default' for currentProfile
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        return null; // No dashboards exist
      });

      getOrCreateDefaultDashboard();

      expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
        default: defaultDashboard,
      });
    });

    it('should not create default dashboard if one already exists', () => {
      // Mock readData to return existing dashboard for 'dashboards' key
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: defaultDashboard };
        return null;
      });

      getOrCreateDefaultDashboard();

      expect(mockWriteData).not.toHaveBeenCalled();
    });
  });

  describe('listDashboards', () => {
    it('should return an empty object if no dashboards exist', () => {
      // Use default mockImplementation which returns null for 'dashboards' key

      const dashboards = listDashboards();

      expect(dashboards).toEqual({});
    });

    it('should return existing dashboards', () => {
      const dashboardsData = { default: defaultDashboard };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return dashboardsData;
        return null;
      });

      const dashboards = listDashboards();

      expect(dashboards).toEqual(dashboardsData);
    });
  });

  describe('colour palette migration', () => {
    it('keeps the Slate (default) palette as Classic slate', () => {
      mockReadData.mockImplementation((key: string) =>
        key === 'dashboards'
          ? {
              slate: {
                widgets: [],
                generalSettings: { colorPalette: 'default' },
              },
              black: {
                widgets: [],
                generalSettings: { colorPalette: 'black' },
              },
            }
          : null
      );
      expect(getDashboard('slate')?.generalSettings).toEqual({
        appTheme: 'classic',
        classicPalette: 'slate',
      });
      expect(getDashboard('black')?.generalSettings).toEqual({
        appTheme: 'classic',
      });
    });
  });

  describe('listDashboards migration', () => {
    it('returns dashboards without the legacy colour palette', () => {
      mockReadData.mockImplementation((key: string) =>
        key === 'dashboards'
          ? {
              legacy: {
                widgets: [],
                generalSettings: { fontSize: 'lg', colorPalette: 'rose' },
              },
            }
          : null
      );
      expect(listDashboards().legacy.generalSettings).toEqual({
        fontSize: 'lg',
        appTheme: 'classic',
      });
    });
  });

  describe('getDashboard', () => {
    it('should return null if no dashboards exist', () => {
      // Use default mockImplementation which returns null for 'dashboards' key

      const dashboard = getDashboard('default');

      expect(dashboard).toBeNull();
    });

    it('should return the requested dashboard if it exists', () => {
      const dashboardsData = { default: defaultDashboard };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return dashboardsData;
        return null;
      });

      const dashboard = getDashboard('default');

      expect(dashboard).toEqual(defaultDashboard);
    });

    it('moves dashboards saved with a colour palette to the Classic theme', () => {
      const saved = {
        widgets: [],
        generalSettings: { fontSize: 'lg', colorPalette: 'rose' },
      };
      mockReadData.mockImplementation((key: string) =>
        key === 'dashboards' ? { custom: saved } : null
      );

      expect(getDashboard('custom')?.generalSettings).toEqual({
        fontSize: 'lg',
        appTheme: 'classic',
      });
    });

    it('keeps the chosen theme of dashboards saved after the palettes went', () => {
      const saved = {
        widgets: [],
        generalSettings: { fontSize: 'lg', appTheme: 'red' },
      };
      mockReadData.mockImplementation((key: string) =>
        key === 'dashboards' ? { custom: saved } : null
      );

      expect(getDashboard('custom')?.generalSettings).toEqual(
        saved.generalSettings
      );
    });
  });

  describe('saveDashboard', () => {
    it('should save a new dashboard', () => {
      const newDashboard: DashboardLayout = {
        widgets: [],
        generalSettings: { fontSize: 'sm' },
      };
      // Use default mockImplementation which returns null for 'dashboards' key

      saveDashboard('newDashboard', newDashboard);

      expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
        newDashboard,
      });
    });

    it('should update an existing dashboard and preserve other dashboards', () => {
      const customDashboard: DashboardLayout = {
        widgets: [],
        generalSettings: { fontSize: 'xl' },
      };
      const existingDashboards = {
        default: defaultDashboard,
        custom: customDashboard,
      };
      const updatedDashboard: DashboardLayout = {
        widgets: [],
        generalSettings: { fontSize: 'lg', appTheme: 'red' },
      };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return existingDashboards;
        return null;
      });

      saveDashboard('default', updatedDashboard);

      expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
        default: {
          ...defaultDashboard,
          ...updatedDashboard,
          generalSettings: {
            ...defaultDashboard.generalSettings,
            ...updatedDashboard.generalSettings,
          },
        },
        custom: customDashboard,
      });
    });
  });

  describe('saveDashboard legacy colour palette', () => {
    it('writes no colorPalette and moves the dashboard to Classic', () => {
      const legacy = {
        widgets: [],
        generalSettings: { fontSize: 'lg', colorPalette: 'rose' },
      } as unknown as DashboardLayout;
      const other = {
        widgets: [],
        generalSettings: { colorPalette: 'blue' },
      } as unknown as DashboardLayout;
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: legacy, other };
        return null;
      });

      saveDashboard('default', {
        widgets: [],
        generalSettings: { fontSize: 'sm' },
      });

      const written = mockWriteData.mock.calls.find(
        ([key]) => key === 'dashboards'
      )?.[1] as Record<string, DashboardLayout>;
      expect(JSON.stringify(written)).not.toContain('colorPalette');
      expect(written.default.generalSettings).toMatchObject({
        fontSize: 'sm',
        appTheme: 'classic',
      });
      expect(written.other.generalSettings).toMatchObject({
        appTheme: 'classic',
      });
    });
  });

  describe('updateDashboardWidget', () => {
    it('should throw an error if the default dashboard does not exist', () => {
      // Use default mockImplementation which returns null for 'dashboards' key

      const updatedWidget = {
        id: 'input',
        enabled: true,
        layout: { x: 100, y: 100, width: 600, height: 120 },
      };

      expect(() => updateDashboardWidget(updatedWidget)).toThrow(
        'Default dashboard not found'
      );
    });

    it('should update an existing widget in the default dashboard', () => {
      const existingWidget = {
        id: 'input',
        enabled: true,
        layout: { x: 0, y: 0, width: 300, height: 100 },
      };
      const updatedWidget = {
        id: 'input',
        enabled: false,
        layout: { x: 100, y: 100, width: 600, height: 120 },
      };
      const existingDashboard: DashboardLayout = {
        widgets: [existingWidget],
        generalSettings: { fontSize: 'sm' },
      };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: existingDashboard };
        return null;
      });

      updateDashboardWidget(updatedWidget);

      expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
        default: {
          widgets: [updatedWidget],
          generalSettings: { fontSize: 'sm' },
        },
      });
    });

    it('should update an existing widget in a specific dashboard', () => {
      const existingWidget = {
        id: 'input',
        enabled: true,
        layout: { x: 0, y: 0, width: 300, height: 100 },
      };
      const updatedWidget = {
        id: 'input',
        enabled: true,
        layout: { x: 100, y: 100, width: 600, height: 120 },
      };
      const existingDashboard: DashboardLayout = {
        widgets: [existingWidget],
        generalSettings: { fontSize: 'sm' },
      };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { custom: existingDashboard };
        return null;
      });

      updateDashboardWidget(updatedWidget, 'custom');

      expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
        custom: {
          widgets: [updatedWidget],
          generalSettings: { fontSize: 'sm' },
        },
      });
    });

    it('should not update a widget if it does not exist in the dashboard', () => {
      const updatedWidget = {
        id: 'input',
        enabled: true,
        layout: { x: 100, y: 100, width: 600, height: 120 },
      };
      const existingDashboard: DashboardLayout = {
        widgets: [],
        generalSettings: { fontSize: 'sm' },
      };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: existingDashboard };
        return null;
      });

      updateDashboardWidget(updatedWidget);

      expect(mockWriteData).not.toHaveBeenCalledWith();
    });
  });

  describe('getOrCreateDefaultDashboard', () => {
    it('should return the default dashboard if it exists', () => {
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: defaultDashboard };
        return null;
      });

      const dashboard = getOrCreateDefaultDashboard();

      expect(dashboard).toEqual(defaultDashboard);
    });

    it('should create and return the default dashboard if it does not exist', () => {
      // Use default mockImplementation which returns null for 'dashboards' key

      const dashboard = getOrCreateDefaultDashboard();

      expect(dashboard).toEqual(defaultDashboard);
      expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
        default: defaultDashboard,
      });
    });

    it('should add missing widgets to the default dashboard if some widgets are missing', () => {
      const incompleteDashboard = {
        generalSettings: { fontSize: 'sm' },
        widgets: defaultDashboard.widgets.slice(0, 1),
      };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: incompleteDashboard };
        return null;
      });

      const dashboard = getOrCreateDefaultDashboard();

      expect(dashboard.widgets).toEqual(defaultDashboard.widgets);
      expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
        default: defaultDashboard,
      });
    });

    it('should not modify the default dashboard if all widgets are present', () => {
      const completeDashboard = { ...defaultDashboard };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: completeDashboard };
        return null;
      });

      const dashboard = getOrCreateDefaultDashboard();

      expect(dashboard).toEqual(completeDashboard);
      expect(mockWriteData).not.toHaveBeenCalled();
    });
  });

  describe('Gantry threshold migration', () => {
    const gantryDefaults = defaultDashboard.widgets.find(
      (w) => w.id === 'gantry'
    )?.config as Record<string, number | string>;

    const dashboardWithGantryConfig = (config: Record<string, unknown>) => ({
      ...defaultDashboard,
      widgets: defaultDashboard.widgets.map((w) =>
        w.id === 'gantry' ? { ...w, config } : w
      ),
    });

    const loadWith = (config: Record<string, unknown>) => {
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards')
          return { default: dashboardWithGantryConfig(config) };
        return null;
      });
      const dashboard = getOrCreateDefaultDashboard();
      return dashboard.widgets.find((w) => w.id === 'gantry')?.config as Record<
        string,
        number | string
      >;
    };

    it('resets thresholds saved before the current version', () => {
      // A config from the frame-count era. Those values are all valid seconds,
      // so nothing rejects them — only the version marker gives them away.
      const config = loadWith({
        ...gantryDefaults,
        thresholdsVersion: undefined,
        slowDurationSeconds: 10,
        offTrackDurationSeconds: 3,
        pitEntryDurationSeconds: 3,
      });

      expect(config.thresholdsVersion).toBe(3);
      expect(config.slowDurationSeconds).toBe(
        gantryDefaults.slowDurationSeconds
      );
      expect(config.impactDecelKmhPerSec).toBe(
        gantryDefaults.impactDecelKmhPerSec
      );
      expect(config.offTrackDurationSeconds).toBe(
        gantryDefaults.offTrackDurationSeconds
      );
      expect(config.pitEntryDurationSeconds).toBe(
        gantryDefaults.pitEntryDurationSeconds
      );
    });

    it('keeps thresholds saved at the current version', () => {
      const config = loadWith({
        ...gantryDefaults,
        thresholdsVersion: 3,
        offTrackDurationSeconds: 0.8,
        slowSpeedThreshold: 25,
      });

      expect(config.offTrackDurationSeconds).toBe(0.8);
      expect(config.slowSpeedThreshold).toBe(25);
    });

    it('leaves non-threshold settings alone when resetting', () => {
      const config = loadWith({
        ...gantryDefaults,
        thresholdsVersion: undefined,
        offTrackDurationSeconds: 3,
        speedUnit: 'mph',
        sessionRetention: 10,
      });

      expect(config.speedUnit).toBe('mph');
      expect(config.sessionRetention).toBe(10);
      expect(config.offTrackDurationSeconds).toBe(
        gantryDefaults.offTrackDurationSeconds
      );
    });
  });

  describe('generalSettings', () => {
    it('should add general settings from the default dashboard if none exist', () => {
      const dashboard: DashboardLayout = { widgets: [] };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: dashboard };
        return null;
      });

      const updatedDashboard = getOrCreateDefaultDashboard();

      expect(updatedDashboard.generalSettings).toEqual(
        defaultDashboard.generalSettings
      );
    });

    it('should preserve general settings from the existing dashboard', () => {
      const dashboard: DashboardLayout = {
        widgets: [],
        generalSettings: { fontSize: 'sm' },
      };
      mockReadData.mockImplementation((key: string) => {
        if (key === 'currentProfile') return 'default';
        if (key === 'profiles')
          return { default: { id: 'default', name: 'Default' } };
        if (key === 'dashboards') return { default: dashboard };
        return null;
      });

      const updatedDashboard = getOrCreateDefaultDashboard();

      expect(updatedDashboard.generalSettings).toEqual({
        ...defaultDashboard.generalSettings,
        fontSize: 'sm',
      });
    });
  });

  describe('defaultDashboard widgets', () => {
    it('should have showOnlyWhenOnTrack property in Track Map widget', () => {
      const mapWidget = defaultDashboard.widgets.find((w) => w.id === 'map');

      expect(mapWidget).toBeDefined();
      expect(mapWidget?.config?.showOnlyWhenOnTrack).toBe(false);
    });

    it('should have showOnlyWhenOnTrack property in Flat Track Map widget', () => {
      const flatMapWidget = defaultDashboard.widgets.find(
        (w) => w.id === 'flatmap'
      );

      expect(flatMapWidget).toBeDefined();
      expect(flatMapWidget?.config?.showOnlyWhenOnTrack).toBe(false);
    });
  });
});

describe('migrateColorPalette', () => {
  it.each(['default', 'black', 'rose', '', null, undefined])(
    'removes legacy palette %j while preserving unrelated settings',
    (colorPalette) => {
      const saved = Object.freeze({
        colorPalette,
        fontSize: 'lg' as const,
        closeToTray: false,
      });
      const migrated = migrateColorPalette(saved);
      expect(migrated).toEqual({
        appTheme: 'classic',
        // "Slate (default)" keeps its look as Classic slate.
        ...(colorPalette === 'default' && { classicPalette: 'slate' }),
        fontSize: 'lg',
        closeToTray: false,
      });
      expect(saved).toHaveProperty('colorPalette', colorPalette);
      expect(migrateColorPalette(migrated)).toEqual(migrated);
    }
  );

  it.each(['carbon', 'red', 'classic'] as const)(
    'preserves the explicit %s theme when a legacy palette is also present',
    (appTheme) => {
      expect(
        migrateColorPalette({ appTheme, ...{ colorPalette: 'rose' } })
      ).toEqual({ appTheme });
    }
  );

  it('leaves absent and modern settings unchanged', () => {
    expect(migrateColorPalette(undefined)).toBeUndefined();
    const modern = { fontSize: 'sm' as const, appTheme: 'red' as const };
    expect(migrateColorPalette(modern)).toBe(modern);
    expect(migrateColorPalette({})).toEqual({});
  });
});

describe('theme migration at storage boundaries', () => {
  beforeEach(() => {
    mockReadData.mockReset();
    mockWriteData.mockReset();
  });

  it('migrates on read without mutating the stored dashboard or writing it', () => {
    const generalSettings = Object.freeze({
      colorPalette: 'rose',
      fontSize: 'lg' as const,
    });
    const saved = Object.freeze({ widgets: [], generalSettings });
    mockReadData.mockReturnValue({ custom: saved });
    expect(getDashboard('custom')).toEqual({
      widgets: [],
      generalSettings: { appTheme: 'classic', fontSize: 'lg' },
    });
    expect(saved.generalSettings).toBe(generalSettings);
    expect(saved.generalSettings.colorPalette).toBe('rose');
    expect(mockWriteData).not.toHaveBeenCalled();
  });

  it('retains dashboards that have no general settings', () => {
    mockReadData.mockReturnValue({ custom: { widgets: [] } });
    expect(getDashboard('custom')?.widgets).toEqual([]);
    expect(getDashboard('custom')?.generalSettings).toBeUndefined();
    expect(getDashboard('missing')).toBeNull();
  });

  it('uses a newly selected theme when saving a legacy dashboard', () => {
    mockReadData.mockImplementation((key: string) => {
      if (key === 'dashboards')
        return {
          custom: {
            widgets: [],
            generalSettings: { colorPalette: 'rose', fontSize: 'lg' },
          },
        };
      if (key === 'currentProfile') return 'default';
      return null;
    });
    saveDashboard('custom', {
      widgets: [],
      generalSettings: { appTheme: 'red' },
    });
    expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
      custom: {
        widgets: [],
        generalSettings: { appTheme: 'red', fontSize: 'lg' },
      },
    });
  });

  it('migrates remaining dashboards when another profile is deleted', () => {
    const dashboards = {
      default: {
        widgets: [],
        generalSettings: { colorPalette: 'rose', fontSize: 'lg' },
      },
      modern: { widgets: [], generalSettings: { appTheme: 'red' } },
      bare: { widgets: [] },
      removed: { widgets: [] },
    };
    mockReadData.mockImplementation((key: string) => {
      if (key === 'dashboards') return dashboards;
      if (key === 'currentProfile') return 'default';
      if (key === 'profiles')
        return { default: { id: 'default' }, removed: { id: 'removed' } };
      return null;
    });
    deleteProfile('removed');
    expect(mockWriteData).toHaveBeenCalledWith('dashboards', {
      default: {
        widgets: [],
        generalSettings: { appTheme: 'classic', fontSize: 'lg' },
      },
      modern: dashboards.modern,
      bare: dashboards.bare,
    });
    expect(dashboards.default.generalSettings.colorPalette).toBe('rose');
  });
});
