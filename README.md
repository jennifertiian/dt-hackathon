# homeroom ✿

Find your people in a big school. Personalize a locker, answer the daily quiz, meet eight locker neighbors, and start a conversation by leaving a private note. A note opens a conversation immediately; its recipient can open it and choose whether to reply.

Built for DiversaTech's *Build Something AI Cannot Do Alone @ Cal* hackathon.

## Authoritative references

The product contract lives in this repository:

- [Product behavior and scope](docs/product.md)
- [Shared record types](src/types.ts)
- [Data relationships, storage and API contracts](docs/data-model.md)
- [Accepted backend decisions and remaining setup](docs/backend-questions.md)

Keep these references aligned with accepted changes. Google Docs is a downstream copy to update at the end of an authorized workstream. Current work stays local.

## Run the application

Requires **Node.js 22.13 or newer** for built-in SQLite and Python 3 for rebuilding the frontend. This workstream runs on Node 26. SQLite may print an experimental-feature notice on some supported Node versions.

```sh
npm install
npm run build
npm start
```

Open [Homeroom](http://localhost:3000/). The application persists profiles, lockers, larger PNG photo sources, quizzes/answers, groups and conversations in ignored `data/`. Local demo mode gives newly completed lockers eight neighbors immediately, using Luna low to generate similar interest/answer variants, with deterministic fallback. Fictional identities remain internally flagged but have no repeated profile labels. `DEMO_MODE=0` restores next-midnight enrollment. SSE updates messages and other changes immediately; fictional demo neighbors send canned replies.

The login offers saved **Google sign-in** for verified `@berkeley.edu` accounts, or **Complete mock mode** with a made-up Berkeley email. Mock profiles, answers, matches, notes and uploads live only in memory and disappear on reload. Google sign-in saves them in SQLite. Production uses `AUTH_MODE=mixed` and `DEMO_MODE=1`: both modes get eight synthetic neighbors personalized by Luna from their onboarding and answers. Google uses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the callback `/auth/google/callback` on the app's public origin. The organization directory UI remains hidden.

Use **skip to next day** after publishing a locker to advance only your own date, answer a new question and meet eight new generated people. Your saved history and other accounts are unaffected. Personalized notes arrive every 30 seconds, capped at four unopened locker notes and four introductory notes per person/day.

The first object in the locker editor is a **music cassette**. Click or drag it in, search for a Spotify track, select a song and add an optional 120-character story. Move, resize, rotate, flip, replace or remove the cassette like other objects. Song edits take effect when you finish with the locker’s **save changes** button. Google accounts retain them; complete mock discards them on reload/reset. Click any saved cassette to open Spotify’s official player. Fictional neighbors have preset songs; playback availability is controlled by Spotify.

The bottom-left button resets and discards a complete mock run. For Google sessions it signs out while preserving the account's history. Standalone file mode remains a separate offline demonstration.

Local configuration is read from ignored `.env`; see [.env.example](.env.example) for names. Keep `CHATGPT_API_KEY` server-side. Questions use **gpt-6-luna with low reasoning only**. Existing dated fixtures are retained; missing questions are generated once, with a marked deterministic fallback if the API is unavailable. Set optional `GLASSER_API_KEY` on the server to enable Spotify song search through Glasser; searches spend Glasser credits. See [question generation](docs/question-generation.md).

There is no admin panel. API-only operations use username/password sign-in. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` before the first startup, or find generated credentials in ignored `data/admin-login.json`. Credentials are established when the local database is created; changing environment variables does not reset an existing account. Use `npm run admin -- status`, `npm run admin -- simulate 1`, `npm run admin -- simulate today`, or `npm run admin -- import-directory`. See [API routes](docs/data-model.md#http-and-live-updates) for details.

### Directory setup

```sh
npm run directory
```

Open [directory setup](http://127.0.0.1:8878/) for Google OAuth configuration, a Berkeley directory import attempt, or a labeled mock roster. The directory callback is `http://127.0.0.1:8878/oauth/callback`, separate from application sign-in. Directory listing needs Google Workspace permissions; a Berkeley email alone may not suffice. The page saves an ignored `data/directory-roster.json` file; the server loads that roster on startup (or uses a mock roster when none is saved). Run `npm run admin -- import-directory` to load a new roster without restarting. See [directory instructions](docs/directory.md).

Local development requires no hosted services. The hackathon deployment runs at [homeroom.alwaysdata.net](https://homeroom.alwaysdata.net/) on alwaysdata with SQLite and uploads in persistent account storage. See [deployment instructions](docs/deployment.md). `.env`, credentials, uploaded files, the database and real roster data stay out of Git. Invitations are recorded without email delivery.

### Standalone frontend

Open `index.html` directly for the self-contained in-memory demonstration, with no server needed. Add `#hallway` to skip onboarding with an example profile. This standalone mode resets on reload and is separate from the persistent served app. Preset cassette playback works through Spotify when online; song search requires signing in to the served app. The interface includes onboarding, avatar/locker editing, photo/sticker uploads, typed quizzes and history, private notes and unified DMs; customization follows the current frontend controls.

## Develop and verify

```sh
npm run build
npm test
npm run typecheck
```

Interaction tests execute the generated page in an isolated DOM with stubbed canvas output. They check flows and records, not raster rendering or visual layout. Backend tests cover database persistence and authorization, typed answers, daily matching, messaging, HTTP/SSE, safe AI generation and directory import. Test network requests are faked unless an explicit live smoke check is requested. Rebuild before testing source changes.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/types.ts` | Authoritative product record declarations and scoped client state. |
| `docs/` | Product behavior, invariants, operational setup and remaining decisions. |
| `server/app.cjs` | Local HTTP application, cookie sessions, admin operations and SSE. |
| `server/store.cjs` | SQLite persistence, validation and deterministic daily matching. |
| `server/spotify.cjs` | Private Glasser Spotify search, provider normalization, caching and retries. |
| `src/music.js`, `src/music.css` | Cassette picker and official Spotify player; bundled into the generated page. |
| `server/questions.cjs` | Luna low daily questions and marked offline fallback. |
| `server/demo-neighbors.cjs` | Luna low preference/answer variants for immediate demo groups. |
| `server/directory-server.cjs` | Separate local Google directory setup/import utility. |
| `src/remote-model.js` | Same-origin persistent frontend adapter. |
| `src/demo-model.js` | Complete in-memory fixtures and standalone interactions. |
| `src/index.template.html` | Hallway, locker viewer, conversations, styles and visual people fixture. |
| `src/flows.template.html` | Onboarding, locker editor, sprite maker, typed quizzes and private notes. |
| `art/build.py` | Bundles templates, models and sprite data into `index.html`. |
| `art/assets.py`, `art/flow_assets.py`, `art/hallway.py` | Current art generators. |
| `art/assets/`, `art/hallway_noclock_native.png` | Art inputs used by the page build. |
| `index.html` | Generated, committed runnable frontend; edit its sources and rebuild. |
| `tests/` | Product-record, frontend, backend and integration checks. |

To change example profiles/art placement, edit the `PEOPLE` fixture in `src/index.template.html`. Quiz examples and normalized records live in `src/demo-model.js`. Existing SQLite data is not reseeded on restart. After any source change, rebuild the generated page.

To redraw the application art, install Pillow in your Python environment, then run:

```sh
python3 art/assets.py
python3 art/flow_assets.py
NOCLOCK=1 python3 art/hallway.py art/hallway_noclock
python3 art/build.py
```

Artwork uses a centered 480×270 design stage, scaled proportionally to fit the browser viewport with pixelated rendering. The surrounding background is white. The palette uses soft sage, cream and warm wood with warm-brown outlines.
