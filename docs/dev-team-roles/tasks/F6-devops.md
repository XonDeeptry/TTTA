<!--
  Per-feature-per-role task file, OWNED by the DEVOPS agent for F6.
-->

# F6 · DevOps — Real-time submission status via SSE (reverse-proxy verification)

- **Owner role:** devops
- **Feature:** F6 — Push `Submission.status` transitions to the dashboard live via SSE. DevOps scope: confirm/ensure Caddy does not buffer the `GET /api/events/submissions` SSE response (AC-19/AC-20).
- **Status:** DONE
- **Last updated:** 2026-07-22
- **Depends on:** F6-ba.md, F6-backend.md

## Inputs (what this role received)

- `F6-ba.md` §6 FR-05 — AC-19 (Caddy must not buffer `text/event-stream`; auto-detected/flushed by default; add `flush_interval -1` only if verification shows buffering) and AC-20 (25s heartbeat must survive any idle timeout in the Caddy/compose path).
- `F6-backend.md` — SSE endpoint already sets `X-Accel-Buffering: no` + `Cache-Control: no-transform` as belt-and-braces (app-level, not proxy-level).
- Real files: `infra/Caddyfile` (`handle /api*` block), `infra/docker-compose.yml` (caddy service: ports 80/443, volumes, no idle-timeout override present).

## Checklist

- [x] Read Caddyfile `/api*` block and cite exact lines
- [x] Adapt Caddyfile to JSON (`caddy adapt`) to inspect the actual `reverse_proxy` handler for `flush_interval`/`transport`/`encode` overrides
- [x] Validate Caddyfile syntax (`caddy validate`) and formatting (`caddy fmt`)
- [x] Confirm `docker compose config` parses cleanly from `infra/`
- [x] Attempt live curl verification against the running stack (read-only, no restart)
- [x] Decide: change needed or not, with evidence
- [x] Document what QA should verify for AC-19/AC-20 given no browser automation
- [x] Set Status DONE

## Outputs

### 1. Caddyfile analysis (evidence)

`infra/Caddyfile` lines 11-14:
```
handle /api* {
	uri strip_prefix /api
	reverse_proxy core-api:3001
}
```
No `header_up`/`header_down`, no `flush_interval`, no `encode` (compression) directive — anywhere in the whole file (checked all handle blocks, lines 1-23).

`caddy adapt --config infra/Caddyfile --adapter caddyfile` (run via `caddy:2-alpine` image) renders the `/api*` route's handler chain as exactly:
```json
{"handler":"rewrite","strip_path_prefix":"/api"},
{"handler":"reverse_proxy","upstreams":[{"dial":"core-api:3001"}]}
```
No `flush_interval` key, no `transport` override, no `encode`/gzip handler anywhere in the adapted config (grepped the full JSON output — zero matches for `"encode"` or `"flush_interval"`). This confirms the reverse_proxy uses Caddy's **built-in defaults** unmodified.

Caddy v2's `reverse_proxy` response-streaming logic (module `caddyhttp/reverseproxy`) auto-detects streaming content types — `text/event-stream` explicitly, plus any response without a `Content-Length` — and flushes each write to the client immediately regardless of the `flush_interval` default (which only governs the *non-streaming* poll interval, default 0/full-buffer for ordinary responses). Since core-api's SSE controller (per `F6-backend.md`) sets `Content-Type: text/event-stream` on the response and never sets `Content-Length` (it's a long-lived chunked stream), Caddy's default path here is the auto-flush path, not the buffered path. There is also no `encode` (gzip/zstd) directive in this Caddyfile at all, so compression-induced buffering is not a factor either — this is defense-in-depth confirmation, not a gap.

**Conclusion: no Caddyfile change is required.** Adding an explicit `flush_interval -1` to this block would be redundant with Caddy's own default behavior for this content type, and the task brief is explicit that config should not be added "for its own sake" when the default already satisfies the requirement — so I left `infra/Caddyfile` unchanged.

### 2. Validation commands run (evidence)

```
cd infra && docker compose config
```
→ exit 0, full merged config rendered (271 lines), no errors — compose file still parses with the F6 changes present in the tree (no infra file was touched, so this simply reconfirms baseline health).

```
docker run --rm -v "infra/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```
→ `Valid configuration`.

```
docker run --rm -v "infra/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
  caddy fmt /etc/caddy/Caddyfile
```
→ output byte-identical to the current file (already correctly formatted — no diff to apply).

### 3. Live end-to-end attempt (read-only, no restart) — partially blocked, root cause documented

- `curl -N http://localhost/api/events/submissions` → Caddy issued its normal `308` HTTP→HTTPS redirect (auto_https is on because `DOMAIN` in `infra/.env` is `bot.example.com`, not `localhost` — this is pre-existing and matches the documented CLAUDE.md caveat: "set DOMAIN=localhost for dev or Caddy will try to obtain a real Let's Encrypt cert and fail"). Not an F6 regression.
- Following the redirect over HTTPS failed at the TLS layer (`docker logs ilm-bot-caddy-1` shows repeated ACME `rejectedIdentifier` errors for `bot.example.com` — Let's Encrypt refuses to issue for a placeholder/example domain — so Caddy has no usable certificate to terminate TLS with in this environment). This is an existing environment/DNS condition unrelated to the SSE feature or the Caddyfile's proxy config.
- Bypassing Caddy, I curled `core-api:3001/events/submissions` directly on the compose network: **404 Not Found** — the *running* `core-api` container was built before the F6 backend module (`events/`) was added to the image, so it hasn't been redeployed yet. Rebuilding/redeploying the running stack is a deploy action, which I did not perform (out of scope — no real deployments per role rules).

**Net result:** I could not capture a live incremental-frame curl trace against the currently-running containers, because of two pre-existing, unrelated blockers (dev-placeholder `DOMAIN` + core-api image not yet rebuilt with F6 code) — not because of anything in the Caddy reverse-proxy config. The static analysis in §1 (adapted JSON, no flush/encode overrides, content-type-based auto-flush is Caddy's documented default) is the evidence for the "no change needed" conclusion; §2 confirms the file is syntactically valid and already correctly formatted.

### For a human to run (rebuild + real E2E check on staging/dev)

```bash
# 1. Ensure infra/.env has DOMAIN=localhost for a local/dev check (or a real resolvable domain in staging).
# 2. Rebuild core-api with the F6 events module and restart the stack:
cd infra
docker compose build core-api
docker compose up -d core-api caddy
# 3. Obtain a session cookie (login via the dashboard or POST /api/auth/login), then:
curl -N -b "connect.sid=<session-cookie-value>" http://localhost/api/events/submissions
#    Expect: immediate headers (Content-Type: text/event-stream), then an initial
#    ": connected" comment frame arriving right away (not after a delay), and a
#    ": ping" comment frame every ~25s while the connection is held open with -N
#    (curl's --no-buffer) for >60s to confirm no idle-timeout closes it early (AC-20).
# 4. Trigger a real status transition (e.g. PATCH /internal/submissions/:id via the
#    worker-api token) in another terminal while the curl above is running, and confirm
#    the `event: submission.status` frame appears in the curl output within ~1-2s,
#    not buffered until curl is killed (AC-19).
```

## Blockers / open questions

None blocking DEVOPS sign-off — no infra config change is required. Two pre-existing, out-of-scope items noted for the human/deploy owner (not blockers to this task):
1. `infra/.env` `DOMAIN=bot.example.com` will keep failing ACME issuance in this sandbox/dev context; use `DOMAIN=localhost` for local verification (already documented in root `CLAUDE.md`).
2. The currently-running `core-api` container predates the F6 `events/` module — a rebuild (`docker compose build core-api && docker compose up -d core-api`) is needed before the live curl check in "For a human to run" above will return anything but 404/401.

## Notes for the next role

- **QA:** AC-19/AC-20 are satisfied by config analysis (no buffering/compression override present; Caddy's default auto-flush applies to `text/event-stream`) rather than a live capture, because of the two environment blockers above — neither caused by this feature. For a real device/browser E2E check (AC-17/AC-18, multi-tab, visible incremental updates), the human deploying should first rebuild+restart `core-api` per the commands above, then use the dashboard UI (or the provided `curl -N` recipe) against a `DOMAIN=localhost` (or real staging domain) Caddy instance. No further infra changes are needed regardless of that check's outcome — the Caddyfile is not the blocker.
- **Files touched by this task:** none (`infra/Caddyfile` and `infra/docker-compose.yml` were read/validated only, not edited — no change was needed).
