import { type DataKey, DecryptError, EnvelopeParseError } from '@cuewise/crypto';
import {
  type AppliedRecord,
  hlcCompare,
  hlcDecode,
  hlcEncode,
  hlcReceive,
  logger,
  type PushRecord,
  type PushResponse,
  type SyncRecord,
} from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import { type CollectionBinding, DEVICE_LOCAL_SETTINGS_KEYS } from './collections';
import { isServerSeq, type SyncMeta, SyncMetadataStore } from './metadata-store';
import { fromSyncRecord, toPushRecord } from './record-map';
import type { ConflictStrategy, RecordBody } from './strategy';

// Structural subset of ApiClient — the cycle only needs these two calls.
export interface SyncTransport {
  pushChanges(records: PushRecord[]): Promise<PushResponse>;
  getChanges(since: number): Promise<{ records: SyncRecord[]; cursor: number }>;
}

export interface CycleDeps {
  transport: SyncTransport;
  meta: SyncMetadataStore;
  bindings: CollectionBinding[];
  dk: DataKey;
  keyId: string;
  strategy: ConflictStrategy;
  now?: () => number;
  onQuarantine?: (key: string) => void;
  /**
   * True once the account this cycle belongs to is gone; the cycle then stops without writing or
   * saving anything further. Required, so no caller can silently opt back into an uncancellable one.
   */
  isCancelled: () => boolean;
}

/**
 * The working ledger of one pull or one batch's conflict settling. It claims only what it decided,
 * and only while the stored ledger has not moved that key past it; the rest is whoever wrote it.
 */
interface PullState {
  meta: SyncMeta;
  applied: Set<string>;
  /** Keys whose quarantine membership this pull changed — not merely re-observed. */
  quarantined: Set<string>;
  /** Highest server seq seen per key: the server's fact about the row, merged by max, unguarded. */
  seqs: Map<string, number>;
  /** Keys local outranked: added to `dirty` (never removed) so the push repairs them. */
  redirtied: Map<string, { collection: string; entityId: string }>;
  /** The server discarded this device's cursor, so the merge must rewind it rather than advance. */
  cursorReset: boolean;
}

function newPullState(meta: SyncMeta): PullState {
  return {
    meta,
    applied: new Set(),
    quarantined: new Set(),
    seqs: new Map(),
    redirtied: new Map(),
    cursorReset: false,
  };
}

function markDirty(meta: SyncMeta, collection: string, entityId: string): void {
  const ids = meta.dirty[collection] ?? [];
  if (!ids.includes(entityId)) {
    meta.dirty[collection] = [...ids, entityId];
  }
}

// Dropped here, not on the next load: a non-seq winning the max would erase the seq this key had.
function recordSeq(pull: PullState, key: string, seq: number): void {
  if (!isServerSeq(seq)) {
    logger.warn('Ignoring a server record whose seq is not a seq', { key, seq });
    return;
  }
  pull.seqs.set(key, Math.max(pull.seqs.get(key) ?? 0, seq));
}

/** One key's membership in a ledger list, mirrored from what the pull decided for it. */
function withMembership(list: string[], key: string, member: boolean): string[] {
  if (!member) {
    return list.filter((k) => k !== key);
  }
  if (list.includes(key)) {
    return list;
  }
  return [...list, key];
}

/** Applies only what the pull owns onto a freshly-loaded ledger; see PullState. */
function mergePull(fresh: SyncMeta, pull: PullState, wallMs: number): void {
  if (pull.cursorReset) {
    fresh.cursor = 0;
  } else {
    fresh.cursor = Math.max(fresh.cursor, pull.meta.cursor);
  }
  fresh.clock = hlcEncode(hlcReceive(hlcDecode(fresh.clock), hlcDecode(pull.meta.clock), wallMs));
  for (const key of pull.quarantined) {
    fresh.quarantine = withMembership(fresh.quarantine, key, pull.meta.quarantine.includes(key));
  }
  for (const key of pull.applied) {
    const held = fresh.hlcs[key];
    // An edit stamped this key while the pull was in flight, so the pull is the older news of the
    // two. Writing its hlc back would have the next push send that edit under a stamp every peer
    // already holds — LWW ties, and the edit would live on this device alone.
    if (held !== undefined && hlcCompare(hlcDecode(pull.meta.hlcs[key]), hlcDecode(held)) <= 0) {
      continue;
    }
    fresh.hlcs[key] = pull.meta.hlcs[key];
    fresh.tombstones = withMembership(fresh.tombstones, key, pull.meta.tombstones.includes(key));
  }
  for (const [key, seq] of pull.seqs) {
    fresh.seqs[key] = Math.max(fresh.seqs[key] ?? 0, seq);
  }
  for (const { collection, entityId } of pull.redirtied.values()) {
    markDirty(fresh, collection, entityId);
  }
}

async function savePullUnlessCancelled(deps: CycleDeps, pull: PullState): Promise<boolean> {
  if (deps.isCancelled()) {
    return false;
  }
  // `update` enqueues synchronously, and no await may come between it and the check above: a
  // disable slipping into that gap would reset the ledger first and have this delta restore it.
  await deps.meta.update((fresh) => mergePull(fresh, pull, (deps.now ?? Date.now)()));
  return true;
}

/**
 * Records that the cycle stopped for a removed account. Records already applied stay on this device
 * with no hlc left to explain them, so this count is the only trace of where they came from.
 */
function cancelledPull(applied: number): PullResult {
  if (applied > 0) {
    // "applied", not "remain": a pulled tombstone counts too, and that one deleted local data.
    logger.error(
      `Cloud sync stopped a pull for a disconnected account; ${applied} of its records had already been applied to this device`
    );
  }
  return { kind: 'cancelled' };
}

const MAX_PUSH_BATCH = 100;
// Must match the server's MAX_CHANGES_PAGE_SIZE (apps/api/src/d1-store.ts) — a page this size
// signals "more to fetch", so pullOnce loops again.
export const PULL_PAGE = 500;

/** The engine never pushes unconditionally; only the wire type leaves `baseSeq` optional. */
type ConditionalPushRecord = PushRecord & { baseSeq: number };

interface DirtyRecord {
  collection: string;
  entityId: string;
  key: string;
  /** The hlc that was sealed into `record`; the ack only speaks for that version — see clearAcked. */
  hlc: string;
  record: ConditionalPushRecord;
}

/**
 * Counts per collection for the cycle summary. Names and totals only — never entity ids or
 * bodies, which is the whole point of the server holding ciphertext.
 */
function tallyByCollection(collections: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of collections) {
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/** Batches before a `cancelled` still reached the server. */
export type PushResult = { kind: 'complete' } | { kind: 'cancelled' };

/** Seals every dirty entity and pushes it in batches; acks clear dirty, refusals settle locally. */
export async function pushOnce(deps: CycleDeps): Promise<PushResult> {
  const meta = await deps.meta.load();
  const dirtyRecords = await buildDirtyRecords(deps, meta);
  if (dirtyRecords.length === 0) {
    return { kind: 'complete' };
  }

  const first = await pushBatches(deps, dirtyRecords);
  if (first.kind === 'cancelled') {
    return first;
  }
  const landed = [...first.landed];
  let leftover = first.retry;
  if (first.retry.size > 0) {
    // One more round for ids a conflict left dirty under a fresh base. A row still moving after
    // that waits for the next cycle rather than looping here.
    const again = await buildDirtyRecords(deps, await deps.meta.load(), first.retry);
    const second = await pushBatches(deps, again);
    if (second.kind === 'cancelled') {
      return second;
    }
    landed.push(...second.landed);
    leftover = second.retry;
  }
  if (leftover.size > 0) {
    logger.debug(`Sync push left ${leftover.size} record(s) still refused for the next cycle`);
  }
  logger.debug(`Sync push sent ${landed.length} record(s)`, {
    byCollection: tallyByCollection(landed.map((item) => item.collection)),
  });
  return { kind: 'complete' };
}

type BatchesResult =
  | { kind: 'cancelled' }
  | { kind: 'pushed'; landed: DirtyRecord[]; retry: Set<string> };

async function pushBatches(deps: CycleDeps, dirtyRecords: DirtyRecord[]): Promise<BatchesResult> {
  const landed: DirtyRecord[] = [];
  const retry = new Set<string>();
  let stalled: string | null = null;
  for (let start = 0; start < dirtyRecords.length; start += MAX_PUSH_BATCH) {
    if (deps.isCancelled()) {
      return { kind: 'cancelled' };
    }
    const batch = dirtyRecords.slice(start, start + MAX_PUSH_BATCH);
    const response = ownResponse(
      batch,
      await deps.transport.pushChanges(batch.map((item) => item.record))
    );
    // After the round trip: the server already holds the applied records, and that has to be said.
    // The ledger write below is skipped outright — the applied seqs it records are not hlc-guarded.
    if (deps.isCancelled()) {
      if (response.applied.length > 0) {
        logger.error(
          `Cloud sync stopped a push for a disconnected account, but its server had already accepted ${response.applied.length} records`
        );
      }
      return { kind: 'cancelled' };
    }
    const acked = ackedRecords(batch, response);
    // Enqueued synchronously after the check above, so nothing may await between the two. A delta,
    // not the snapshot the batch was sealed from: anything marked dirty meanwhile must survive.
    await deps.meta.update((fresh) => recordAcks(fresh, acked, response.applied));
    landed.push(...acked);
    if (response.conflicts.length > 0) {
      logger.debug(`Sync push had ${response.conflicts.length} record(s) refused`, {
        byCollection: tallyByCollection(response.conflicts.map((c) => c.collection)),
      });
    }
    const settled = await settleConflicts(deps, response.conflicts);
    // Re-checked: settling awaited (decrypts, local writes), and the enqueue below must follow a
    // check with no await between them, or a disable's ledger reset could be undone by this delta.
    if (deps.isCancelled()) {
      return cancelledPush(settled.state?.applied.size ?? 0);
    }
    if (settled.state !== null) {
      const state = settled.state;
      await deps.meta.update((fresh) =>
        recordSettled(fresh, batch, state, settled.decisions, (deps.now ?? Date.now)())
      );
    }
    for (const [key, decision] of settled.decisions) {
      if (decision === 'retry') {
        retry.add(key);
      }
    }
    // Later batches still go out: an inbound write failing must not hold outbound changes hostage.
    stalled ??= settled.stalled;
  }
  if (stalled !== null) {
    throw new Error(`sync push stalled applying the server's version of ${stalled}`);
  }
  return { kind: 'pushed', landed, retry };
}

/** The reply narrowed to the batch's own keys; anything else it named is logged and dropped. */
function ownResponse(batch: DirtyRecord[], response: PushResponse): PushResponse {
  const sent = new Set(batch.map((item) => item.key));
  const own = (r: { collection: string; entityId: string }): boolean =>
    sent.has(SyncMetadataStore.entityKey(r.collection, r.entityId));
  const applied = response.applied.filter(own);
  const conflicts = response.conflicts.filter(own);
  const foreign = response.applied.length - applied.length;
  const foreignConflicts = response.conflicts.length - conflicts.length;
  if (foreign > 0 || foreignConflicts > 0) {
    logger.warn('Push reply named records this batch did not send; ignoring them', {
      applied: foreign,
      conflicts: foreignConflicts,
    });
  }
  return { cursor: response.cursor, applied, conflicts };
}

/** See cancelledPull: versions settled onto this device before the stop leave no hlc behind. */
function cancelledPush(applied: number): BatchesResult {
  if (applied > 0) {
    logger.error(
      `Cloud sync stopped a push for a disconnected account; ${applied} server versions of its refused records had already been applied to this device`
    );
  }
  return { kind: 'cancelled' };
}

/**
 * The batch records the server named in `applied` and did not also refuse. Either other case is
 * said out loud: a record in neither list stays pending, one in both settles as a refusal.
 */
function ackedRecords(batch: DirtyRecord[], response: PushResponse): DirtyRecord[] {
  const applied = new Set(
    response.applied.map((a) => SyncMetadataStore.entityKey(a.collection, a.entityId))
  );
  const refused = new Set(
    response.conflicts.map((c) => SyncMetadataStore.entityKey(c.collection, c.entityId))
  );
  const acked: DirtyRecord[] = [];
  for (const item of batch) {
    const named = { collection: item.collection, entityId: item.entityId };
    if (applied.has(item.key) && refused.has(item.key)) {
      logger.warn('Push record both applied and refused; settling it as refused', named);
    } else if (applied.has(item.key)) {
      acked.push(item);
    } else if (!refused.has(item.key)) {
      logger.warn('Push record neither applied nor refused; keeping it pending', named);
    }
  }
  return acked;
}

function recordAcks(fresh: SyncMeta, acked: DirtyRecord[], applied: AppliedRecord[]): void {
  clearAcked(fresh, acked);
  const appliedSeqs = new Map(
    applied.map((a) => [SyncMetadataStore.entityKey(a.collection, a.entityId), a.seq])
  );
  for (const { key, collection, entityId } of acked) {
    const seq = appliedSeqs.get(key);
    if (isServerSeq(seq)) {
      fresh.seqs[key] = Math.max(fresh.seqs[key] ?? 0, seq);
    } else if (seq !== undefined) {
      logger.warn('Ignoring an applied record whose seq is not a seq', {
        collection,
        entityId,
        seq,
      });
    }
  }
}

/**
 * What one refused record came to: the server's version now sits locally (`incoming`), the server
 * already holds the local version (`same`), or local still outranks it and pushes again (`retry`).
 */
type ConflictDecision = 'incoming' | 'same' | 'retry';

/** What settling a batch's conflicts decided; `state` is null when there were none. */
interface SettledConflicts {
  state: PullState | null;
  decisions: Map<string, ConflictDecision>;
  /** The key whose server version could not be written locally, if any. */
  stalled: string | null;
}

/**
 * Resolves each refused record against local through the same path a pull uses, minus the cursor.
 * The server never chooses: a conflict only means "you did not see this version yet".
 */
async function settleConflicts(
  deps: CycleDeps,
  conflicts: SyncRecord[]
): Promise<SettledConflicts> {
  const settled: SettledConflicts = { state: null, decisions: new Map(), stalled: null };
  if (conflicts.length === 0) {
    return settled;
  }
  const state = newPullState(await deps.meta.load());
  settled.state = state;
  const warnedUnknownCollections = new Set<string>();
  for (const [index, conflict] of conflicts.entries()) {
    if (deps.isCancelled()) {
      return settled;
    }
    const key = SyncMetadataStore.entityKey(conflict.collection, conflict.entityId);
    const outcome = await resolveAndApply(deps, state, conflict, warnedUnknownCollections);
    switch (outcome.kind) {
      case 'applied':
        settled.decisions.set(key, 'incoming');
        break;
      case 'kept':
        settled.decisions.set(key, outcome.reason === 'same' ? 'same' : 'retry');
        break;
      case 'quarantined':
        // A version this device can read outranks a row it cannot: the retry lands over it.
        logger.warn('Re-pushing the local version over a server row this device cannot read', {
          collection: conflict.collection,
          entityId: conflict.entityId,
          seq: conflict.seq,
        });
        settled.decisions.set(key, 'retry');
        break;
      case 'unknown-collection':
        break;
      case 'failed': {
        settled.stalled = key;
        const unsettled = conflicts.length - index - 1;
        if (unsettled > 0) {
          logger.debug(`Sync push left ${unsettled} conflict(s) unsettled behind a failed write`);
        }
        return settled;
      }
      default: {
        const unhandled: never = outcome;
        throw new Error(`unhandled conflict outcome: ${JSON.stringify(unhandled)}`);
      }
    }
  }
  return settled;
}

/** One batch's conflict delta: what settling applied, and the dirty marks it may clear. */
function recordSettled(
  fresh: SyncMeta,
  batch: DirtyRecord[],
  state: PullState,
  decisions: Map<string, ConflictDecision>,
  wallMs: number
): void {
  // Decided before the merge moves any hlc: an id re-edited during the round trip keeps its mark.
  const clearable = batch.filter((item) => {
    const decision = decisions.get(item.key);
    return decision !== undefined && decision !== 'retry' && fresh.hlcs[item.key] === item.hlc;
  });
  mergePull(fresh, state, wallMs);
  // A conflict row is read after the batch, so its seq is the server's current fact: a held seq
  // above it (a restored database) would otherwise be pushed as the base for ever, refused every time.
  for (const [key, seq] of state.seqs) {
    const held = fresh.seqs[key];
    if (held !== undefined && held > seq) {
      logger.warn("Server seq for a refused record is below the one held; taking the server's", {
        key,
        held,
        seq,
      });
      fresh.seqs[key] = seq;
    }
  }
  for (const item of clearable) {
    clearDirty(fresh, item.collection, item.entityId);
    // The server already held this exact version, which is an ack in all but name.
    if (decisions.get(item.key) === 'same') {
      fresh.tombstones = fresh.tombstones.filter((t) => t !== item.key);
    }
  }
}

async function buildDirtyRecords(
  deps: CycleDeps,
  meta: SyncMeta,
  only?: Set<string>
): Promise<DirtyRecord[]> {
  const dirtyRecords: DirtyRecord[] = [];

  for (const collection of Object.keys(meta.dirty)) {
    const binding = deps.bindings.find((b) => b.name === collection);
    if (binding === undefined) {
      logger.warn('Skipping dirty entities for unknown collection', { collection });
      continue;
    }

    const all = await binding.readAll();
    for (const entityId of meta.dirty[collection]) {
      // Mirrors settingsBinding.writeOne's guard: a device-local key that snuck into dirty must
      // never push — readAll() already excludes it, so pushing would seal a spurious tombstone.
      if (collection === 'settings' && DEVICE_LOCAL_SETTINGS_KEYS.includes(entityId)) {
        continue;
      }
      const key = SyncMetadataStore.entityKey(collection, entityId);
      if (only !== undefined && !only.has(key)) {
        continue;
      }
      const hlc = meta.hlcs[key];
      if (hlc === undefined) {
        continue;
      }

      const entity = all[entityId] ?? null;
      const body: RecordBody = { entity, hlc };
      const record: ConditionalPushRecord = {
        ...(await toPushRecord(deps.dk, deps.keyId, collection, entityId, body)),
        // 0 matches no row: a key this device never saw a seq for lands only where none exists.
        baseSeq: meta.seqs[key] ?? 0,
      };
      dirtyRecords.push({ collection, entityId, key, hlc, record });
    }
  }

  return dirtyRecords;
}

// Clears the pushed ids from dirty (pruning empty collections) and resolves their tombstones. An
// id whose hlc moved during the round trip was re-edited, so the ack does not speak for it.
function clearAcked(meta: SyncMeta, batch: DirtyRecord[]): void {
  for (const { collection, entityId, key, hlc } of batch) {
    if (meta.hlcs[key] !== hlc) {
      continue;
    }
    clearDirty(meta, collection, entityId);
    meta.tombstones = meta.tombstones.filter((t) => t !== key);
  }
}

function clearDirty(meta: SyncMeta, collection: string, entityId: string): void {
  const ids = meta.dirty[collection];
  if (ids === undefined) {
    return;
  }
  const remaining = ids.filter((id) => id !== entityId);
  if (remaining.length === 0) {
    delete meta.dirty[collection];
  } else {
    meta.dirty[collection] = remaining;
  }
}

/**
 * What one pull did. `stalled` is not a completed pull: the cursor is parked before a record
 * whose local write failed, so no later remote change can reach this device until it succeeds.
 */
export type PullResult =
  | { kind: 'complete' }
  | { kind: 'resynced' }
  | { kind: 'cancelled' }
  | { kind: 'stalled'; collection: string; entityId: string };

/** Pulls remote changes in seq order, resolves each via the strategy, and applies the winners. */
export async function pullOnce(deps: CycleDeps): Promise<PullResult> {
  const pull = newPullState(await deps.meta.load());
  // Once per collection per pull — a page of unknown records is one line, not N.
  const warnedUnknownCollections = new Set<string>();
  let appliedCount = 0;
  const startCursor = pull.meta.cursor;
  const appliedCollections: string[] = [];

  let pageSize = PULL_PAGE;
  while (pageSize === PULL_PAGE) {
    if (deps.isCancelled()) {
      return cancelledPull(appliedCount);
    }
    let result: { records: SyncRecord[]; cursor: number };
    try {
      result = await deps.transport.getChanges(pull.meta.cursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'resync_required') {
        pull.meta.cursor = 0;
        pull.cursorReset = true;
        if (!(await savePullUnlessCancelled(deps, pull))) {
          return cancelledPull(appliedCount);
        }
        return { kind: 'resynced' };
      }
      throw err;
    }
    pageSize = result.records.length;

    for (const rec of result.records) {
      if (deps.isCancelled()) {
        return cancelledPull(appliedCount);
      }
      const applied = await applyPulledRecord(deps, pull, rec, warnedUnknownCollections);
      if (applied === 'failed') {
        // Apply-before-advance: the write failed, so stop here and leave the cursor before it.
        if (!(await savePullUnlessCancelled(deps, pull))) {
          return cancelledPull(appliedCount);
        }
        return { kind: 'stalled', collection: rec.collection, entityId: rec.entityId };
      }
      if (applied === 'wrote') {
        appliedCount += 1;
        appliedCollections.push(rec.collection);
      }
    }
  }

  if (!(await savePullUnlessCancelled(deps, pull))) {
    return cancelledPull(appliedCount);
  }
  logger.debug(`Sync pull applied ${appliedCount} record(s)`, {
    byCollection: tallyByCollection(appliedCollections),
    cursor: `${startCursor} -> ${pull.meta.cursor}`,
  });
  return { kind: 'complete' };
}

/** What one pulled record did. `failed` is the write refusing, which parks the pull where it is. */
type ApplyResult = 'wrote' | 'skipped' | 'failed';

/** What resolving one server record against local did; the pull and conflict paths share it. */
type ApplyOutcome =
  | { kind: 'applied' }
  | { kind: 'kept'; reason: 'newer' | 'same' }
  | { kind: 'quarantined' }
  | { kind: 'unknown-collection' }
  | { kind: 'failed' };

async function applyPulledRecord(
  deps: CycleDeps,
  pull: PullState,
  rec: SyncRecord,
  warnedUnknownCollections: Set<string>
): Promise<ApplyResult> {
  const outcome = await resolveAndApply(deps, pull, rec, warnedUnknownCollections);
  if (outcome.kind === 'failed') {
    return 'failed';
  }
  advanceCursor(pull.meta, rec.seq);
  return outcome.kind === 'applied' ? 'wrote' : 'skipped';
}

/**
 * Decrypts, resolves and applies one server record into `pull`'s ledger snapshot. Never touches
 * the cursor: the push's conflict path applies records the cursor has not reached yet.
 */
async function resolveAndApply(
  deps: CycleDeps,
  pull: PullState,
  rec: SyncRecord,
  warnedUnknownCollections: Set<string>
): Promise<ApplyOutcome> {
  const { meta } = pull;
  const key = SyncMetadataStore.entityKey(rec.collection, rec.entityId);
  // Even a row this device cannot read or place has a server seq; only a failed write forgets it.
  const priorSeq = pull.seqs.get(key);
  recordSeq(pull, key, rec.seq);

  let incoming: RecordBody;
  try {
    incoming = (await fromSyncRecord(deps.dk, rec)).body;
  } catch (err) {
    if (!(err instanceof DecryptError || err instanceof EnvelopeParseError)) {
      throw err;
    }
    if (!meta.quarantine.includes(key)) {
      meta.quarantine.push(key);
      pull.quarantined.add(key);
      deps.onQuarantine?.(key);
      // Metadata only — collection/entityId/seq — never the ciphertext or decoded payload.
      logger.warn('Quarantined undecryptable sync record', {
        collection: rec.collection,
        entityId: rec.entityId,
        seq: rec.seq,
      });
    }
    return { kind: 'quarantined' };
  }

  // Decrypt succeeded: a previously-quarantined key has recovered (spec §5.3 self-heal).
  if (meta.quarantine.includes(key)) {
    meta.quarantine = meta.quarantine.filter((q) => q !== key);
    pull.quarantined.add(key);
  }

  const binding = deps.bindings.find((b) => b.name === rec.collection);
  if (binding === undefined) {
    if (!warnedUnknownCollections.has(rec.collection)) {
      warnedUnknownCollections.add(rec.collection);
      logger.warn('Skipping server records for unknown collection', {
        collection: rec.collection,
      });
    }
    return { kind: 'unknown-collection' };
  }

  const all = await binding.readAll();
  const localEntity = all[rec.entityId];
  const localHlc = meta.hlcs[key];
  // No hlc means this key is unknown to the engine (e.g. legacy pre-sync data) even if an
  // entity exists locally — treat it as null so incoming always wins, per union-migration intent.
  const local: RecordBody | null =
    localHlc === undefined ? null : { entity: localEntity ?? null, hlc: localHlc };

  const resolution = deps.strategy.resolve(local, incoming);
  if (resolution.winner === 'local') {
    if (resolution.reason === 'newer' && local !== null) {
      pull.redirtied.set(key, { collection: rec.collection, entityId: rec.entityId });
    } else {
      pull.redirtied.delete(key);
    }
    return { kind: 'kept', reason: resolution.reason };
  }

  const res = await binding.writeOne(rec.entityId, resolution.body.entity);
  if (!res.success) {
    // Neither this seq nor a repair mark may outlive the failure: the next push would use them to
    // land the older local version over the very one it just judged newer.
    if (priorSeq === undefined) {
      pull.seqs.delete(key);
    } else {
      pull.seqs.set(key, priorSeq);
    }
    pull.redirtied.delete(key);
    // Without this, a wedged cycle (e.g. persistent quota) is undiagnosable —
    // nothing else connects "stalled at seq N" to the failing write.
    logger.error('Sync write failed applying a server record; it stays pending', {
      collection: rec.collection,
      entityId: rec.entityId,
      seq: rec.seq,
      error: res.error,
    });
    return { kind: 'failed' };
  }
  meta.hlcs[key] = resolution.body.hlc;
  pull.applied.add(key);
  pull.redirtied.delete(key);
  meta.clock = hlcEncode(
    hlcReceive(hlcDecode(meta.clock), hlcDecode(resolution.body.hlc), (deps.now ?? Date.now)())
  );
  if (resolution.body.entity === null) {
    if (!meta.tombstones.includes(key)) {
      meta.tombstones.push(key);
    }
  } else {
    meta.tombstones = meta.tombstones.filter((t) => t !== key);
  }
  return { kind: 'applied' };
}

// The server-issued cursor only moves forward — a backward value is dropped, not applied.
function advanceCursor(meta: SyncMeta, seq: number): void {
  if (seq > meta.cursor) {
    meta.cursor = seq;
  } else {
    logger.warn('Rejected backward sync cursor', { seq, cursor: meta.cursor });
  }
}
