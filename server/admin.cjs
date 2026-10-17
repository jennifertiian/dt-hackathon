/* Local administrator CLI. Passwords are sent only to the loopback app and never printed. */
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv } = require('./app.cjs');
async function main() {
  loadEnv();
  const dir = path.resolve(__dirname, '..', process.env.DATA_DIR || 'data');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(path.join(dir, 'admin-login.json'), 'utf8')); } catch {}
  const origin = `http://localhost:${Number(process.env.PORT || 3000)}`;
  const auth = await fetch(origin + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ Username: process.env.ADMIN_USERNAME || saved.username, Password: process.env.ADMIN_PASSWORD || saved.password }) });
  if (!auth.ok) throw Error('Administrator sign-in failed. Check your local administrator credentials.');
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  const [command = 'status', argument] = process.argv.slice(2);
  const routes = { status: ['/api/admin/status', 'GET'], simulate: ['/api/admin/simulate', 'POST', { Day: argument || 1 }], generate: ['/api/admin/questions/generate', 'POST', { Day: argument || 1 }], 'import-directory': ['/api/admin/directory/import', 'POST', {}] };
  if (!routes[command]) throw Error('Use status, simulate <date|day|offset|today>, generate <date|offset>, or import-directory.');
  const [route, method, payload] = routes[command];
  const response = await fetch(origin + route, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Administrator request failed.');
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(e => { console.error(e.message.startsWith('Administrator') || e.message.startsWith('Use ') ? e.message : 'Request failed. Check that the local server is running.'); process.exitCode = 1; });
