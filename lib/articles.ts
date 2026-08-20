import fs from "fs";
import path from "path";
import matter from "gray-matter";

/**
 * Generate a URL-safe slug from text.
 * This function is duplicated in MarkdownContent.tsx to keep it pure.
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
 * Extract headings from markdown content.
 * Parses H2 and H3 tags and returns them as structured data.
 */
function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  
  let match;
  let seenKeys = new Set<string>();
  
  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length as 2 | 3;
    const text = match[2].trim();
    const baseSlug = slugify(text);
    
    // Handle duplicate slugs by appending a number
    let finalSlug = baseSlug;
    let counter = 1;
    while (seenKeys.has(finalSlug)) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    seenKeys.add(finalSlug);
    
    headings.push({
      slug: finalSlug,
      text,
      level,
    });
  }
  
  return headings;
}

/** Read and parse a single markdown file into an Article. */
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

/** Return a stable list of publishable articles, newest first. */
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

/** Fetch a single article by its slug. */
export function getArticleBySlug(slug: string): Article | null {
  return readArticle(path.join(articlesDirectory, `${slug}.md`), slug);
}

/** Provide slugs to Next.js for static pre-rendering. */
export function getAllSlugs(): string[] {
  if (!fs.existsSync(articlesDirectory)) return [];

  return fs
    .readdirSync(articlesDirectory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""));
}

/** Format an ISO date string as a human readable publish date. */
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