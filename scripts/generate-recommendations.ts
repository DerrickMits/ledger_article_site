/**
 * Script to generate AI-powered article recommendations for all articles.
 * Run with: npx tsx scripts/generate-recommendations.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { generateAllRecommendations } from "@/lib/recommendations";

async function main() {
  console.log("Starting recommendation generation...");
  console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
  try {
    await generateAllRecommendations();
    console.log("All recommendations generated successfully!");
  } catch (err) {
    console.error("Failed to generate recommendations:", err);
    process.exit(1);
  }
}

main();