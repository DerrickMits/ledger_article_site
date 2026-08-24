/**
 * generate-briefing-audio.ts
 *
 * Pre-renders AI-voice briefing audio files for all articles using the
 * ElevenLabs TTS API (POST /v1/text-to-speech/{voice_id} → MP3 binary).
 *
 * Run after setting your ElevenLabs API key and voice ID:
 *
 *   1. export ELEVENLABS_API_KEY=xi_...
 *   2. export ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
 *   3. npx tsx scripts/generate-briefing-audio.ts
 *   4. git add public/audio/briefings/ briefing-audio-manifest.json
 *
 * Output lands in public/audio/briefings/{slug}.mp3, consumed directly
 * by AudioBriefingPlayer at runtime.
 *
 * Environment variables:
 *   ELEVENLABS_API_KEY     ElevenLabs API key (required; starts with xi_...)
 *   ELEVENLABS_VOICE_ID   Voice ID (required; UUID from Voice Library)
 *   ELEVENLABS_MODEL       Model slug (default: eleven_multilingual_v2)
 *   BRIEFING_TTS_LANG      BCP-47 language code (informational; defaults to en)
 *   BRIEFING_RATE_LIMIT_MS Milliseconds between API calls (default: 500)
 *   BRIEFING_OUTPUT_DIR    Output directory (default: public/audio/briefings)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ */
/*  Configuration                                                     */
/* ------------------------------------------------------------------ */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const OUTPUT_DIR = process.env.BRIEFING_OUTPUT_DIR ?? path.join(PUBLIC_DIR, "audio", "briefings");
const MANIFEST_PATH = path.join(PROJECT_ROOT, "briefing-audio-manifest.json");
const ARTICLES_DIR = path.join(PROJECT_ROOT, "content", "articles");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
const TTS_LANG = process.env.BRIEFING_TTS_LANG ?? "en";
const RATE_LIMIT_MS = Number.parseInt(process.env.BRIEFING_RATE_LIMIT_MS ?? "500", 10);

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface BriefingText {
  slug: string;
  text: string;
}

interface ManifestEntry {
  slug: string;
  url: string;
  durationSeconds: number;
  voiceProfile: string;
  byteSize: number;
  generatedAt: string;
  mimeType: string;
}

interface Manifest {
  version: 1;
  generatedAt: string;
  engine: string;
  modelSize?: string;
  entries: Record<string, ManifestEntry>;
}

/* ------------------------------------------------------------------ */
/*  Article helpers                                                   */
/* ------------------------------------------------------------------ */

function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*|\*|__|_/g, "")
    .replace(/`/g, "")
    .replace(/>\s+/g, "")
    .replace(/\|/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function summaryProse(bottleneck: string, fix: string, outcome: string): string {
  return [
    "Here is your executive briefing.",
    `The core bottleneck: ${bottleneck}`,
    `The recommended fix: ${fix}`,
    `The measured outcome: ${outcome}`,
  ].join(" ");
}

function parseMd(file: string): { meta: Record<string, unknown>; body: string } {
  const raw = fs.readFileSync(file, "utf8");
  const fmEnd = raw.indexOf("\n---", 3);
  const body = fmEnd >= 0 ? raw.slice(fmEnd + 4).trim() : raw;
  const fmRaw = fmEnd >= 0 ? raw.slice(3, fmEnd).trim() : "";
  const meta: Record<string, unknown> = {};
  for (const line of fmRaw.split("\n")) {
    const ci = line.indexOf(":");
    if (ci < 0) continue;
    const key = line.slice(0, ci).trim();
    let val: unknown = line.slice(ci + 1).trim();
    const sv = typeof val === "string" ? val : String(val);
    if (sv.startsWith('"') && sv.endsWith('"')) {
      val = sv.slice(1, -1);
    } else if (sv === "true") {
      val = true;
    } else if (sv === "false") {
      val = false;
    } else if (sv !== "" && !Number.isNaN(Number(sv))) {
      val = Number(sv);
    }
    meta[key] = val;
  }
  return { meta, body };
}

function collectBriefings(): BriefingText[] {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.error(`Articles dir not found: ${ARTICLES_DIR}`);
    process.exit(1);
  }
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      const { meta, body } = parseMd(path.join(ARTICLES_DIR, file));
      const es = meta.executiveSummary as
        | { bottleneck?: string; fix?: string; outcome?: string }
        | undefined;
      const text =
        es?.bottleneck && es?.fix && es?.outcome
          ? summaryProse(es.bottleneck, es.fix, es.outcome)
          : plainText(body).split(/\s+/).slice(0, 300).join(" ");
      if (text.trim().length < 5) return null;
      return { slug, text };
    })
    .filter((b): b is BriefingText => b !== null);
}

/* ------------------------------------------------------------------ */
/*  ElevenLabs client                                                 */
/* ------------------------------------------------------------------ */

/**
 * ElevenLabs response headers include X-Audio-Duration with the clip
 * length in seconds. We read it from the response headers.
 */
async function elevenLabsTts(
  text: string,
  voiceId: string,
  apiKey: string,
  modelId: string = ELEVENLABS_MODEL,
): Promise<{ audioBuffer: Buffer; durationSeconds: number }> {
  const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`;

  // ElevenLabs caps input at 50 000 chars; chunk if longer.
  const MAX_CHARS = 48_000;
  const chunks = text.length <= MAX_CHARS ? [text] : [text.slice(0, MAX_CHARS)];

  const audioBuffers: Buffer[] = [];
  let lastDurationHeader = 0;

  for (const chunk of chunks) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: chunk,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "(no body)");
      throw new Error(
        `ElevenLabs API error ${response.status}: ${errBody}`,
      );
    }

    // Capture duration from response header (available on production tier).
    const durHdr = response.headers.get("x-audio-duration");
    if (durHdr) lastDurationHeader = parseFloat(durHdr);

    const arrayBuf = await response.arrayBuffer();
    audioBuffers.push(Buffer.from(arrayBuf));
  }

  return {
    audioBuffer: Buffer.concat(audioBuffers),
    durationSeconds: lastDurationHeader,
  };
}

/* ------------------------------------------------------------------ */
/*  Manifest I/O                                                     */
/* ------------------------------------------------------------------ */

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function atomicWrite(file: string, data: Buffer): void {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function loadManifest(): Manifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function writeManifest(entries: Record<string, ManifestEntry>): void {
  const manifest: Manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine: "elevenlabs",
    modelSize: ELEVENLABS_MODEL,
    entries,
  };
  ensureDir(path.dirname(MANIFEST_PATH));
  atomicWrite(
    MANIFEST_PATH,
    Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"),
  );
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                */
/* ------------------------------------------------------------------ */

function fmtDur(s: number): string {
  if (!isFinite(s) || s <= 0) return "?:??";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Estimated duration fallback                                       */
/* ------------------------------------------------------------------ */

/**
 * ElevenLabs doesn't always return x-audio-duration on free tier.
 * Estimate ~130 words/min at 1x rate as a fallback.
 */
function estimateDuration(wordCount: number, _rate: number = 1): number {
  return wordCount / 130;
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Ledger — AI Audio Briefing Generator       ║");
  console.log("╚══════════════════════════════════════════════╝\n");
  console.log(`ElevenLabs   : ${ELEVENLABS_BASE}`);
  console.log(`Model        : ${ELEVENLABS_MODEL}`);
  console.log(`Voice ID     : ${ELEVENLABS_VOICE_ID ?? "(not set — using default)"}`);
  console.log(`Rate Limit   : ${RATE_LIMIT_MS}ms between requests`);
  console.log(`Output Dir   : ${OUTPUT_DIR}\n`);

  if (!ELEVENLABS_API_KEY) {
    console.error(
      "✗ ELEVENLABS_API_KEY env var is not set.\n" +
      "  Get your key at https://elevenlabs.io → Settings → API Keys\n" +
      "  Then: export ELEVENLABS_API_KEY=xi_...",
    );
    process.exit(1);
  }
  if (!ELEVENLABS_VOICE_ID) {
    console.error(
      "✗ ELEVENLABS_VOICE_ID env var is not set.\n" +
      "  Pick a voice at https://elevenlabs.io/voice-library\n" +
      "  Then: export ELEVENLABS_VOICE_ID=<voice-uuid>",
    );
    process.exit(1);
  }

  // Pre-flight: verify API key is valid.
  try {
    const meRes = await fetch(`${ELEVENLABS_BASE}/user`, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!meRes.ok) throw new Error(`HTTP ${meRes.status}`);
    const meData = await meRes.json().catch(() => ({}));
    const subscription = (meData as Record<string, unknown>).subscription as
      | Record<string, unknown>
      | undefined;
    const tier = subscription?.tier ?? "unknown";
    const charCount = subscription?.character_count ?? "?";
    const charLimit = subscription?.character_limit ?? "?";
    console.log(`✓ API key valid (tier: ${tier}, usage: ${charCount}/${charLimit})\n`);
  } catch {
    console.error("✗ Failed to reach ElevenLabs or invalid API key.");
    process.exit(1);
  }

  ensureDir(OUTPUT_DIR);
  ensureDir(path.dirname(MANIFEST_PATH));

  const briefings = collectBriefings();
  console.log(`Found ${briefings.length} articles with briefing content.\n`);

  const existingManifest = loadManifest();
  const newEntries: ManifestEntry[] = [];
  let generated = 0;
  let skipped = 0;

  for (let i = 0; i < briefings.length; i++) {
    const { slug, text } = briefings[i];
    const prefix = `[${String(i + 1).padStart(2, "0")}/${String(briefings.length).padStart(2, "0")}]`;
    process.stdout.write(`${prefix} ${slug} … `);

    // Throttle to stay within rate limits (ElevenLabs free tier: ~5 req/min).
    if (i > 0) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

    try {
      // Skip if already cached on disk and recorded in manifest.
      const existingEntry = existingManifest?.entries[slug];
      if (existingEntry?.url && existingEntry.byteSize > 0) {
        const localPath = path.join(PROJECT_ROOT, existingEntry.url.replace(/^\//, ""));
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
          console.log(`cached (${fmtDur(existingEntry.durationSeconds)})`);
          newEntries.push({
            ...existingEntry,
            generatedAt: new Date().toISOString(),
          });
          skipped++;
          continue;
        }
      }

      // Call ElevenLabs API.
      process.stdout.write(`synth … `);
      const { audioBuffer, durationSeconds } = await elevenLabsTts(
        text,
        ELEVENLABS_VOICE_ID,
        ELEVENLABS_API_KEY,
        ELEVENLABS_MODEL,
      );

      // Save to public/audio/briefings/{slug}.mp3.
      const filename = `${slug}.mp3`;
      const outPath = path.join(OUTPUT_DIR, filename);
      atomicWrite(outPath, audioBuffer);

      // Estimate duration if header was absent (free tier).
      const wc = text.split(/\s+/).length;
      const duration =
        durationSeconds > 0
          ? Math.round(durationSeconds * 100) / 100
          : Math.round(estimateDuration(wc) * 100) / 100;

      const entry: ManifestEntry = {
        slug,
        url: `/audio/briefings/${filename}`,
        durationSeconds: duration,
        voiceProfile: ELEVENLABS_VOICE_ID,
        byteSize: audioBuffer.length,
        generatedAt: new Date().toISOString(),
        mimeType: "audio/mpeg",
      };

      newEntries.push(entry);
      generated++;

      console.log(
        `✓ written (${fmtDur(duration)} · ${fmtBytes(audioBuffer.length)} · ${filename})`,
      );
    } catch (err) {
      console.log(
        `✗ FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Merge new entries with existing manifest (preserving uncached entries).
  if (generated > 0 || skipped > 0) {
    const merged: Record<string, ManifestEntry> = { ...(existingManifest?.entries ?? {}) };
    for (const e of newEntries) merged[e.slug] = e;

    // Drop entries whose files no longer exist on disk.
    for (const [slug, entry] of Object.entries(merged)) {
      const p = path.join(PROJECT_ROOT, entry.url.replace(/^\//, ""));
      if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
        delete merged[slug];
      }
    }

    writeManifest(merged);

    console.log(`\n── Summary ──────────────────────────────`);
    console.log(`  Generated : ${generated}`);
    console.log(`  Skipped   : ${skipped} (cached)`);
    console.log(`  Total in  : ${Object.keys(merged).length}`);
    console.log(`  Manifest  : ${MANIFEST_PATH}`);
    console.log(`  Assets    : ${OUTPUT_DIR}`);
  } else {
    console.log("\nNo new audio files generated.");
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});