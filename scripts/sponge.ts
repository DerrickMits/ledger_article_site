/**
 * sponge.ts
 *
 * Lightweight gap-filler companion to generate-briefing-audio.ts.
 *
 * Modes:
 *   Normal  — scans public/audio/briefings/ for existing MP3 files,
 *             skips API calls, and writes the manifest from disk.
 *             (Sponge is the "soak up what's already here" step.)
 *
 *   --skip-api  — same as normal mode (explicit flag for clarity).
 *
 *   No --skip-api flag: in this ElevenLabs-only version, sponge always
 *   works in manual/manifest-from-existing-files mode. The real API
 *   generation is handled by generate-briefing-audio.ts.
 *
 * Usage:
 *   npx tsx scripts/sponge.ts
 *   npx tsx scripts/sponge.ts --skip-api
 *
 * Environment variables (informational; not required in skip mode):
 *   ELEVENLABS_API_KEY     ElevenLabs API key
 *   ELEVENLABS_VOICE_ID   Voice ID
 *   ELEVENLABS_MODEL       Model slug (default: eleven_multilingual_v2)
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
const SKIP_API = process.argv.includes("--skip-api");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Briefing {
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
  version: number;
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
  console.log("── sponge.ts — AI Audio Briefing Gap-Filler ──\n");
  console.log(`Mode        : scan existing MP3 files (no API)`);
  console.log(`Output Dir  : ${OUTPUT_DIR}`);
  console.log(`Manifest    : ${MANIFEST_PATH}\n`);

  if (!SKIP_API) {
    console.log("(hint: --skip-api is the default for sponge; passing it explicitly for clarity)\n");
  }

  ensureDir(OUTPUT_DIR);

  const briefings = collectBriefings();
  const manifest = loadManifest() ?? {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine: "elevenlabs",
    entries: {},
  };

  let found = 0;
  let missing = 0;
  const newEntries: ManifestEntry[] = [];

  for (let i = 0; i < briefings.length; i++) {
    const { slug, text } = briefings[i];
    const prefix = `[${String(i + 1).padStart(2, "0")}/${String(briefings.length).padStart(2, "0")}]`;
    const filename = `${slug}.mp3`;
    const filePath = path.join(OUTPUT_DIR, filename);

    process.stdout.write(`${prefix} ${slug} … `);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      console.log(`MISSING — copy ${filename} into ${OUTPUT_DIR}`);
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
    found++;
    console.log(`✓ found (${fmtDur(dur)} · ${fmtBytes(stat.size)})`);
  }

  // Merge new entries into manifest
  const merged: Record<string, ManifestEntry> = { ...(manifest.entries) };
  for (const e of newEntries) merged[e.slug] = e;

  // Prune entries for articles that no longer exist on disk
  const articleSlugs = new Set(briefings.map((b) => b.slug));
  for (const [slug] of Object.entries(merged)) {
    if (!articleSlugs.has(slug)) delete merged[slug];
  }
  // Prune entries whose audio file is missing
  for (const [slug, entry] of Object.entries(merged)) {
    const p = path.join(OUTPUT_DIR, `${slug}.mp3`);
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) delete merged[slug];
  }

  writeManifest(merged);

  console.log("\n── Summary ─────────────────────────────────────");
  console.log(`  Found     : ${found}`);
  console.log(`  Missing   : ${missing}`);
  console.log(`  In manifest: ${Object.keys(merged).length}`);
  console.log(`  Manifest  : ${MANIFEST_PATH}`);
  console.log(`  Assets    : ${OUTPUT_DIR}`);

  if (missing > 0 && found === 0) {
    console.log(`\nAll articles missing. Run npx tsx scripts/generate-briefing-audio.ts to generate.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});