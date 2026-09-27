import assert from 'node:assert/strict';
import { createMonsterControlController } from '../monster-control-controller-v900.mjs';
import { createMonsterCommandAdapter } from '../monster-command-adapter.mjs';
import { createMonsterHttpProvider } from '../monster-command-http-provider-v900.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for deterministic controller condition');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function throwSlot(controller, slot) {
  const prepared = await controller.activateSlot(slot);
  if (!prepared.ok) return prepared;
  return controller.throwHeld();
}
function fixture(overrides = {}, options = {}) {
  let actors = [{ instanceId: 'a', zone: 'hub', active: true, generation: 10 }];
  const calls = [];
  const pending = deferred();
  const controller = createMonsterControlController({
    getZone: () => 'hub',
    getAim: () => ({ x: 1, y: 0, z: 1 }),
    getParty: () => ({ available: true, slots: ['a', 'b', 'c'].map(instanceId => ({ instanceId, available: true })) }),
    getConfirmedActors: () => actors,
    getCapabilities: () => ({ recall: true, switch: true }),
    refreshControlState: options.refreshControlState,
    pendingTimeoutMs: options.pendingTimeoutMs ?? 12000,
    commands: {
      summon: async command => { calls.push({ ...command, kind: 'summon' }); return { ok: true }; },
      skill: async () => ({ ok: true }),
      switch: command => { calls.push({ ...command, kind: 'switch' }); return pending.promise; },
      recall: command => { calls.push({ ...command, kind: 'recall' }); return pending.promise; },
      ...overrides,
    },
  });
  return { controller, calls, pending, setActors: value => { actors = value; } };
}

// ACK ต้องตามด้วย canonical control-state read; เปลี่ยน active เฉพาะเมื่อ snapshot ยืนยัน
{
  let controller;
  let actors = [{ instanceId: 'a', zone: 'hub', active: true, generation: 10 }];
  let refreshCount = 0;
  controller = createMonsterControlController({
    commands: { summon: async () => ({ ok: true }), skill: async () => ({ ok: true }), recall: async () => ({ ok: true }) },
    getParty: () => ({ available: true, slots: [{ instanceId: 'a', available: true }] }),
    getConfirmedActors: () => actors,
    getCapabilities: () => ({ recall: true }),
    getZone: () => 'hub',
    refreshControlState: async options => {
      assert.equal(options.afterPending, true);
      refreshCount += 1;
      actors = [];
      controller.sync();
      return { ok: true, state: { actors } };
    },
  });
  assert.equal(controller.snapshot().slots[0].active, true);
  assert.equal((await controller.recall()).reason, 'recall-confirmed');
  assert.equal(refreshCount, 1);
  assert.equal(controller.snapshot().slots[0].active, false, 'Recall UI leaves active only after authoritative snapshot');
  assert.equal(controller.snapshot().pending, false);
  controller.dispose();
}

// ผล resync ที่เริ่มใน epoch เดิมห้าม emit/ล้างสถานะหลัง reset เปลี่ยนฉาก
{
  let controller;
  let actors = [{ instanceId: 'a', zone: 'hub', active: true, generation: 10 }];
  let resolveTimedOutResync;
  let refreshCount = 0;
  controller = createMonsterControlController({
    commands: { summon: async () => ({ ok: true }), skill: async () => ({ ok: true }), recall: async () => ({ ok: true }) },
    getParty: () => ({ available: true, slots: [{ instanceId: 'a', available: true }] }),
    getConfirmedActors: () => actors,
    getCapabilities: () => ({ recall: true }), getZone: () => 'hub', pendingTimeoutMs: 20,
    refreshControlState: () => {
      refreshCount += 1;
      return refreshCount === 1 ? Promise.resolve({ ok: true }) : new Promise(resolve => { resolveTimedOutResync = resolve; });
    },
  });
  await controller.recall();
  await waitFor(() => refreshCount === 2);
  assert.equal(refreshCount, 2, 'timeout started a delayed resync');
  controller.reset();
  const afterResetRevision = controller.snapshot().revision;
  resolveTimedOutResync({ ok: true });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(controller.snapshot().revision, afterResetRevision, 'stale prior-epoch resync cannot mutate new scene state');
  assert.equal(controller.snapshot().lastFailure, null);
  controller.dispose();
}

// reject คง actor จริงไว้; ไม่ทำ local recall/switch
{
  let refreshCount = 0;
  const f = fixture({ recall: async () => ({ ok: false, code: 'RECALL_REJECTED' }) }, {
    refreshControlState: async () => { refreshCount += 1; return { ok: true }; },
  });
  assert.equal((await f.controller.recall()).ok, false);
  assert.equal(f.controller.snapshot().slots[0].active, true);
  assert.equal(f.controller.snapshot().pending, false);
  assert.equal(refreshCount, 0, 'rejected command cannot imply a local state transition');
  f.controller.dispose();
}

// snapshot ที่เริ่ม/มาถึงก่อน ACK ห้ามยืนยัน Recall; ต้องมี readback หลัง ACK เท่านั้น
{
  let actors = [{ instanceId: 'a', zone: 'hub', active: true, generation: 10 }];
  let resolveCommand;
  let refreshCount = 0;
  const controller = createMonsterControlController({
    commands: { summon: async () => ({ ok: true }), skill: async () => ({ ok: true }), recall: () => new Promise(resolve => { resolveCommand = resolve; }) },
    getParty: () => ({ available: true, slots: [{ instanceId: 'a', available: true }] }),
    getConfirmedActors: () => actors,
    getCapabilities: () => ({ recall: true }), getZone: () => 'hub',
    refreshControlState: async () => { refreshCount += 1; return { ok: true }; },
  });
  const request = controller.recall();
  actors = [];
  controller.sync();
  assert.equal(controller.snapshot().pending, true, 'pre-ACK snapshot cannot clear recall guard');
  resolveCommand({ ok: true });
  assert.equal((await request).reason, 'recall-confirmed');
  assert.equal(refreshCount, 1, 'successful command performs an explicit post-ACK canonical read');
  assert.equal(controller.snapshot().pending, false);
  controller.dispose();
}

// ACK + missing snapshot times out, releases duplicate guard, and resync confirms state without local toggle
{
  let controller;
  let actors = [{ instanceId: 'a', zone: 'hub', active: true, generation: 10 }];
  let refreshCount = 0;
  controller = createMonsterControlController({
    commands: { summon: async () => ({ ok: true }), skill: async () => ({ ok: true }), recall: async () => ({ ok: true }) },
    getParty: () => ({ available: true, slots: [{ instanceId: 'a', available: true }] }),
    getConfirmedActors: () => actors,
    getCapabilities: () => ({ recall: true }), getZone: () => 'hub', pendingTimeoutMs: 20,
    refreshControlState: async () => {
      refreshCount += 1;
      if (refreshCount > 1) { actors = []; controller.sync(); }
      return { ok: true, state: { actors } };
    },
  });
  assert.equal((await controller.recall()).reason, 'awaiting-snapshot');
  assert.equal(controller.snapshot().pending, true);
  assert.equal(controller.snapshot().slots[0].active, true);
  await waitFor(() => controller.snapshot().pending === false);
  assert.ok(refreshCount >= 2, 'timeout triggers a canonical resync');
  assert.equal(controller.snapshot().pending, false);
  assert.equal(controller.snapshot().slots[0].active, false, 'only resync-confirmed state changes the Recall UI');
  assert.equal(controller.snapshot().lastFailure, null);
  controller.dispose();
}

// แม้ canonical readback ค้าง ACK ก็มี deadline; resync เก่าห้ามล้าง failure/state หลังข้าม epoch
{
  let controller;
  let actors = [{ instanceId: 'a', zone: 'hub', active: true, generation: 10 }];
  let resolveFirstRead;
  let refreshCount = 0;
  controller = createMonsterControlController({
    commands: { summon: async () => ({ ok: true }), skill: async () => ({ ok: true }), recall: async () => ({ ok: true }) },
    getParty: () => ({ available: true, slots: [{ instanceId: 'a', available: true }] }),
    getConfirmedActors: () => actors,
    getCapabilities: () => ({ recall: true }), getZone: () => 'hub', pendingTimeoutMs: 20,
    refreshControlState: () => {
      refreshCount += 1;
      if (refreshCount === 1) return new Promise(resolve => { resolveFirstRead = resolve; });
      actors = [];
      controller.sync();
      return Promise.resolve({ ok: true, state: { actors } });
    },
  });
  const pendingRecall = controller.recall();
  await waitFor(() => refreshCount >= 2);
  assert.ok(refreshCount >= 2, 'timeout triggers a second resync while first readback is unresolved');
  assert.equal(controller.snapshot().pending, false, 'unresolved readback cannot keep the button locked indefinitely');
  assert.equal(controller.snapshot().slots[0].active, false, 'only the timeout resync snapshot changes active UI');
  const beforeStaleRead = controller.snapshot();
  resolveFirstRead({ ok: false, code: 'STALE_SCENE' });
  assert.equal((await pendingRecall).reason, 'recall-confirmed');
  assert.equal(controller.snapshot().revision >= beforeStaleRead.revision, true);
  assert.equal(controller.snapshot().lastFailure, null, 'late old read cannot restore or clear newer confirmation state');
  controller.dispose();
}

// ใช้รูปแบบ party จริงจาก C# ซึ่งไม่มี available ในแต่ละช่อง
{
  const requests = [];
  let actors = [];
  const provider = createMonsterHttpProvider({
    config: { apiBaseUrl: 'https://fixture.invalid/', apiVersion: '1.1' },
    sessionToken: 'fixture-session', getZone: () => 'hub',
    fetchImpl: async (_url, init) => {
      if (init.method === 'GET') return new Response(JSON.stringify({ ok: true, monsterControl: {
        party: [{ instanceId: 'a', speciesId: 'flameling', name: 'flameling', assetId: null }, null, null],
        actors, skills: {}, capabilities: { recall: true, switch: true }, revision: requests.length + 1,
      } }));
      const command = JSON.parse(init.body);
      requests.push(command);
      actors = command.kind === 'recall' ? [] : [{ instanceId: 'a', actorId: 'owned:a', zone: 'hub', active: true, generation: 12, hp: 80, maxHp: 100 }];
      return new Response(JSON.stringify({ ok: true, accepted: true, commandId: command.commandId, code: 'MONSTER_COMMAND_ACCEPTED' }));
    },
  });
  const commands = createMonsterCommandAdapter({ getZone: () => 'hub', send: provider.send });
  const controller = createMonsterControlController({ commands, getZone: () => 'hub',
    getAim: () => ({ x: 0, y: 0, z: 4 }), getParty: () => provider.snapshot().party,
    getConfirmedActors: () => provider.snapshot().actors, getCapabilities: () => provider.snapshot().capabilities,
  });
  await provider.refresh();
  assert.equal((await throwSlot(controller, 0)).ok, true, 'party จาก Server ต้องถือและปาได้โดยไม่ต้องมี available ที่ Server ไม่ได้ส่ง');
  await provider.refresh();
  controller.sync();
  assert.equal((await controller.activateSlot(0)).reason, 'panel-toggled');
  assert.equal((await controller.recall()).ok, true);
  await provider.refresh();
  controller.sync();
  assert.deepEqual(requests.map(command => command.kind), ['summon', 'recall']);
  assert.equal(requests[1].expectedActiveGeneration, 12);
  assert.equal(controller.snapshot().mode, 'character');
  controller.dispose();
  provider.dispose();
}

// การกดตัวเดิมเพื่อสลับแผงต้องไม่ยกเลิกคำสั่งเปลี่ยนตัวที่ยังรอ Server
{
  const f = fixture();
  await f.controller.activateSlot(1);
  const request = f.controller.throwHeld();
  await f.controller.activateSlot(0);
  const blockedRequest = f.controller.recall();
  const callCount = f.calls.length;
  assert.equal(f.calls[0].expectedActiveGeneration, 10);
  f.pending.resolve({ ok: false, code: 'THROW_OUT_OF_RANGE' });
  assert.equal((await blockedRequest).ok, false, 'ห้ามส่ง recall ซ้อนหลังการกดสลับแผง');
  assert.equal(callCount, 1);
  assert.equal((await request).ok, false);
  assert.equal(f.controller.snapshot().slots[0].active, true, 'เปลี่ยนตัวถูกปฏิเสธต้องยังคง A');
  f.controller.dispose();
}

// ACK เก็บกลับมาก่อน snapshot ต้องคง pending และไม่ส่ง switch ซ้อน
{
  const f = fixture({}, { refreshControlState: async () => ({ ok: true }) });
  const request = f.controller.recall();
  f.controller.sync();
  assert.equal(f.controller.snapshot().slots[0].pending, true, 'active snapshot เดิมไม่ใช่ผลยืนยัน recall');
  f.pending.resolve({ ok: true });
  await request;
  assert.equal((await f.controller.activateSlot(1)).ok, false);
  assert.equal(f.calls.length, 1);
  f.setActors([]);
  f.controller.sync();
  assert.equal(f.controller.snapshot().slots[0].pending, false);
  assert.equal(f.controller.snapshot().mode, 'character');
  f.controller.dispose();
}

// เมื่อ state เปลี่ยนหลัง timeout การ retry ต้องคง kind และ payload เดิม
{
  const sent = [];
  const f = fixture({
    switch: async command => { sent.push({ ...command, kind: 'switch' }); return { ok: false, code: 'TRANSPORT_TIMEOUT' }; },
    summon: async command => { sent.push({ ...command, kind: 'summon' }); return { ok: false, code: 'TRANSPORT_TIMEOUT' }; },
  });
  await throwSlot(f.controller, 1);
  f.setActors([]);
  await throwSlot(f.controller, 1);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], sent[0], 'retry switch ต้องไม่กลายเป็น summon เมื่อ snapshot เปลี่ยน');
  f.controller.dispose();
}

// Recall timeout ต้องส่ง ID และ generation เดิมเมื่อผู้เล่นลองอีกครั้ง
{
  const sent = [];
  const f = fixture({
    summon: async command => { sent.push({ ...command, kind: 'summon' }); return { ok: false, code: 'TRANSPORT_TIMEOUT' }; },
    switch: async command => { sent.push({ ...command, kind: 'switch' }); return { ok: false, code: 'TRANSPORT_TIMEOUT' }; },
  });
  f.setActors([]);
  await throwSlot(f.controller, 0);
  f.setActors([{ instanceId: 'b', active: true, zone: 'hub', generation: 30 }]);
  await throwSlot(f.controller, 0);
  assert.deepEqual(sent[1], sent[0], 'retry summon ต้องไม่เปลี่ยนเป็น switch เมื่อมี actor ใหม่');
  f.controller.dispose();
}
{
  const sent = [];
  const f = fixture({
    recall: async command => { sent.push({ ...command, kind: 'recall' }); return { ok: false, code: 'TRANSPORT_TIMEOUT' }; },
    summon: async command => { sent.push({ ...command, kind: 'summon' }); return { ok: false, code: 'TRANSPORT_TIMEOUT' }; },
  });
  await f.controller.recall();
  f.setActors([]);
  await throwSlot(f.controller, 0);
  assert.equal(sent[1].kind, 'summon');
  assert.notEqual(sent[1].commandId, sent[0].commandId, 'recall retry ต้องไม่ปนกับคำสั่งปาใหม่');
  assert.deepEqual(sent[1].targetPoint, { x: 1, y: 0, z: 1 });
  f.controller.dispose();
}

// Recall timeout ต้องส่ง ID และ generation เดิมเมื่อผู้เล่นลองอีกครั้ง
{
  const sent = [];
  const f = fixture({ recall: async command => { sent.push(command); return { ok: false, code: 'TRANSPORT_ERROR' }; } });
  await f.controller.recall();
  await f.controller.recall();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], sent[0]);
  f.controller.dispose();
}

// HTTP provider คืน transient failure เป็นค่า result จึงต้องไม่ติด resolved cache
{
  let attempts = 0;
  const command = { commandId: 'recall-retry', instanceId: 'a', zone: 'hub', expectedActiveGeneration: 10 };
  const adapter = createMonsterCommandAdapter({ getZone: () => 'hub', send: async input => {
    attempts += 1;
    return attempts === 1
      ? { ok: false, code: 'TRANSPORT_ERROR', commandId: input.commandId }
      : { ok: true, accepted: true, code: 'MONSTER_RECALL_ACCEPTED', commandId: input.commandId };
  } });
  assert.equal((await adapter.recall(command)).ok, false);
  assert.equal((await adapter.recall(command)).ok, true);
  assert.equal(attempts, 2);
  assert.equal((await adapter.recall(command)).ok, true);
  assert.equal(attempts, 2, 'ผลสำเร็จยังต้อง cache ป้องกันส่งซ้ำ');
  adapter.clearScene();
}

console.log('V9 monster recall/switch race regression: PASS');
