# Backend decisions and remaining setup

Backend implementation is authorized. The repository is authoritative; Google Docs is a downstream mirror. Implementation stays in the repository; the alwaysdata deployment is authorized.

## Accepted decisions

- SQLite with per-record JSON and relational identities/constraints, both locally and on the authorized alwaysdata hackathon deployment. A managed PostgreSQL migration can follow; it is not needed for this deployment.
- Minimum onboarding remains name, major, year, an interest or hobby, and one placed locker item with a title and description. Users add more through their locker.
- Local demo publication gives immediate neighbors: Luna low generates full fictional profiles and personalized introductory notes from supplied onboarding context and quiz answers, with deterministic fallback. Minimum profile and locker-item requirements remain. Outside demo mode, publication still waits until the next Berkeley midnight. IsDemo stays internal; individual profile labels are omitted.
- A locker note immediately creates the pair's only conversation. No acceptance, missed-notes inbox or expiry. Unopened notes stay in the locker across midnight; reading clears unread status but retains DM history. Old notes remain replyable. Badges count unread messages and all messages allow 200 characters. Demo profiles can send canned replies.
- Remote artwork, Mittens, name tags, photo enlargement and new hairstyles are accepted. Exterior sticker controls are removed; existing interior artwork, placements and saved hairstyles remain supported. The server's active clock drives the countdown. Likes stay excluded, quizzes keep their three types and same-day revisions, and matching text uses the actual backend reason.
- `berkeley.edu` is the directory domain. A mock roster is acceptable when Google permissions are unavailable.
- Username/password administrator authentication is sufficient for local operations. No admin panel; question generation uses Luna low and the existing three question types.
- Use `CHATGPT_API_KEY` from ignored `.env`, **`gpt-6-luna` and low reasoning only**. Do not substitute another model. Glasser is not used for question generation. Spotify song search uses the separate server-only `GLASSER_API_KEY`.
- Spotify cassette edits use the locker’s final save button. Google saves them in SQLite; complete mock keeps them in memory. Keep Glasser-powered song search and Spotify’s official player, with one cassette and preset songs for fictional neighbors.
- REST JSON with SSE notifications provides instant updates. Day simulation accepts a calendar date, day name or day-number offset.

## Remaining setup, not implementation blockers

1. **Google OAuth:** The local client credentials are configured, and the directory OAuth flow returned from Google, but the directory request was forbidden. Nine explicitly fictional directory records have been saved and imported as the accepted fallback. Real directory access still needs the appropriate Google API configuration and Workspace permissions. App sign-in is a separate flow and requires registering `http://localhost:3000/auth/google/callback` on the OAuth client. The [directory setup page](http://127.0.0.1:8878/) remains available for another import attempt.
2. **Hosting:** alwaysdata Free, account `homeroom`, Node 24 and persistent account storage. `.env.always` selects `AUTH_MODE=mixed` and `DEMO_MODE=1`. Google sign-in and complete in-memory mock mode share personal Luna-generated cohorts. The deployed Google callback is registered. Organization directory listing remains hidden. See [deployment.md](deployment.md).

See [product.md](product.md), [data-model.md](data-model.md), [directory.md](directory.md), and [question-generation.md](question-generation.md) for implemented behavior and operational limits.
