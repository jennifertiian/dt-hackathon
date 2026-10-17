import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const account = 'homeroom';
const destination = `${account}@ssh-${account}.alwaysdata.net`;
const sshArgs = ['-i', path.join(os.homedir(), '.ssh/id_ed25519'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes'];
const release = new Date().toISOString().replace(/[^0-9]/g, '');
const remoteRelease = `/home/${account}/homeroom-releases/${release}`;
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'homeroom-deploy-'));
fs.chmodSync(stage, 0o700);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}
try {
  const local = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
  const configPath = path.join(root, '.env.always');
  const configured = fs.readFileSync(configPath, 'utf8').replace(/^(APP_ORIGIN|DATA_DIR)=(.*)$/gm, (_, key, value) => `${key}=${value.replaceAll('ACCOUNT', account)}`);
  fs.writeFileSync(configPath, configured, { mode: 0o600 });
  fs.chmodSync(configPath, 0o600);
  const config = parseEnv(configured);
  if (config.APP_ORIGIN !== 'https://homeroom.alwaysdata.net' || config.DATA_DIR !== '/home/homeroom/homeroom-data') throw Error('Check APP_ORIGIN and DATA_DIR in .env.always.');
  if (config.AUTH_MODE !== 'mixed' || config.DEMO_MODE !== '1') throw Error('The hackathon deployment requires AUTH_MODE=mixed and DEMO_MODE=1.');
  if (!config.ADMIN_USERNAME || !config.ADMIN_PASSWORD) throw Error('Configure initial administrator credentials before deploying.');
  const allowed = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'APP_ORIGIN', 'AUTH_MODE', 'DATA_DIR', 'DEMO_MODE', 'NODEJS_VERSION'];
  const deployed = Object.fromEntries(allowed.filter(key => config[key] !== undefined).map(key => [key, config[key]]));
  if (local.CHATGPT_API_KEY) deployed.CHATGPT_API_KEY = local.CHATGPT_API_KEY;
  if (local.GLASSER_API_KEY) deployed.GLASSER_API_KEY = local.GLASSER_API_KEY;
  for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
    if (!(config[key] || local[key])) throw Error(`Configure ${key} before deploying Google sign-in.`);
    deployed[key] = config[key] || local[key];
  }
  for (const relative of ['index.html', 'package.json', 'server', 'src', 'art/assets', 'art/hallway_noclock_native.png']) {
    const target = path.join(stage, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, relative), target, { recursive: true });
  }
  fs.writeFileSync(path.join(stage, '.env'), Object.entries(deployed).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 });
  fs.writeFileSync(path.join(stage, 'deployment.json'), JSON.stringify({ release, commit: run('git', ['rev-parse', 'HEAD']).trim(), indexSHA256: createHash('sha256').update(fs.readFileSync(path.join(stage, 'index.html'))).digest('hex') }, null, 2) + '\n');
  const archive = path.join(stage, 'bundle.tgz');
  run('tar', ['-czf', archive, '-C', stage, 'index.html', 'package.json', 'server', 'src', 'art', '.env', 'deployment.json'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const remoteArchive = `/home/${account}/.homeroom-${release}.tgz`;
  run('scp', [...sshArgs, archive, `${destination}:${remoteArchive}`]);
  const setup = `set -eu
umask 077
mkdir -p '${remoteRelease}' /home/homeroom/homeroom-data
tar -xzf '${remoteArchive}' -C '${remoteRelease}'
chmod 600 '${remoteRelease}/.env'
cd '${remoteRelease}'
NODEJS_VERSION=24 node -e 'const {DatabaseSync}=require("node:sqlite"); const db=new DatabaseSync(":memory:"); console.log("Node",process.version,"SQLite ready"); db.close();'
ln -s '${remoteRelease}' '/home/homeroom/.homeroom-next-${release}'
mv -Tf '/home/homeroom/.homeroom-next-${release}' /home/homeroom/homeroom
unlink '${remoteArchive}'
printf 'Activated release ${release}\\n'
`;
  process.stdout.write(run('ssh', [...sshArgs, destination, 'sh -s'], { input: setup }));
  console.log('Restart the homeroom site in alwaysdata, then verify https://homeroom.alwaysdata.net/api/health');
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
