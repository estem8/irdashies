import { constants, closeSync, openSync, writeSync } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { channelRegistry } from '../../types/channels';
import { PUBLIC_PLUGIN_CHANNELS } from '../../types/plugins';
import type {
  InstalledWidgetPlugin,
  PluginSettingSpec,
  WidgetPluginManifest,
} from '../../types/plugins';
import logger from '../logger';
import {
  inspectPluginArchive,
  isSafePluginRelativePath,
  PLUGIN_ARCHIVE_LIMITS,
  streamPluginArchive,
  type PluginArchive,
} from './zipArchive';

const PLUGIN_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const MAX_PLUGIN_ID_LENGTH = 128;
const MAX_PLUGIN_ARCHIVES = 64;

let installedPlugins: readonly InstalledWidgetPlugin[] = [];
let pluginManifests: ReadonlyMap<string, WidgetPluginManifest> = new Map();

let installedPackageRoot: string | undefined;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => Object.hasOwn(value, key));

const hasOptionalKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[]
) =>
  Object.keys(value).every(
    (key) => required.includes(key) || optional.includes(key)
  ) && required.every((key) => Object.hasOwn(value, key));

const isSafeJsonValue = (
  value: unknown,
  depth = 0,
  budget = { nodes: 0 }
): boolean => {
  budget.nodes += 1;
  if (budget.nodes > 10_000 || depth > 16) return false;
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value === 'string') return value.length <= 16_384;
  if (Array.isArray(value)) {
    return (
      value.length <= 1_024 &&
      value.every((item) => isSafeJsonValue(item, depth + 1, budget))
    );
  }
  if (!isObject(value) || Object.keys(value).length > 256) return false;
  return Object.entries(value).every(
    ([key, item]) =>
      key !== '__proto__' &&
      key !== 'prototype' &&
      key !== 'constructor' &&
      key.length <= 128 &&
      isSafeJsonValue(item, depth + 1, budget)
  );
};

const isValidPluginId = (id: unknown): id is string =>
  typeof id === 'string' &&
  id.length <= MAX_PLUGIN_ID_LENGTH &&
  PLUGIN_ID_PATTERN.test(id);

const isSemver = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 128 &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.test(
    value
  );

const isFiniteInRange = (
  value: unknown,
  minimum: number,
  maximum: number
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= minimum &&
  value <= maximum;

const isValidSetting = (value: unknown): value is PluginSettingSpec => {
  if (
    !isObject(value) ||
    typeof value.key !== 'string' ||
    !/^[a-z][A-Za-z0-9_]{0,63}$/.test(value.key) ||
    typeof value.label !== 'string' ||
    value.label.trim() !== value.label ||
    value.label.length < 1 ||
    value.label.length > 120
  ) {
    return false;
  }
  if (value.type === 'boolean') {
    return hasOnlyKeys(value, ['key', 'type', 'label']);
  }
  if (value.type === 'number') {
    if (
      !hasOptionalKeys(value, ['key', 'type', 'label'], ['min', 'max', 'step'])
    ) {
      return false;
    }
    if (
      (value.min !== undefined &&
        !isFiniteInRange(value.min, -1_000_000, 1_000_000)) ||
      (value.max !== undefined &&
        !isFiniteInRange(value.max, -1_000_000, 1_000_000)) ||
      (value.step !== undefined &&
        !isFiniteInRange(value.step, Number.MIN_VALUE, 1_000_000))
    ) {
      return false;
    }
    return (
      value.min === undefined ||
      value.max === undefined ||
      value.min <= value.max
    );
  }
  if (value.type === 'select') {
    return (
      hasOnlyKeys(value, ['key', 'type', 'label', 'options']) &&
      Array.isArray(value.options) &&
      value.options.length > 0 &&
      value.options.length <= 100 &&
      value.options.every(
        (option) => typeof option === 'string' && option.length <= 120
      ) &&
      new Set(value.options).size === value.options.length
    );
  }
  if (value.type === 'text') {
    return (
      hasOptionalKeys(value, ['key', 'type', 'label'], ['maxLength']) &&
      (value.maxLength === undefined ||
        (typeof value.maxLength === 'number' &&
          Number.isInteger(value.maxLength) &&
          value.maxLength >= 0 &&
          value.maxLength <= 4096))
    );
  }
  return false;
};

const validateManifest = (value: unknown): WidgetPluginManifest => {
  if (
    !isObject(value) ||
    !hasOptionalKeys(
      value,
      [
        'manifestVersion',
        'id',
        'name',
        'version',
        'apiVersion',
        'entry',
        'widget',
        'requires',
      ],
      ['styles']
    ) ||
    value.manifestVersion !== 1 ||
    value.apiVersion !== 1 ||
    !isValidPluginId(value.id) ||
    typeof value.name !== 'string' ||
    value.name.trim() !== value.name ||
    value.name.length < 1 ||
    value.name.length > 120 ||
    !isSemver(value.version) ||
    value.entry !== 'dist/index.js' ||
    (value.styles !== undefined &&
      (!Array.isArray(value.styles) ||
        value.styles.length > 64 ||
        !value.styles.every(
          (style) => isSafePluginRelativePath(style) && /\.css$/i.test(style)
        ) ||
        new Set(value.styles).size !== value.styles.length)) ||
    !isObject(value.widget) ||
    !hasOnlyKeys(value.widget, [
      'name',
      'defaultLayout',
      'defaultConfig',
      'settings',
    ]) ||
    !isObject(value.requires) ||
    !hasOnlyKeys(value.requires, ['channels'])
  ) {
    throw new Error('Manifest fields are missing, malformed, or unsupported');
  }

  const widget = value.widget;
  if (
    typeof widget.name !== 'string' ||
    widget.name.trim() !== widget.name ||
    widget.name.length < 1 ||
    widget.name.length > 120 ||
    !isObject(widget.defaultLayout) ||
    !hasOnlyKeys(widget.defaultLayout, ['width', 'height']) ||
    !isFiniteInRange(widget.defaultLayout.width, 1, 4096) ||
    !isFiniteInRange(widget.defaultLayout.height, 1, 4096) ||
    !isObject(widget.defaultConfig) ||
    !isSafeJsonValue(widget.defaultConfig) ||
    !Array.isArray(widget.settings) ||
    widget.settings.length > 100 ||
    !widget.settings.every(isValidSetting)
  ) {
    throw new Error('Manifest widget declaration is invalid');
  }

  const settingKeys = new Set<string>();
  for (const setting of widget.settings) {
    if (
      settingKeys.has(setting.key) ||
      !Object.hasOwn(widget.defaultConfig, setting.key)
    ) {
      throw new Error('Manifest settings must have unique keys with defaults');
    }
    settingKeys.add(setting.key);
    const defaultValue = widget.defaultConfig[setting.key];
    if (setting.type === 'boolean' && typeof defaultValue !== 'boolean') {
      throw new Error(`Invalid boolean default for setting ${setting.key}`);
    }
    if (
      setting.type === 'number' &&
      (typeof defaultValue !== 'number' ||
        !Number.isFinite(defaultValue) ||
        (setting.min !== undefined && defaultValue < setting.min) ||
        (setting.max !== undefined && defaultValue > setting.max))
    ) {
      throw new Error(`Invalid number default for setting ${setting.key}`);
    }
    if (
      setting.type === 'select' &&
      (typeof defaultValue !== 'string' ||
        !setting.options.includes(defaultValue))
    ) {
      throw new Error(`Invalid select default for setting ${setting.key}`);
    }
    if (
      setting.type === 'text' &&
      (typeof defaultValue !== 'string' ||
        (setting.maxLength !== undefined &&
          defaultValue.length > setting.maxLength))
    ) {
      throw new Error(`Invalid text default for setting ${setting.key}`);
    }
  }

  if (
    !Array.isArray(value.requires.channels) ||
    value.requires.channels.length > 64 ||
    !value.requires.channels.every((channel) => {
      if (
        typeof channel !== 'string' ||
        !PUBLIC_PLUGIN_CHANNELS.includes(
          channel as (typeof PUBLIC_PLUGIN_CHANNELS)[number]
        ) ||
        !Object.hasOwn(channelRegistry, channel)
      ) {
        return false;
      }
      return (
        channelRegistry[channel as keyof typeof channelRegistry].kind ===
        'snapshot'
      );
    }) ||
    new Set(value.requires.channels).size !== value.requires.channels.length
  ) {
    throw new Error(
      'Manifest may request only unique public snapshot channels'
    );
  }

  return value as unknown as WidgetPluginManifest;
};

const readRegularFile = async (filePath: string, maximumBytes: number) => {
  const entryInfo = await lstat(filePath);
  if (
    !entryInfo.isFile() ||
    entryInfo.isSymbolicLink() ||
    entryInfo.size > maximumBytes
  ) {
    throw new Error('Expected a bounded regular file');
  }
  const handle = await open(
    filePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const openedInfo = await handle.stat();
    if (
      !openedInfo.isFile() ||
      openedInfo.size !== entryInfo.size ||
      openedInfo.size > maximumBytes
    ) {
      throw new Error('File changed while being opened');
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
};

const parseManifestBytes = (
  manifestBytes: Uint8Array
): WidgetPluginManifest => {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes);
  } catch {
    throw new Error('Manifest must be valid UTF-8');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('Manifest is not valid JSON');
  }
  return validateManifest(parsed);
};

const parseManifestFromArchive = (
  bytes: Uint8Array,
  archive: PluginArchive
): WidgetPluginManifest => {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let completed = false;
  streamPluginArchive(
    bytes,
    archive,
    {
      onChunk(entry, chunk, final) {
        if (entry.relativePath !== 'plugin.json') return;
        totalBytes += chunk.byteLength;
        if (totalBytes > PLUGIN_ARCHIVE_LIMITS.manifestBytes) {
          throw new Error('Manifest exceeds the size limit');
        }
        if (chunk.byteLength) chunks.push(chunk);
        if (final) completed = true;
      },
    },
    'plugin.json'
  );
  if (!completed) throw new Error('Missing complete plugin manifest');
  return parseManifestBytes(Buffer.concat(chunks, totalBytes));
};

const verifyCachedFile = async (
  packageRoot: string,
  relativePath: string
): Promise<string> => {
  if (!isSafePluginRelativePath(relativePath)) {
    throw new Error('Cached package contains an unsafe path');
  }
  const parts = relativePath.split('/');
  let parent = packageRoot;
  for (const part of parts.slice(0, -1)) {
    parent = path.join(parent, part);
    const directory = await lstat(parent);
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      throw new Error('Cached package contains a non-directory path component');
    }
  }
  const filePath = path.join(parent, parts[parts.length - 1]);
  const file = await lstat(filePath);
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    file.size > PLUGIN_ARCHIVE_LIMITS.fileBytes
  ) {
    throw new Error('Cached package file is not a bounded regular file');
  }
  return filePath;
};

const loadCachedPlugin = async (
  installedRoot: string,
  id: string,
  builtInIds: ReadonlySet<string>
): Promise<InstalledWidgetPlugin> => {
  if (!isValidPluginId(id) || builtInIds.has(id)) {
    throw new Error('Cached plugin ID is invalid or conflicts with a built-in');
  }
  const packageRoot = path.join(installedRoot, id);
  const directory = await lstat(packageRoot);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error('Cached plugin root is not a real directory');
  }
  const manifestBytes = await readRegularFile(
    path.join(packageRoot, 'plugin.json'),
    PLUGIN_ARCHIVE_LIMITS.manifestBytes
  );
  const manifest = parseManifestBytes(manifestBytes);
  if (manifest.id !== id)
    throw new Error('Cached plugin ID does not match its directory');
  const entryPath = await verifyCachedFile(packageRoot, manifest.entry);
  const stylePaths = await Promise.all(
    (manifest.styles ?? []).map((style) => verifyCachedFile(packageRoot, style))
  );
  return {
    manifest,
    entryUrl: pathToFileURL(entryPath).href,
    styleUrls: stylePaths.map((stylePath) => pathToFileURL(stylePath).href),
  };
};

interface Candidate {
  readonly archivePath: string;
  readonly archive: PluginArchive;
  readonly manifest: WidgetPluginManifest;
  readonly sha256: string;
}

const ensureRealDirectory = async (directoryPath: string) => {
  await mkdir(directoryPath, { recursive: true });
  const stat = await lstat(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Plugin directory must be a real directory');
  }
};

const writeAllSync = (fd: number, bytes: Uint8Array) => {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(fd, bytes, offset, bytes.byteLength - offset);
    if (written <= 0) throw new Error('Could not write extracted plugin file');
    offset += written;
  }
};

const extractToDirectory = async (
  bytes: Uint8Array,
  archive: PluginArchive,
  stageDirectory: string
) => {
  const descriptors = new Map<string, number>();
  const sizes = new Map<string, number>();
  try {
    for (const entry of archive.entries) {
      if (entry.directory) continue;
      const outputPath = path.join(
        stageDirectory,
        ...entry.relativePath.split('/')
      );
      await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
      const fd = openSync(
        outputPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600
      );
      descriptors.set(entry.relativePath, fd);
      sizes.set(entry.relativePath, 0);
    }
    streamPluginArchive(bytes, archive, {
      onChunk(entry, chunk) {
        const fd = descriptors.get(entry.relativePath);
        if (fd === undefined) throw new Error('Unexpected extracted file');
        const size = (sizes.get(entry.relativePath) ?? 0) + chunk.byteLength;
        if (
          size > entry.uncompressedSize ||
          size > PLUGIN_ARCHIVE_LIMITS.fileBytes
        ) {
          throw new Error('Extracted plugin file exceeded its size limit');
        }
        if (chunk.byteLength) writeAllSync(fd, chunk);
        sizes.set(entry.relativePath, size);
      },
    });
  } finally {
    for (const fd of descriptors.values()) closeSync(fd);
  }
};

const backupInstalledDirectory = async (
  destination: string,
  stage: string
): Promise<string | undefined> => {
  try {
    const existing = await lstat(destination);
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new Error('Installed plugin destination is not a real directory');
    }
    const backup = `${stage}.previous-${randomUUID()}`;
    await rename(destination, backup);
    return backup;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};

const installCandidate = async (
  installedRoot: string,
  candidate: Candidate
): Promise<InstalledWidgetPlugin> => {
  const archiveBytes = await readRegularFile(
    candidate.archivePath,
    PLUGIN_ARCHIVE_LIMITS.archiveBytes
  );
  if (
    createHash('sha256').update(archiveBytes).digest('hex') !== candidate.sha256
  ) {
    throw new Error('Plugin archive changed during startup');
  }

  await ensureRealDirectory(installedRoot);
  const stage = await mkdtemp(path.join(installedRoot, '.stage-'));
  const destination = path.join(installedRoot, candidate.manifest.id);
  let backup: string | undefined;
  try {
    await extractToDirectory(archiveBytes, candidate.archive, stage);
    backup = await backupInstalledDirectory(destination, stage);
    try {
      await rename(stage, destination);
    } catch (error) {
      if (backup) await rename(backup, destination);
      backup = undefined;
      throw error;
    }
    if (backup) {
      await rm(backup, { recursive: true, force: true }).catch(
        (error: unknown) => {
          logger.warn(
            '[Plugins] Could not remove previous package contents',
            error
          );
        }
      );
    }
  } catch (error) {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    if (backup) await rename(backup, destination).catch(() => undefined);
    throw error;
  }

  const entryPath = path.join(
    destination,
    ...candidate.manifest.entry.split('/')
  );
  const styleUrls = (candidate.manifest.styles ?? []).map(
    (style) => pathToFileURL(path.join(destination, ...style.split('/'))).href
  );
  return {
    manifest: candidate.manifest,
    entryUrl: pathToFileURL(entryPath).href,
    styleUrls,
  };
};

const collectCandidates = async (
  pluginsRoot: string,
  builtInIds: ReadonlySet<string>
): Promise<Candidate[]> => {
  const entries = await readdir(pluginsRoot, { withFileTypes: true });
  const archives = entries
    .filter((entry) => entry.isFile() && /\.zip$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const candidates: Candidate[] = [];
  let totalArchiveBytes = 0;
  for (const item of archives.slice(0, MAX_PLUGIN_ARCHIVES)) {
    const zipPath = path.join(pluginsRoot, item.name);
    try {
      const fileInfo = await lstat(zipPath);
      if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) continue;
      if (
        fileInfo.size > PLUGIN_ARCHIVE_LIMITS.archiveBytes ||
        totalArchiveBytes + fileInfo.size >
          PLUGIN_ARCHIVE_LIMITS.totalArchiveBytes
      ) {
        throw new Error('Plugin archives exceed configured size limits');
      }
      totalArchiveBytes += fileInfo.size;
      const bytes = await readRegularFile(
        zipPath,
        PLUGIN_ARCHIVE_LIMITS.archiveBytes
      );
      const archive = inspectPluginArchive(bytes);
      const manifest = parseManifestFromArchive(bytes, archive);
      const packageFiles = new Set(
        archive.entries
          .filter((entry) => !entry.directory)
          .map((entry) => entry.relativePath)
      );
      if ((manifest.styles ?? []).some((style) => !packageFiles.has(style))) {
        throw new Error('Manifest styles must name regular package files');
      }
      if (builtInIds.has(manifest.id)) {
        throw new Error('Plugin ID conflicts with a built-in widget');
      }
      candidates.push({
        archivePath: zipPath,
        archive,
        manifest,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    } catch (error) {
      logger.warn(`[Plugins] Rejected ${item.name}`, error);
    }
  }
  if (archives.length > MAX_PLUGIN_ARCHIVES) {
    logger.warn(
      `[Plugins] Ignored archives after the ${MAX_PLUGIN_ARCHIVES}-package limit`
    );
  }
  return candidates;
};

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

/** Scan and atomically install valid user-provided ZIP packages. */
export async function scanInstalledWidgetPlugins(
  pluginsRoot: string,
  builtInIds: Iterable<string> = []
): Promise<readonly InstalledWidgetPlugin[]> {
  installedPlugins = [];
  pluginManifests = new Map();
  installedPackageRoot = undefined;
  const installedRoot = path.join(pluginsRoot, '.installed');
  try {
    await ensureRealDirectory(pluginsRoot);
    await ensureRealDirectory(installedRoot);
    installedPackageRoot = installedRoot;
  } catch (error) {
    logger.warn('[Plugins] Could not initialize plugin storage', error);
    return installedPlugins;
  }
  const builtInWidgetIds = new Set(builtInIds);
  const candidates = await collectCandidates(
    pluginsRoot,
    builtInWidgetIds
  ).catch((error: unknown) => {
    logger.warn('[Plugins] Could not scan plugin ZIPs', error);
    return [];
  });
  const candidatesById = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const sameId = candidatesById.get(candidate.manifest.id) ?? [];
    sameId.push(candidate);
    candidatesById.set(candidate.manifest.id, sameId);
  }

  const plugins: InstalledWidgetPlugin[] = [];
  for (const candidate of candidates) {
    if ((candidatesById.get(candidate.manifest.id)?.length ?? 0) !== 1) {
      logger.warn(
        `[Plugins] Rejected duplicate plugin ID ${candidate.manifest.id}`
      );
      continue;
    }
    try {
      const installed = await installCandidate(installedRoot, candidate);
      plugins.push({
        manifest: deepFreeze(installed.manifest),
        entryUrl: installed.entryUrl,
        styleUrls: installed.styleUrls,
      });
    } catch (error) {
      logger.warn(
        `[Plugins] Could not install ${candidate.manifest.id}`,
        error
      );
    }
  }

  const loadedIds = new Set(plugins.map(({ manifest }) => manifest.id));
  const cachedPackages = await readdir(installedRoot, {
    withFileTypes: true,
  }).catch((error: unknown) => {
    logger.warn('[Plugins] Could not read cached plugin directory', error);
    return [];
  });
  for (const cached of cachedPackages) {
    if (
      plugins.length >= MAX_PLUGIN_ARCHIVES ||
      !cached.isDirectory() ||
      !isValidPluginId(cached.name) ||
      builtInWidgetIds.has(cached.name) ||
      loadedIds.has(cached.name)
    ) {
      continue;
    }
    try {
      const installed = await loadCachedPlugin(
        installedRoot,
        cached.name,
        builtInWidgetIds
      );
      plugins.push({
        manifest: deepFreeze(installed.manifest),
        entryUrl: installed.entryUrl,
        styleUrls: installed.styleUrls,
      });
      loadedIds.add(cached.name);
      logger.info(
        `[Plugins] Using cached package ${cached.name}; deleting its source ZIP does not uninstall it`
      );
    } catch (error) {
      logger.warn(
        `[Plugins] Ignored invalid cached package ${cached.name}`,
        error
      );
    }
  }

  plugins.sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id)
  );
  installedPlugins = Object.freeze(plugins.slice());
  pluginManifests = new Map(
    plugins.map(({ manifest }) => [manifest.id, manifest])
  );
  return installedPlugins;
}

/** Read-only runtime manifest lookup for storage default merging. */
export const getInstalledPluginManifest = (
  id: string
): WidgetPluginManifest | undefined => pluginManifests.get(id);

/** Return a copy suitable for Electron structured cloning over IPC. */
export const getInstalledWidgetPlugins = (): InstalledWidgetPlugin[] =>
  installedPlugins.slice();

/** Read one regular file from a validated installed package for local HTTP serving. */
export async function readInstalledWidgetPluginAsset(
  id: string,
  relativePath: string
): Promise<Buffer | undefined> {
  const manifest = pluginManifests.get(id);
  if (
    !installedPackageRoot ||
    !manifest ||
    !isSafePluginRelativePath(relativePath) ||
    (relativePath !== manifest.entry &&
      !manifest.styles?.includes(relativePath) &&
      !relativePath.startsWith('dist/assets/'))
  ) {
    return undefined;
  }
  try {
    const filePath = await verifyCachedFile(
      path.join(installedPackageRoot, id),
      relativePath
    );
    return await readRegularFile(filePath, PLUGIN_ARCHIVE_LIMITS.fileBytes);
  } catch {
    return undefined;
  }
}
