# Daily question generation

The server generates questions using **`gpt-6-luna` with `reasoning.effort: low` only**. It reads `CHATGPT_API_KEY` from the server environment; local startup loads the ignored `.env` file. Credentials never go to the browser. There is no alternate model, provider, tool call, or automatic retry. `GLASSER_API_KEY` is not used for question generation; it enables the separate Spotify song search.

One date-seeded question type is chosen from `MultipleChoice`, `Checkbox`, and `ShortResponse`. The model receives only the Berkeley calendar date, a fixed public topic, and general instructions for a friendly icebreaker. It receives no profile, message, answer, or directory records. Model text may vary; the stored question is reused for that day. Offline examples and type/topic choices are reproducible from the date.

Generation uses the Responses API with a strict JSON schema, `store: false`, a 700-token output budget, and a 20-second timeout. Application validation additionally checks the selected type, nonempty prompt, lengths, choice count, and distinct labels. Short responses have no choices; choice questions have three through five. The server assigns stable date-based question and choice IDs. It rejects malformed output, incomplete responses and refusals.

If the key is absent or the single API request fails, the application uses a deterministic built-in question and persists its source as `fallback`, separately from the shared `Question` record. This is an explicit offline demo mode, not AI output. Safe error codes distinguish authentication, model access, quota/rate limit, timeout, network, refusal, incomplete response and invalid output. Raw provider errors, fetch errors and credentials are never included in these diagnostics. A stored fallback remains stable instead of repeatedly incurring paid requests.

`ensureQuestions(store, { days, ...options })` checks `store.questionForDay(day)` before generation and calls `store.saveQuestion(question, source)` for missing dates. It defaults to today and tomorrow in `America/Los_Angeles`. The scheduler serializes callers; the database enforces one question per day. Existing fixtures are retained. `generateQuestionResult` also exposes a safe result for application status; `generateQuestion` throws safe errors when a caller needs strict AI-only behavior.

For an explicit one-question check, run `node server/questions.cjs --day YYYY-MM-DD`. It prints the validated question, its source and safe status. It can make one paid request when a key is present. Tests use fake requests and make no network calls.

Official references: [Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna), [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Personalized fictional neighbors and notes

`server/demo-neighbors.cjs` also uses gpt-6-luna with low reasoning, `store: false`, strict output schema, a 6,500-token maximum and a 25-second timeout. It receives the person's interests/hobbies, major/year/classes/food/study/artist/fun context, latest typed quiz answer, active date and prior synthetic names. Real names/emails, images, directory records and messages are excluded. It generates eight complete fictional profiles, one introductory note per neighbor and a short grounded match explanation. The application validates field lengths, distinct names, lists and note content limits, preserving valid choice IDs. Valid output enriches the same current-day identities; malformed output or API failure retains deterministic similar profiles. Provenance is `pending`, `luna` or `fallback`, never silently represented as AI output.

Generation is cached per person/day and input fingerprint. New dates create new identities; same-day revisions update existing ones. Stale completions cannot overwrite a newer answer or day. The backend schedules up to four personalized introductions per day, one every 30 seconds, while enforcing a global cap of four unopened locker notes for that viewer. Mock sessions have the same generation and delivery path, using only an isolated in-memory database.
