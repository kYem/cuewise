import { crc32, deflateRawSync } from 'node:zlib';

export type ZipEntry = { name: string; data: Uint8Array; method: 0 | 8; flags?: number };

const HAS_DATA_DESCRIPTOR = 0x0008;
const DOS_DATE_1980 = 0x0021;

const u16 = (value: number) => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
};

const u32 = (value: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};

export const text = (value: string): Uint8Array => new TextEncoder().encode(value);

export const decode = (bytes: Uint8Array | undefined): string => new TextDecoder().decode(bytes);

// Same layout archiver writes: zero sizes in the local header, a data descriptor after the data.
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const body: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const flags = HAS_DATA_DESCRIPTOR | (entry.flags ?? 0);
    const compressed = entry.method === 8 ? deflateRawSync(entry.data) : Buffer.from(entry.data);
    const crc = crc32(entry.data);

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(entry.method),
      u16(0),
      u16(DOS_DATE_1980),
      u32(0),
      u32(0),
      u32(0),
      u16(name.length),
      u16(0),
      name,
    ]);
    const descriptor = Buffer.concat([
      u32(0x08074b50),
      u32(crc),
      u32(compressed.length),
      u32(entry.data.length),
    ]);

    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(flags),
        u16(entry.method),
        u16(0),
        u16(DOS_DATE_1980),
        u32(crc),
        u32(compressed.length),
        u32(entry.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ])
    );
    body.push(local, compressed, descriptor);
    offset += local.length + compressed.length + descriptor.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(directory.length),
    u32(offset),
    u16(0),
  ]);
  return new Uint8Array(Buffer.concat([...body, directory, end]));
}
