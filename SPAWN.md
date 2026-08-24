**SPAWN.md** — AI Audio Pipeline for `ledger_article_site`
============================================================

> One-page operational guide: generate article briefing audio via
> ElevenLabs, verify the player locally, and keep assets fresh.

---

## 1. What This Repo Has

| Layer | File(s) |
|---|---|
| Manifest & types | `lib/briefing-audio.ts`, `lib/articles.ts` |
| HTML5 Player | `components/AudioBriefingPlayer.tsx` |
| Meta-row wrapper | `components/ArticleMetaRow.tsx` |
| Dynamic fallback API | `app/api/tts/generate/route.ts` |
| Batch generator | `scripts/generate-briefing-audio.ts` |
| Gap-filler | `scripts/sponge.ts` |
| Generated assets | `public/audio/briefings/{slug}.mp3` |
| Manifest | `briefing-audio-manifest.json` (git-tracked) |

---

## 2. ElevenLabs Setup (~2 minutes)

### Create account & get API key

1. Go to **[elevenlabs.io](https://elevenlabs.io)** → Sign up (Google or email)
2. Dashboard → **Settings → API Keys** → **Create API Key**
3. Copy the key (`xi_...`)

### Pick a voice

1. Go to the **[Voice Library](https://elevenlabs.io/voice-library)**
2. Browse/build-in voices or clone your own
3. Click a voice → copy its **Voice ID** (UUID like `21m00Tcm4TlvDq8ikWAM`)

Recommended free-tier voices for editorial/briefing:
- `21m00Tcm4TlvDq8ikWAM` — Rachel (warm, authoritative)
- `AZnzlk1XvdvUeBnXmlld` — Domi (deep, calm)
- `ErXwobaYiN019PkySvjV` — Antoni (neutral male)

### Set environment variables

```bash
export ELEVENLABS_API_KEY=xi_...
export ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
export ELEVENLABS_MODEL=eleven_multilingual_v2   # default, good for en
```

Add to `.env.local` for persistence:

```bash
# .env.local
ELEVENLABS_API_KEY=xi_...
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL=eleven_multilingual_v2
```

---

## 3. Generate All Audio Briefings

```bash
cd /path/to/ledger_article_site

# Verify env vars are set
echo $ELEVENLABS_API_KEY   # → xi_...
echo $ELEVENLABS_VOICE_ID  # → 21m00Tcm4TlvDq8ikWAM

# Run the generation script (installs tsx if needed)
npx tsx scripts/generate-briefing-audio.ts
```

**Expected output:**

```
╔══════════════════════════════════════════════╗
║   Ledger — AI Audio Briefing Generator       ║
╚══════════════════════════════════════════════╝

ElevenLabs   : https://api.elevenlabs.io/v1
Model        : eleven_multilingual_v2
Voice ID     : 21m00Tcm4TlvDq8ikWAM
Rate Limit   : 500ms between requests

✓ API key valid (tier: free, usage: 0/10000)

Found 18 articles with briefing content.

[01/18] become-a-super-salesforce-administrator … ✓ written (1:42 · 2.1 MB)
[02/18] conflict-management-and-collaboration … ✓ written (2:08 · 2.7 MB)
...
```

**After it finishes:**

```bash
git add public/audio/briefings/ briefing-audio-manifest.json
git commit -m "feat: generate AI voice audio briefings"
git push origin main
```

---

## 4. What Gets Generated

| Output | Location | Description |
|---|---|---|
| Audio files | `public/audio/briefings/{slug}.mp3` | MP3 binary, served directly by Next.js static file handler |
| Manifest | `briefing-audio-manifest.json` | Git-tracked JSON mapping `{ slug: { url, durationSeconds, voiceProfile, ... } }` |

**Manifest shape:**

```json
{
  "version": 1,
  "generatedAt": "2026-01-15T10:30:00.000Z",
  "engine": "elevenlabs",
  "modelSize": "eleven_multilingual_v2",
  "entries": {
    "become-a-super-salesforce-administrator": {
      "slug": "become-a-super-salesforce-administrator",
      "url": "/audio/briefings/become-a-super-salesforce-administrator.mp3",
      "durationSeconds": 102.5,
      "voiceProfile": "21m00Tcm4TlvDq8ikWAM",
      "byteSize": 2179840,
      "generatedAt": "2026-01-15T10:30:00.000Z",
      "mimeType": "audio/mpeg"
    }
  }
}
```

---

## 5. Re-generating / Adding New Articles

### Full regenerate (all articles)

```bash
# Delete the manifest to force fresh generation
rm briefing-audio-manifest.json
npx tsx scripts/generate-briefing-audio.ts
```

### Generate only new/missing articles

```bash
npx tsx scripts/sponge.ts
```

`sponge.ts` checks `public/audio/briefings/{slug}.mp3` on disk — if the file exists and has content, it skips it. Use this after adding a single new article without re-running the whole batch.

---

## 6. ElevenLabs API Contract (reference)

The generation scripts and the Next.js proxy both call the same endpoint:

### Generate speech

```http
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
xi-api-key: xi_...
Content-Type: application/json
Accept: audio/mpeg

{
  "text": "Here is your executive briefing. The core bottleneck: ...",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  }
}
```

**Response:** Raw MP3 binary (`audio/mpeg`), ~64 KB streaming chunks.

**Response header `X-Audio-Duration`:** Clip length in seconds (production tier only; script falls back to word-count estimate on free tier).

### Free tier limits

| Limit | Value |
|---|---|
| Characters/month | 10,000 |
| Concurrent requests | Not explicitly limited |
| Voices | 3 custom voices |
| Audio duration | No hard cap per clip |

Each article briefing is typically 100–300 words (~50–150 chars), so 10,000 chars ≈ **30–60 articles/month** on the free tier. Most sites stay well within this.

---

## 7. Next.js Dynamic Fallback (on-demand generation)

If `briefing-audio-manifest.json` doesn't have an entry for an article:

1. `AudioBriefingPlayer` mounts but shows `"AI-generated voice audio coming soon"`
2. You can call the API route to generate on-demand:
   ```bash
   curl -X POST http://localhost:3000/api/tts/generate \
     -H "Content-Type: application/json" \
     -d '{"text": "Here is your executive briefing...", "voiceId": "21m00Tcm4TlvDq8ikWAM"}'
   ```
3. Response contains `audioUrl` as a base64 data URI the player can consume immediately

---

## 8. Verification Checklist

```bash
# 1. Manifest exists and is valid JSON
cat briefing-audio-manifest.json | jq .

# 2. Audio files served from public/ directory
ls -lh public/audio/briefings/ | head -10

# 3. Site loads — no audio errors in browser console
pnpm dev
# Open: http://localhost:3000/articles/<slug>
# DevTools → Network → filter "audio"
# Confirm: 200 for /audio/briefings/{slug}.mp3

# 4. Player UI visible beneath meta row
# → "Audio Briefing" · play ▶ button · scrubber · speed pills

# 5. Playback works
# → Click ▶ → hear AI voice → scrub → change speed → click ■ → reset to 0:00
```

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `ELEVENLABS_API_KEY is not set` | Export it or add to `.env.local` |
| `401 Unauthorized` | Key is wrong or expired — regenerate at elevenlabs.io/settings |
| `422 Unprocessable` | Voice ID is invalid — verify at elevenlabs.io/voice-library |
| Character limit hit | You've used 10k chars this month on free tier — upgrade or wait for reset |
| Audio file is 0 bytes | Check network tab — API returned error body instead of MP3 |
| Player shows "coming soon" | Run the generation script and commit the manifest + audio files |

---

## 10. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                  ledger_article_site (Next.js)                   │
│                                                                  │
│  ┌─────────────────┐      ┌──────────────────────────┐          │
│  │  lib/articles.ts │──────│ briefing-audio-manifest   │          │
│  │  (SSG pre-render)│      │ .json  ← git-tracked      │          │
│  └────────┬────────┘      └───────────┬──────────────┘          │
│           │                            │ reads                  │
│  ┌────────▼────────────────────────────▼───────┐               │
│  │  components/ArticleMetaRow.tsx              │               │
│  │  passes audio → AudioBriefingPlayer          │               │
│  └──────────────────┬──────────────────────────┘               │
│                     │ mounts                                    │
│  ┌──────────────────▼──────────────────────────────────────────┐ │
│  │  components/AudioBriefingPlayer.tsx                         │ │
│  │  <audio src="/audio/briefings/{slug}.mp3">                  │ │
│  │  Scrubber · Waveform · Speed pills · Stop                  │ │
│  │                                                              │ │
│  │  OR (fallback, no manifest entry):                          │ │
│  │  POST /api/tts/generate → base64 data URI                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  app/api/tts/generate/route.ts  (dynamic fallback)         ││
│  │  Calls ElevenLabs API → returns base64 audio blob          ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
                  ┌──────────────────────┐
                  │    ElevenLabs API    │
                  │  api.elevenlabs.io   │
                  │  POST /v1/text-to-   │
                  │  speech/{voice_id}   │
                  └──────────────────────┘
```

---

## 11. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `ELEVENLABS_API_KEY` | ✅ | — | Your ElevenLabs API key (`xi_...`) |
| `ELEVENLABS_VOICE_ID` | ✅ | — | Voice ID from Voice Library |
| `ELEVENLABS_MODEL` | — | `eleven_multilingual_v2` | Model slug — use `eleven_turbo_v2` for faster/cheaper |
| `BRIEFING_TTS_LANG` | — | `en` | Language code (informational) |
| `BRIEFING_RATE_LIMIT_MS` | — | `500` | Milliseconds between API calls |
| `BRIEFING_OUTPUT_DIR` | — | `public/audio/briefings` | Where MP3 files are saved |

---

## 12. Reference Links

| Resource | URL |
|---|---|
| ElevenLabs | https://elevenlabs.io |
| Voice Library | https://elevenlabs.io/voice-library |
| API Docs | https://docs.elevenlabs.io/api-reference |
| Streaming guide | https://docs.elevenlabs.io/streaming |