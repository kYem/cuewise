import { inflateRawSync } from 'node:zlib';

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const END_RECORD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const MAX_COMMENT_SIZE = 0xffff;
const ZIP64_COUNT = 0xffff;
const ZIP64_SIZE = 0xffffffff;
const ENCRYPTED = 0x0001;
const STORED = 0;
const DEFLATED = 8;

type Entry = { name: string; method: number; compressedSize: number; localOffset: number };

function findEndRecord(view: DataView): number {
  const last = view.byteLength - END_RECORD_SIZE;
  for (let at = last; at >= Math.max(0, last - MAX_COMMENT_SIZE); at--) {
    if (view.getUint32(at, true) === END_SIGNATURE) {
      return at;
    }
  }
  throw new Error('Not a zip: no end-of-central-directory record');
}

function assertSafeName(name: string): void {
  if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
    throw new Error(`Unsafe zip entry name: ${name}`);
  }
}

function readEntries(view: DataView): Entry[] {
  const end = findEndRecord(view);
  const count = view.getUint16(end + 10, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (count === ZIP64_COUNT || directoryOffset === ZIP64_SIZE) {
    throw new Error('Zip64 archives are not supported');
  }

  const decoder = new TextDecoder();
  const entries: Entry[] = [];
  let at = directoryOffset;
  for (let index = 0; index < count; index++) {
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new Error('Corrupt zip: bad central directory entry');
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const nameStart = view.byteOffset + at + CENTRAL_HEADER_SIZE;
    const name = decoder.decode(new Uint8Array(view.buffer, nameStart, nameLength));

    assertSafeName(name);
    if (compressedSize === ZIP64_SIZE || size === ZIP64_SIZE || localOffset === ZIP64_SIZE) {
      throw new Error(`Zip64 archives are not supported: ${name}`);
    }
    if (flags & ENCRYPTED) {
      throw new Error(`Encrypted zip entry: ${name}`);
    }
    if (method !== STORED && method !== DEFLATED) {
      throw new Error(`Unsupported compression method ${method}: ${name}`);
    }
    entries.push({ name, method, compressedSize, localOffset });
    at += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readData(zip: Uint8Array, view: DataView, entry: Entry): Uint8Array {
  if (view.getUint32(entry.localOffset, true) !== LOCAL_SIGNATURE) {
    throw new Error(`Corrupt zip: bad local header for ${entry.name}`);
  }
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + LOCAL_HEADER_SIZE + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > zip.length) {
    throw new Error(`Corrupt zip: ${entry.name} runs past the end`);
  }
  const data = zip.slice(start, end);
  return entry.method === DEFLATED ? inflateRawSync(data) : data;
}

export function extractZip(
  zip: Uint8Array,
  keep: (name: string) => boolean
): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const files = new Map<string, Uint8Array>();
  for (const entry of readEntries(view)) {
    if (!entry.name.endsWith('/') && keep(entry.name)) {
      files.set(entry.name, readData(zip, view, entry));
    }
  }
  return files;
}
