# Homeroom product specification

This repository is the authoritative reference for the application. This file defines behavior; [types.ts](../src/types.ts) defines record shapes; [data-model.md](data-model.md) defines record relationships and invariants. Changes to an agreed behavior must update the relevant local references in the same workstream. Google Docs is a downstream mirror to update at the end of a workstream, not a dependency during implementation.

## Scope and implementation status

Homeroom helps Berkeley students meet people through personalized lockers, a daily shared cohort, and private conversations. The local served application persists records in SQLite, stores uploads locally, authenticates sessions, generates dated quizzes and publishes midnight cohorts. JSON REST mutations and SSE notifications keep signed-in clients current. The standalone generated page retains an in-memory mock mode; opening it directly resets data on reload.

Backend implementation and the alwaysdata hackathon deployment are authorized. The hosted app uses the same SQLite, JSON REST and SSE behavior as the local served app. Remaining optional setup is recorded in [backend-questions.md](backend-questions.md).

## Sign-in, directory and invitations

- The login page has two choices: **Sign in with Google**, using a verified `@berkeley.edu` identity and saving the profile/history, or **Complete mock mode**, using any made-up `@berkeley.edu` email without verification. Google sign-in requests only `openid email profile`; organization directory access is hidden and the `/directory` application route returns 404.
- Complete mock sessions use isolated in-memory SQLite stores and memory-only uploads. They cannot read or mutate saved accounts, even if a Google session cookie is present. The browser keeps its mock token only in memory and discards the run on reload/exit; idle server sessions expire after 30 minutes. No mock profile, answer, match, message or upload is written to the persistent database or disk. Google sessions use the normal HttpOnly cookie and durable database.
- Production uses `AUTH_MODE=mixed` with `DEMO_MODE=1`: Google identity is real, while each person's eight neighbors are generated fictional people. Real registered accounts are never matched together in this mode.
- The backend should support a complete organization roster where authorized Google Workspace directory access is available. A mock roster is acceptable otherwise. Directory membership, app registration, and matching eligibility are separate concepts.
- Directory members who have not registered do not have an app profile and never appear in matches.
- Invitations only invite someone to join the app. They create no friendship, mutual relationship, referral score, or matching signal. The local app records invitations without sending email.
- The directory domain is `berkeley.edu`. The separate local directory setup page supports Google permission and import, or an explicitly labeled fictional roster. Real Google access requires suitable Workspace directory permissions; an email account alone does not confer them. A complete real roster must not be sent to ordinary clients. See [directory.md](directory.md).

## Onboarding and publication

Users configure their profile, avatar and locker before joining matching. `OnboardingStatus` starts as `draft`; unfinished users do not participate. Publishing changes it to `live`.

The minimum is a name, major, year, at least one interest or hobby, and at least one placed item with a nonempty title and description. Additional profile and locker customization remains available through the locker editor.

On first publication outside demo mode, the server sets `EligibleFrom` to the next calendar date in `America/Los_Angeles`. Local demo mode gives a completed user a cohort immediately, setting eligibility to the active date. Editing a live profile preserves eligibility. A draft has `EligibleFrom = null`. Minimum publication requirements apply in both modes.

In demo matching mode (`DEMO_MODE=1`), a completed user gets eight fictional locker neighbors immediately in a personal, dated `demo_preview` group. Luna low generates complete fictional profiles, including names, majors, classes, interests, hobbies and personal details, from the viewer's supplied onboarding context and latest submitted quiz answer. The real viewer's name/email, directory, messages and images are excluded from model input. Fictional profiles have distinct identities, valid existing artwork and coherent locker descriptions. Similar deterministic profiles appear immediately while Luna enriches the same identities in the background; generation provenance is retained.

Each person/day gets its own group and new synthetic identities. Midnight creates a fresh set; the **skip to next day** button advances only the current person's clock, ensures the next dated question, creates new neighbors and opens that quiz. Other users keep their dates and cohorts. Saved Google accounts retain their own day offset, generated people, groups, quiz answers, uploads and conversations in SQLite across sign-ins and restarts. Mock sessions use exactly the same matching behavior in memory. Previous synthetic names are supplied to Luna to encourage fresh identities. Same-day profile/answer revisions personalize the existing day's people instead of discarding conversations. `DEMO_MODE=0` retains the separate shared matching behavior below.

## Profile and appearance

Profile fields are name, pronouns, major, year, MBTI, interests, classes, food spot, study spot, hobbies, musical artist and fun fact. Interests, classes and hobbies are lists in stored metadata; the form uses comma-separated text. Other current fields are text. Door tags and profile-card labels are derived presentation data.

All customization follows the current frontend:

- A 24×24 procedural avatar with eyes, mouth, hair style, skin color, hair color, shirt color, background color and blush. Shirt shape and background shape are fixed. Randomization changes the same settings.
- Fourteen interior wallpaper patterns and five exterior color presets. Exterior sticker controls are removed; first names on doors are derived from profile metadata. Legacy exterior data remains readable for compatibility and is cleared by the current editor on save.
- Interior photos, stickers and flat objects; uploaded images can become pixel Polaroids or stickers. Uploaded photos retain a larger processed PNG as the media source and derive pixel thumbnails from it; clicking a photo enlarges that source. The upload bank retains assets even when no placement uses them. Existing stickers, placement sizes and saved hairstyles remain supported alongside the remote additions.
- Every placed copy has its own title and description. Asset-bank titles/descriptions are defaults copied when an item is added.
- One optional Spotify cassette per locker, with an optional story of up to 120 characters. Adding, changing, transforming or removing it stays in the editor draft until the locker’s final save/publish action. Google sessions save its track and placement in SQLite; complete mock and standalone sessions keep them only in memory and discard them on reload/reset. The full song title/artist are retained separately from the short placement label. A cassette with a nonempty story can satisfy the existing titled-item publication requirement.
- Song search uses the existing Node backend and Glasser ScrapeCreators Spotify endpoint, with the server-only `GLASSER_API_KEY`. Both Google and complete mock sessions can search. Searches spend Glasser credits, share identical pending requests and use a ten-minute public-result cache. The app embeds Spotify’s official player only after a cassette is clicked; it never downloads or serves audio. Fictional neighbors use preset songs. Standalone mode supports preset playback but has no search backend.
- Drag, remove, resize, rotate and flip horizontally. Uploaded photos have three fixed Polaroid sizes. Insertion order determines stacking; some objects snap to a shelf or floor.
- Sticky notes, whiteboards and schedules are images with descriptions. There is no free text board editor, drawing surface, vertical flip, layer-order control, custom frame picker, or true 3D object.

Adding a new customization capability requires an explicit product change, corresponding type changes, and frontend support.

## Daily quizzes and administration

There is one question per Berkeley calendar date. Each question has exactly one type:

| Question type | Submitted answer | Empty submission |
| --- | --- | --- |
| `MultipleChoice` | One valid choice ID | Invalid |
| `Checkbox` | A distinct set of valid choice IDs | An empty set is valid |
| `ShortResponse` | Nonempty text | Invalid |

A multiple-choice question cannot accept an alternative text answer. Choice IDs belong to their question. An unanswered question differs from a submitted checkbox answer with zero selections. History is derived from question and answer records, including questions a person did not answer. No fabricated similar-answer count is displayed.

There is no admin panel. The backend ensures today's and tomorrow's questions, preserving any existing dated question. It uses **`gpt-6-luna` with low reasoning only**, a strict schema and no personal user data. An unavailable API produces an identified deterministic fallback; it never switches models. See [question-generation.md](question-generation.md).

Username/password administrator sessions authorize operational JSON endpoints for status, missing-question generation, saved directory import and day simulation. Initial credentials are configured through environment variables or generated in ignored `data/admin-login.json`. Admin endpoints do not permit arbitrary question types. A new input type requires a type, renderer and validator in code. Day simulation accepts a date, a weekday name or a number of days relative to today, and persists until reset.

## Shared daily cohorts

Use `America/Los_Angeles` for all quiz dates, cutoffs and group dates. A group is active from one local midnight to the next, including daylight-saving transitions. Groups refresh at midnight, never at 7 a.m.

Each group has nine distinct live profiles: eligible registered people and fictional fillers when needed. Each real member sees the same cohort, with their own locker centered and the other eight around it. Missing a quiz does not make an otherwise eligible user ineligible. Refreshing cohorts preserves locker contents, uploaded assets, quiz history, conversations and messages. Fictional profiles retain `IsDemo = true` internally; individual profile labels are omitted in the demo UI. Importing a directory identity never creates a fictional application profile.

The SQLite backend runs the following deterministic baseline. It checks for a new Berkeley day while running and catches up the active day on startup; it does not require a separate hosted scheduler. Approximate/demo scoring is acceptable for the POC.

1. At the midnight cutoff for day D, take one consistent snapshot of live users with `EligibleFrom <= D`, excluding linked suspended directory identities. For each person, select their answered quiz with the latest QuizDay on or before D−1 whose AnsweredAt precedes the cutoff. Store its question ID in that person's matching input; store null if they have never answered. Use metadata from the same snapshot.
2. Sort unassigned users by source quiz date descending, then PersonID ascending, with unanswered users last. Choose the first as seed. Rank remaining users by same nonempty source question first, then answer similarity descending, profile similarity descending, and PersonID ascending. Assign the top eight with the seed and repeat.
3. Within one source question, multiple choice scores exact equality; checkboxes score Jaccard overlap of distinct selected choices. Two empty checkbox sets score 1. Short responses use lowercase word sets after replacing punctuation with spaces; Jaccard overlap scores similarity, with two empty word sets scoring 0. Different source questions and missing answers score 0.
4. Compare metadata keys present for both people and validated against the same property definition. Primitive values score equality, lists use Jaccard overlap of distinct values (two empty lists score 1), and records recursively average comparable fields. Structured list values compare recursively by content, ignoring map-key order. Average comparable top-level keys; use 0 when none exist.
5. Find repeated answer signals supported by at least two group members answering the same source question. Choose greatest support, breaking ties by source quiz date descending, question ID ascending, then choice ID or normalized word ascending. Theme is that source question's prompt. Reason states the actual count and selected label or mentioned word. If there is no shared signal, use “Daily neighbors” and a neutral explanation. Never claim that everyone shared an answer unless supported.
6. Publish a complete assignment together, with one group per eligible person, yesterday's scheduled question ID, actual per-person matching inputs, theme and reason. A retry for the same date must replace or reuse that assignment without duplicate active memberships.

If fewer than nine real users remain, rank complete demo templates by the same similarity signals and create distinct fictional copies to fill the cohort. Their example answers remain linked to their actual source questions. A missing yesterday question is supplied by a deterministic built-in fallback. A published date is reused on repeat runs without adding memberships. Newly finished users wait for their eligible date outside the immediate demo flow. Demo templates alone do not produce groups. The countdown uses `ServerNow` and `NextRefreshAt` from the server's active day, including simulation, rather than assuming a fixed PST offset.

The hallway keeps a persistent “matched by” card showing `MatchGroup.Reason`. Luna low writes a short explanation (up to 120 characters) grounded in the actual shared preferences or quiz answers. For demo previews it is generated alongside the similar neighbors; for scheduled groups Luna receives only the group's theme and aggregate matching evidence. No identities, private messages or other users' raw records are sent. Generation runs in the background and is cached; the deterministic matching explanation is displayed immediately and retained on failure. It changes wording, never membership or matching scores.

## Notes and conversations

A first locker note creates a conversation immediately. Opening it is not accepting it; the recipient may choose whether to respond. There is exactly one conversation per unordered pair of people. Its first message is a `locker_note`; all later messages in either direction are `direct_message` records.

Sent and received messages use the same records and the same conversation history. Mailboxes query conversations involving the current person. The prototype no longer has separate sent-note and received-note stores.

Each message starts with `IsOpened = false`. Only its recipient changes this to true. Opening a locker note from either the locker or the DM view hides that same note from the unread locker display. The record remains in DM history. There are no read timestamps, acceptance/rejection states or expiry times.

Only the owner sees the note stack on their own locker. Visitors never see another person's received notes. Unread locker notes are messages whose type is `locker_note`, recipient is the current person, and `IsOpened` is false. Conversation unread badges also include unopened direct messages.

All messages allow 200 characters. Messages sort by creation timestamp, then message ID. Creating a new daily group never removes a conversation. The inbox is one linear conversation list, ordered by latest message. Reading a note clears that message's unread status and its contribution to the unread-message badge, but keeps it in DM history. Unopened notes remain in the owner's locker across midnight; there is no separate missed-notes inbox. Existing conversations, including an old unopened locker note, remain replyable after cohort changes. Only the first locker note can initiate a conversation; no arbitrary new-DM entry point is exposed.

In demo matching mode, fictional neighbors also leave personalized introductory locker notes. Luna writes each note from supplied profile preferences or quiz answers. Notes arrive one every 30 seconds after the cohort is ready, with at most four sample introductions per person/day and at most four unopened locker notes across days. Reading notes never causes an endless same-day refill; the cadence and sent count survive restarts for saved accounts. The same cadence and cap apply to the isolated complete mock.

In demo mode, messages sent to fictional profiles receive delayed canned replies through the same message records and SSE updates. Real profiles never receive automatic replies on their behalf. The standalone demo uses the same behavior in memory.

## Restarting a demo

The bottom-left reset button is available throughout demo onboarding and the hallway. For complete mock mode it ends and discards the in-memory run, returning to sign-in. For a saved Google account it is a **sign out** button: profile, day offset, answers, matches, uploads and conversations remain saved for the next sign-in. An anonymous or standalone reset reloads at sign-in. The older local reset API remains available for explicit test-run retirement; it is not used to reset saved Google accounts from the UI.

## Excluded features

Likes/reactions, friendships/mutuals, theme guessing, rewards, leaderboards, freehand drawing and true 3D objects are outside the agreed scope. Join invitations are in scope and have no social-graph significance.
