/**
 * generate-briefing-audio.ts
 *
 * Pre-renders AI-voice briefing audio files for all articles using the
 * Voicebox TTS backend (POST /generate → SSE status stream).
 *
 * Run after the Voicebox Docker container is up and the desired voice
 * profiles have been cloned or selected from the preset catalog:
 *
 *   1. docker compose up voicebox          (or: docker run ...)
 *   2. pnpm run generate-audio             (runs this script)
 *   3. git add briefing-audio-manifest.json public/audio/briefings/
 *
 * Generated files land in `public/audio/briefings/{slug}.wav`, consumed
 * by `AudioBriefingPlayer` at runtime without any extra API round-trip.
 *
 * Environment variables:
 *   VOICEBOX_URL          Base URL of the Voicebox server (default: http://localhost:17600)
 *   BRIEFING_VOICE_PROFILE  Voice profile ID string (required unless overridden per-article)
 *   BRIEFING_TTS_ENGINE    Engine slug: qwen | kokoro | chatterbox | etc. (default: qwen)
 *   BRIEFING_TTS_LANG      BCP-47 language code (default: en)
 *   BRIEFING_MODEL_SIZE    Model size: 1.7B | 0.6B (qwen only)
 *   BRIEFING_RATE_LIMIT_MS Milliseconds between API calls (default: 2000)
 *
 * npx tsx scripts/generate-briefing-audio.ts
 */

/* ------------------------------------------------------------------ */
/*  Imports & env                                                     */
/* ------------------------------------------------------------------ */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VOICEBOX_URL =
  process.env.VOICEBOX_URL?.replace(/\/+$/, "") ?? "http://localhost:17600";
const VOICE_PROFILE = process.env.BRIEFING_VOICE_PROFILE;
const TTS_ENGINE = process.env.BRIEFING_TTS_ENGINE ?? "qwen";
const TTS_LANG = process.env.BRIEFING_TTS_LANG ?? "en";
const MODEL_SIZE = process.env.BRIEFING_MODEL_SIZE;
const RATE_LIMIT_MS = Number.parseInt(process.env.BRIEFING_RATE_LIMIT_MS ?? "2000", 10);
const PROJECT_ROOT = path.resolve(path.dirname(__dirname), ".");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const OUTPUT_DIR = path.join(PUBLIC_DIR, "audio", "briefings");
const MANIFEST_PATH = path.join(PROJECT_ROOT, "briefing-audio-manifest.json");
const ARTICLES_DIR = path.join(PROJECT_ROOT, "content", "articles");
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per article max

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

interface GenerationRequest {
  profile_id?: string;
  text: string;
  language: string;
  engine: string;
  model_size?: string;
  normalize: boolean;
  max_chunk_chars: number;
  crossfade_ms: number;
}

interface GenerationResponse {
  id: string;
  status: string;
  audio_path: string | null;
  duration: number | null;
  error: string | null;
  engine: string;
}

/* ------------------------------------------------------------------ */
/*  Markdown / article helpers                                         */
/* ------------------------------------------------------------------ */

/** Lightweight frontmatter + file reader (avoids loading gray-matter in
 *  scripts — keeping dependencies minimal for the build script. */
function readArticleMarkdown(fullPath: string): { metadata: Record<string, unknown>; content: string } {
  const raw = fs.readFileSync(fullPath, "utf8");
  const fmEnd = raw.indexOf("\n---", 3);
  const content = raw.slice(fmEnd + 4).trim();
  const fmBlock = raw.slice(3, fmEnd).trim(); // strip `---` fences

  const metadata: Record<string, unknown> = {};
  for (const line of fmBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
let value: unknown = line.slice(colonIdx + 1).trim();
  const strVal = typeof value === "string" ? value : String(value);
  if (strVal.startsWith('"') && strVal.endsWith('"')) {
    value = strVal.slice(1, -1);
  } else if (strVal === "true") {
    value = true;
  } else if (strVal === "false") {
    value = false;
  } else if (strVal !== "" && !Number.isNaN(Number(strVal))) {
    value = Number(strVal);
    }
    metadata[key] = value;
  }

  return { metadata, content };
}

/** Strip markdown to plain text for the TTS engine. */
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

/** Render a structured executive summary into natural, readable prose
 *  that the TTS engine speaks naturally. */
function renderSummaryProse(summary: {
  bottleneck: string;
  fix: string;
  outcome: string;
  readTime?: number;
}): string {
  return [
    "Here is your executive briefing.",
    `The core bottleneck: ${summary.bottleneck}`,
    `The recommended fix: ${summary.fix}`,
    `The measured outcome: ${summary.outcome}`,
  ].join(" ");
}

/** Scan articles and return briefing texts keyed by slug. */
function collectBriefings(): BriefingText[] {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.error(`Articles directory not found: ${ARTICLES_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const results: BriefingText[] = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const fullPath = path.join(ARTICLES_DIR, file);
    const { metadata, content } = readArticleMarkdown(fullPath);
    const execSummary = metadata.executiveSummary as
      | { bottleneck: string; fix: string; outcome: string; readTime?: number }
      | undefined;

    if (execSummary?.bottleneck && execSummary?.fix && execSummary?.outcome) {
      results.push({ slug, text: renderSummaryProse(execSummary) });
    } else {
      // Fallback: first 300 words of the article body
      const plain = plainText(content).split(/\s+/).slice(0, 300).join(" ");
      if (plain.length > 10) {
        results.push({ slug, text: plain });
      }
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Voicebox REST client                                              */
/* ------------------------------------------------------------------ */

type StatusListener = (state: { status: string; duration: number | null }) => void;

/** Parse an SSE stream and fire `onEvent` for each data payload. */
async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: StatusListener,
): Promise<{ status: string; duration: number | null }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let accum = "";
  let last: { status: string; duration: number | null } = { status: "generating", duration: null };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accum += decoder.decode(value, { stream: true });
      const chunks = accum.split("\n\n");
      accum = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const raw = dataLine.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const parsed = JSON.parse(raw) as {
            status: string;
            duration: number | null;
          };
          last = parsed;
          onEvent(parsed);
          if (parsed.status === "completed" || parsed.status === "failed") return last;
        } catch {
          // skip bad payloads silently
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return last;
}

/**
 * Submit text to Voicebox, then poll its SSE status stream, returning the
 * fully-resolved audio path once generation is complete.
 */
async function generateAudio(
  text: string,
  onStatusChange?: StatusListener,
): Promise<{ audioPath: string; duration: number }> {
  if (!VOICE_PROFILE) {
    throw new Error(
      "BRIEFING_VOICE_PROFILE env var is required. " +
        "Set it to a Voicebox profile ID (UUID or preset name like 'adam').",
    );
  }

  // 1) Submit generation
  const requestBody: GenerationRequest = {
    profile_id: VOICE_PROFILE,
    text,
    language: TTS_LANG,
    engine: TTS_ENGINE,
    normalize: true,
    max_chunk_chars: 800,
    crossfade_ms: 50,
  };
  if (MODEL_SIZE) requestBody.model_size = MODEL_SIZE;

  const genRes = await fetch(`${VOICEBOX_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => "(no body)");
    throw new Error(`Voicebox /generate failed (${genRes.status}): ${errText}`);
  }

  const genData = (await genRes.json()) as GenerationResponse;

  if (genData.status === "failed") {
    throw new Error(`Voicebox rejected generation: ${genData.error ?? "unknown error"}`);
  }

  const generationId = genData.id;

  // 2) Poll status via SSE
  const start = Date.now();
  let finalStatus: { status: string; duration: number | null } = {
    status: "generating",
    duration: null,
  };

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const statusRes = await fetch(`${VOICEBOX_URL}/generate/${generationId}/status`, {
      headers: { Accept: "text/event-stream" },
    });

    if (statusRes.ok && statusRes.body) {
      finalStatus = await readSseStream(statusRes.body, (state) => {
        onStatusChange?.(state);
      });
    } else {
      // If SSE isn't available, fall back to the JSON response endpoint
      // (some builds of Voicebox mount both).
      const fallbackRes = await fetch(
        `${VOICEBOX_URL}/generate/${generationId}`,
        { headers: { Accept: "application/json" } },
      );
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        finalStatus = {
          status: fbData.status ?? "generating",
          duration: fbData.duration ?? null,
        };
        if (finalStatus.status === "completed" || finalStatus.status === "failed") break;
      }
    }

    if (finalStatus.status === "completed" || finalStatus.status === "failed") break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (finalStatus.status !== "completed" || !finalStatus.duration) {
    throw new Error(`Generation timed out for article after ${POLL_TIMEOUT_MS / 1000}s`);
  }

  // 3) Resolve the audio file — the generation_response contains audio_path
  //    which is a relative path inside Voicebox's data directory.
  const resolvedRes = await fetch(
    `${VOICEBOX_URL}/generate/${generationId}`,
    { headers: { Accept: "application/json" } },
  );
  if (!resolvedRes.ok) {
    throw new Error(`Failed to resolve generated audio path: HTTP ${resolvedRes.status}`);
  }
  const resolvedData = (await resolvedRes.json()) as GenerationResponse;

  if (!resolvedData.audio_path) {
    throw new Error("Voicebox returned completed status but no audio_path");
  }

  const audioPath =
    resolvedData.audio_path.startsWith("http")
      ? resolvedData.audio_path
      : `${VOICEBOX_URL}/data/generations/${resolvedData.audio_path}`;

  return { audioPath, duration: finalStatus.duration };
}

/** Download bytes from a URL and return them as a Buffer. */
async function downloadAudio(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download audio: HTTP ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/* ------------------------------------------------------------------ */
/*  File-system helpers                                               */
/* ------------------------------------------------------------------ */

/** Save Buffer to disk, replacing any previous file atomically. */
function atomicWrite(filePath: string, data: Buffer): void {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, filePath); // atomic on POSIX
}

/** Ensure a directory exists, creating it recursively. */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ------------------------------------------------------------------ */
/*  Manifest helpers                                                  */
/* ------------------------------------------------------------------ */

/** Load an existing manifest if present. */
function loadExistingManifest(): Manifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function buildManifest(entries: ManifestEntry[]): Manifest {
  const entriesMap: Record<string, ManifestEntry> = {};
  for (const e of entries) entriesMap[e.slug] = e;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine: TTS_ENGINE,
    modelSize: MODEL_SIZE,
    entries: entriesMap,
  };
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Ledger — AI Audio Briefing Generator       ║");
  console.log("╚══════════════════════════════════════════════╝\n");
  console.log(`Voicebox URL  : ${VOICEBOX_URL}`);
  console.log(`TTS Engine    : ${TTS_ENGINE}`);
  console.log(`Voice Profile : ${VOICE_PROFILE ?? "(not set — using Voicebox default)"}`);
  console.log(`Rate Limit    : ${RATE_LIMIT_MS}ms between requests`);
  console.log(`Output Dir    : ${OUTPUT_DIR}\n`);

  // Pre-flight — ensure Voicebox is reachable before processing articles.
  try {
    const healthRes = await fetch(`${VOICEBOX_URL}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
    console.log("✓ Voicebox instance is healthy.\n");
  } catch {
    console.error(
      "✗ Cannot reach Voicebox at " + VOICEBOX_URL + ".\n" +
      "  Start it with: docker compose up voicebox\n" +
      "  Or set VOICEBOX_URL to the correct address.",
    );
    process.exit(1);
  }

  ensureDir(OUTPUT_DIR);
  ensureDir(path.dirname(MANIFEST_PATH));

  const briefings = collectBriefings();
  console.log(`Found ${briefings.length} articles with briefing content.\n`);

  const existingManifest = loadExistingManifest();
  const newEntries: ManifestEntry[] = [];
  let generated = 0;
  let skipped = 0;

  for (let i = 0; i < briefings.length; i++) {
    const { slug, text } = briefings[i];
    const prefix = `[${String(i + 1).padStart(2, "0")}/${String(briefings.length).padStart(2, "0")}]`;
    process.stdout.write(`${prefix} ${slug} … `);

    // Throttle between API calls to avoid overwhelming the TTS backend.
    if (i > 0) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

    try {
      let audioPath: string;
      let duration: number;

      // Short-circuit: if we already have a valid entry for this article, reuse it.
      const existingEntry = existingManifest?.entries[slug];
      if (existingEntry?.url && existingEntry.durationSeconds && existingEntry.byteSize > 0) {
        const localPath = path.join(PROJECT_ROOT, existingEntry.url.replace(/^\//, ""));
        if (fs.existsSync(localPath)) {
          console.log(`cached (${fmtDuration(existingEntry.durationSeconds)})`);
          newEntries.push({
            ...existingEntry,
            generatedAt: new Date().toISOString(), // touch the timestamp
          });
          skipped++;
          continue;
        }
      }

      // Generate fresh audio via Voicebox.
      const result = await generateAudio(text, (state) => {
        process.stdout.write(
          `\r${prefix} ${slug} … ${state.status}${state.duration ? ` (${fmtDuration(state.duration)})` : ""}`,
        );
      });

      audioPath = result.audioPath;
      duration = result.duration;

      // 4) Download the generated WAV file.
      process.stdout.write(`\r${prefix} ${slug} … downloading … `);
      const wavBuffer = await downloadAudio(audioPath);

      // 5) Save to public/audio/briefings/{slug}.wav.
      const filename = `${slug}.wav`;
      const outPath = path.join(OUTPUT_DIR, filename);
      atomicWrite(outPath, wavBuffer);

      // 6) Record the entry.
      const entry: ManifestEntry = {
        slug,
        url: `/audio/briefings/${filename}`,
        durationSeconds: Math.round(duration * 100) / 100,
        voiceProfile: VOICE_PROFILE ?? TTS_ENGINE,
        byteSize: wavBuffer.length,
        generatedAt: new Date().toISOString(),
        mimeType: "audio/wav",
      };

      newEntries.push(entry);
      generated++;

      console.log(
        `✓ written (${fmtDuration(duration)} · ${fmtBytes(wavBuffer.length)} · ${filename})`,
      );
    } catch (err) {
      console.log(
        `✗ FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Continue to the next article on failure.
      // The manifest will reflect success entries only.
    }
  }

  // 7) Write manifest (merge with any stale entries not regenerated this run).
  if (generated > 0 || skipped > 0) {
    const mergedEntries: Record<string, ManifestEntry> = { ...(existingManifest?.entries ?? {}) };
    for (const e of newEntries) mergedEntries[e.slug] = e;

    // Drop entries whose files no longer exist on disk.
    for (const [slug, entry] of Object.entries(mergedEntries)) {
      const localPath = path.join(PROJECT_ROOT, entry.url.replace(/^\//, ""));
      if (!fs.existsSync(localPath)) {
        delete mergedEntries[slug];
      }
    }

    const manifest: Manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      engine: TTS_ENGINE,
      modelSize: MODEL_SIZE,
      entries: mergedEntries,
    };

    const json = JSON.stringify(manifest, null, 2) + "\n";
    atomicWrite(MANIFEST_PATH, Buffer.from(json, "utf8"));

    console.log(`\n── Summary ──────────────────────────────`);
    console.log(`  Generated : ${generated}`);
    console.log(`  Skipped   : ${skipped} (cached)`);
    console.log(`  Total in  : ${mergedEntries.length}`);
    console.log(`  Manifest  : ${MANIFEST_PATH}`);
    console.log(`  Assets    : ${OUTPUT_DIR}`);
  } else {
    console.log("\nNo new audio files generated.");
  }
}

/* ------------------------------------------------------------------ */
/*  Formatting utilities                                               */
/* ------------------------------------------------------------------ */

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});