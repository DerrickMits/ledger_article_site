/**
 * Test script for a single article recommendation.
 * Run with: npx tsx scripts/test-recommendation.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { generateRecommendations } from "@/lib/recommendations";

async function main() {
  console.log("Testing recommendation for one article...");
  console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
  
  try {
    const result = await generateRecommendations("inbound-marketing-for-beginners", true);
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("Success!");
  } catch (err) {
    console.error("Failed:", err);
    process.exit(1);
  }
}

main();