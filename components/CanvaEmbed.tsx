/**
 * Renders an embedded Canva presentation as a 16:9 iframe.
 *
 * react-markdown is configured without rehype-raw, so raw <iframe> HTML in
 * article sources is stripped (see MarkdownContent). To embed a Canva design,
 * use a ```canva fenced block containing only the design ID:
 *
 *   ```canva
 *   DAHQS2XGkVg/43RiMhsJoVmGVobd3nkrLg
 *   ```
 *
 * The component re-attaches the `/view?embed` suffix Canva uses for embeds.
 */

const CANVA_EMBED_BASE = "https://www.canva.com/design";

export default function CanvaEmbed({ designId }: { designId: string }) {
  // Defensive cleanup: authors may accidentally paste the full URL or leave
  // stray whitespace / a trailing query string. Normalize so the iframe src
  // always resolves to the canonical embed endpoint.
  const cleanId = designId.trim().replace(/^\/+/, "");
  const withoutEmbedSuffix = cleanId.replace(/\/view(?:\?embed)?$/, "");
  const src = `${CANVA_EMBED_BASE}/${withoutEmbedSuffix}/view?embed`;

  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-warm-200 dark:border-warm-800 shadow-sm my-8">
      <iframe
        loading="lazy"
        className="absolute top-0 left-0 w-full h-full border-0"
        src={src}
        allowFullScreen
        allow="fullscreen"
      />
    </div>
  );
}
