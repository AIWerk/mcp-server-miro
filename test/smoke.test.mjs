#!/usr/bin/env node
// Smoke test: spawn the built server over stdio, run initialize + tools/list.
// Requires no real Miro token — tool registration must not need network access.
import { spawn } from 'node:child_process';
import assert from 'node:assert';

const child = spawn(process.execPath, ['build/index.js'], {
  env: { ...process.env, MIRO_ACCESS_TOKEN: 'dummy-for-smoke-test' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const responses = [];
child.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) try { responses.push(JSON.parse(line)); } catch {}
  }
});

const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'smoke', version: '0.0.0' } } });

const deadline = Date.now() + 15000;
const wait = (pred) => new Promise((res, rej) => {
  const t = setInterval(() => {
    const hit = responses.find(pred);
    if (hit) { clearInterval(t); res(hit); }
    else if (Date.now() > deadline) { clearInterval(t); rej(new Error('timeout')); }
  }, 50);
});

try {
  const init = await wait(r => r.id === 1);
  assert.ok(init.result?.serverInfo?.name, 'initialize returns serverInfo');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const tools = await wait(r => r.id === 2);
  const n = tools.result?.tools?.length ?? 0;
  assert.ok(n >= 50, `expected >=50 tools, got ${n}`);
  console.log(`OK: initialize + tools/list — ${n} tools registered`);
  process.exit(0);
} catch (e) {
  console.error('SMOKE FAIL:', e.message);
  process.exit(1);
} finally {
  child.kill();
}
