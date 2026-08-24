/**
 * Sidecar manifest for pre-generated AI-voice briefing audio files.
 *
 * The manifest is produced by scripts/generate-briefing-audio.ts after calling
 * the Voicebox REST API and saving the resulting audio assets to
 * public/audio/briefings/.
 *
 * It lives in the project root as briefing-audio-manifest.json so that:
 *  - It is git-committed alongside the site content.
 *  - It is resolved from process.cwd() during SSG.
 *  - The generation script can atomic-replace it (write-then-rename) without
 *    corrupting a partially-written file during an interrupted build.
 */

import fs from "fs";
import path from "path";

/* ------------------------------------------------------------------ */
/*  Manifest entry types                                              */
/* ------------------------------------------------------------------ */

/**
 * Shape expected by the Article.audio field and the AudioBriefingPlayer.
 * Mirrors BriefingAudioEntry minus the slug (already known from the article).
 */
export type BriefingAudio = Omit<BriefingAudioEntry, "slug">;

/**
 * One entry — one per article slug — within the manifest's `entries` map.
 */
export interface BriefingAudioEntry {
  /** The article slug this audio belongs to (e.g. "mastering-the-four-pillars"). */
  slug: string;
  /** Site-relative URL to the generated file; matches the file placed in public/audio/briefings/. */
  url: string;
  /** Duration in seconds (from Voicebox GenerationResponse.duration). */
  durationSeconds: number;
  /** Voice profile name used (e.g. "adam", "Bella", or a cloned-profile UUID). */
  voiceProfile: string;
  /** File size in bytes — useful for pre-flight range-request validation. */
  byteSize: number;
  /** ISO-8601 timestamp recorded when the audio was generated. */
  generatedAt: string;
  /** MIME type reported by the TTS engine output. Typically "audio/wav". */
  mimeType: string;
}

/**
 * Top-level manifest shape saved to briefing-audio-manifest.json.
 */
export interface BriefingAudioManifest {
  /** Schema version — incremented when the entry shape changes. */
  version: number;
  /** UTC timestamp of when this manifest was last written. */
  generatedAt: string;
  /** Voicebox engine key used for all entries in this manifest. */
  engine: string;
  /** Model size tag passed to Voicebox (engine-specific, e.g. "1.7B"). */
  modelSize?: string;
  /** Per-slug entries, keyed by article slug. */
  entries: Record<string, BriefingAudioEntry>;
}

/* ------------------------------------------------------------------ */
/*  Validation + normalization                                        */
/* ------------------------------------------------------------------ */

/**
 * Validate an entry dict loaded from JSON.
 * Returns the entry on success, or null on any validation failure.
 * Error details are logged so failing entries can be identified during a noisy
 * generation run without aborting the whole batch.
 */
function validateEntry(slug: string, raw: unknown): BriefingAudioEntry | null {
  if (typeof raw !== "object" || raw === null) {
    console.error(`[briefing-manifest] entry for "${slug}" is not an object — skipped`);
    return null;
  }
  const obj = raw as Record<string, unknown>;

  const required: [string, unknown, unknown][] = [
    ["url",             obj.url,             ""],
    ["durationSeconds", obj.durationSeconds,  0],
    ["voiceProfile",    obj.voiceProfile,     ""],
    ["byteSize",        obj.byteSize,          0],
    ["generatedAt",     obj.generatedAt,      ""],
    ["mimeType",        obj.mimeType,         ""],
  ];

  for (const [field, actual] of required) {
    if (typeof actual !== "string" && typeof actual !== "number") {
      console.error(`[briefing-manifest] "${slug}": "${field}" must be string/number — skipped`);
      return null;
    }
  }

  if (typeof obj.durationSeconds !== "number" || obj.durationSeconds < 0) {
    console.error(`[briefing-manifest] "${slug}": durationSeconds must be >= 0 — skipped`);
    return null;
  }
  if (typeof obj.byteSize !== "number" || obj.byteSize < 0) {
    console.error(`[briefing-manifest] "${slug}": byteSize must be >= 0 — skipped`);
    return null;
  }

  return {
    slug:        typeof obj.slug === "string" ? (obj.slug as string) : slug,
    url:         String(obj.url),
    durationSeconds: Number(obj.durationSeconds),
    voiceProfile:   String(obj.voiceProfile),
    byteSize:       Number(obj.byteSize),
    generatedAt:    String(obj.generatedAt),
    mimeType:       String(obj.mimeType),
  };
}

/**
 * Validate top-level manifest fields.
 */
function validateTopLevel(raw: Record<string, unknown>): { version: number; generatedAt: string; engine: string; modelSize?: string } | null {
  if (typeof raw.version !== "number" || raw.version !== 1) {
    console.error("[briefing-manifest] invalid version — expected 1");
    return null;
  }
  if (typeof raw.generatedAt !== "string" || typeof raw.engine !== "string") {
    console.error("[briefing-manifest] missing required fields (generatedAt, engine)");
    return null;
  }
  return {
    version: raw.version as number,
    generatedAt: raw.generatedAt as string,
    engine: raw.engine as string,
    modelSize: typeof raw.modelSize === "string" ? (raw.modelSize as string) : undefined,
  };
}

/**
 * Wrap validateEntry result in a typed map, running the normalizer only for
 * entries that pass validation.
 */
function validateEntries(raw: unknown): Record<string, BriefingAudioEntry> | null {
  if (typeof raw !== "object" || raw === null || !("entries" in raw)) {
    console.error("[briefing-manifest] missing or invalid 'entries' key");
    return null;
  }

  const rawEntries = (raw as { entries: unknown }).entries;
  if (typeof rawEntries !== "object" || rawEntries === null) {
    console.error("[briefing-manifest] 'entries' is not an object");
    return null;
  }

  const validated: Record<string, BriefingAudioEntry> = {};
  const rawDict = rawEntries as Record<string, unknown>;
  for (const [slug, entryRaw] of Object.entries(rawDict)) {
    const entry = validateEntry(slug, entryRaw);
    if (entry) {
      validated[slug] = entry;
    }
  }

  if (Object.keys(validated).length === 0) {
    console.warn("[briefing-manifest] no valid entries found — manifest is empty");
  }

  return validated;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Load, validate, and normalize the briefing-audio manifest.
 *
 * If the file does not exist (e.g. before the generation script has been run),
 * an empty manifest is returned silently. The site degrades gracefully —
 * the audio player shows no audio controls.
 *
 * @param filePath — absolute path to briefing-audio-manifest.json
 * @returns A fully-validated BriefingAudioManifest (possibly with zero entries).
 */
export function loadBriefingAudioManifest(filePath: string): BriefingAudioManifest {
  if (!fs.existsSync(filePath)) {
    // Non-error condition: manifest has not been generated yet.
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      engine: "elevenlabs",
      entries: {},
    };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("manifest root is not a JSON object");
    }

    const top = validateTopLevel(parsed as Record<string, unknown>);
    if (!top) {
      return { version: 1, generatedAt: new Date().toISOString(), engine: "elevenlabs", entries: {} };
    }

    const entries = validateEntries(parsed);
    if (!entries) {
      return { version: 1, generatedAt: new Date().toISOString(), engine: "elevenlabs", entries: {} };
    }

    return {
      version: top.version,
      generatedAt: top.generatedAt,
      engine: top.engine,
      modelSize: top.modelSize,
      entries,
    };
  } catch (err) {
    console.error(`[briefing-manifest] failed to parse ${filePath}:`, err);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      engine: "elevenlabs",
      entries: {},
    };
  }
}

/**
 * Convenience: load the manifest from the default project-root path.
 */
export function loadBriefingManifest(): BriefingAudioManifest {
  return loadBriefingAudioManifest(
    path.join(process.cwd(), "briefing-audio-manifest.json"),
  );
}