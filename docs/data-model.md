# Shared data model

[src/types.ts](../src/types.ts) is the authoritative declaration of record shapes. This document specifies relationships, units and validation rules that TypeScript alone cannot enforce. [product.md](product.md) specifies behavior. The served implementation stores per-record JSON in SQLite with relational identities and returns PascalCase product fields through JSON REST endpoints.

## Conventions

- IDs are nonempty strings; references resolve to existing records. IDs are unique within their record collection. The same choice ID may occur in different questions.
- Timestamps are UTC instants serialized as ISO 8601 strings. Creation/submission timestamps are retained. Message-open times are never recorded.
- Local dates are `YYYY-MM-DD` calendar dates in `America/Los_Angeles`.
- Colors are six-digit `#RRGGBB` strings. Coordinates and dimensions are finite numbers; widths and heights are positive.
- Optional references use `null`; an omitted metadata key means the person has not supplied that property.
- Array order is meaningful where specified. No record array implies an endpoint response or client authorization to download the full system.

## Record relationships

| Record | Identity and relationships |
| --- | --- |
| `Person` | One PersonID, typed metadata, one avatar configuration, one locker, draft/live state, explicit IsDemo flag and nullable EligibleFrom date. |
| `PropertyDefinition` | One definition per metadata key, with a primitive, enum, list or record value schema. |
| `DirectoryPerson` | An organization identity with primary email, display name, suspension flag and an optional PersonID. Unregistered members have no PersonID. |
| `Invitation` | SenderPersonID, recipient email and creation timestamp. Creates no relationship or matching eligibility. |
| `MediaAsset` | File identity, optional owner, kind, MIME type, storage key and default title/description. |
| `SystemAsset` | A catalog entry referencing built-in media for an avatar part, photo frame, sticker, wallpaper or flat object. |
| `BoardItem` | One placement ID, one media reference, placement-specific title/description and transform. Repeated use of one media asset creates distinct placement IDs. |
| `ExteriorSticker` | Legacy exterior position/size data. The current editor has no exterior sticker control and writes an empty array. |
| `Question` | One question ID and one quiz date; exactly one question type. Choices are empty for ShortResponse. |
| `QuestionAnswer` | Unique `(PersonID, QuestionID)` pair, with answer and submission timestamp both present or both null. |
| `MatchGroup` | Group ID, optional scheduled/demo_preview kind, active local date, nine distinct eligible members, source question, actual matching inputs, theme and reason. Fictional members keep IsDemo internally. |
| `Conversation` | One ID for each unordered pair of different people and the first message's creation timestamp. |
| `Message` | Message ID, conversation ID, sender, recipient, content, creation timestamp, opened boolean and message type. |
| `System` | Aggregate of these collections for fixtures/export/model discussion. Not a public API payload. |

## People and metadata

Each metadata value must satisfy the `PropertyDefinition` referenced by its key. Primitive schemas accept their named primitive; enums accept one listed option; lists validate every item; records validate their named fields. All numeric values must be finite.

Current profile keys are `name`, `pronouns`, `major`, `year`, `mbti`, `interests`, `classes`, `food`, `study`, `hobbies`, `artist`, and `fun`. Interests, classes and hobbies are lists of text; all other current values are text. Form labels and rendered tags are not additional persisted properties.

Roster membership does not imply an application account or a completed locker. The real directory roster belongs on the server and directory listing is hidden from the app. Google sign-in requires verified Berkeley email/domain claims, links saved accounts by normalized email, and uses hashed opaque HttpOnly cookie sessions. Complete mock accepts a made-up `@berkeley.edu` address, creates an isolated in-memory store and returns a token held only in browser memory. Mock requests carry `X-Homeroom-Mock`; no mock identity is written to the persistent store and the token never replaces a Google cookie. Closing/reloading discards the mock, with a 30-minute idle cleanup fallback. Username/password admin accounts and operational settings are server-only. No client can assign itself admin access, IsDemo or an earlier EligibleFrom date.

Registered people have `IsDemo = false`. Fictional templates and copies have `IsDemo = true` internally and cannot be edited as registered accounts; the demo UI omits individual fictional-profile labels. A draft's `EligibleFrom` is null; first publication sets it to the next Berkeley date, or the active date in immediate demo mode. Subsequent live edits retain it. Publication requires name, major, year, an interest or hobby, and one placement with a nonempty title and description. A directory-linked suspended person is excluded from newly generated groups.

## Avatar and locker

Avatar configuration contains eyes, mouth and hair system-asset references; skin, hair, shirt and background colors; and a boolean blush flag. It has no configurable shirt-style or background-shape reference because the frontend does not expose those controls.

The locker has an interior board and appearance metadata. Interior wallpaper references media. Exterior color uses the existing presets. Exterior sticker data is retained only for compatibility with old records; the current editor clears it on save. Door name tags are derived from name metadata. The avatar catalog includes the remote hairstyles and preserves short/spiky IDs. New catalog entries are added on startup without reseeding saved people or placements.

A board item is an image placement, optionally carrying a Spotify track on the music cassette. Its X/Y are the top-left of its unrotated rectangle in the 190×166 locker design space. Rotation is in degrees around the rectangle center. Width and height describe the unrotated image; horizontally flipped state is a boolean. Insertion order is back to front. Rendered/baked image bounds are derived output, not the placement's stored geometry.

Uploaded photos reference one of the three existing Polaroid sizes through FrameStyleID. The Photo MediaAsset stores a larger processed source PNG; pixel Polaroid thumbnails and transformed placements are derived from that same source. Photo enlargement uses its authorized StorageKey URL, so no duplicate per-placement image is persisted. Uploads and placements are separate records. Removing a placement must not remove the upload from the owner's bank. Asset-bank title/description values initialize a placement; changing one copy must not alter another copy's story.

The built-in `media:music_cassette` is an SVG flat object; it is cataloged on startup without an upload. At most one cassette is allowed in a locker. It requires a `SpotifyTrack` containing exactly `ID` (22 alphanumeric characters), `Title` and `Artist` (nonempty, at most 500 characters each). Other media cannot carry a track. Its short placement Title remains limited to 24 characters; the full title is preserved separately. Its Description is an optional story of at most 120 characters. Geometry and transforms use the existing BoardItem fields, with no separate stored music placement or browser localStorage. The final `PUT /api/me` saves track changes and removal together with the rest of the locker; state hydration restores tracks for both owners and visible peers. Existing fictional lockers receive a missing preset cassette additively on startup, preserving all existing contents and registered people.

Both frontend and server enforce form limits: names 22 characters, pronouns 16, other profile inputs 60 (list fields measured as comma-separated text), item titles 24 and item descriptions 160. The server validates ownership, asset references, finite geometry and at most one exterior sticker. Processed PNG uploads are stored as files in ignored `data/uploads/`; metadata and placements are distinct database records.

## Quizzes

| Question Type | Answer.Type | Payload |
| --- | --- | --- |
| `MultipleChoice` | `SingleChoice` | One ChoiceID belonging to that question. |
| `Checkbox` | `MultipleChoices` | Distinct ChoiceIDs, all belonging to that question. An empty list is a submitted answer. |
| `ShortResponse` | `ShortText` | Nonempty Content. The frontend currently limits it to 200 characters. |

Question IDs and quiz dates are unique. Choice IDs are unique within one question. Stored choice questions require at least two nonempty choices; Luna generation uses three through five distinct labels. There is no admin editor. A submitted answer has both Answer and AnsweredAt. A quiz with neither is unanswered. Query history by PersonID and join to questions; do not duplicate history inside Person. Users can submit or revise only the active day's typed answer. An existing dated question cannot be silently replaced, preserving answer references.

Adding a question of an existing type creates data. Adding an entirely new type requires a deliberate extension of question/answer types, validation and rendering; a freeform string alone is insufficient.

## Groups

A scheduled group stores yesterday's QuestionID, even if some members' actual answers came from earlier questions. A demo_preview may instead reference the latest submitted question, including today. MatchingInputs has exactly one entry per member, identifying that member's actual source question, or null if they have never answered.

`Reason` is displayed under “matched by.” Its immediate value comes from deterministic matching evidence. Luna low can replace its wording with a grounded explanation of up to 120 characters, persisted in the same field and delivered through SSE. Demo previews generate it with their variants; scheduled groups use only Theme and aggregate Reason as input. Generation status/caching is server-only; no membership, scoring or new public record type is introduced.

Only live, eligible people belong to a group. Every eligible real person has one active membership for a published day. If a group is short, distinct fictional copies fill its remaining positions. Their actual answer source is retained in MatchingInputs. Demo templates alone do not initiate assignments. Group membership is shared; centering the viewer is a presentation transformation. Date/time, fallback and scoring rules are in [product.md](product.md#shared-daily-cohorts).

The database enforces unique `(day, person)` memberships and publishes groups transactionally. Repeating a published date reuses its groups. Outside demo mode, new users wait until EligibleFrom. In demo mode a newly completed user receives a separate immediate demo_preview with eight stable fictional IDs; this does not alter existing groups. Luna low creates similar preference/answer variants, with deterministic fallback. The preview can update after profile or same-day answer revisions while preserving its people and conversations. Seed fingerprints and generation source are server-only operational metadata. Scheduled matching resumes at the next midnight.

In demo matching mode, each `demo_preview` group belongs to one `OwnerPersonID` and active date. Its eight other people are new synthetic identities, retained in that owner's database (durable for Google, memory-only for mock). `GenerationSource` is pending, luna or fallback. Historical groups and people are retained; current state follows the membership table, including migration from older shared groups. Google users never appear in each other's demo cohorts.

A per-person day offset is stored in server-only settings. Advancing changes only that user's effective Berkeley date, ensures a typed daily question and creates the new dated group. Existing answers/conversations/assets remain unchanged. Natural midnight also generates a new personal cohort. The shared-cohort rules above still apply when `DEMO_MODE=0`.

## Conversations and messages

Participants must exist and be different people. Each unordered pair has one conversation. Every message's sender and recipient are exactly the conversation participants in opposite roles. The first message is a locker note and subsequent messages are direct messages. FirstMessageTimestamp equals the first message's CreatedAt. Message ordering is by CreatedAt, then MessageID.

Starting a conversation requires a current locker neighbor and both participants to be live. All messages allow 200 characters. An existing conversation, including an unopened old locker note, remains accessible and replyable across cohort changes. Only the initial locker note creates the pair's conversation. Demo-mode canned replies use the same Message records and never impersonate registered users.

IsOpened is false when a message is created and is set to true by its recipient. Opening is idempotent. There is no ReadAt, acceptance state, expiry or second copy of unread state inside Locker. Reading does not delete or copy the message. Unopened notes stay in the locker across midnight. There is one conversation list; today/missed/sent are not separate stores or inboxes. The main badge counts unread incoming messages.

Derived views:

```text
Mail(personID) = conversations containing personID
UnreadMessages(personID) = messages with Recipient = personID and IsOpened = false
UnreadLockerNotes(personID) = UnreadMessages(personID) where Type = locker_note
Thread(conversationID) = messages with that ConversationID, ordered by CreatedAt then ID
```

These rules apply equally to messages originally sent or received by the viewer. Existing conversations remain accessible after daily matching changes.

## SQLite storage

`server/store.cjs` uses Node's built-in SQLite driver. `data/homeroom.sqlite` stores one JSON record per row rather than serializing the entire application into one blob. IDs, dates, ownership and participant relationships also have SQL columns for lookup and integrity. Foreign keys are enabled and write groups use transactions.

| Table | Relational identity / constraint | JSON payload |
| --- | --- | --- |
| `people` | Primary ID; unique nullable login email | Person |
| `assets`, `system_assets`, `properties` | Primary IDs; assets link owner | MediaAsset, SystemAsset, PropertyDefinition |
| `questions` | Primary ID; unique quiz day; source column | Question |
| `answers` | Composite person/question key; foreign keys | QuestionAnswer |
| `match_days`, `groups`, `memberships` | Published date; group ID; unique day/person | MatchGroup on groups |
| `conversations` | Primary ID; canonical ordered pair unique | Conversation |
| `messages` | Primary ID; conversation, sender, recipient and creation columns | Message |
| `directory` | Primary ID; unique email | DirectoryPerson |
| `invitations` | Primary ID; sender relationship | Invitation |

Server-only tables hold session token hashes and expiry, salted password hashes, OAuth state, simulated-day settings and generation diagnostics. These are operational records, not public product data. Question source distinguishes fixture, Luna and fallback generation; generation error codes are safe summaries without raw API responses. No message read timestamp is stored.

Uploads and directory-import artifacts live beside the database in `DATA_DIR` (ignored `data/` locally; `/home/homeroom/homeroom-data` on alwaysdata). Environment secrets remain in ignored `.env`; the deployment combines allowlisted `.env.always` settings with the existing question-generation key and Google OAuth client credentials. Complete mock uses SQLite `:memory:` and data-URL upload sources, with no database/upload files. Code releases are separate from persistent records. Exporting canonical records through the server-side store supports a later schema migration to PostgreSQL or another hosted database. A database migration still needs table conversion, uploaded-file transfer and production session/auth setup.

## HTTP and live updates

Endpoints are same-origin JSON. Saved Google sessions use cookies; complete mock sessions use an in-memory token in `X-Homeroom-Mock`. Mock SSE is read using a streaming fetch with that header, so tokens never appear in URLs. `ClientState.IsTemporary` distinguishes memory-only sessions from saved accounts. Mutations accept `application/json`; product payload keys retain their type names/casing. The server checks origin/host and uses HttpOnly SameSite cookies. A session accesses its own profile, answers, invitations, conversations and messages, plus current neighbors and conversation peers. It cannot download the roster or other users' answers. `ClientState` includes `CurrentPersonID`, `ActiveDay`, `DemoMode`, `ServerNow` and `NextRefreshAt`; `DirectoryPeople` is always empty. Clock timestamps represent the active day, including simulation; the next midnight is computed in America/Los_Angeles with DST. The browser advances the server clock by elapsed local time for the countdown.

| Method / route | Input or result |
| --- | --- |
| `GET /api/config`, `GET /api/health` | Public auth configuration and health/day; no secrets. |
| `POST /api/auth/demo` | `{ Email }`; available only in demo auth mode. Creates a normal session and returns scoped state. |
| `GET /auth/google`, `GET /auth/google/callback` | Optional Google OAuth sign-in and callback. |
| `POST /api/auth/logout` | Ends the current session. |
| `POST /api/demo/reset` | Demo mode only: retires the signed-in run, releases its email and revokes sessions. The next sign-in creates a fresh draft; historical records are retained. |
| `GET /api/state` | Signed-in user's scoped ClientState. |
| `POST /api/auth/mock` | Start an isolated in-memory run with a made-up Berkeley email; returns Token and scoped State without setting a cookie. |
| `POST /api/demo/advance` | Advance only the current authenticated person to the next date; create new synthetic people and a question while retaining history. |
| `GET /api/events` | Signed-in SSE stream. `state` events trigger fetching scoped state; heartbeat keeps the connection alive. |
| `PUT /api/me` | `{ Person }`; validates and saves the current user's profile/locker, returning refreshed state. |
| `POST /api/spotify/search` | Authenticated `{ query }` (2–120 normalized characters), returning `{ tracks: [{ id, title, artist, artwork, url }] }`. Utility search fields retain the provider adapter’s lowercase names; stored product fields use SpotifyTrack. Same-origin and mock-token rules apply. One in-flight search per person, at least one second apart; identical public results cache ten minutes. Missing server key returns 503. |
| `POST /api/uploads` | `{ DataURL, Kind, Title, Description }`; processed PNG Photo/Sticker upload, returns MediaAsset. |
| `GET /media/:id` | Authorized uploaded image bytes. |
| `POST /api/answers` | `{ QuestionID, Answer }`; active day's typed answer, returns refreshed state. |
| `POST /api/messages` | `{ Recipient, Content }`; server chooses first note versus direct message, returns Message. |
| `POST /api/messages/open` | `{ MessageID }`; recipient-only idempotent opening, returns refreshed state. |
| `POST /api/invitations` | `{ Email }`; records a join invitation. No email delivery. |
| `POST /api/admin/login` | `{ Username, Password }`; creates an administrator session. No public panel. |
| `GET /api/admin/status` | Admin-only active day, questions, generation source/status and directory count. |
| `POST /api/admin/simulate` | Admin-only `{ Day }`: YYYY-MM-DD, weekday, day offset, or `today` to reset. |
| `POST /api/admin/questions/generate` | Admin-only `{ Day }`; ensures a missing question, preserving existing ones. |
| `POST /api/admin/directory/import` | Admin-only import of the saved local roster artifact. |

SSE notifications contain no private records; clients request the authorized state after a notification. Notifications follow message/opening, quiz/profile and daily cohort changes. EventSource reconnects automatically. State and media authorization remain server-side; hiding controls is not authorization.

## Fixtures and standalone boundary

[src/demo-model.js](../src/demo-model.js) builds complete example records from the visual people fixture and current asset catalog. It also performs frontend-only quiz, invitation and message interactions in memory. The original `PEOPLE` data is an art/display fixture, not a replacement for the product records.

The backend seeds complete example templates/catalog records once on a fresh database. Restarting does not overwrite existing data. The served frontend uses `src/remote-model.js` for durable operations; direct-file mode uses the memory model. Temporary standalone image keys and whole-system arrays do not establish public access rights or hosted storage configuration.

## Generated introductory notes

Luna generates an introductory note (maximum 200 characters) for each synthetic neighbor using supplied profile context and answers. The text is stored server-side with the synthetic identity. A per-group schedule stores the next delivery time and sent count. Deliver at most one note every 30 seconds, at most four introductions per person/day, and never more than four unopened locker notes for the recipient across dates. Delivery uses normal conversation/message authorization and record shapes; notes can be opened and replied to normally. Saved schedules survive restarts. Mock schedules and all associated records remain in memory and are discarded with the run.
