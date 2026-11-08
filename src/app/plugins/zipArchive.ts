import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';

export const PLUGIN_ARCHIVE_LIMITS = {
  archiveBytes: 50 * 1024 * 1024,
  totalArchiveBytes: 200 * 1024 * 1024,
  uncompressedBytes: 100 * 1024 * 1024,
  fileBytes: 32 * 1024 * 1024,
  manifestBytes: 256 * 1024,
  files: 256,
  pathBytes: 512,
  pathDepth: 16,
} as const;

export interface PluginArchiveEntry {
  readonly archivePath: string;
  /** Path below the archive's one top-level directory. */
  readonly relativePath: string;
  readonly directory: boolean;
  readonly compression: 0 | 8;
  readonly flags: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localOffset: number;
  readonly dataOffset: number;
  readonly recordEnd: number;
}

export interface PluginArchive {
  readonly rootDirectory: string;
  readonly entries: readonly PluginArchiveEntry[];
  readonly manifest: PluginArchiveEntry;
  readonly entry: PluginArchiveEntry;
}

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
const ZIP_DATA_DESCRIPTOR = 0x08074b50;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;

const fail = (message: string): never => {
  throw new Error(`Invalid plugin ZIP: ${message}`);
};

const assertRange = (buffer: Buffer, offset: number, size: number) => {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    offset + size > buffer.length
  ) {
    fail('truncated or out-of-range ZIP structure');
  }
};

const readExtraFields = (buffer: Buffer, offset: number, size: number) => {
  assertRange(buffer, offset, size);
  const end = offset + size;
  let cursor = offset;
  while (cursor < end) {
    if (cursor + 4 > end) fail('malformed extra field');
    const id = buffer.readUInt16LE(cursor);
    const fieldSize = buffer.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + fieldSize > end) fail('malformed extra field');
    if (id === 0x0001) fail('ZIP64 archives are not supported');
    cursor += fieldSize;
  }
};

const portableArchivePath = (archivePath: string, directory: boolean) => {
  if (
    archivePath.length === 0 ||
    Buffer.byteLength(archivePath, 'utf8') > PLUGIN_ARCHIVE_LIMITS.pathBytes ||
    archivePath.startsWith('/') ||
    archivePath.includes('\\') ||
    [...archivePath].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    )
  ) {
    fail('unsafe archive path');
  }
  const name = directory ? archivePath.slice(0, -1) : archivePath;
  if (name.length === 0) fail('empty archive path');
  const parts = name.split('/');
  if (
    parts.length > PLUGIN_ARCHIVE_LIMITS.pathDepth ||
    parts.some(
      (part) =>
        part.length === 0 ||
        part === '.' ||
        part === '..' ||
        part.endsWith('.') ||
        part.endsWith(' ') ||
        part.normalize('NFC') !== part ||
        part.toLowerCase() === 'node_modules' ||
        /[<>:"|?*]/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
  ) {
    fail('unsafe archive path');
  }
  return parts;
};

const getEntryKind = (
  creator: number,
  externalAttributes: number,
  directory: boolean
) => {
  const host = creator >>> 8;
  if (host !== 0 && host !== 3 && host !== 19) {
    fail('unsupported ZIP creator platform');
  }
  if (host === 3 || host === 19) {
    const fileType = (externalAttributes >>> 16) & 0xf000;
    if (fileType !== 0 && fileType !== (directory ? 0x4000 : 0x8000)) {
      fail('symbolic links and special files are not allowed');
    }
  }
  const dosAttributes = externalAttributes & 0xffff;
  if ((dosAttributes & 0x0400) !== 0 || (dosAttributes & 0x0008) !== 0) {
    fail('reparse points and volume labels are not allowed');
  }
  if (host === 0 && Boolean(dosAttributes & 0x0010) !== directory) {
    fail('inconsistent directory attributes');
  }
};

/** Validate one manifest-relative file path with the archive path rules. */
export const isSafePluginRelativePath = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const parts = portableArchivePath(value, false);
    return parts.join('/') === value;
  } catch {
    return false;
  }
};

const decodeName = (buffer: Buffer, offset: number, size: number) => {
  assertRange(buffer, offset, size);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      buffer.subarray(offset, offset + size)
    );
  } catch {
    return fail('archive paths must be valid UTF-8');
  }
};

const decodeArchive = (bytes: Uint8Array): PluginArchive => {
  if (bytes.byteLength > PLUGIN_ARCHIVE_LIMITS.archiveBytes) {
    fail('compressed archive exceeds the size limit');
  }
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 22) fail('missing end-of-central-directory record');

  const minimumEocd = Math.max(0, buffer.length - 22 - UINT16_MAX);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumEocd; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_EOCD) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) fail('invalid end-of-central-directory record');

  const disk = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const diskEntries = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== entryCount ||
    entryCount === 0 ||
    entryCount === UINT16_MAX ||
    centralSize === UINT32_MAX ||
    centralOffset === UINT32_MAX ||
    entryCount > PLUGIN_ARCHIVE_LIMITS.files ||
    centralOffset + centralSize !== eocdOffset
  ) {
    fail('multi-disk, ZIP64, empty, or oversized archive');
  }

  const centralEntries: Omit<
    PluginArchiveEntry,
    'relativePath' | 'dataOffset' | 'recordEnd'
  >[] = [];
  let cursor = centralOffset;
  let totalUncompressed = 0;
  let totalCompressed = 0;
  let rootDirectory: string | undefined;
  const pathKeys = new Set<string>();

  for (let index = 0; index < entryCount; index += 1) {
    assertRange(buffer, cursor, 46);
    if (buffer.readUInt32LE(cursor) !== ZIP_CENTRAL) {
      fail('invalid central-directory entry');
    }
    const creator = buffer.readUInt16LE(cursor + 4);
    const flags = buffer.readUInt16LE(cursor + 8);
    const compression = buffer.readUInt16LE(cursor + 10);
    const crc32 = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const diskStart = buffer.readUInt16LE(cursor + 34);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const variableLength = nameLength + extraLength + commentLength;
    assertRange(buffer, cursor + 46, variableLength);
    if (
      nameLength === 0 ||
      diskStart !== 0 ||
      compressedSize === UINT32_MAX ||
      uncompressedSize === UINT32_MAX ||
      localOffset === UINT32_MAX
    ) {
      fail('invalid or ZIP64 central-directory entry');
    }
    readExtraFields(buffer, cursor + 46 + nameLength, extraLength);

    if (flags & 0x0001) fail('encrypted entries are not allowed');
    if (flags & ~(0x0006 | 0x0008 | 0x0800)) {
      fail('unsupported ZIP entry flags');
    }
    if ((flags & 0x0006) !== 0 && compression !== 8) {
      fail('invalid compression flags');
    }
    if (compression !== 0 && compression !== 8) {
      fail('only stored and deflate entries are supported');
    }

    if (
      (flags & 0x0800) === 0 &&
      buffer
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .some((byte) => byte > 0x7f)
    ) {
      fail('non-ASCII ZIP paths must declare UTF-8 encoding');
    }
    const archivePath = decodeName(buffer, cursor + 46, nameLength);
    const directory = archivePath.endsWith('/');
    if (
      !directory &&
      /\.(?:node|dll|dylib|so|exe|bat|cmd|ps1)$/i.test(archivePath)
    ) {
      fail(
        'native binaries and executable scripts are not part of plugin packages'
      );
    }
    const parts = portableArchivePath(archivePath, directory);
    if (parts.length === 1 && !directory) {
      fail('every package file must be below one top-level directory');
    }
    const currentRoot = parts[0];
    if (rootDirectory === undefined) rootDirectory = currentRoot;
    if (rootDirectory !== currentRoot) {
      fail('archive must contain exactly one top-level directory');
    }
    getEntryKind(creator, externalAttributes, directory);
    if (
      directory &&
      (compressedSize !== 0 || uncompressedSize !== 0 || crc32 !== 0)
    ) {
      fail('directory entries must be empty');
    }
    if (uncompressedSize > PLUGIN_ARCHIVE_LIMITS.fileBytes) {
      fail('file exceeds the uncompressed size limit');
    }
    if (directory && uncompressedSize !== 0) fail('non-empty directory entry');
    totalUncompressed += uncompressedSize;
    totalCompressed += compressedSize;
    if (
      totalUncompressed > PLUGIN_ARCHIVE_LIMITS.uncompressedBytes ||
      totalCompressed > PLUGIN_ARCHIVE_LIMITS.archiveBytes
    ) {
      fail('package exceeds the archive size limits');
    }

    const normalizedPath = parts.join('/');
    const pathKey = normalizedPath.toLowerCase();
    if (pathKeys.has(pathKey)) fail('duplicate archive path');
    pathKeys.add(pathKey);
    centralEntries.push({
      archivePath,
      directory,
      compression: compression as 0 | 8,
      flags,
      crc32,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    cursor += 46 + variableLength;
  }
  if (cursor !== centralOffset + centralSize) {
    fail('unexpected central-directory data');
  }
  if (!rootDirectory) fail('missing top-level plugin directory');

  const entries: PluginArchiveEntry[] = [];
  const occupiedRanges: { start: number; end: number }[] = [];
  for (const central of centralEntries) {
    const parts = portableArchivePath(central.archivePath, central.directory);
    const relativePath = parts.slice(1).join('/');
    if (relativePath.length === 0 && !central.directory) {
      fail('top-level entry must be a directory');
    }
    const offset = central.localOffset;
    assertRange(buffer, offset, 30);
    if (buffer.readUInt32LE(offset) !== ZIP_LOCAL) {
      fail('invalid local-file header');
    }
    const localFlags = buffer.readUInt16LE(offset + 6);
    const localCompression = buffer.readUInt16LE(offset + 8);
    const localCrc = buffer.readUInt32LE(offset + 14);
    const localCompressedSize = buffer.readUInt32LE(offset + 18);
    const localUncompressedSize = buffer.readUInt32LE(offset + 22);
    const localNameLength = buffer.readUInt16LE(offset + 26);
    const localExtraLength = buffer.readUInt16LE(offset + 28);
    const localVariableLength = localNameLength + localExtraLength;
    assertRange(buffer, offset + 30, localVariableLength);
    readExtraFields(buffer, offset + 30 + localNameLength, localExtraLength);
    if (
      localFlags !== central.flags ||
      localCompression !== central.compression ||
      localNameLength !== Buffer.byteLength(central.archivePath, 'utf8') ||
      !buffer
        .subarray(offset + 30, offset + 30 + localNameLength)
        .equals(Buffer.from(central.archivePath, 'utf8'))
    ) {
      fail('local and central entry headers do not match');
    }
    const hasDataDescriptor = (central.flags & 0x0008) !== 0;
    if (
      !hasDataDescriptor &&
      (localCrc !== central.crc32 ||
        localCompressedSize !== central.compressedSize ||
        localUncompressedSize !== central.uncompressedSize)
    ) {
      fail('local entry sizes do not match the central directory');
    }
    if (
      hasDataDescriptor &&
      !(
        (localCrc === 0 &&
          localCompressedSize === 0 &&
          localUncompressedSize === 0) ||
        (localCrc === central.crc32 &&
          localCompressedSize === central.compressedSize &&
          localUncompressedSize === central.uncompressedSize)
      )
    ) {
      fail('invalid data-descriptor local header');
    }

    const dataOffset = offset + 30 + localVariableLength;
    const dataEnd = dataOffset + central.compressedSize;
    if (dataEnd > centralOffset)
      fail('file data overlaps the central directory');
    let recordEnd = dataEnd;
    if (hasDataDescriptor) {
      assertRange(buffer, dataEnd, 12);
      const hasSignature =
        buffer.readUInt32LE(dataEnd) === ZIP_DATA_DESCRIPTOR &&
        dataEnd + 16 <= centralOffset &&
        buffer.readUInt32LE(dataEnd + 4) === central.crc32 &&
        buffer.readUInt32LE(dataEnd + 8) === central.compressedSize &&
        buffer.readUInt32LE(dataEnd + 12) === central.uncompressedSize;
      if (hasSignature) {
        recordEnd += 16;
      } else if (
        buffer.readUInt32LE(dataEnd) === central.crc32 &&
        buffer.readUInt32LE(dataEnd + 4) === central.compressedSize &&
        buffer.readUInt32LE(dataEnd + 8) === central.uncompressedSize
      ) {
        recordEnd += 12;
      } else {
        fail('invalid data descriptor');
      }
    }
    if (recordEnd > centralOffset) {
      fail('file record overlaps the central directory');
    }
    occupiedRanges.push({ start: offset, end: recordEnd });
    entries.push({ ...central, relativePath, dataOffset, recordEnd });
  }

  occupiedRanges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < occupiedRanges.length; index += 1) {
    if (occupiedRanges[index].start < occupiedRanges[index - 1].end) {
      fail('overlapping local-file entries');
    }
  }

  const byPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const byPathCaseFolded = new Map(
    entries.map((entry) => [entry.relativePath.toLowerCase(), entry])
  );
  for (const entry of entries) {
    if (entry.directory) continue;
    const parts = entry.relativePath.split('/');
    for (let depth = 1; depth < parts.length; depth += 1) {
      const parentPath = parts.slice(0, depth).join('/');
      const parent =
        byPath.get(parentPath) ??
        byPathCaseFolded.get(parentPath.toLowerCase());
      if (parent && !parent.directory)
        fail('file path has a file as its parent');
    }
  }

  const manifest = byPath.get('plugin.json');
  const pluginEntry = byPath.get('dist/index.js');
  if (
    !manifest ||
    manifest.directory ||
    !pluginEntry ||
    pluginEntry.directory ||
    pluginEntry.uncompressedSize === 0
  ) {
    fail(
      'expected a non-empty dist/index.js and plugin.json below the package root'
    );
  }
  const validManifest = manifest;
  const validEntry = pluginEntry;
  if (!validManifest || !validEntry)
    throw new Error('missing plugin package files');
  if (!rootDirectory) throw new Error('missing plugin package root');
  if (validManifest.uncompressedSize > PLUGIN_ARCHIVE_LIMITS.manifestBytes) {
    fail('plugin.json exceeds the manifest size limit');
  }
  return {
    rootDirectory,
    entries,
    manifest: validManifest,
    entry: validEntry,
  };
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const updateCrc32 = (current: number, data: Uint8Array) => {
  let value = current;
  for (const byte of data) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
};

interface StreamSink {
  onChunk(entry: PluginArchiveEntry, bytes: Uint8Array, final: boolean): void;
}

export function streamPluginArchive(
  bytes: Uint8Array,
  archive: PluginArchive,
  sink: StreamSink,
  onlyPath?: string
): void {
  let failure: Error | undefined;
  const emitted = new Set<string>();
  const entries = new Map(
    archive.entries.map((entry) => [entry.archivePath, entry])
  );
  const unzip = new Unzip();
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (failure) return;
    const isDirectory = file.name.endsWith('/');
    const entry = entries.get(file.name);
    if (
      !entry ||
      entry.directory !== isDirectory ||
      entry.compression !== file.compression ||
      (file.size !== undefined && file.size !== entry.compressedSize) ||
      (file.originalSize !== undefined &&
        file.originalSize !== entry.uncompressedSize)
    ) {
      failure = new Error(
        'ZIP stream entry does not match the validated directory'
      );
      return;
    }
    if (entry.directory) return;
    emitted.add(entry.relativePath);
    if (onlyPath !== undefined && entry.relativePath !== onlyPath) return;

    let outputBytes = 0;
    let crc = 0xffffffff;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        failure = error;
        return;
      }
      if (chunk) {
        outputBytes += chunk.byteLength;
        if (
          outputBytes > entry.uncompressedSize ||
          outputBytes > PLUGIN_ARCHIVE_LIMITS.fileBytes
        ) {
          failure = new Error(
            'ZIP entry exceeded its declared uncompressed size'
          );
          return;
        }
        crc = updateCrc32(crc, chunk);
        try {
          sink.onChunk(entry, chunk, false);
        } catch (cause) {
          failure = cause instanceof Error ? cause : new Error(String(cause));
          return;
        }
      }
      if (final) {
        if (
          outputBytes !== entry.uncompressedSize ||
          (crc ^ 0xffffffff) >>> 0 !== entry.crc32
        ) {
          failure = new Error('ZIP entry size or CRC does not match');
          return;
        }
        try {
          sink.onChunk(entry, new Uint8Array(), true);
        } catch (cause) {
          failure = cause instanceof Error ? cause : new Error(String(cause));
        }
      }
    };
    try {
      file.start();
    } catch (cause) {
      failure = cause instanceof Error ? cause : new Error(String(cause));
    }
  };
  try {
    unzip.push(bytes, true);
  } catch (cause) {
    failure ??= cause instanceof Error ? cause : new Error(String(cause));
  }
  if (failure) throw failure;
  const expected = archive.entries
    .filter((entry) => !entry.directory)
    .filter(
      (entry) => onlyPath === undefined || entry.relativePath === onlyPath
    );
  for (const entry of expected) {
    if (!emitted.has(entry.relativePath)) {
      fail(`missing ZIP stream entry: ${entry.archivePath}`);
    }
  }
}

export function inspectPluginArchive(bytes: Uint8Array): PluginArchive {
  return decodeArchive(bytes);
}
