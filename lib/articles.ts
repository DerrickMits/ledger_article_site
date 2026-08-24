import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { 
  loadBriefingAudioManifest 
} from "./briefing-audio";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface ExecutiveSummaryData {
  bottleneck: string;
  fix: string;
  outcome: string;
  readTime?: number;
}

export interface HeadingItem {
  slug: string;
  text: string;
  level: 2 | 3;
  readTime?: number;
}

/**
 * Metadata describing the pre-generated AI audio file attached to an article's
 * executive-summary briefing. Populated at build time by:
 *   scripts/generate-briefing-audio.ts
 *
 * We store the data in a separate sidecar manifest rather than mutating
 * article frontmatter so the markdown source files stay clean, and so that
 * the manifest can be regenerated independently without touching the CMS.
 */
export interface BriefingAudio {
  /** Absolute (or site-rooted) URL to the served audio asset. */
  url: string;
  /** Duration in seconds, as reported by Voicebox at generation time. */
  durationSeconds: number;
  /** Voice-profile name used during synthesis (informational). */
  voiceProfile: string;
  /** File size in bytes. */
  byteSize: number;
  /** ISO-8601 timestamp of when this file was generated. */
  generatedAt: string;
  /** MIME type of the generated file, typically "audio/wav". */
  mimeType: string;
}

export interface Article {
  slug: string;
  title: string;
  date: string;
  readTime: string;
  excerpt: string;
  author: string;
  category: string;
  content: string;
  headings: HeadingItem[];
  executiveSummary?: ExecutiveSummaryData;
  /** Attached pre-generated briefing audio, populated at build time by the
   *  generation script and stored in the sidecar manifest. */
  audio?: BriefingAudio | null;
}

export interface ArticleSummary {
  slug: string;
  title: string;
  date: string;
  readTime: string;
  excerpt: string;
  author: string;
  category: string;
}

const articlesDirectory = path.join(process.cwd(), "content", "articles");

/**
 * Derive the briefings-manifest path. The manifest is written to the repo
 * root by scripts/generate-briefing-audio.ts so it must be git-tracked and
 * therefore resolvable from process.cwd().
 */
const manifestPath = path.join(process.cwd(), "briefing-audio-manifest.json");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getReadTimeMinutes(wordCount: number): number {
  return Math.ceil(wordCount / 200);
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\|[^\n]*\|/g, "")
    .replace(/```/g, "")
    .replace(/`/g, "")
    .replace(/>\s+/g, "")
    .replace(/[*_]{1,3}\s*/g, "")
    .replace(/\*\*|\*|__|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Heading extraction                                                */
/* ------------------------------------------------------------------ */

function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const seenKeys = new Set<string>();

  const headingPattern = /^(#{2,3})\s+(.+)$/gm;
  const headingMatches: { level: 2 | 3; text: string; start: number; end: number }[] = [];

  let match;
  while ((match = headingPattern.exec(content)) !== null) {
    const level = match[1].length as 2 | 3;
    const text = match[2].trim();
    headingMatches.push({ level, text, start: match.index, end: match.index + match[0].length });
  }

  headingMatches.forEach((heading, index) => {
    const baseSlug = slugify(heading.text);
    let finalSlug = baseSlug;
    let counter = 1;
    while (seenKeys.has(finalSlug)) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    seenKeys.add(finalSlug);

    let sectionContent = "";
    if (index < headingMatches.length - 1) {
      sectionContent = content.substring(heading.end, headingMatches[index + 1].start);
    } else {
      sectionContent = content.substring(heading.end);
    }

    const cleanContent = stripMarkdown(sectionContent);
    const readTime = getReadTimeMinutes(getWordCount(cleanContent));

    headings.push({ slug: finalSlug, text: heading.text, level: heading.level, readTime });
  });

  return headings;
}

/* ------------------------------------------------------------------ */
/*  Article loading — wired to briefing manifest                      */
/* ------------------------------------------------------------------ */

function readArticle(fullPath: string, slug: string): Article | null {
  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  const article: Article = {
    slug,
    title: (data.title as string) ?? slug,
    date: (data.date as string) ?? "",
    readTime: (data.readTime as string) ?? "5 min read",
    excerpt: (data.excerpt as string) ?? "",
    author: (data.author as string) ?? "Derrick Odiwuor",
    category: (data.category as string) ?? "",
    content,
    headings: extractHeadings(content),
    executiveSummary: data.executiveSummary as ExecutiveSummaryData | undefined,
    audio: null, // populated below after manifest load
  };

  // Attach sidecar audio record if the manifest contains a match for this slug
  try {
    const manifest = loadBriefingAudioManifest(manifestPath);
    const entry = manifest.entries[slug];
    if (entry) {
      article.audio = {
        url: entry.url,
        durationSeconds: entry.durationSeconds,
        voiceProfile: entry.voiceProfile,
        byteSize: entry.byteSize,
        generatedAt: entry.generatedAt,
        mimeType: entry.mimeType,
      };
    }
  } catch {
    // Non-fatal: audio feature degrades gracefully when no manifest present
  }

  return article;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export function getAllArticles(): ArticleSummary[] {
  if (!fs.existsSync(articlesDirectory)) return [];

  const fileNames = fs
    .readdirSync(articlesDirectory)
    .filter((name) => name.endsWith(".md"));

  const summaries = fileNames.map((fileName) => {
    const slug = fileName.replace(/\.md$/, "");
    const article = readArticle(path.join(articlesDirectory, fileName), slug);
    if (!article) return null;
    return {
      slug: article.slug,
      title: article.title,
      date: article.date,
      readTime: article.readTime,
      excerpt: article.excerpt,
      author: article.author,
      category: article.category,
    };
  });

  return summaries
    .filter((entry): entry is ArticleSummary => entry !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getArticleBySlug(slug: string): Article | null {
  return readArticle(path.join(articlesDirectory, `${slug}.md`), slug);
}

export function getAllSlugs(): string[] {
  if (!fs.existsSync(articlesDirectory)) return [];
  return fs
    .readdirSync(articlesDirectory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""));
}

export function formatPublishDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function calculateReadingTime(text: string, wordsPerMinute = 200): number {
  return Math.ceil(getWordCount(stripMarkdown(text)) / wordsPerMinute);
}

export function calculateWordCount(content: string): number {
  return getWordCount(stripMarkdown(content));
}