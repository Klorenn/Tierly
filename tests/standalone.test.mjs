import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
test('standalone deploy routes preserve root, OAuth and admin entry points', async () => {
 const config = JSON.parse(await readFile('vercel.json', 'utf8'));
 for (const route of ['/', '/tierly', '/admin/event', '/admin/event/']) {
  assert.ok(config.rewrites.some(r => r.source === route && r.destination === '/tierly/index.html'));
 }
 assert.ok(config.redirects.some(r => r.source === '/ops/tierly' && r.destination === '/ops/tierly/' && r.permanent));
 assert.ok(config.rewrites.every(r => !r.source.includes('merch') && !r.source.includes('resources')));
});
test('local server serves standalone routes and assets without exposing backend source', async t => {
 const server = spawn(process.execPath, ['scripts/dev-server.mjs'], {env: {...process.env, PORT: '18981'}});
 let stderr = ''; server.stderr.on('data', chunk => { stderr += chunk; });
 t.after(() => server.kill());
 await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`server exited ${code}: ${stderr}`))); });
 const redirect = await fetch('http://127.0.0.1:18981/ops/tierly', {redirect: 'manual'});
 assert.equal(redirect.status, 308);
 assert.equal(redirect.headers.get('location'), '/ops/tierly/');
 const preview = await fetch('http://127.0.0.1:18981/ops/tierly?preview=1', {redirect: 'manual'});
 assert.equal(preview.headers.get('location'), '/ops/tierly/?preview=1');
 const page = await fetch(new URL(redirect.headers.get('location'), redirect.url));
 const html = await page.text();
 for (const relative of ['styles.css', 'config.js', 'app.js']) {
  assert.ok(html.includes(relative));
  assert.equal((await fetch(new URL(relative, page.url))).status, 200);
 }
 for (const path of ['/', '/tierly', '/admin/event/', '/ops/tierly/','/tierly/ranks.mjs','/hub/logos/tellus-logo-full.svg']) {
  const response = await fetch(`http://127.0.0.1:18981${path}`);
  assert.equal(response.status, 200, path);
 }
 for (const path of ['/supabase/config.toml', '/discord-bot/index.js', '/.git/config']) {
  assert.equal((await fetch(`http://127.0.0.1:18981${path}`)).status, 404, path);
 }
});
