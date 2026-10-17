# alwaysdata hackathon deployment

URL: https://homeroom.alwaysdata.net/

The `homeroom` alwaysdata Free account hosts one Node 24 website. SQLite and processed PNG uploads remain in `/home/homeroom/homeroom-data`, outside versioned code releases. No database migration, object store, Docker image or runtime npm dependencies are needed. Free account limits are 1 GB disk and 256 MB RAM; it is for personal, noncommercial use.

## Configure once

Register the local `~/.ssh/id_ed25519` public key on the existing alwaysdata SSH user. The deploy command uses that identity with batch authentication and strict known-host checking.

Keep deployment configuration in ignored `.env.always`:

```dotenv
APP_ORIGIN=https://homeroom.alwaysdata.net
DATA_DIR=/home/homeroom/homeroom-data
AUTH_MODE=mixed
DEMO_MODE=1
NODEJS_VERSION=24
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-private-initial-password
```

The script requires `AUTH_MODE=mixed` and `DEMO_MODE=1`, and copies the allowlisted app settings, `CHATGPT_API_KEY`, optional `GLASSER_API_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the ignored local env files. SSH credentials, real rosters, local databases and uploads are excluded. The Google OAuth client must allow `https://homeroom.alwaysdata.net/auth/google/callback` (registered on the current client). Sign-in requests only `openid email profile` and verifies Berkeley email/domain claims. The separate directory utility is not deployed as a public interface.

Saved Google users and their per-person, per-day generated people, questions, answers, conversations and sample-note schedules use the persistent database. Complete mock sessions use isolated in-memory databases and inline upload sources, never disk. Their browser token is not stored in cookies or browser storage; reload/exit ends the run, with 30-minute idle expiry as a cleanup fallback. Up to 16 mock sessions and 8 MiB of encoded mock upload data per session fit the small free host. Existing remote data is retained; changing admin environment variables does not reset an initialized database's admin account.

In alwaysdata **Web → Sites**, configure the existing `homeroom.alwaysdata.net` site:

- Type: Node.js; Node version: 24.
- Command: `node /home/homeroom/homeroom/server/app.cjs`.
- Working directory: `homeroom/` (under `/home/homeroom/`).
- Keep the provider-supplied `IP` and `PORT`; do not override them with localhost settings.
- Enable Force HTTPS. Leave hot restart unsupported; the app handles SIGTERM/SIGINT shutdown.

The app reads `.env` from its release directory. The listener uses `IP`, then `HOST`, then local `127.0.0.1`. Secure cookies are selected using `APP_ORIGIN`.

## Deploy or update

```sh
npm run build
npm test
npm run typecheck
npm run deploy:alwaysdata
```

The deployment script uploads an explicit runtime file list into a private timestamped release directory, writes secrets with mode 0600, verifies the remote Node/SQLite runtime, and atomically switches `/home/homeroom/homeroom` to the new release. Previous releases and persistent data remain intact. The script never prints secret values. Run the checks before uploading; the deploy command does not run them automatically.

Then click **Restart** on the site in the alwaysdata dashboard. Loading `/api/health` starts the app if needed. Verify the homepage, sign-in and `/api/events`; use the same browser session after a restart to verify persistence. Check that Google sign-in and Complete mock mode are the only login choices, the mock starts fresh after reload, and skip-day leaves a second account unchanged. `deployment.json` in each release records its timestamp, source commit and generated-page hash and is not exposed by the web routes.

To roll back code, switch the `homeroom` symlink to a previous release and restart the site. This does not roll back database records. Future incompatible schema changes need a separate backup/migration plan.

Releases retain their private configuration and consume account storage. Remove obsolete releases deliberately when needed, keeping the active release and persistent data. Local development, generated frontend mocks and the directory setup utility remain separate; no real directory export is deployed.

Spotify search uses the optional server-only `GLASSER_API_KEY`. The release script includes it from local `.env` when supplied; it is separate from `CHATGPT_API_KEY` and searches spend Glasser credits. The integrated app uses the existing Node service, with no Bun service or additional port.
