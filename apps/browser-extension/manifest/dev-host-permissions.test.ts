import { describe, expect, it } from 'vitest';
import { devHostPermissions } from './dev-host-permissions';

describe('devHostPermissions', () => {
  it('grants only the dev server when sync is off', () => {
    expect(devHostPermissions('')).toEqual(['http://localhost:5173/*']);
  });

  it('grants the default local sync API', () => {
    expect(devHostPermissions('http://localhost:8787')).toEqual([
      'http://localhost:5173/*',
      'http://localhost:8787/*',
    ]);
  });

  it('grants a configured sync API by its origin, dropping any path', () => {
    expect(devHostPermissions('http://127.0.0.1:9000/api/')).toEqual([
      'http://localhost:5173/*',
      'http://127.0.0.1:9000/*',
    ]);
  });
});
