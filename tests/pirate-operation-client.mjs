import assert from 'node:assert/strict';
import {
  createPocketOperationClient,
  PIRATE_OPERATION_REPLY_MESSAGE,
  PIRATE_OPERATION_REQUEST_MESSAGE,
  sanitizePirateOperation,
} from '../pirate-operation-client.mjs';

const listeners = new Set(), sent = [];
const parent = { postMessage(message, targetOrigin) { sent.push({ message, targetOrigin }); } };
const windowLike = {
  parent,
  addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
  removeEventListener(type, listener) { if (type === 'message') listeners.delete(listener); },
};
const emit = (data, origin = 'https://game.example', source = parent) => {
  for (const listener of listeners) listener({ data, origin, source });
};
const client = createPocketOperationClient({ parentOrigin: 'https://game.example', windowLike, timeoutMs: 100 });
const resultPromise = client.request({ type: 'boatSelection', selectedBoatId: 'sloop' });
assert.equal(sent.at(-1).message.type, PIRATE_OPERATION_REQUEST_MESSAGE);
assert.equal(sent.at(-1).targetOrigin, 'https://game.example');
assert.deepEqual(sent.at(-1).message.operation, { type: 'boatSelection', selectedBoatId: 'sloop' });
const id = sent.at(-1).message.requestId;
emit({ type: PIRATE_OPERATION_REPLY_MESSAGE, requestId: id, ok: true, revision: 4, persisted: { selectedBoatId: 'sloop' }, outcome: { changed: true } }, 'https://wrong.example');
let settled = false; resultPromise.then(() => { settled = true; });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(settled, false, 'wrong origin must not resolve the request');
emit({ type: PIRATE_OPERATION_REPLY_MESSAGE, requestId: id, ok: true, revision: 4, persisted: { selectedBoatId: 'sloop' }, outcome: { changed: true } });
assert.deepEqual(await resultPromise, { revision: 4, persisted: { selectedBoatId: 'sloop' }, outcome: { changed: true } });
await assert.rejects(client.request({ type: 'save', token: 'must-not-cross-frame' }), /PIRATE_OPERATION_INVALID/);
await assert.rejects(client.request({ type: 'save', value: 'x' }).then(() => { throw new Error('unexpected'); }), error => error.code === 'PIRATE_OPERATION_TIMEOUT');
client.dispose();
assert.equal(listeners.size, 0);
assert.equal(sanitizePirateOperation({ type: 'save', nested: { authorization: 'secret' } }), null);
assert.throws(() => createPocketOperationClient({ parentOrigin: 'null', windowLike }), /PIRATE_PARENT_ORIGIN_INVALID/);
console.log('PASS Pirate parent operation RPC client');
