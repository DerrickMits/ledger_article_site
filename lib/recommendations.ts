/**
 * Server-side recommendation engine using Google Gemini API.
 * Analyzes article content to find the 3 most conceptually relevant "next reads".
 * Caches results to avoid repeated API calls.
 */

import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { ArticleSummary, getAllArticles } from "./articles";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface Recommendation {
  articleId: string;
  badge: string; // e.g., "Deep Dive", "Next Step", "Counter-Perspective"
  reason: string; // 1-sentence explanation
}

export interface CachedRecommendations {
  [articleSlug: string]: Recommendation[];
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                     */
/* ------------------------------------------------------------------ */

const CACHE_FILE = path.join(process.cwd(), "data", "recommendations-cache.json");
const GEMINI_MODEL = "gemini-3.8-flash";

// Ensure cache directory exists
const cacheDir = path.dirname(CACHE_FILE);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

/* ------------------------------------------------------------------ */
/*  Cache Helpers                                                     */
/* ------------------------------------------------------------------ */

function loadCache(): CachedRecommendations {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("[Recommendations] Failed to load cache:", err);
  }
  return {};
}

function saveCache(cache: CachedRecommendations): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error("[Recommendations] Failed to save cache:", err);
  }
}

/* ------------------------------------------------------------------ */
/*  Article Data Preparation                                          */
/* ------------------------------------------------------------------ */

interface ArticleForPrompt {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  contentPreview: string; // First ~500 chars of content for context
}

function prepareArticleData(article: ArticleSummary): ArticleForPrompt {
  // Get a content preview from the full article
  const fullArticle = getAllArticles().find(a => a.slug === article.slug);
  let contentPreview = article.excerpt;
  
  if (fullArticle) {
    // Read the actual markdown file for full content
    const articlesDirectory = path.join(process.cwd(), "content", "articles");
    const filePath = path.join(articlesDirectory, `${article.slug}.md`);
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const { content } = require("gray-matter")(fileContent);
      // Strip markdown and take first 800 chars
      const plainText = content
        .replace(/```[\s\S]*?```/g, "")
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/#{1,6}\s+/g, "")
        .replace(/\|[^\n]*\|/g, "")
        .replace(/[*_]{1,3}/g, "")
        .replace(/\s+/g, " ")
        .trim();
      contentPreview = plainText.slice(0, 800);
    }
  }
  
  return {
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    category: article.category,
    contentPreview,
  };
}

/* ------------------------------------------------------------------ */
/*  Gemini Prompt Construction                                        */
/* ------------------------------------------------------------------ */

function buildPrompt(currentArticle: ArticleForPrompt, otherArticles: ArticleForPrompt[]): string {
  const otherArticlesText = otherArticles.map(a => 
    `ID: ${a.slug}
Title: ${a.title}
Category: ${a.category}
Summary: ${a.excerpt}
Content Preview: ${a.contentPreview}
---`
  ).join("\n");

  return `You are an expert editorial curator for "The Ledger" - a publication focused on operations, customer relationship strategy, automation, and systems thinking.

CURRENT ARTICLE THE READER JUST FINISHED:
Title: ${currentArticle.title}
Category: ${currentArticle.category}
Summary: ${currentArticle.excerpt}
Content Preview: ${currentArticle.contentPreview}

OTHER PUBLISHED ARTICLES:
${otherArticlesText}

TASK: Select the 3 most conceptually relevant articles for the reader to read next. Think like an editor who understands narrative progression:

- "Next Step": Natural progression from beginner → intermediate → advanced on the SAME topic
- "Deep Dive": Goes deeper into a specific concept mentioned in the current article
- "Practical Application": Shows how to implement/apply the theory from current article
- "Counter-Perspective": Offers a different viewpoint or complementary framework
- "Prerequisite": Foundational knowledge that would have helped before this article
- "Companion": Covers a parallel topic that rounds out the reader's understanding

AVOID: Duplicate topics, articles that just share a category, or random associations.

Return EXACTLY 3 recommendations as a JSON array with this schema:
[
  {
    "articleId": "slug-of-recommended-article",
    "badge": "2-3 word label (e.g., Deep Dive, Next Step, Practical Application, Counter-Perspective, Prerequisite, Companion)",
    "reason": "One punchy sentence explaining WHY this builds on what they just read. Address the reader directly."
  }
]

Only return the JSON array. No markdown, no explanation, no extra text.`;
}

/* ------------------------------------------------------------------ */
/*  Core Recommendation Logic                                         */
/* ------------------------------------------------------------------ */

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (aiClient) return aiClient;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Recommendations] GEMINI_API_KEY not set, skipping AI recommendations");
    return null;
  }
  
  try {
    aiClient = new GoogleGenAI({ apiKey });
    return aiClient;
  } catch (err) {
    console.error("[Recommendations] Failed to initialize GoogleGenAI:", err);
    return null;
  }
}

export async function generateRecommendations(
  currentSlug: string,
  forceRefresh = false
): Promise<Recommendation[]> {
  const cache = loadCache();
  
  // Return cached if available and not forcing refresh
  if (!forceRefresh && cache[currentSlug]) {
    console.log(`[Recommendations] Cache hit for ${currentSlug}`);
    return cache[currentSlug];
  }
  
  const client = getAIClient();
  if (!client) {
    return getFallbackRecommendations(currentSlug);
  }
  
  // Get all articles
  const allArticles = getAllArticles();
  const currentArticle = allArticles.find(a => a.slug === currentSlug);
  
  if (!currentArticle) {
    console.warn(`[Recommendations] Article not found: ${currentSlug}`);
    return getFallbackRecommendations(currentSlug);
  }
  
  const otherArticles = allArticles.filter(a => a.slug !== currentSlug);
  
  if (otherArticles.length < 3) {
    console.warn("[Recommendations] Not enough articles for recommendations");
    return getFallbackRecommendations(currentSlug);
  }
  
  // Prepare data for prompt
  const currentData = prepareArticleData(currentArticle);
  const otherData = otherArticles.map(prepareArticleData);
  
  const prompt = buildPrompt(currentData, otherData);
  
  try {
    console.log(`[Recommendations] Calling Gemini for ${currentSlug}...`);
    
    // Add timeout to prevent hanging - shorter for API responsiveness
    const geminiPromise = client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Gemini API timeout after 5s")), 5000)
    );
    
    const response = await Promise.race([geminiPromise, timeoutPromise]);
    
    const text = response.text?.trim();
    if (!text) {
      throw new Error("Empty response from Gemini");
    }
    
    let recommendations: Recommendation[];
    try {
      recommendations = JSON.parse(text);
    } catch (parseErr) {
      console.error("[Recommendations] Failed to parse Gemini response:", text);
      throw parseErr;
    }
    
    // Validate response
    if (!Array.isArray(recommendations) || recommendations.length !== 3) {
      throw new Error("Invalid response format: expected array of 3 recommendations");
    }
    
    for (const rec of recommendations) {
      if (!rec.articleId || !rec.badge || !rec.reason) {
        throw new Error("Invalid recommendation object: missing required fields");
      }
      // Verify the articleId exists
      if (!allArticles.some(a => a.slug === rec.articleId)) {
        throw new Error(`Invalid articleId in recommendation: ${rec.articleId}`);
      }
    }
    
    // Cache the result
    cache[currentSlug] = recommendations;
    saveCache(cache);
    
    console.log(`[Recommendations] Generated and cached for ${currentSlug}`);
    return recommendations;
    
  } catch (err) {
    console.error("[Recommendations] Generation failed:", err);
    return getFallbackRecommendations(currentSlug);
  }
}

/* ------------------------------------------------------------------ */
/*  Fallback Recommendations                                          */
/* ------------------------------------------------------------------ */

function getFallbackRecommendations(currentSlug: string): Recommendation[] {
  const allArticles = getAllArticles().filter(a => a.slug !== currentSlug);
  
  // Sort by date descending (most recent first)
  const recent = allArticles
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);
  
  return recent.map((article, index) => ({
    articleId: article.slug,
    badge: index === 0 ? "Latest" : index === 1 ? "Recent" : "More Reading",
    reason: `Continue exploring ${article.category.toLowerCase()} insights with this recent article.`,
  }));
}

/* ------------------------------------------------------------------ */
/*  Batch Generation (for build-time)                                 */
/* ------------------------------------------------------------------ */

export async function generateAllRecommendations(): Promise<void> {
  const allArticles = getAllArticles();
  console.log(`[Recommendations] Generating for ${allArticles.length} articles...`);
  
  for (const article of allArticles) {
    await generateRecommendations(article.slug, true); // force refresh
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log("[Recommendations] Batch generation complete");
}

/* ------------------------------------------------------------------ */
/*  Server-only helper for article page                               */
/* ------------------------------------------------------------------ */

export async function getRecommendationsForArticle(slug: string): Promise<Recommendation[]> {
  return generateRecommendations(slug, false);
}