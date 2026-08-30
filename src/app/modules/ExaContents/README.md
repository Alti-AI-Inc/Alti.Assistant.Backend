# ExaContents module — Exa `/contents` integration

Persists the result of an Exa **POST `/contents`** call, isolated per `Space`
(the space model and access-control layer live in `../ExaSearch`, alongside
the sibling `ExaSearch` module which does the equivalent for Exa `/search`).

Unlike the original draft of this module, `ContentService.createContentRecord`
**calls the real Exa API** itself — the caller supplies `ids` + extraction
options, the service calls `POST https://api.exa.ai/contents`, and stores
whatever Exa returns (success or failure) as a new `ExaContent` document.

## Query-driven workflow

For a user question, call `POST /api/v1/spaces/:spaceId/searches` with a
`contents` object. `ExaSearch` forwards that object to Exa's `/search` API,
which returns search matches enriched with the requested content in the same
response. Use this module's `/contents` endpoint only when the URLs are
already known.

```json
{
  "query": "What changed in AI safety research?",
  "contents": {
    "text": { "maxCharacters": 5000 },
    "highlights": { "query": "AI safety", "highlightsPerUrl": 3 },
    "summary": { "query": "Summarize the key findings" },
    "livecrawl": "preferred"
  }
}
```

## Data model

**ExaContent** (`contents.model.js`)

```
space (ref Space, required), user (ref User, required),
sourceSearch (ref ExaSearch, optional — must belong to the same space),
requestIds[] (the `ids` sent to Exa), requestOptions (Mixed: text/highlights/
summary/livecrawl/livecrawlTimeout/subpages/subpageTarget/context),
results[{ id, url, title, author, publishedDate, text, highlights[],
highlightScores[], summary, structuredSummary(Mixed), image, favicon }],
statuses[{ id, status(success|error), errorTag, httpStatusCode }],
resultCount, successCount, errorCount, status(completed|partial|failed),
errorMessage, isFavorite, tags[], timestamps
```

- `requestOptions` / `structuredSummary` stay `Mixed` — Exa's `/contents`
  options (including arbitrary `summary.schema`) aren't reimplemented here.
- `statuses[]` mirrors Exa's own per-url `statuses` array, including its
  error tags (`CRAWL_NOT_FOUND`, `CRAWL_TIMEOUT`, `CRAWL_LIVECRAWL_TIMEOUT`,
  `SOURCE_NOT_AVAILABLE`, `CRAWL_UNKNOWN_ERROR`).
- A `pre('save')` hook derives the overall `status` from `statuses[]`:
  `completed` if every url succeeded, `failed` if every url errored,
  `partial` otherwise — and recomputes `successCount`/`errorCount`/
  `resultCount`. `errorMessage` is set instead when the whole HTTP request
  to Exa fails outright (network error / non-2xx before any per-url
  statuses exist).
- `sourceSearch` is cross-checked at the service layer: if supplied, it must
  reference an `ExaSearch` document in the _same_ space.

## Isolation

Every operation goes through `SpaceService.assertSpaceAccess(spaceId, userId, minRole)`
(imported from `../Space/space.service.js` — the single, canonical
space-access guard shared with every space-scoped product). There is no
path to an `ExaContent` document that bypasses its owning space's access
check, and deleting a space cascades to its `ExaContent` records.

## Routes

Mounted under the dedicated space router (`Space/space.route.js`), which is
itself mounted at `/spaces` in `src/app/routes/index.js`:

```
POST   /api/v1/spaces/:spaceId/contents
GET    /api/v1/spaces/:spaceId/contents        (?searchTerm=&status=&isFavorite=&tags=&sourceSearch=&page=&limit=&sortBy=&sortOrder=)
GET    /api/v1/spaces/:spaceId/contents/:id
PATCH  /api/v1/spaces/:spaceId/contents/:id    (tags, isFavorite, sourceSearch)
DELETE /api/v1/spaces/:spaceId/contents/:id
```

`POST` body (validated by `contents.validation.js`):

```json
{
  "ids": ["https://example.com/article"],
  "text": true,
  "highlights": { "query": "optional focus query" },
  "summary": { "query": "optional summary prompt" },
  "livecrawl": "preferred",
  "sourceSearch": "<ExaSearch _id from the same space, optional>",
  "tags": ["optional"],
  "isFavorite": false
}
```

## Configuration

Requires `EXA_API_KEY` (or `EXA_KEY`) in the environment — same variable
used by the `ExaSearch` module's own Exa `/search` integration.

## Fixes applied

The module previously had several issues that made it non-functional:

- Import paths for `auth`, `validateRequest`, and `ENUM_USER_ROLE` pointed at
  files that don't exist in this repo (`middlewares/auth.js`,
  `middlewares/validateRequest.js`, `enums/user.js`) — corrected to the real
  locations (`middlewares/auth/auth.js`, `middlewares/validateRequest/validateRequest.js`,
  `shared/enum.js`).
- `http-status-codes` isn't an installed dependency — switched to `http-status`,
  matching the rest of the codebase.
- `pick` / pagination helper imports pointed at non-existent
  `shared/paginationHelper.js` / `shared/pick.js` — switched to the actual
  `helpers/paginationHelpers.js` and `middlewares/other/pick.js`.
- The module imported its own duplicate `SpaceService` (and a wrong
  `ExaSearch` model path, `../search/search.model.js`) instead of reusing the
  canonical ones in `../ExaSearch`. The duplicate `space.service.js` file
  has been removed.
- The route file was never mounted anywhere — it is now wired into
  `Space/space.route.js` at `/:spaceId/contents`.
- `createContentRecord` accepted pre-fetched Exa output instead of calling
  Exa — it now performs the real `POST /contents` call.
- The controller read `req.user.id`, but the JWT payload uses `_id` — now
  resolved defensively (`id` / `_id` / `userId`).
