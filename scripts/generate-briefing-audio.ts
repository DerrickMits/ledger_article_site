/**
 * generate-briefing-audio.ts
 *
 * Pre-renders AI-voice briefing audio files for all articles.
 *
 * Two modes:
 *   Normal  — calls ElevenLabs API, generates MP3s, writes manifest.
 *   --skip-api — scans public/audio/briefings/ for existing MP3 files,
 *                skips the API entirely, and writes the manifest from
 *                what's already on disk.
 *
 * Setup: see SPAWN.md for ElevenLabs API key and voice ID.
 *
 *   npx tsx scripts/generate-briefing-audio.ts
 *   npx tsx scripts/generate-briefing-audio.ts --skip-api
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
const RATE_LIMIT_MS = Number.parseInt(process.env.BRIEFING_RATE_LIMIT_MS ?? "500", 10);
const SKIP_API = process.argv.includes("--skip-api");

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
    if (sv.startsWith('"') && sv.endsWith('"')) val = sv.slice(1, -1);
    else if (sv === "true") val = true;
    else if (sv === "false") val = false;
    else if (sv !== "" && !Number.isNaN(Number(sv))) val = Number(sv);
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

async function elevenLabsTts(
  text: string,
  voiceId: string,
  apiKey: string,
  modelId: string = ELEVENLABS_MODEL,
): Promise<{ audioBuffer: Buffer; durationSeconds: number }> {
  const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`;
  const trimmed = text.length > 48_000 ? text.slice(0, 48_000) : text;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: trimmed,
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
    const errText = await response.text().catch(() => "(no body)");
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  const arrayBuf = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuf);
  const durHdr = response.headers.get("x-audio-duration");
  const durationSeconds = durHdr
    ? parseFloat(durHdr)
    : Math.round((trimmed.split(/\s+/).length / 130) * 100) / 100;

  return { audioBuffer, durationSeconds };
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

function estimateDuration(wordCount: number): number {
  return wordCount / 130;
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Ledger — AI Audio Briefing Generator       ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  if (SKIP_API) {
    console.log("── SKIP-API mode: building manifest from existing MP3 files ──\n");
    console.log(`Output Dir : ${OUTPUT_DIR}`);
    console.log(`Manifest   : ${MANIFEST_PATH}\n`);
  } else {
    console.log(`ElevenLabs : ${ELEVENLABS_BASE}`);
    console.log(`Model      : ${ELEVENLABS_MODEL}`);
    console.log(`Voice ID   : ${ELEVENLABS_VOICE_ID ?? "(default)"}`);
    console.log(`Rate Limit : ${RATE_LIMIT_MS}ms between requests`);
    console.log(`Output Dir : ${OUTPUT_DIR}\n`);
  }

  if (!SKIP_API) {
    if (!ELEVENLABS_API_KEY) {
      console.error("✗ ELEVENLABS_API_KEY not set. See SPAWN.md.");
      process.exit(1);
    }
    if (!ELEVENLABS_VOICE_ID) {
      console.error("✗ ELEVENLABS_VOICE_ID not set. See SPAWN.md.");
      process.exit(1);
    }
    try {
      const meRes = await fetch(`${ELEVENLABS_BASE}/user`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (!meRes.ok) throw new Error(`HTTP ${meRes.status}`);
      const meData = await meRes.json().catch(() => ({}));
      const sub = (meData as Record<string, unknown>).subscription as Record<string, unknown> | undefined;
      console.log(`✓ API key valid (tier: ${(sub?.tier as string) ?? "?"})\n`);
    } catch {
      console.error("✗ Cannot reach ElevenLabs.");
      process.exit(1);
    }
  }

  ensureDir(OUTPUT_DIR);
  ensureDir(path.dirname(MANIFEST_PATH));

  const briefings = collectBriefings();
  console.log(`Found ${briefings.length} articles with briefing content.\n`);

  const existingManifest = loadManifest();
  const newEntries: ManifestEntry[] = [];
  let generated = 0, skipped = 0, missing = 0;

  for (let i = 0; i < briefings.length; i++) {
    const { slug, text } = briefings[i];
    const prefix = `[${String(i + 1).padStart(2, "0")}/${String(briefings.length).padStart(2, "0")}]`;
    const filename = `${slug}.mp3`;
    const filePath = path.join(OUTPUT_DIR, filename);

    if (SKIP_API) {
      process.stdout.write(`${prefix} ${slug} … `);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        console.log(`MISSING — place ${filename} in ${OUTPUT_DIR}`);
        missing++;
        continue;
      }
      const stat = fs.statSync(filePath);
      const wc = text.split(/\s+/).length;
      const dur = Math.round(estimateDuration(wc) * 100) / 100;
      newEntries.push({
        slug,
        url: `/audio/briefings/${filename}`,
        durationSeconds: dur,
        voiceProfile: ELEVENLABS_VOICE_ID ?? "manual",
        byteSize: stat.size,
        generatedAt: new Date().toISOString(),
        mimeType: "audio/mpeg",
      });
      skipped++;
      console.log(`✓ found (${fmtDur(dur)} · ${fmtBytes(stat.size)})`);
      continue;
    }

    process.stdout.write(`${prefix} ${slug} … `);

    if (i > 0) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

    try {
      const existingEntry = existingManifest?.entries[slug];
      if (existingEntry?.url && existingEntry.byteSize > 0) {
        const localPath = path.join(PROJECT_ROOT, existingEntry.url.replace(/^\//, ""));
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
          console.log(`cached (${fmtDur(existingEntry.durationSeconds)})`);
          newEntries.push({ ...existingEntry, generatedAt: new Date().toISOString() });
          skipped++;
          continue;
        }
      }

      process.stdout.write(`synth … `);
      const { audioBuffer, durationSeconds } = await elevenLabsTts(
        text,
        ELEVENLABS_VOICE_ID!,
        ELEVENLABS_API_KEY!,
        ELEVENLABS_MODEL,
      );
      atomicWrite(filePath, audioBuffer);

      const wc = text.split(/\s+/).length;
      const duration = durationSeconds > 0
        ? Math.round(durationSeconds * 100) / 100
        : Math.round(estimateDuration(wc) * 100) / 100;

      newEntries.push({
        slug,
        url: `/audio/briefings/${filename}`,
        durationSeconds: duration,
        voiceProfile: ELEVENLABS_VOICE_ID!,
        byteSize: audioBuffer.length,
        generatedAt: new Date().toISOString(),
        mimeType: "audio/mpeg",
      });
      generated++;
      console.log(`✓ written (${fmtDur(duration)} · ${fmtBytes(audioBuffer.length)})`);
    } catch (err) {
      console.log(`✗ FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Merge + prune + write manifest
  if (generated > 0 || skipped > 0) {
    const merged: Record<string, ManifestEntry> = { ...(existingManifest?.entries ?? {}) };
    for (const e of newEntries) merged[e.slug] = e;
    for (const [slug, entry] of Object.entries(merged)) {
      // URL is public-relative (e.g. /audio/briefings/x.mp3);
      // resolve through PUBLIC_DIR on disk.
      const p = path.join(PUBLIC_DIR, entry.url.replace(/^\//, ""));
      if (!fs.existsSync(p) || fs.statSync(p).size === 0) delete merged[slug];
    }
    writeManifest(merged);
    console.log("\n── Summary ──────────────────────────────");
    console.log(`  Generated : ${generated}`);
    console.log(`  Found     : ${skipped}`);
    if (SKIP_API) console.log(`  Missing   : ${missing}`);
    console.log(`  Total in  : ${Object.keys(merged).length}`);
    console.log(`  Manifest  : ${MANIFEST_PATH}`);
    console.log(`  Assets    : ${OUTPUT_DIR}`);
  } else if (SKIP_API && missing > 0) {
    console.log(`\n${missing} file(s) missing. Place them in ${OUTPUT_DIR} and re-run.`);
    process.exit(1);
  } else {
    console.log("\nNo new audio files generated.");
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});