import { describe, expect, it } from 'vitest';
import { decode, makeZip, text } from './__fixtures__/zip.fixtures';
import { extractZip } from './unzip.mts';

const END_RECORD_SIZE = 22;

function patchCentralDirectory(zip: Uint8Array, field: number, size: 2 | 4, value: number) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const directoryOffset = view.getUint32(zip.length - END_RECORD_SIZE + 16, true);
  if (size === 2) {
    view.setUint16(directoryOffset + field, value, true);
  } else {
    view.setUint32(directoryOffset + field, value, true);
  }
  return zip;
}

describe('extractZip', () => {
  it('extracts a deflated entry and a stored entry', () => {
    const zip = makeZip([
      { name: 'index.html', data: text('<html></html>'), method: 8 },
      { name: 'assets/a.js', data: text('let a = 1;'), method: 0 },
    ]);
    const files = extractZip(zip, () => true);
    expect([...files.keys()]).toEqual(['index.html', 'assets/a.js']);
    expect(decode(files.get('index.html'))).toBe('<html></html>');
    expect(decode(files.get('assets/a.js'))).toBe('let a = 1;');
  });

  it('skips directory entries and names the filter rejects', () => {
    const zip = makeZip([
      { name: 'assets/', data: new Uint8Array(), method: 0 },
      { name: 'assets/a.js', data: text('a'), method: 8 },
      { name: 'manifest.json', data: text('{}'), method: 8 },
    ]);
    expect([...extractZip(zip, (name) => name.startsWith('assets/')).keys()]).toEqual([
      'assets/a.js',
    ]);
  });

  it.each(['../evil.js', '/abs.js', 'a/../../b.js', 'a\\b.js'])(
    'refuses the unsafe name %s',
    (name) => {
      expect(() => extractZip(makeZip([{ name, data: text('x'), method: 0 }]), () => true)).toThrow(
        /unsafe/i
      );
    }
  );

  it('refuses an encrypted entry', () => {
    const zip = makeZip([{ name: 'a.js', data: text('x'), method: 8, flags: 0x0001 }]);
    expect(() => extractZip(zip, () => true)).toThrow(/encrypted/i);
  });

  it('refuses an unknown compression method', () => {
    const zip = patchCentralDirectory(
      makeZip([{ name: 'a.js', data: text('x'), method: 8 }]),
      10,
      2,
      12
    );
    expect(() => extractZip(zip, () => true)).toThrow(/compression method/i);
  });

  it('refuses a zip64 entry count', () => {
    const zip = makeZip([{ name: 'a.js', data: text('x'), method: 8 }]);
    new DataView(zip.buffer, zip.byteOffset, zip.byteLength).setUint16(
      zip.length - END_RECORD_SIZE + 10,
      0xffff,
      true
    );
    expect(() => extractZip(zip, () => true)).toThrow(/zip64/i);
  });

  it('refuses a zip64 entry size', () => {
    const zip = patchCentralDirectory(
      makeZip([{ name: 'a.js', data: text('x'), method: 8 }]),
      20,
      4,
      0xffffffff
    );
    expect(() => extractZip(zip, () => true)).toThrow(/zip64/i);
  });

  it('refuses a buffer with no end-of-central-directory record', () => {
    expect(() => extractZip(text('not a zip'), () => true)).toThrow(/not a zip/i);
  });
});
