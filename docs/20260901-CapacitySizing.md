# Capacity & Hardware Sizing — ILM Zalo Grading Bot

**Date:** 2026-09-01
**Status:** Rev B — sizing target reduced from 2,000 to 600 students
**Scope:** VPS sizing, spare capacity, and the five-year growth curve
**Companion artifact:** https://claude.ai/code/artifact/b1ead7fd-6c85-4659-9191-1d128c05986a

Derived from the shipped M1–M4 code in this repository, not from generic per-user
rules of thumb. Source files cited inline.

---

## 1. Headline specification

| Resource      | Rev B (600 students) | Rev A (2,000 students) |
| ------------- | -------------------- | ---------------------- |
| vCPU          | **4 dedicated**      | 8 dedicated            |
| RAM           | **16 GB**            | 32 GB                  |
| Storage       | **500 GB NVMe**      | 1 TB                   |
| Network       | **100 Mbps+**        | 200 Mbps+              |
| Transfer      | **≥ 1 TB / mo**      | ≥ 2 TB / mo            |
| Grading slots | **6**                | 16                     |
| Peak load     | ~45%                 | ~60%                   |

Suggested split: 100 GB root + 400 GB media volume (see §5).

---

## 2. Workload model

Roster size, staff count and retention were given. Daily volume and peak share are
derived or carried forward. **If an assumption is wrong, the figure it feeds is the
one to revisit.**

| Quantity                          | Value      | Basis                                                     |
| --------------------------------- | ---------- | --------------------------------------------------------- |
| Enrolled students                 | 600        | Given                                                     |
| Submitting on a given school day  | ~75%       | *Assumption* — homework compliance                        |
| **Submissions per school day**    | **450**    | Derived                                                   |
| Peak concurrent / in-flight       | 60–120     | 10–20% of roster, carried forward                         |
| Peak window                       | 1 hr       | *Assumption* — evening homework cluster                   |
| Audio / video split               | 70 / 30    | *Assumption* — spec favours speaking clips                |
| Clip length                       | ~5 min     | `CLAUDE.md`; cap `limits.max_clip_duration_sec` = 420 s   |
| Pipeline latency per submission   | 30–90 s    | Architecture doc §3.1 (estimate, never measured live)     |
| Media retention — audio           | 90 d       | Given (3 months) — **matches current default**            |
| Media retention — video original  | 7 d        | §3.8 fixed grace after audio extraction                   |
| Teaching / advisory staff         | 20         | Given                                                     |
| Staff concurrently signed in      | 2–4        | *Assumption* — 10–20% of 20                               |
| Growth                            | 10–15% YoY | Carried forward                                           |

Design point is the upper bound throughout: 120 concurrent, 90 s pipeline, 15% growth.

> **Retention needs no change.** Three months is already the shipped default —
> `limits.media_retention_days` defaults to 90 and §3.8 specifies exactly that.
> Storage figures below are computed on it directly.

---

## 3. Throughput — the binding constraint

**The grading worker processes exactly one submission at a time.**

- `services/grading-worker/src/grading_worker/rabbit_consumer.py:87-91` — `consume()` is
  a sequential `async for message in queue_iter: await self._handle_message(...)`
- `rabbit_consumer.py:37` — `prefetch_count=1`
- `infra/docker-compose.yml` — single `grading-worker` replica, no `deploy.replicas`

At 30–90 s per grading that is a hard ceiling of **40–120 submissions per hour**.

Little's Law (*arrival rate × service time*) at 120 arrivals/hr (0.033/s) and a 90 s
pipeline gives **3 slots to break even** — where break-even means the queue stops
growing, not that it drains.

| Concurrent slots        | Throughput | Drain 120  | Verdict                     |
| ----------------------- | ---------- | ---------- | --------------------------- |
| 1 — *current config*    | 48 / hr    | 2 hr 30 m  | Feedback near midnight      |
| 2                       | 96 / hr    | 1 hr 15 m  | Break-even, no headroom     |
| 4                       | 192 / hr   | 37 m       | Workable minimum            |
| **6 — recommended**     | 288 / hr   | **25 m**   | Drains inside peak window   |
| 10                      | 480 / hr   | 15 m       | Year-5 headroom             |

*Throughput at 75 s average service time. At the 90 s worst case, 6 slots still drain
120 in 30 minutes.*

### Raising `prefetch_count` alone will NOT work

A higher prefetch only buffers messages in the client — the loop still awaits each one
to completion before iterating. Concurrency requires **either** a bounded
`asyncio.TaskGroup`/semaphore around the handler, **or** multiple worker replicas.

**Recommended: 2 replicas with `prefetch_count=3`.** No code change. Safe as written:

- each submission writes to its own `/data/media/{yyyy}/{mm}/{id}/` directory
- `POST /internal/submissions` is already an upsert keyed on `messageId`, so
  redelivery across replicas cannot double-insert

### Before raising concurrency

Six parallel gradings sit well inside Gemini/OpenAI request-per-minute limits, but
**audio tokens-per-minute** is the quota that actually binds on 5-minute clips. Confirm
the tier limit, or the queue moves from a worker bottleneck to a 429 retry storm —
which, with `MAX_RETRIES = 3`, ends in the DLQ. Wide margin expected at 6 slots.

---

## 4. Compute and memory budget

Per submission the only CPU-bound work is FFmpeg. Downloads stream straight to disk
(`media/downloader.py` uses `client.stream` with chunked writes — no buffering) and the
LLM call is pure network wait.

Against the actual `ffmpeg -acodec libmp3lame` invocation: ~3 s of one core for audio
input, ~15 s for a 5-minute video → **~6.6 core-seconds average** at the 70/30 mix.

Draining 120 submissions in 25 minutes costs `120 × 6.6 ÷ 1,500 s` ≈ **0.53 cores
sustained**. Across a whole day the worker burns under one core-hour. The peak is not
FFmpeg-dominated — it is dominated by holding six mostly-idle connections open.

### vCPU allocation — 4 total

| Service                | vCPU |
| ---------------------- | ---- |
| grading-worker ×2      | 1.0  |
| postgres               | 0.75 |
| core-api               | 0.75 |
| zalo-gateway           | 0.25 |
| rabbit + redis + caddy | 0.5  |
| OS + Docker            | 0.25 |
| *unallocated spare*    | 0.5  |

### RAM allocation — 16 GB total

| Service                | RAM    |
| ---------------------- | ------ |
| postgres               | 4 GB   |
| grading-worker ×2      | 2 GB   |
| core-api               | 1 GB   |
| rabbitmq               | 1 GB   |
| redis                  | 0.5 GB |
| zalo-gateway + caddy   | 0.5 GB |
| OS + Docker            | 1.5 GB |
| *page cache + spare*   | 5.5 GB |

Allocations sum to 10.5 GB, so **8 GB is not viable** without trimming Postgres to 2 GB
and dropping to four slots. 16 GB leaves real page cache for Postgres and media reads.

### Do not buy burstable vCPU

FFmpeg transcoding on a credit-based instance (AWS `t`-class, most budget VPS "vCPU"
tiers) exhausts CPU credits during exactly the evening window that matters, then
throttles. A 4-core burstable box has a smaller credit pool to begin with. Specify
**dedicated cores**.

### `core-api` single-process ceiling — not a concern at this scale

`services/core-api/src/main.ts` calls `app.listen()` with no clustering, so one core is
its hard ceiling. Against **2–4 concurrent staff** and at most 20 SSE connections that
ceiling is ~10× away. It was the next bottleneck after the worker at 2,000 students; at
600 it needs no action. Revisit only if staff count grows past ~100.

---

## 5. Storage over a 90-day retention window

Architecture doc §3.8 sizes storage at *"150 bài/ngày × ~5MB ≈ 750MB/ngày → 90 ngày ≈
~70GB, VPS cần đĩa ≥100GB."* That was written for 150 submissions/day. At 450 it is
**three times low** — the shape of the estimate is right, the multiplier is not.

| Store                                | Retention | Per item | Per day  | Steady state  |
| ------------------------------------ | --------- | -------- | -------- | ------------- |
| Audio (`audio.mp3`) — as configured  | 90 d      | 6.2 MB   | 2.8 GB   | 251 GB        |
| Video originals                      | 7 d       | ~75 MB   | 10.1 GB  | 71 GB         |
| Postgres (submissions, gradings, …)  | permanent | ~3.6 KB  | 1.6 MB   | ~1.8 GB / yr  |
| Images, logs, WAL, local backups     | —         | —        | —        | ~30 GB        |
| **Year-1 total, current encoder**    |           |          |          | **354 GB**    |

### The FFmpeg setting — now an optimisation, not a blocker

`services/grading-worker/src/grading_worker/media/ffmpeg.py:34` encodes with `-q:a 4` —
VBR stereo at roughly 165 kbps. That is a music setting. For speech that exists solely
to be scored on pronunciation, mono at 48 kbps is ample and close to what the providers
downmix to anyway.

| Setting                             | 5-min clip | 90-day audio | Year-1 total | Year-5 total |
| ----------------------------------- | ---------- | ------------ | ------------ | ------------ |
| `-q:a 4` — current                  | 6.2 MB     | 251 GB       | 354 GB       | 620 GB       |
| **`-ac 1 -b:a 48k` — proposed**     | **1.8 MB** | **73 GB**    | **176 GB**   | **308 GB**   |

Existing files are unaffected; only new submissions encode smaller.

**This determines whether 500 GB is a five-year disk or a three-year one.** With the
change, year 5 lands at 308 GB — 62% of a 500 GB disk, comfortably under the >80% alert
threshold from §3.8. Without it, year 5 is 620 GB and you cross that threshold around
year 3.

Note that once audio is optimised, **video and audio stores are roughly equal**
(71 GB vs 73 GB) despite video being kept 13× more briefly. If storage ever tightens,
shortening the 7-day video grace is the more effective second lever — though it is a
fixed constant today, not a setting.

### Volume split — recommended, not urgent

`media` and `pgdata` are both Docker named volumes on the same filesystem, so unbounded
media growth can fill the disk Postgres sits on. At 176–354 GB against 500 GB the margin
is wide enough that this is no longer a day-one risk — but it costs nothing to split at
provisioning time (100 GB root + 400 GB media) and is awkward to retrofit.

---

## 6. Network — no longer a constraint

Every submission is downloaded from Zalo in full before FFmpeg touches it, and video is
15× the size of audio — so ingress, not egress, dominates.

| Flow                                | Per day   | Per month  | Notes                                |
| ----------------------------------- | --------- | ---------- | ------------------------------------ |
| Inbound — media download from Zalo  | 11.7 GB   | 304 GB     | 315 audio × 5 MB + 135 video × 75 MB |
| Outbound — audio to LLM provider    | 0.8 GB    | 21 GB      | After encoder fix; 73 GB without it  |
| Outbound — dashboard playback       | 0.2 GB    | 5 GB       | ~90 review listens/day, 20 staff     |
| **Peak-hour inbound rate**          | 3.1 GB/hr | **7 Mbps** | Sustained, bursting 3–5×             |

*26 school days per month.*

At **~330 GB/month** combined you sit at roughly a third of the 1 TB allowance on even
entry-level VPS plans, reaching only ~580 GB by year 5. The transfer-cap warning that
applied at 2,000 students **is withdrawn**. 100 Mbps is sufficient against a 7 Mbps
sustained peak, and most providers bundle 1 Gbps regardless.

---

## 7. Recovery / spare capacity

| Option                                | Standing cost   | RTO       | RPO          |
| ------------------------------------- | --------------- | --------- | ------------ |
| **Backup & rebuild** *(recommended)*  | ~2% of primary  | 2–3 h     | 24 h         |
| Warm spare (2 vCPU / 4 GB / 80 GB)    | ~15% of primary | 60–90 min | 15 min (WAL) |

At 600 students and 20 staff, **backup-and-rebuild is the more proportionate choice**:
the whole stack is one `docker compose up -d --build` against a restored Postgres dump,
and §3.8 already states media is acceptable to lose — *"media chấp nhận mất được — chỉ
Postgres bắt buộc backup."*

Take the warm spare only if a lost evening of grading is genuinely unacceptable. It is a
real cost-vs-RTO tradeoff rather than an obvious default.

Regardless of which model is chosen:

- **Back up Redis as well as Postgres.** Dedup keys live under `dedup:{messageId}` with
  a 7-day TTL. Losing them means Zalo redeliveries get re-graded — duplicate LLM charges
  and duplicate messages to students, which the product rules forbid.
- **RabbitMQ queues are durable but on the lost box.** In-flight submissions at failure
  time are gone unless the volume is replicated. Acceptable given Zalo redelivery,
  provided the point above holds.
- **Nightly `pg_dump` is a 24-hour RPO.** Grading results are permanent records, so a
  day's loss is a day of teacher review work. WAL archiving to object storage tightens
  RPO to ~15 minutes without needing the warm spare at all.

---

## 8. Growth to year five (15% YoY)

| Year | Students | Subs/day | Peak burst | Slots | Media store | Action                     |
| ---- | -------- | -------- | ---------- | ----- | ----------- | -------------------------- |
| 1    | 600      | 450      | 120        | 6     | 144 GB      | Provision as specified     |
| 2    | 690      | 518      | 138        | 6     | 166 GB      | None                       |
| 3    | 794      | 595      | 159        | 8     | 191 GB      | Raise worker replicas to 3 |
| 4    | 913      | 685      | 183        | 8     | 219 GB      | None                       |
| 5    | 1,050    | 788      | 210        | 10    | 252 GB      | Review disk headroom       |

*Media store is audio + video only, assuming the encoder fix and 90-day retention; add
~32 GB for Postgres, images and logs for the disk total. Slots sized to drain each peak
inside ~30 minutes.*

Compound growth of 10–15% is gentle: **year 5 is only 1.75× year 1**, reaching 1,050
students. Sizing at ~45% peak utilisation means compute, memory, storage and bandwidth
all need **no change across the whole window**. Year-5 FFmpeg load at 10 slots is ~0.8
cores sustained during drain — still a fraction of 4 vCPU, because added concurrency is
mostly added network wait.

The only scheduled action in five years is raising the worker replica count, twice.

**Watch LLM spend, not hardware.** It scales directly with audio-minutes, reaching 788
five-minute clips per day by year 5. `cost_log` and the reports subsystem already track
it — that curve governs the budget.

---

## 9. Action list

Provisioning the box without item 1 buys idle capacity: the worker will still grade one
submission at a time on four cores.

| # | Action | Priority | Where |
| - | ------ | -------- | ----- |
| 1 | **Make the grading worker concurrent** — 2 replicas via `deploy.replicas` + `prefetch_count=3` (no code change), or a bounded `asyncio.TaskGroup` of 6 | **Blocker** | `infra/docker-compose.yml`, `rabbit_consumer.py:37,87` |
| 2 | **Ship the retention cron** — every storage figure assumes the §3.8 lifecycle runs; without deletion the 500 GB disk fills in ~14 months | **Blocker** | M3.6, `TASKS.md` |
| 3 | **Re-encode audio mono 48 kbps** — turns 500 GB from a 3-year disk into a 5-year one; verify grading quality on a sample first | High | `media/ffmpeg.py:34` |
| 4 | **Set per-service `mem_limit` / `cpus`** — RabbitMQ's `vm_memory_high_watermark` defaults to 40% of *host* RAM, i.e. ~6.4 GB on a 16 GB box vs the 1 GB budgeted | High | `infra/docker-compose.yml` |
| 5 | **Tune Postgres off defaults** — for 4 GB allocated: `shared_buffers=1GB`, `effective_cache_size=3GB`, `work_mem=16MB` | High | compose / `postgresql.conf` |
| 6 | **Split `/data/media` onto its own volume** — free at provisioning time, awkward to retrofit | Medium | `infra/docker-compose.yml` |
| 7 | **Confirm LLM audio tokens-per-minute limit** at the current tier | Check | provider console |
| 8 | **`core-api` clustering — not needed.** Recorded as a decision: ~10× headroom at 20 staff | None | — |

---

## Appendix — Rev A figures (2,000 students / 200 teachers)

Retained for reference if the roster target changes again.

| Resource      | Value                                           |
| ------------- | ----------------------------------------------- |
| vCPU          | 8 dedicated                                     |
| RAM           | 32 GB                                           |
| Storage       | 1 TB (100 root + 800 media)                     |
| Network       | 200 Mbps+, ≥ 2 TB/mo                            |
| Grading slots | 16                                              |
| Subs/day      | 1,500                                           |
| Peak burst    | 400                                             |
| Media store   | 479 GB (optimised) / 1,073 GB (current encoder) |
| Transfer      | ~1.1 TB/mo — **brushes common VPS caps**        |

Three findings changed character between revisions, not merely magnitude:

1. **Transfer cap** — a likely cost surprise at 2,000; a non-issue at 600.
2. **`core-api` single-process ceiling** — the next bottleneck at 2,000; ~10× away at 600.
3. **Media/pgdata volume split** — a day-one risk at 2,000; hygiene at 600.

The worker concurrency bottleneck (§3) is scale-independent and applies to both.

---

## Caveats

Daily submission volume, the audio/video mix, the 10–20% peak share and staff
concurrency are **stated assumptions, not measurements** — each is flagged in §2 and
should be replaced with observed data once real traffic exists.

Pipeline latency of 30–90 s is the architecture doc's estimate and **has not been
measured against a live LLM key**. The 2026-08-25 acceptance run graded a sample clip on
`gemini-3.6-flash` and logged 4,285 in / 2,131 out tokens, but no full 5-minute clip has
been timed end-to-end at production settings. Re-derive §3 once it has.
