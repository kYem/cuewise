// Requires (from apps/api): cp .dev.vars.example .dev.vars && npx wrangler d1 migrations apply cuewise-sync --local && npx wrangler dev
const BASE = process.env.API_URL ?? 'http://localhost:8787';

async function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function exchange(deviceName) {
  const res = await fetch(`${BASE}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'dev', credential: 'e2e-user', deviceName }),
  });
  if (res.status !== 200) {
    await fail(`token exchange for ${deviceName} returned ${res.status}`);
  }
  const { token } = await res.json();
  return token;
}

const deviceA = await exchange('device-a');
const deviceB = await exchange('device-b');

const push = await fetch(`${BASE}/v1/changes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceA}` },
  body: JSON.stringify({
    records: [
      {
        collection: 'goals',
        entityId: 'g-e2e-1',
        ciphertext: Buffer.from('stub-envelope:goal-1').toString('base64'),
        clientUpdatedAt: Date.now(),
        deleted: false,
      },
    ],
  }),
});
if (push.status !== 200) {
  await fail(`push returned ${push.status}: ${await push.text()}`);
}

const pull = await fetch(`${BASE}/v1/changes?since=0`, {
  headers: { Authorization: `Bearer ${deviceB}` },
});
if (pull.status !== 200) {
  await fail(`pull returned ${pull.status}: ${await pull.text()}`);
}
const { records } = await pull.json();
const found = records.find((r) => r.entityId === 'g-e2e-1');
if (found === undefined) {
  await fail('device B did not receive the record pushed by device A');
}
if (Buffer.from(found.ciphertext, 'base64').toString() !== 'stub-envelope:goal-1') {
  await fail('ciphertext did not round-trip intact');
}
console.log('PASS: two-device round-trip OK (cursor semantics + opaque payload intact)');
