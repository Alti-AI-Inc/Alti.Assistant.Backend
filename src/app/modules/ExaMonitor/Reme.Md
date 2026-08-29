# Exa Storage — Space, Search, Contents & Monitor Modules

Four modules, following your `route / controller / validation / service` pattern:

- **`space`** — the isolation boundary. A user creates a space; it owns zero or more stored searches, content extractions, and monitors.
- **`search`** — persists the _output_ of an Exa `/search` call.
- **`contents`** — persists the _output_ of an Exa `/contents` call, optionally linked back to the `ExaSearch` it was extracted from via `sourceSearch`.
- **`monitor`** + **`monitorRun`** — persists a scheduled Exa Monitor and its recurring run history. Unlike `search`/`contents`, a monitor is a _live, stateful_ Exa-side resource — so this pair also includes a signature-verified **webhook receiver** that ingests run history automatically as Exa delivers it, rather than requiring you to poll.

None of these modules call the Exa API to create/trigger/search anything — they only store whatever payload you hand them after you call Exa yourself, or whatever Exa pushes to the webhook.

## Data model

**Space**

```
name, slug, description, owner, members[{user, role}],
isPrivate, status(active|archived), searchCount, timestamps
```

- Unique per owner on `slug` (not globally unique — two different users can each have a "research" space).
- `members[]` gives simple shared-access without building a full ACL system: `editor` can write, `viewer` can only read.
- `searchCount` is a denormalized counter kept in sync by `search.service.js` so listing spaces doesn't require a `COUNT` aggregation per space.

**ExaSearch**

```
space (ref, required), user (ref, required), query, searchType(neural|keyword|auto),
category, requestParams(Mixed), results[{ exaId, title, url, author, publishedDate,
score, text, summary, highlights[], highlightScores[], image, favicon }],
resultCount, autopromptString, resolvedSearchType, requestId, costDollars(Mixed),
status(completed|failed|pending), errorMessage, isFavorite, tags[], timestamps
```

- `requestParams` and `costDollars` are intentionally `Mixed` — Exa's request/response shape isn't reimplemented here, so the schema doesn't fight it.
- `results[]` is a subdocument array (no separate collection) since result items are never queried independently of their parent search.
- Compound index `{space, createdAt: -1}` — the dominant query pattern is "recent searches in this space."
- `requestId` is sparse-indexed so you can de-dupe retried writes from your Exa-calling code if you pass Exa's own request id through.

**ExaContent**

```
space (ref, required), user (ref, required), sourceSearch (ref ExaSearch, optional),
requestIds[] (the urls sent as `ids`), requestOptions(Mixed: text/highlights/summary/
maxAgeHours/livecrawlTimeout/subpages/subpageTarget), results[{ id, url, title, author,
publishedDate, text, highlights[], highlightScores[], summary, structuredSummary(Mixed),
image, favicon }], statuses[{ id, status(success|error), errorTag, httpStatusCode }],
resultCount, successCount, errorCount, status(completed|partial|failed), isFavorite,
tags[], timestamps
```

- `requestOptions` and `structuredSummary` are `Mixed` for the same reason as `ExaSearch.requestParams` — Exa's `/contents` options (including arbitrary `summary.schema`) aren't reimplemented here.
- `statuses[]` mirrors Exa's own per-url `statuses` array from the Contents API response, including its error tags (`CRAWL_NOT_FOUND`, `CRAWL_TIMEOUT`, `CRAWL_LIVECRAWL_TIMEOUT`, `SOURCE_NOT_AVAILABLE`, `CRAWL_UNKNOWN_ERROR`).
- A `pre('save')` hook derives the overall `status` from `statuses[]`: `completed` if every url succeeded, `failed` if every url errored, `partial` otherwise — and recomputes `successCount`/`errorCount`/`resultCount` so callers don't have to.
- `sourceSearch` is optional and cross-checked at the service layer: if supplied, it must reference an `ExaSearch` document that belongs to the _same_ space, so a caller can't use it to reach into a space they otherwise can't see.

**Monitor**

```
space (ref, required), user (ref, required), exaMonitorId (unique, required),
name, status(active|paused|disabled), search{ query, numResults, contents(Mixed) },
trigger{ type('interval'), period } | null, outputSchema(Mixed) | null,
metadata(Mixed) | null, webhook{ url, events[] }, webhookSecret (select:false),
nextRunAt, exaCreatedAt, exaUpdatedAt, lastSyncedAt, timestamps
```

- `exaMonitorId` is uniquely indexed **globally**, not per-space — Exa's own monitor ids are unique across your whole Exa account, so this mirrors that.
- `webhookSecret` uses Mongoose's `select: false`, the same pattern typically used for password hashes — it's excluded from every normal `find()`/API response by default, and only pulled in explicitly (`.select('+webhookSecret')`) by the webhook-verification code path. Store it as soon as you receive it from Exa's create response; Exa never returns it again.
- `status` mirrors whatever Exa last reported. This module never sets `disabled` itself — that's Exa's system-only state.

**MonitorRun**

```
space (ref, required, denormalized), monitor (ref, required), exaRunId (required),
status(pending|running|completed|failed|cancelled), output{ results[], content(Mixed),
grounding[{field, citations[{url,title}], confidence}] } | null, failReason,
startedAt, completedAt, failedAt, cancelledAt, durationMs, exaCreatedAt, exaUpdatedAt,
timestamps
```

- `space` is denormalized onto every run (not just reachable via `monitor`) — same rationale as `ExaSearch`/`ExaContent`: every isolation check filters on `space` directly, no join required.
- Compound unique index `{monitor, exaRunId}` — this is what makes webhook ingestion idempotent. A redelivered `monitor.run.completed` event for the same run just overwrites the same document instead of duplicating it.

## Webhook ingestion (why monitors need one)

`search` and `contents` are one-shot: you call Exa, you get a payload back, you store it. Monitors don't work that way — a monitor keeps running on Exa's schedule indefinitely, and each run's result shows up as a **webhook delivery**, not a response you're holding onto. Without ingesting that webhook, `MonitorRun` would stay empty.

`monitor.webhook.route.js` exposes `POST /api/v1/webhooks/exa/monitors` (deliberately **not** nested under `/spaces` and **not** behind your `auth()` middleware, since Exa calls it directly with its own signature scheme, not a user's bearer token).

Flow on each delivery:

1. The raw request body is preserved via `express.raw()` instead of your global JSON parser — signature verification needs the _exact bytes_ Exa signed, and a JSON-parse-then-restringify round-trip can change byte-for-byte formatting and silently break every verification.
2. The payload is parsed just enough to find which monitor it's about (`data.id` for `monitor.*` events, `data.monitorId` for `monitor.run.*` events).
3. That monitor's stored `webhookSecret` is loaded, and `monitor.webhook.utils.js` recomputes the HMAC-SHA256 signature and compares it to the `Exa-Signature` header using a constant-time comparison. Unsigned/mis-signed requests are rejected with `401`.
4. Only after that: `monitor.created`/`monitor.updated` sync the local `Monitor` fields, `monitor.deleted` cascades a local delete, and `monitor.run.created`/`monitor.run.completed` upsert a `MonitorRun` row (idempotent, via the `{monitor, exaRunId}` unique index).

**Bootstrap order matters.** Mount the webhook router _before_ your global `express.json()`:

```js
app.use('/api/v1/webhooks', MonitorWebhookRoutes); // raw body — must come first
app.use(express.json()); // global parser, after
app.use('/api/v1', router); // rest of the API
```

If `express.json()` runs first, the raw body is already consumed and every signature check will fail.

## Isolation

All access goes through `SpaceService.assertSpaceAccess(spaceId, userId, minRole)`. The search, contents, and monitor services all call this before every operation — there's no path to an `ExaSearch`, `ExaContent`, `Monitor`, or `MonitorRun` document that bypasses the owning space's access check. `monitorRun.service.js` additionally verifies the parent `Monitor` belongs to the space on every operation, the same way `contents.service.js` cross-checks `sourceSearch`. Deleting a space cascades to all four. Routes nest resources under the space:

```
POST   /api/v1/spaces
GET    /api/v1/spaces
GET    /api/v1/spaces/:id
PATCH  /api/v1/spaces/:id
DELETE /api/v1/spaces/:id            (cascades — deletes its ExaSearch records too)
POST   /api/v1/spaces/:id/members
DELETE /api/v1/spaces/:id/members/:memberId

POST   /api/v1/spaces/:spaceId/searches
GET    /api/v1/spaces/:spaceId/searches        (?searchTerm=&searchType=&status=&isFavorite=&tags=&page=&limit=&sortBy=&sortOrder=)
GET    /api/v1/spaces/:spaceId/searches/:id
PATCH  /api/v1/spaces/:spaceId/searches/:id    (tags, isFavorite, status, errorMessage)
DELETE /api/v1/spaces/:spaceId/searches/:id

POST   /api/v1/spaces/:spaceId/contents
GET    /api/v1/spaces/:spaceId/contents        (?searchTerm=&status=&isFavorite=&tags=&sourceSearch=&page=&limit=&sortBy=&sortOrder=)
GET    /api/v1/spaces/:spaceId/contents/:id
PATCH  /api/v1/spaces/:spaceId/contents/:id    (tags, isFavorite, sourceSearch)
DELETE /api/v1/spaces/:spaceId/contents/:id

POST   /api/v1/spaces/:spaceId/monitors
GET    /api/v1/spaces/:spaceId/monitors        (?searchTerm=&status=&page=&limit=&sortBy=&sortOrder=)
GET    /api/v1/spaces/:spaceId/monitors/:id
PATCH  /api/v1/spaces/:spaceId/monitors/:id
DELETE /api/v1/spaces/:spaceId/monitors/:id    (cascades — deletes its MonitorRun history too)

POST   /api/v1/spaces/:spaceId/monitors/:monitorId/runs
GET    /api/v1/spaces/:spaceId/monitors/:monitorId/runs      (?status=&failReason=&page=&limit=&sortBy=&sortOrder=)
GET    /api/v1/spaces/:spaceId/monitors/:monitorId/runs/:id
PATCH  /api/v1/spaces/:spaceId/monitors/:monitorId/runs/:id
DELETE /api/v1/spaces/:spaceId/monitors/:monitorId/runs/:id

POST   /api/v1/webhooks/exa/monitors           (Exa → your server, not user-authenticated)
```

## Wiring into `src/routes/index.js`

```js
import { SpaceRoutes } from '../app/modules/space/space.route.js';
import { SearchRoutes } from '../app/modules/search/search.route.js';
import { ContentRoutes } from '../app/modules/contents/contents.route.js';
import { MonitorRoutes } from '../app/modules/monitor/monitor.route.js';
import { MonitorWebhookRoutes } from '../app/modules/monitor/monitor.webhook.route.js';

// Webhook router needs the RAW body — mount before express.json()
// in your main app bootstrap (see "Webhook ingestion" section above).
// app.use('/api/v1/webhooks', MonitorWebhookRoutes);

router.use('/spaces', SpaceRoutes);
router.use('/spaces/:spaceId/searches', SearchRoutes);
router.use('/spaces/:spaceId/contents', ContentRoutes);
router.use('/spaces/:spaceId/monitors', MonitorRoutes); // also mounts .../monitors/:monitorId/runs
```

## Assumptions to reconcile with your actual repo

I don't have your real file tree, so the imports point at the conventional locations for this boilerplate style. Adjust these paths if yours differ:

| Import             | Assumed at                           |
| ------------------ | ------------------------------------ |
| `ApiError`         | `src/errors/ApiError.js`             |
| `catchAsync`       | `src/shared/catchAsync.js`           |
| `sendResponse`     | `src/shared/sendResponse.js`         |
| `pick`             | `src/shared/pick.js`                 |
| `paginationHelper` | `src/shared/paginationHelper.js`     |
| `auth`             | `src/middlewares/auth.js`            |
| `validateRequest`  | `src/middlewares/validateRequest.js` |
| `ENUM_USER_ROLE`   | `src/enums/user.js`                  |

If any of these don't exist yet (e.g. no `paginationHelper`), the shape they need to expose is:

```js
// paginationHelper.calculatePagination(options) -> { page, limit, skip, sortBy, sortOrder }
// pick(obj, keys) -> subset of obj containing only keys present in `keys`
```

Also confirm:

- `validateRequest` expects a zod schema and validates `{ body, query, params }` — this is written against that convention (used by libraries like `zod` in `req.body = schema.parse(req).body` style). If your project uses Joi instead, the `.validation.js` files need the equivalent Joi schemas — say the word and I'll port them.
- `auth(...)` populates `req.user.id`. If your auth middleware exposes the user id under a different key (`req.user._id`, `req.user.userId`), update the four spots in `search.controller.js` / `space.controller.js`.

## Not included, by request

The actual Exa API calls (`/search`, `/contents`, and the Monitors CRUD/trigger endpoints — SDK requests, retries, request-param building) are left out. Whatever service performs those calls should persist the result afterward:

- After a `/search` call: `SearchService.createSearchRecord(spaceId, userId, exaResponsePayload)`.
- After a `/contents` call: `ContentService.createContentRecord(spaceId, userId, exaResponsePayload)`, with `sourceSearch` set if the URLs came from a stored search.
- After creating a monitor on Exa: `MonitorService.createMonitorRecord(spaceId, userId, exaMonitorPayload)` — critically, include `webhookSecret` from Exa's create response, since it's never returned again.
- Monitor run history: normally arrives automatically via the webhook receiver (`POST /api/v1/webhooks/exa/monitors`) — no code of yours needs to call `MonitorRunService.createMonitorRunRecord` for the common case. That service method exists for manual backfill/sync (e.g. `GET /monitors/{id}/runs` against Exa once, to import history predating your webhook setup).

Typical flow: call Exa `/search` → store it → pick URLs from the stored `results[]` → call Exa `/contents` on those URLs → store that with `sourceSearch` set. Separately: call Exa's create-monitor endpoint → store the returned `Monitor` (with its `webhookSecret`) → Exa runs it on schedule → each run's webhook delivery is verified and ingested automatically into `MonitorRun`.
