# Repository guidance

- Use `docs/product.md` for product behavior, `src/types.ts` for record shapes, and `docs/data-model.md` for invariants. Keep them aligned with accepted changes. `docs/backend-questions.md` records unresolved choices, not requirements.
- Keep ongoing work local. Google Docs is a downstream mirror; defer any authorized synchronization until the end of the workstream.
- Backend implementation is authorized. Keep it local with SQLite and the accepted JSON REST/SSE contracts. Do not provision hosted services without a user request. Standalone frontend mocks remain distinct from the persistent served application.
- Edit the source templates/model and rebuild `index.html` with `python3 art/build.py`. Run the relevant checks described in README.md after functional changes. The art generator must not recreate removed, out-of-scope assets.
