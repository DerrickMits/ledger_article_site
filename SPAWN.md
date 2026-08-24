**SPAWN.md** — Voicebox Local-AI Audio Pipeline for `ledger_article_site`
============================================================================

> One-page operational guide: run Voicebox, generate article briefing
> audio, verify the player. Everything you need in one document.

---

## 1. What This Repo Has

| Layer | Key files / path |
|---|---|
| Manifests & types | `lib/briefing-audio.ts`, `lib/articles.ts` |
| HTML5 Player | `components/AudioBriefingPlayer.tsx` |
| Meta-row wrapper | `components/ArticleMetaRow.tsx` |
| Voicebox API proxy (fallback) | `app/api/tts/generate/route.ts` |
| Batch generation script | `scripts/generate-briefing-audio.ts` |
| Continuous gap-filler | `scripts/sponge.ts` |
| Generated assets | `public/audio/briefings/{slug}.wav` |
| Manifest file | `briefing-audio-manifest.json` (git-tracked) |

---

## 2. Run Voicebox (Docker — CPU, 8 GB RAM min)

The site's generation scripts talk to a running Voicebox instance over HTTP.
Spin it up with Docker:

```bash
# From the repo root (has docker-compose.yml in the same folder as Voicebox):
cd /path/to/voicebox   # clone: https://github.com/jamiepine/voicebox

# CPU mode (no GPU required — slower but portable)
docker compose up --build voicebox

# The server listens on port 17493 inside the container.
# docker-compose.yml maps 127.0.0.1:17600 → 17493 (host port 17600).
```

### Environment variables to be aware of

```bash
VOICEBOX_URL=http://localhost:17600      # matches docker-compose host port
VOICEBOX_CORS_ORIGINS=http://localhost:3000   # Next.js dev server origin
```

Verify the server is up:

```bash
curl http://localhost:17600/health
# → {"status": "healthy", ...}
```

Browse the interactive API docs at `http://localhost:17600/docs`.

---

## 3. Pick a Voice Profile

Voicebox ships with preset voices **or** you can clone your own.

### List presets

```bash
curl http://localhost:17600/profiles/presets/kokoro | jq .
# or for qwen_custom_voice:
curl http://localhost:17600/profiles/presets/qwen_custom_voice | jq .
```

Popular presets: `am_adam`, `am_echo`, `am_onyx`, `am_sam`, `af_bella`, `af_nova`.

### Create a cloned voice profile (optional)

```bash
# Upload a reference sample
curl -X POST http://localhost:17600/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "derrick-voice", "description": "Derrick's cloned voice", "language": "en", "voice_type": "cloned"}'
# → {"id": "<uuid>", ...}

# Upload an audio sample (multipart)
curl -X POST "http://localhost:17600/profiles/<uuid>/samples" \
  -F "audio=@/path/to/sample.wav" \
  -F "reference_text=This is a reference recording for voice cloning."
```

---

## 4. Generate All Article Briefing Audio (Primary Pipeline)

Run **once** after:
- Voicebox is healthy
- (Optional) Your cloned voice profile is created
- The article markdown files have `executiveSummary:` frontmatter

```bash
cd /path/to/ledger_article_site

# Required: point at your Voicebox instance and voice profile
export VOICEBOX_URL=http://localhost:17600
export BRIEFING_VOICE_PROFILE=am_adam   # or your cloned profile UUID/name
export BRIEFING_TTS_ENGINE=kokoro       # or qwen, chatterbox, tada, etc.
export BRIEFING_MODEL_SIZE=1.7B         # qwen only; ignored by other engines
export BRIEFING_RATE_LIMIT_MS=2000      # ms between API calls

# Execute the batch generator
npx tsx scripts/generate-briefing-audio.ts
```

**Expected output** (truncated):

```
╔══════════════════════════════════════════════╗
║   Ledger — AI Audio Briefing Generator       ║
╚══════════════════════════════════════════════╝

Voicebox URL  : http://localhost:17600
TTS Engine    : kokoro
Voice Profile : am_adam
Rate Limit    : 2000ms between requests
Output Dir    : /path/to/ledger_article_site/public/audio/briefings

✓ Voicebox instance is healthy.

Found 18 articles with briefing content.

[01/18] become-a-super-salesforce-administrator … ✓ written (1:42 · 2.1 MB)
[02/18] conflict-management-and-collaboration … ✓ written (2:08 · 2.7 MB)
...
```

After it finishes:

```bash
git add public/audio/briefings/ briefing-audio-manifest.json
git commit -m "feat: generate AI voice audio briefings for all articles"
```

---

## 5. Gap-Fill / Regenerate Missing Articles (Continuous Pipeline)

Use `sponge.ts` when you've **added new articles** or want to **regenerate**
all briefings without re-running the full batch from scratch. It skips any
article that already has a valid cached `.wav` file.

```bash
export VOICEBOX_URL=http://localhost:17600
export BRIEFING_VOICE_PROFILE=am_adam
export BRIEFING_TTS_ENGINE=kokoro

npx tsx scripts/sponge.ts
```

**Difference from `generate-briefing-audio.ts`:**

| | generate-briefing-audio.ts | sponge.ts |
|---|---|---|
| Scope | Full batch (all articles) | Gap-fill (skips cached) |
| Primary use | First-time generation | CI / incremental updates |
| Re-run cost | Re-generates everything | Only missing / stale entries |
| Cache check | Skips if manifest entry exists | Verifies file on disk too |

---

## 6. Voicebox REST API Contract (for reference)

The generation scripts and the Next.js proxy both talk to the same
Voicebox API surface. Here is the minimal contract you need:

### Start generation

```http
POST /generate HTTP/1.1
Host: localhost:17600
Content-Type: application/json

{
  "profile_id": "am_adam",
  "text": "Here is your executive briefing. The core bottleneck: …",
  "language": "en",
  "engine": "kokoro",
  "normalize": true,
  "max_chunk_chars": 800,
  "crossfade_ms": 50
}
```

**Response (immediate, async):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "generating",
  "audio_path": null,
  "duration": null,
  "engine": "kokoro"
}
```

### Poll status (SSE stream preferred)

```http
GET /generate/{generationId}/status HTTP/1.1
Accept: text/event-stream
```

Streams events:

```
data: {"id":"...","status":"generating","duration":null,"error":null}
data: {"id":"...","status":"completed","duration":102.5,"error":null}
```

### Resolve completed audio

```http
GET /generate/{generationId} HTTP/1.1
Accept: application/json
```

```json
{
  "id": "...",
  "status": "completed",
  "audio_path": "generations/2025/07/abc123.wav",
  "duration": 102.5,
  "engine": "kokoro"
}
```

**Streaming download:**

```
GET /data/generations/2025/07/abc123.wav
```

---

## 7. Next.js Dynamic Fallback (ISR / On-Demand)

If an article does **not** have a pre-generated audio file, the site calls:

```
POST /api/tts/generate
```

This server-side route (in `app/api/tts/generate/route.ts`) forwards the
request to Voicebox, waits for completion, and returns the final audio URL.
Use this for:

- One-off regenerations without running the batch script.
- ISR revalidation: call this endpoint from a Vercel cron job to keep
  audio fresh for new articles.

To wire it into a Vercel cron:

```yaml
# vercel.json (add to existing config)
{
  "crons": [
    {
      "path": "/api/cron/regenerate-audio",
      "schedule": "0 3 * * 0"
    }
  ]
}
```

---

## 8. Verification Checklist

```bash
# 1. Manifest exists and is valid JSON
cat briefing-audio-manifest.json | jq .

# 2. Audio files served from public/ directory
ls -lh public/audio/briefings/ | head -10

# 3. Site loads without audio errors
pnpm dev   # → http://localhost:3000/articles/<slug>
# Open DevTools → Network tab → filter "audio"
# Confirm: 200 for /audio/briefings/{slug}.wav

# 4. Player UI visible beneath the meta row
# → "Audio Briefing" label + play button + scrubber + speed pills

# 5. Playback works
# → Click ▶ → hear AI voice → scrub bar moves → change speed → click ■ → reset to 0:00
```

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot reach Voicebox` | Container not running. `docker compose up voicebox` from the Voicebox repo dir. Confirm `curl localhost:17600/health` returns 200. |
| `BRIEFING_VOICE_PROFILE is not set` | Set `BRIEFING_VOICE_PROFILE` in your `.env.local` or export before running the script. |
| Generation times out | Increase `BRIEFING_TIMEOUT_MS`. CPU-only Docker is slow (~30-90s per article). |
| Audio file is 0 bytes | Voicebox hit an error — check the container logs: `docker compose logs voicebox`. |
| Manifest has zeros entries | Run `generate-briefing-audio.ts` not `sponge.ts`; or make sure VOICEBOX_URL points to the right container. |
| Player shows but no scrubber | `audio.durationSeconds` is `0` in the manifest — regenerate the entry. |
| CORS error from Voicebox | Add `http://localhost:3000` to `VOICEBOX_CORS_ORIGINS` in the next-themes env. |

---

## 10. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     leder_article_site (Next.js)                 │
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────────────┐          │
│  │  lib/articles.ts │──────│ briefing-audio-manifest  │          │
│  │  (SSG pre-render)│      │ .json  ← git-tracked     │          │
│  └────────┬────────┘      └───────────┬──────────────┘          │
│           │                            │ reads                  │
│  ┌────────▼────────────────────────────▼───────┐               │
│  │  components/ArticleMetaRow.tsx              │               │
│  │  passes audio → AudioBriefingPlayer          │               │
│  └──────────────────┬──────────────────────────┘               │
│                     │ mounts                                    │
│  ┌──────────────────▼──────────────────────────┐               │
│  │  components/AudioBriefingPlayer.tsx         │               │
│  │  <audio src="/audio/briefings/{slug}.wav">  │               │
│  │  Scrubber · Waveform · Speed pills · Stop  │               │
│  └─────────────────────────────────────────────┘               │
│                                                                  │
│  ┌─────────────────────────────────────────────┐               │
│  │  app/api/tts/generate/route.ts  (fallback)  │               │
│  │  Proxy to Voicebox when no pre-rendered     │               │
│  │  audio exists — SSE poll → return audio URL │               │
│  └─────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP
                            ▼
                  ┌──────────────────┐
                  │   Voicebox API   │
                  │  :17600          │
                  │  POST /generate  │
                  │  SSE /status     │
                  │  /data/… download│
                  └─────────┬────────┘
                            │
                Docker Volume (persisted generations)
                            │
                            ▼
              scripts/generate-briefing-audio.ts
                    downloads → PUBLIC_DIR
                            │
                            ▼
              public/audio/briefings/{slug}.wav
```

---

## 11. Reference Links

| Resource | URL |
|---|---|
| Voicebox repo | https://github.com/jamiepine/voicebox |
| Voicebox Docker docs | https://github.com/jamiepine/voicebox#docker |
| API docs (auto) | http://localhost:17600/docs (when running) |
| Kokoro preset voices | http://localhost:17600/profiles/presets/kokoro |
| This PR / commit | See git log for `feat: AI Audio Briefing` commit message |