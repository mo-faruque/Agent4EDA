#!/usr/bin/env npx tsx
/**
 * Test script for Phase 4: RAG System
 *
 * Tests the RAG functionality without requiring ChromaDB
 * to be running (will check and report status)
 */

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import { isOpenAIConfigured } from "../src/rag/embeddings.js";
import { isVectorstoreAvailable, getCollectionStats } from "../src/rag/vectorstore.js";
import { isRAGAvailable } from "../src/rag/search.js";
import { chunkText, extractTextFromHtml } from "../src/rag/doc-loader.js";
import {
  checkRAGStatus,
  searchEDADocs,
  getConfigHelp,
  formatRAGResult,
} from "../src/tools/rag-tools.js";

async function testPhase4() {
  console.log("=== Phase 4: RAG System Tests ===\n");

  // Test 1: Check OpenAI configuration
  console.log("Test 1: Checking OpenAI configuration...");
  const openaiConfigured = isOpenAIConfigured();
  console.log(`  OpenAI API key: ${openaiConfigured ? "configured" : "NOT configured"}`);
  if (openaiConfigured) {
    console.log("  ✓ OpenAI ready");
  } else {
    console.log("  ⚠ Set OPENAI_API_KEY to enable RAG");
  }

  // Test 2: Check ChromaDB availability
  console.log("\nTest 2: Checking ChromaDB availability...");
  const vectorstoreAvailable = await isVectorstoreAvailable();
  console.log(`  ChromaDB: ${vectorstoreAvailable ? "available" : "NOT available"}`);
  if (vectorstoreAvailable) {
    console.log("  ✓ ChromaDB ready");
    try {
      const stats = await getCollectionStats();
      console.log(`  Documents indexed: ${stats.count}`);
      console.log(`  Doc types: ${JSON.stringify(stats.docTypes)}`);
    } catch (e) {
      console.log("  Collection not yet created (run ingest-docs.ts first)");
    }
  } else {
    console.log("  ⚠ Start ChromaDB: docker run -d -p 8000:8000 chromadb/chroma");
  }

  // Test 3: Check overall RAG status
  console.log("\nTest 3: Checking RAG system status...");
  const ragStatus = await isRAGAvailable();
  console.log(`  RAG available: ${ragStatus.available}`);
  console.log(`  OpenAI: ${ragStatus.openaiConfigured}`);
  console.log(`  Vectorstore: ${ragStatus.vectorstoreAvailable}`);
  console.log(`  Documents: ${ragStatus.documentCount}`);

  // Test 4: Test text chunking (local operation)
  console.log("\nTest 4: Testing text chunking...");
  const sampleText = `
OpenLane is an automated RTL to GDSII flow based on several components including OpenROAD, Yosys, Magic, Netgen, Fault, SPEF-Extractor, CU-GR, Klayout and a number of custom scripts for design exploration and optimization.

The flow performs full ASIC implementation steps from RTL all the way down to GDSII - this includes synthesis, floorplanning, placement, clock tree synthesis, routing, optimization, and signoff.

OpenLane has been tested to function with different ASIC technologies including SkyWater 130nm, GlobalFoundries 180nm, and IHP 130nm. The flow has been tested to function on many designs such as spm, picorv32a, and USB.
  `.trim();

  const chunks = chunkText(sampleText, { chunkSize: 200, chunkOverlap: 50 });
  console.log(`  Input: ${sampleText.length} characters`);
  console.log(`  Output: ${chunks.length} chunks`);
  for (let i = 0; i < chunks.length; i++) {
    console.log(`    Chunk ${i + 1}: ${chunks[i].length} chars`);
  }
  console.log("  ✓ Text chunking works");

  // Test 5: Test HTML extraction (local operation)
  console.log("\nTest 5: Testing HTML text extraction...");
  const sampleHtml = `
<!DOCTYPE html>
<html>
<head><title>OpenLane Docs</title></head>
<body>
  <nav>Navigation menu</nav>
  <main>
    <h1>Getting Started</h1>
    <p>This is the main content about OpenLane configuration.</p>
    <code>FP_CORE_UTIL = 50</code>
  </main>
  <footer>Footer content</footer>
</body>
</html>
  `;

  const extractedText = extractTextFromHtml(sampleHtml);
  console.log(`  HTML input: ${sampleHtml.length} chars`);
  console.log(`  Extracted text: ${extractedText.length} chars`);
  console.log(`  Content: "${extractedText.substring(0, 80)}..."`);
  console.log("  ✓ HTML extraction works");

  // Test 6: Test RAG tool status check
  console.log("\nTest 6: Testing RAG status tool...");
  const toolStatus = await checkRAGStatus();
  console.log(`  Tool status: ${JSON.stringify(toolStatus, null, 2)}`);
  console.log("  ✓ RAG status tool works");

  // Test 7: Test search (if RAG is available)
  if (ragStatus.available && ragStatus.documentCount > 0) {
    console.log("\nTest 7: Testing documentation search...");

    const searchResult = await searchEDADocs("how to configure clock period", { limit: 2 });
    if (searchResult.success) {
      console.log("  ✓ Search successful");
      console.log("\n--- Search Result Preview ---");
      console.log(formatRAGResult(searchResult.result!).substring(0, 500) + "...");
    } else {
      console.log(`  ✗ Search failed: ${searchResult.error}`);
    }

    console.log("\nTest 8: Testing config help...");
    const configResult = await getConfigHelp("FP_CORE_UTIL");
    if (configResult.success) {
      console.log("  ✓ Config help successful");
    } else {
      console.log(`  ✗ Config help failed: ${configResult.error}`);
    }
  } else {
    console.log("\nTest 7-8: Skipped (RAG not available or no documents indexed)");
    console.log("  To enable: Set OPENAI_API_KEY, start ChromaDB, run ingest-docs.ts");
  }

  // Summary
  console.log("\n=== Phase 4 Tests Complete ===");
  console.log("\nRAG System Status:");
  console.log(`  - OpenAI API: ${openaiConfigured ? "✓ Ready" : "✗ Need OPENAI_API_KEY"}`);
  console.log(`  - ChromaDB: ${vectorstoreAvailable ? "✓ Ready" : "✗ Need to start ChromaDB"}`);
  console.log(`  - Documents: ${ragStatus.documentCount > 0 ? `✓ ${ragStatus.documentCount} indexed` : "✗ Need to run ingest-docs.ts"}`);
  console.log(`  - Overall: ${ragStatus.available ? "✓ Fully operational" : "⚠ Partially available"}`);

  if (!ragStatus.available) {
    console.log("\nTo enable full RAG functionality:");
    if (!openaiConfigured) {
      console.log("  1. Set OPENAI_API_KEY environment variable");
    }
    if (!vectorstoreAvailable) {
      console.log("  2. Start ChromaDB: docker run -d -p 8000:8000 chromadb/chroma");
    }
    if (ragStatus.documentCount === 0) {
      console.log("  3. Run: npx tsx scripts/ingest-docs.ts");
    }
  }
}

testPhase4().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
