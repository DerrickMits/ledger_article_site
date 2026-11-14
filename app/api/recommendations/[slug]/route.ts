/**
 * GET /api/recommendations/[slug]
 * Returns AI-generated article recommendations for the given article slug.
 * Uses server-side caching to avoid repeated Gemini API calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRecommendationsForArticle } from "@/lib/recommendations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    
    if (!slug) {
      return NextResponse.json(
        { error: "Article slug is required" },
        { status: 400 }
      );
    }
    
    const recommendations = await getRecommendationsForArticle(slug);
    
    return NextResponse.json({
      slug,
      recommendations,
      cached: true, // Indicates this came from cache or was just generated
    });
    
  } catch (err) {
    console.error("[Recommendations API] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}