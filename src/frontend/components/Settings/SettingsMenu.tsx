import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import {
  useActiveSimulator,
  useDashboard,
  useSimWidgetSupport,
} from '@irdashies/context';
import { widgetDisabledMessage } from '@irdashies/types';
import {
  generalItems,
  widgetItems,
  bottomItems,
  WIDGET_CATEGORIES,
  type MenuItem,
} from './menuItems';
import { ToggleSwitch } from './components/ToggleSwitch';

const MenuLink = ({
  item,
  pathname,
  showIcon = false,
  isEnabled,
  onToggle,
  disabledReason,
}: {
  item: MenuItem;
  pathname: string;
  showIcon?: boolean;
  isEnabled?: boolean;
  /** Present when the row controls a widget that exists in the dashboard. */
  onToggle?: (enabled: boolean) => void;
  /** Hover text when the running sim cannot support this widget. */
  disabledReason?: string | null;
}) => {
  const isActive = pathname.startsWith(`/settings${item.path}`);
  const isWidget = !!item.widgetType;
  // Still a link: the settings page stays reachable so the user can see why it
  // is unavailable and what it would do.
  return (
    <li
      className={[
        'flex items-center gap-2 pr-2 rounded border-l-2 transition-colors',
        isActive
          ? 'border-accent-500 bg-accent-500/10 text-white'
          : disabledReason
            ? 'border-transparent text-slate-600 hover:bg-slate-700/50'
            : 'border-transparent text-slate-400 hover:bg-slate-700/50 hover:text-white',
      ].join(' ')}
    >
      <Link
        to={item.to}
        title={disabledReason ?? undefined}
        className={[
          'flex items-center gap-2 flex-1 min-w-0 px-2 cursor-pointer',
          'py-1',
        ].join(' ')}
      >
        {showIcon && item.icon && (
          <item.icon
            size={14}
            weight={isActive ? 'bold' : 'regular'}
            className="shrink-0"
          />
        )}
        {item.description ? (
          <span className="flex-1 min-w-0 flex flex-col leading-tight">
            <span className="truncate settings-heading font-semibold text-[13px]">
              {item.label}
            </span>
            <span className="truncate text-[11px] text-slate-500">
              {item.description}
            </span>
          </span>
        ) : (
          <span className="flex-1 truncate">{item.label}</span>
        )}
      </Link>
      {isWidget && isEnabled && !disabledReason && (
        <span className="text-[10px] font-semibold tracking-widest text-emerald-400">
          LIVE
        </span>
      )}
      {onToggle && (
        <ToggleSwitch
          small
          enabled={!!isEnabled}
          disabled={!!disabledReason}
          disabledReason={disabledReason ?? undefined}
          ariaLabel={`Enable ${item.label}`}
          onToggle={onToggle}
        />
      )}
    </li>
  );
};

export const SettingsMenu = () => {
  const { pathname } = useLocation();
  const { currentDashboard, onDashboardUpdated } = useDashboard();
  const simulator = useActiveSimulator();
  const supportConfig = useSimWidgetSupport();
  // Compatible-only by default: the full list is mostly noise when half of it
  // cannot run in the sim you are using. Persisted in config.json, so the
  // choice survives a restart.
  const [showAllWidgets, setShowAllWidgets] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.dashboardBridge
      ?.getSettingsShowAllWidgets?.()
      .then((stored) => {
        if (!cancelled) setShowAllWidgets(stored);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleShowAllWidgets = () => {
    setShowAllWidgets((previous) => {
      const next = !previous;
      void window.dashboardBridge?.setSettingsShowAllWidgets?.(next);
      return next;
    });
  };

  // The primary widget (id === type) is the one the switch toggles, so show its
  // state; fall back to an instance only when there is no primary.
  const isWidgetEnabled = (widgetType: string) => {
    const widgets = currentDashboard?.widgets ?? [];
    const widget =
      widgets.find((w) => w.id === widgetType) ??
      widgets.find((w) => (w.type ?? w.id) === widgetType);
    return widget?.enabled ?? false;
  };

  // The settings page toggles the widget whose id is the widget type, so the
  // menu does the same; extra instances keep their own state.
  const hasWidget = (widgetType: string) =>
    !!currentDashboard?.widgets.some((w) => w.id === widgetType);

  const setWidgetEnabled = (widgetType: string, enabled: boolean) => {
    if (!currentDashboard || !onDashboardUpdated) return;
    onDashboardUpdated({
      ...currentDashboard,
      widgets: currentDashboard.widgets.map((w) =>
        w.id === widgetType ? { ...w, enabled } : w
      ),
    });
  };

  const itemsWithSupport = widgetItems.map((item) => ({
    item,
    disabledReason: widgetDisabledMessage(
      supportConfig,
      item.widgetType,
      simulator
    ),
  }));
  const visibleItems = showAllWidgets
    ? itemsWithSupport
    : itemsWithSupport.filter(({ disabledReason }) => !disabledReason);
  const hiddenCount = itemsWithSupport.length - visibleItems.length;
  // "On" means running: enabled and supported by the current simulator. The
  // header and the category counts both count the visible rows this way.
  const isOn = ({ item, disabledReason }: (typeof itemsWithSupport)[number]) =>
    !disabledReason && !!item.widgetType && isWidgetEnabled(item.widgetType);
  const enabledCount = visibleItems.filter(isOn).length;

  return (
    <div className="w-1/4 bg-slate-800 p-3 rounded-md border border-slate-600/60 flex flex-col gap-0 overflow-y-auto">
      <ul className="flex flex-col pb-2 border-b border-slate-700">
        {generalItems.map((item) => (
          <MenuLink key={item.path} item={item} pathname={pathname} showIcon />
        ))}
      </ul>

      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <button
          type="button"
          onClick={toggleShowAllWidgets}
          title={
            showAllWidgets
              ? 'Showing every widget. Click to show only the ones this simulator supports.'
              : 'Showing only the widgets this simulator supports. Click to show every widget.'
          }
          aria-pressed={showAllWidgets}
          className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
        >
          {showAllWidgets ? <EyeIcon size={14} /> : <EyeSlashIcon size={14} />}
        </button>
        <p className="text-xs font-semibold text-slate-400 settings-heading tracking-widest">
          Widgets
        </p>
        {!showAllWidgets && hiddenCount > 0 && (
          <span className="text-xs text-slate-600">({hiddenCount} hidden)</span>
        )}
        <span className="flex-1 mx-2 border-t border-dashed border-accent-500/60" />
        <span className="text-xs text-slate-500">{enabledCount} on</span>
      </div>
      {WIDGET_CATEGORIES.map((category) => {
        const items = visibleItems.filter(
          ({ item }) => (item.category ?? 'extras') === category.id
        );
        if (items.length === 0) return null;
        const onCount = items.filter(isOn).length;
        return (
          <section key={category.id} className="pt-2">
            <h4 className="flex items-center gap-2 px-2 pb-1 text-[11px] font-semibold text-slate-400 settings-heading tracking-widest">
              {category.label}
              <span className="flex-1 border-t border-dashed border-slate-600" />
              <span className="text-slate-500">
                {onCount}/{items.length}
              </span>
            </h4>
            <ul className="flex flex-col">
              {items.map(({ item, disabledReason }) => (
                <MenuLink
                  key={item.path}
                  item={item}
                  pathname={pathname}
                  disabledReason={disabledReason}
                  isEnabled={
                    item.widgetType
                      ? isWidgetEnabled(item.widgetType)
                      : undefined
                  }
                  onToggle={
                    item.widgetType && hasWidget(item.widgetType)
                      ? setWidgetEnabled.bind(null, item.widgetType)
                      : undefined
                  }
                />
              ))}
            </ul>
          </section>
        );
      })}

      <ul className="mt-auto pt-2 border-t border-slate-700 flex flex-col">
        {bottomItems.map((item) => (
          <MenuLink key={item.path} item={item} pathname={pathname} showIcon />
        ))}
      </ul>
    </div>
  );
};
