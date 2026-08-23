import fs from "fs";
import path from "path";
import matter from "gray-matter";

/**
 * Generate a URL-safe slug from text.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface HeadingItem {
  slug: string;
  text: string;
  level: 2 | 3;
  /** Estimated read time for this specific section in minutes */
  readTime?: number;
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
 * Calculate word count from text
 */
function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calculate reading time in minutes (using 200 words per minute)
 */
function getReadTimeMinutes(wordCount: number): number {
  return Math.ceil(wordCount / 200);
}

/**
 * Strip markdown syntax for accurate word counting
 */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Keep link text
    .replace(/#{1,6}\s+/g, "") // Remove heading markers
    .replace(/\|[^\n]*\|/g, "") // Remove table cells
    .replace(/```/g, "") // Remove code fence markers
    .replace(/`/g, "") // Remove inline code markers
    .replace(/>\s+/g, "") // Remove blockquote markers
    .replace(/[*_]{1,3}\s*/g, "") // Remove list markers
    .replace(/\*\*|\*|__|_/g, "") // Remove bold/italic markers
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Extract headings from markdown content and calculate section read times
 */
function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const seenKeys = new Set<string>();
  
  // Find all heading positions
  const headingPattern = /^(#{2,3})\s+(.+)$/gm;
  const headingMatches: { level: 2 | 3; text: string; start: number; end: number }[] = [];
  
  let match;
  while ((match = headingPattern.exec(content)) !== null) {
    const level = match[1].length as 2 | 3;
    const text = match[2].trim();
    const start = match.index;
    const end = match.index + match[0].length;
    headingMatches.push({ level, text, start, end });
  }
  
  // Calculate read time for each section
  headingMatches.forEach((heading, index) => {
    // Skip duplicates
    const baseSlug = slugify(heading.text);
    let finalSlug = baseSlug;
    let counter = 1;
    while (seenKeys.has(finalSlug)) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    seenKeys.add(finalSlug);
    
    // Get content for this section
    let sectionContent = "";
    if (index < headingMatches.length - 1) {
      const nextHeading = headingMatches[index + 1];
      sectionContent = content.substring(heading.end, nextHeading.start);
    } else {
      sectionContent = content.substring(heading.end);
    }
    
    // Calculate word count and read time for this section
    const cleanContent = stripMarkdown(sectionContent);
    const wordCount = getWordCount(cleanContent);
    const readTime = getReadTimeMinutes(wordCount);
    
    headings.push({
      slug: finalSlug,
      text: heading.text,
      level: heading.level,
      readTime,
    });
  });
  
  return headings;
}

/**
 * Read and parse a single markdown file into an Article.
 */
function readArticle(fullPath: string, slug: string): Article | null {
  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    slug,
    title: (data.title as string) ?? slug,
    date: (data.date as string) ?? "",
    readTime: (data.readTime as string) ?? "5 min read",
    excerpt: (data.excerpt as string) ?? "",
    author: (data.author as string) ?? "Derrick Odiwuor",
    category: (data.category as string) ?? "",
    content,
    headings: extractHeadings(content),
  };
}

/**
 * Return a stable list of publishable articles, newest first.
 */
export function getAllArticles(): ArticleSummary[] {
  if (!fs.existsSync(articlesDirectory)) return [];

  const fileNames = fs
    .readdirSync(articlesDirectory)
    .filter((name) => name.endsWith(".md"));

  const summaries = fileNames.map((fileName) => {
    const slug = fileName.replace(/\.md$/, "");
    const article = readArticle(path.join(articlesDirectory, fileName), slug);
    const summary = article ? {
      slug,
      title: article.title,
      date: article.date,
      readTime: article.readTime,
      excerpt: article.excerpt,
      author: article.author,
      category: article.category,
    } : null;
    return summary;
  });

  return summaries
    .filter((entry): entry is ArticleSummary => entry !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Fetch a single article by its slug.
 */
export function getArticleBySlug(slug: string): Article | null {
  return readArticle(path.join(articlesDirectory, `${slug}.md`), slug);
}

/**
 * Provide slugs to Next.js for static pre-rendering.
 */
export function getAllSlugs(): string[] {
  if (!fs.existsSync(articlesDirectory)) return [];

  return fs
    .readdirSync(articlesDirectory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""));
}

/**
 * Format an HTML date string to a human readable format.
 */
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

/**
 * Calculate reading time for a text string
 * @param text - Text to calculate reading time for
 * @param wordsPerMinute - Reading speed (default: 200)
 * @returns Reading time in minutes
 */
export function calculateReadingTime(text: string, wordsPerMinute = 200): number {
  const cleanText = stripMarkdown(text);
  const wordCount = getWordCount(cleanText);
  return getReadTimeMinutes(wordCount);
}

/**
 * Calculate word count from markdown content (removing markdown syntax)
 * @param content - Markdown content
 * @returns Word count
 */
export function calculateWordCount(content: string): number {
  const cleanContent = stripMarkdown(content);
  return getWordCount(cleanContent);
}