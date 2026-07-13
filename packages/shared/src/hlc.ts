// Hybrid Logical Clock: physical wall time + a monotonic counter + a device id tiebreak.
// Encoded as a lexicographically-sortable string so string compare == hlc compare.
export interface Hlc {
  physical: number;
  counter: number;
  node: string;
}

export const HLC_MAX_DRIFT_MS = 24 * 60 * 60 * 1000;

export function hlcInit(node: string): Hlc {
  return { physical: 0, counter: 0, node };
}

export function hlcNow(prev: Hlc, wallMs: number): Hlc {
  if (wallMs > prev.physical) {
    return { physical: wallMs, counter: 0, node: prev.node };
  }
  return { physical: prev.physical, counter: prev.counter + 1, node: prev.node };
}

export function hlcReceive(prev: Hlc, remote: Hlc, wallMs: number): Hlc {
  // Clamp a remote clock that is absurdly ahead of ours so one bad device can't poison ordering.
  const cappedRemote = Math.min(remote.physical, wallMs + HLC_MAX_DRIFT_MS);
  const physical = Math.max(prev.physical, cappedRemote, wallMs);
  let counter: number;
  if (physical === prev.physical && physical === cappedRemote) {
    counter = Math.max(prev.counter, remote.counter) + 1;
  } else if (physical === prev.physical) {
    counter = prev.counter + 1;
  } else if (physical === cappedRemote) {
    counter = remote.counter + 1;
  } else {
    counter = 0;
  }
  return { physical, counter, node: prev.node };
}

const PHYS_WIDTH = 15; // ms since epoch fits in 15 decimal digits until year ~5138
const COUNTER_WIDTH = 5;

export function hlcEncode(h: Hlc): string {
  const phys = String(h.physical).padStart(PHYS_WIDTH, '0');
  const ctr = String(h.counter).padStart(COUNTER_WIDTH, '0');
  return `${phys}:${ctr}:${h.node}`;
}

export function hlcDecode(s: string): Hlc {
  const parts = s.split(':');
  if (parts.length !== 3) {
    throw new Error('malformed hlc');
  }
  return { physical: Number(parts[0]), counter: Number(parts[1]), node: parts[2] };
}

export function hlcCompare(a: Hlc, b: Hlc): number {
  if (a.physical !== b.physical) {
    return a.physical < b.physical ? -1 : 1;
  }
  if (a.counter !== b.counter) {
    return a.counter < b.counter ? -1 : 1;
  }
  if (a.node !== b.node) {
    return a.node < b.node ? -1 : 1;
  }
  return 0;
}
