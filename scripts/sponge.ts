/**
 * sponge.ts
 *
 * A lightweight companion to generate-briefing-audio.ts that focuses on the
 * "secondary/dynamic" path: it reads the current manifest, identifies any
 * articles that are missing pre-generated audio, then calls the local
 * Voicebox REST API (POST /generate → SSE poll) to synthesize them on-demand.
 *
 * Unlike the primary batch script, this one:
 *   - Skips articles that already have a valid cached audio file in
 *     public/audio/briefings/{slug}.wav.
 *   - Falls back to the local Voicebox Docker URL for any missing entries.
 *   - Writes the updated manifest atomically at the end.
 *   - Is designed to be run manually or wired into the Next.js on-demand
 *     ISR revalidation path (e.g. via a cron job or a Vercel cron trigger).
 *
 * Usage:
 *   npx tsx scripts/sponge.ts
 *
 * Environment variables (same as generate-briefing-audio.ts):
 *   VOICEBOX_URL            Base URL of the running Voicebox instance
 *   BRIEFING_VOICE_PROFILE  Voice profile ID (required)
 *   BRIEFING_TTS_ENGINE     Engine slug (default: qwen)
 *   BRIEFING_TTS_LANG       BCP-47 language code (default: en)
 *   BRIEFING_MODEL_SIZE     Model size: 1.7B | 0.6B (qwen only)
 *   BRIEFING_RATE_LIMIT_MS  Milliseconds between API calls (default: 2000)
 *   BRIEFING_POLL_MS        Milliseconds between SSE status polls (default: 3000)
 *   BRIEFING_TIMEOUT_MS     Max wait per article in ms (default: 600000 = 10min)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ */
/*  Configuration (env with sensible defaults)                         */
/* ------------------------------------------------------------------ */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const OUTPUT_DIR = path.join(PUBLIC_DIR, "audio", "briefings");
const MANIFEST_PATH = path.join(PROJECT_ROOT, "briefing-audio-manifest.json");
const ARTICLES_DIR = path.join(PROJECT_ROOT, "content", "articles");

const VOICEBOX_URL =
  process.env.VOICEBOX_URL?.replace(/\/+$/, "") ?? "http://localhost:17600";
const VOICE_PROFILE = process.env.BRIEFING_VOICE_PROFILE;
const TTS_ENGINE = process.env.BRIEFING_TTS_ENGINE ?? "qwen";
const TTS_LANG = process.env.BRIEFING_TTS_LANG ?? "en";
const MODEL_SIZE = process.env.BRIEFING_MODEL_SIZE;
const RATE_LIMIT_MS = Number.parseInt(process.env.BRIEFING_RATE_LIMIT_MS ?? "2000", 10);
const POLL_INTERVAL_MS = Number.parseInt(process.env.BRIEFING_POLL_MS ?? "3000", 10);
const POLL_TIMEOUT_MS = Number.parseInt(process.env.BRIEFING_TIMEOUT_MS ?? String(10 * 60 * 1000), 10);

/* ------------------------------------------------------------------ */
/*  Types (mirrors briefing-audio.ts)                                 */
/* ------------------------------------------------------------------ */

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
  version: number;
  generatedAt: string;
  engine: string;
  modelSize?: string;
  entries: Record<string, ManifestEntry>;
}

/* ------------------------------------------------------------------ */
/*  Article helpers (lightweight — no gray-matter dependency)          */
/* ------------------------------------------------------------------ */

interface Briefing {
  slug: string;
  text: string;
}

/** Strip markdown to prose for the TTS engine. */
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

/** Render structured executive summary into readable prose. */
function summaryProse(
  bottleneck: string,
  fix: string,
  outcome: string,
): string {
  return [
    "Here is your executive briefing.",
    `The core bottleneck: ${bottleneck}`,
    `The recommended fix: ${fix}`,
    `The measured outcome: ${outcome}`,
  ].join(" ");
}

/** Read a `.md` article file and return its frontmatter as a plain object
 *  and the raw markdown body. Avoids the gray-matter dependency. */
function parseMd(file: string): { meta: Record<string, unknown>; body: string } {
  const raw = fs.readFileSync(file, "utf8");
  // Find the closing --- of the frontmatter fence.
  const fmEnd = raw.indexOf("\n---", 3);
  const body = fmEnd >= 0 ? raw.slice(fmEnd + 4).trim() : raw;
  const fmRaw = fmEnd >= 0 ? raw.slice(3, fmEnd).trim() : "";

  const meta: Record<string, unknown> = {};
  for (const line of fmRaw.split("\n")) {
    const ci = line.indexOf(":");
    if (ci < 0) continue;
    let val: unknown = line.slice(ci + 1).trim();
    const strVal = typeof val === "string" ? val : String(val);
    if (strVal.startsWith('"') && strVal.endsWith('"')) {
      val = strVal.slice(1, -1);
    } else if (strVal === "true") {
      val = true;
    } else if (strVal === "false") {
      val = false;
    } else if (!isNaN(Number(val))) {
      val = Number(val);
    }
    meta[line.slice(0, ci).trim()] = val;
  }
  return { meta, body };
}

/** Scan articles/ and return a briefing text for each one. */
function collectBriefings(): Briefing[] {
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
    .filter((b): b is Briefing => b !== null);
}

/* ------------------------------------------------------------------ */
/*  Voicebox REST client                                              */
/* ------------------------------------------------------------------ */

interface GenerationResponse {
  id: string;
  status: string;
  audio_path: string | null;
  duration: number | null;
  error: string | null;
  engine: string;
}

async function readSse(
  stream: ReadableStream<Uint8Array>,
  onUpdate: (status: string, duration: number | null) => void,
): Promise<{ status: string; duration: number | null }> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let last: { status: string; duration: number | null } = {
    status: "generating",
    duration: null,
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const raw = dataLine.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const ev = JSON.parse(raw) as { status: string; duration: number | null };
          last = ev;
          onUpdate(ev.status, ev.duration);
          if (ev.status === "completed" || ev.status === "failed") return last;
        } catch {
          // skip malformed payloads
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return last;
}

/**
 * Submit `text` to Voicebox and poll SSE until the audio is ready.
 * Returns `{ audioPath, duration }`.
 */
async function generateAudio(text: string): Promise<{ audioPath: string; duration: number }> {
  if (!VOICE_PROFILE) {
    throw new Error("BRIEFING_VOICE_PROFILE is not set.");
  }

  // 1) Fire generation request.
  const genRes = await fetch(`${VOICEBOX_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile_id: VOICE_PROFILE,
      text,
      language: TTS_LANG,
      engine: TTS_ENGINE,
      model_size: MODEL_SIZE,
      normalize: true,
      max_chunk_chars: 800,
      crossfade_ms: 50,
    } satisfies Record<string, unknown>),
  });
  if (!genRes.ok) {
    const body = await genRes.text().catch(() => "");
    throw new Error(`Voicebox /generate HTTP ${genRes.status}: ${body}`);
  }
  const gen = (await genRes.json()) as GenerationResponse;
  if (gen.status === "failed") {
    throw new Error(`Voicebox rejected: ${gen.error ?? "unknown"}`);
  }
  if (!gen.id) throw new Error("Voicebox returned generation without id");

  // 2) Poll status via SSE.
  const start = Date.now();
  let state: { status: string; duration: number | null } = {
    status: gen.status ?? "generating",
    duration: gen.duration,
  };

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const statusRes = await fetch(`${VOICEBOX_URL}/generate/${gen.id}/status`, {
      headers: { Accept: "text/event-stream" },
    });
    if (statusRes.ok && statusRes.body) {
      state = await readSse(statusRes.body, () => {});
    } else {
      // Fallback to JSON polling if SSE is unavailable.
      const fb = await fetch(`${VOICEBOX_URL}/generate/${gen.id}`);
      if (fb.ok) {
        const fbData = await fb.json();
        state.status = fbData.status ?? state.status;
        state.duration = fbData.duration ?? state.duration;
      }
    }
    if (state.status === "completed" || state.status === "failed") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  if (state.status !== "completed" || !state.duration) {
    throw new Error(`Generation timed out after ${(Date.now() - start) / 1000}s`);
  }

  // 3) Resolve audio URL from the completed generation record.
  const resolved = await fetch(`${VOICEBOX_URL}/generate/${gen.id}`);
  if (!resolved.ok) throw new Error(`HTTP ${resolved.status} resolving audio path`);
  const resolvedData = (await resolved.json()) as GenerationResponse;
  if (!resolvedData.audio_path) throw new Error("Completed generation has no audio_path");
  const audioUrl = resolvedData.audio_path.startsWith("http")
    ? resolvedData.audio_path
    : `${VOICEBOX_URL}/data/generations/${resolvedData.audio_path}`;

  return { audioPath: audioUrl, duration: state.duration };
}

/** Download a URL to a Buffer. */
async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
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
    engine: TTS_ENGINE,
    modelSize: MODEL_SIZE,
    entries,
  };
  ensureDir(path.dirname(MANIFEST_PATH));
  atomicWrite(MANIFEST_PATH, Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"));
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                */
/* ------------------------------------------------------------------ */

function fmtDur(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("── sponge.ts — AI Audio Briefing Gap-Filler ──\n");
  console.log(`Voicebox     : ${VOICEBOX_URL}`);
  console.log(`Engine       : ${TTS_ENGINE}`);
  console.log(`Voice Profile: ${VOICE_PROFILE ?? "(not set)"}`);
  console.log(`Manifest     : ${MANIFEST_PATH}\n`);

  // Pre-flight.
  try {
    const h = await fetch(`${VOICEBOX_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!h.ok) throw new Error(`HTTP ${h.status}`);
    console.log("✓ Voicebox reachable.\n");
  } catch {
    console.error("✗ Cannot reach Voicebox at", VOICEBOX_URL);
    process.exit(1);
  }

  ensureDir(OUTPUT_DIR);

  const briefings = collectBriefings();
  const manifest = loadManifest() ?? { version: 1, generatedAt: new Date().toISOString(), engine: TTS_ENGINE, entries: {} };

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < briefings.length; i++) {
    const { slug, text } = briefings[i];
    const tag = `[${String(i + 1).padStart(2, "0")}/${String(briefings.length).padStart(2, "0")}]`;
    process.stdout.write(`${tag} ${slug} ... `);

    // Throttle.
    if (i > 0) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

    // Check cache: file already on disk AND valid in manifest.
    const localPath = path.join(OUTPUT_DIR, `${slug}.wav`);
    const cachedEntry = manifest.entries[slug];
    const hasFile = fs.existsSync(localPath) && (fs.statSync(localPath).size > 0);

    if (hasFile && cachedEntry?.durationSeconds && cachedEntry.byteSize > 0) {
      console.log(`✓ cached (${fmtDur(cachedEntry.durationSeconds)})`);
      skipped++;
      continue;
    }

    // Generate fresh.
    try {
      const { audioPath, duration } = await generateAudio(text);
      process.stdout.write(`\r${tag} ${slug} ... downloading ... `);
      const buf = await download(audioPath);
      atomicWrite(localPath, buf);

      manifest.entries[slug] = {
        slug,
        url: `/audio/briefings/${slug}.wav`,
        durationSeconds: Math.round(duration * 100) / 100,
        voiceProfile: VOICE_PROFILE ?? TTS_ENGINE,
        byteSize: buf.length,
        generatedAt: new Date().toISOString(),
        mimeType: "audio/wav",
      };
      generated++;
      console.log(
        `✓ written (${fmtDur(duration)} · ${fmtBytes(buf.length)})`,
      );
    } catch (err) {
      failed++;
      console.log(
        `✗ FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Prune entries for articles that no longer exist or have no audio on disk.
  const articlesDir = fs.readdirSync(ARTICLES_DIR).map((f) => f.replace(/\.md$/, ""));
  for (const [slug] of Object.entries(manifest.entries)) {
    if (!articlesDir.includes(slug)) {
      delete manifest.entries[slug];
    }
  }

  // Drop entries whose audio file is missing.
  for (const [slug, entry] of Object.entries(manifest.entries)) {
    const p = path.join(OUTPUT_DIR, `${slug}.wav`);
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
      delete manifest.entries[slug];
    }
  }

  writeManifest(manifest.entries);

  console.log("\n── Summary ─────────────────────────────────────");
  console.log(`  Generated : ${generated}`);
  console.log(`  Skipped   : ${skipped} (already cached)`);
  console.log(`  Failed    : ${failed}`);
  console.log(`  Manifest  : ${MANIFEST_PATH}`);
  console.log(`  Assets    : ${OUTPUT_DIR} (${Object.keys(manifest.entries).length} files)`);
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});