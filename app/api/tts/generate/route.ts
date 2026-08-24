/**
 * POST /api/tts/generate
 *
 * Server-side proxy to the Voicebox REST API. This endpoint:
 *
 *   1. Accepts a generation request from the client (or any caller).
 *   2. Forwards it to the running Voicebox instance at `VOICEBOX_URL`.
 *   3. Returns a JSON body mirroring Voicebox's `GenerationResponse`, which
 *      contains the `id`, initial `status`, and a relative `audio_path`.
 *
 * The client then polls `GET /api/tts/status/{id}` (or calls Voicebox's
 * SSE endpoint directly) to retrieve the final `audio_path`, which can be
 * resolved against `VOICEBOX_URL` for streaming, or served through
 * `GET /api/tts/audio/{id}` which handles the Cloudflare-style header
 * rewrite needed when Voicebox is behind a CDN.
 *
 * This API route is the SECONDARY fallback. The PRIMARY path is pre-rendered
 * MP3/WAV files stored in `public/audio/briefings/`, generated once by
 * scripts/generate-briefing-audio.ts during the build.
 *
 * Server-only: never marked "use client".
 */

import { NextRequest, NextResponse } from "next/server";

const VOICEBOX_URL = process.env.VOICEBOX_URL ?? "http://localhost:17600";

/* ------------------------------------------------------------------ */
/*  SSE parser — consumes the Voicebox status stream in a safe way    */
/* ------------------------------------------------------------------ */

interface SseStateEvent {
  status: string;
  duration: number | null;
  error: string | null;
}

/**
 * Accepts a ReadableStream (the SSE body from Voicebox) and invokes
 * `onEvent` for each parsed JSON event payload, resolving with the final
 * parsed status state (or rejecting on network error).
 */
async function consumeSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (state: SseStateEvent) => void,
): Promise<SseStateEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastState: SseStateEvent = { status: "generating", duration: null, error: null };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE chunks arrive event-by-event separated by double newlines.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? ""; // keep incomplete chunk in buffer

      for (const chunk of events) {
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload) as SseStateEvent;
            lastState = parsed;
            onEvent(parsed);
            if (parsed.status === "completed" || parsed.status === "failed") {
              return lastState;
            }
          } catch {
            // skip malformed SSE payloads gracefully
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return lastState;
}

/**
 * Poll Voicebox's SSE status stream using fetch (server-side, not
 * subject to browser CORS restrictions from a Next.js server runtime).
 */
async function pollVoiceboxStatus(generationId: string): Promise<SseStateEvent> {
  const statusUrl = `${VOICEBOX_URL}/generate/${generationId}/status`;

  const response = await fetch(statusUrl, {
    headers: { Accept: "text/event-stream" },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Voicebox status stream returned ${response.status}`);
  }

  return consumeSseStream(response.body, () => {});
}

/* ------------------------------------------------------------------ */
/*  Route handlers                                                    */
/* ------------------------------------------------------------------ */

/**
 * POST /api/tts/generate
 *
 * Request body mirrors Voicebox's GenerationRequest:
 *   { text, profileId?, language?, engine?, modelSize?, personality? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Validate required fields
    if (!body.text || typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json(
        { error: "A non-empty 'text' string is required." },
        { status: 400 },
      );
    }

    // Forward to Voicebox
    const vbResponse = await fetch(`${VOICEBOX_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: body.text,
        profile_id: body.profileId ?? undefined,
        language: body.language ?? "en",
        engine: body.engine ?? "qwen",
        model_size: body.modelSize ?? "1.7B",
        personality: body.personality ?? false,
        max_chunk_chars: body.maxChunkChars ?? 800,
        crossfade_ms: body.crossfadeMs ?? 50,
        normalize: body.normalize ?? true,
      }),
    });

    if (!vbResponse.ok) {
      const errText = await vbResponse.text().catch(() => "unknown error");
      return NextResponse.json(
        { error: `Voicebox generation failed (${vbResponse.status}): ${errText}` },
        { status: 502 },
      );
    }

    const genData = (await vbResponse.json()) as {
      id: string;
      status: string;
      audio_path: string | null;
      duration: number | null;
      engine: string;
    };

    return NextResponse.json({
      id: genData.id,
      status: genData.status,
      audioUrl: genData.audio_path
        ? `${VOICEBOX_URL}/data/generations/${genData.audio_path}`
        : null,
      duration: genData.duration,
      engine: genData.engine,
    });
  } catch (err) {
    console.error("[TTS API] generation error:", err);
    return NextResponse.json(
      { error: `TTS generation request failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 },
    );
  }
}

/**
 * GET /api/tts/generate?text=...&profileId=...&engine=...
 *
 * Convenience GET — accepts query-string parameters for simple one-shot
 * generation. Polls Voicebox status until complete, then returns the
 * fully-resolved response including the audio URL and duration.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get("text")?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Query parameter 'text' is required." },
        { status: 400 },
      );
    }

    const profileId = searchParams.get("profileId") ?? undefined;
    const engine = (searchParams.get("engine") as string | undefined) ?? "qwen";

    // 1) Kick off generation
    const genResponse = await fetch(`${VOICEBOX_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        profile_id: profileId,
        language: "en",
        engine,
        normalize: true,
      }),
    });

    if (!genResponse.ok) {
      return NextResponse.json(
        { error: `Voicebox error ${genResponse.status}` },
        { status: 502 },
      );
    }

    const { id } = (await genResponse.json()) as { id: string };

    // 2) Poll status SSE until completed
    const finalState = await pollVoiceboxStatus(id);

    const audioPath = (finalState as unknown as { audio_path?: string | null }).audio_path;

    return NextResponse.json({
      id,
      status: finalState.status,
      audioUrl: audioPath
        ? `${VOICEBOX_URL}/data/generations/${audioPath}`
        : null,
      duration: finalState.duration,
      error: finalState.error ?? null,
    });
  } catch (err) {
    console.error("[TTS API] GET generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
}