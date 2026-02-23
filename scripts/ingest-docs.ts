#!/usr/bin/env npx tsx
/**
 * Documentation Ingestion Script for MCP4EDA RAG
 *
 * This script fetches documentation from OpenLane and AutoTuner repositories
 * and indexes them into ChromaDB for semantic search.
 *
 * Usage:
 *   npx tsx scripts/ingest-docs.ts [options]
 *
 * Options:
 *   --openlane-only    Only ingest OpenLane documentation
 *   --autotuner-only   Only ingest AutoTuner documentation
 *   --clear            Clear existing documents before ingesting
 *   --verbose          Show detailed progress
 */

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import {
  loadOpenLaneDocs,
  loadAutoTunerDocs,
  loadAllDocs,
  addDocuments,
  clearCollection,
  getCollectionStats,
  isVectorstoreAvailable,
  COLLECTIONS,
} from "../src/rag/index.js";
import { isOpenAIConfigured } from "../src/rag/embeddings.js";

// Parse command line arguments
const args = process.argv.slice(2);
const openlaneOnly = args.includes("--openlane-only");
const autotunerOnly = args.includes("--autotuner-only");
const clearFirst = args.includes("--clear");
const verbose = args.includes("--verbose");

async function main() {
  console.log("=== MCP4EDA Documentation Ingestion ===\n");

  // Check prerequisites
  console.log("Checking prerequisites...");

  if (!isOpenAIConfigured()) {
    console.error("ERROR: OPENAI_API_KEY environment variable is not set.");
    console.error("Please set it to enable embedding generation.");
    process.exit(1);
  }
  console.log("  ✓ OpenAI API key configured");

  const vectorstoreAvailable = await isVectorstoreAvailable();
  if (!vectorstoreAvailable) {
    console.error("ERROR: ChromaDB is not available.");
    console.error("Please start ChromaDB on port 8000:");
    console.error("  docker run -d -p 8000:8000 chromadb/chroma");
    process.exit(1);
  }
  console.log("  ✓ ChromaDB available");

  // Clear if requested
  if (clearFirst) {
    console.log("\nClearing existing documents...");
    await clearCollection(COLLECTIONS.COMBINED);
    console.log("  ✓ Collection cleared");
  }

  // Load documentation
  console.log("\nLoading documentation...");

  let chunks;

  if (openlaneOnly) {
    console.log("  Loading OpenLane documentation only...");
    chunks = await loadOpenLaneDocs();
  } else if (autotunerOnly) {
    console.log("  Loading AutoTuner documentation only...");
    chunks = await loadAutoTunerDocs();
  } else {
    console.log("  Loading all documentation (OpenLane + AutoTuner)...");
    chunks = await loadAllDocs();
  }

  console.log(`  ✓ Loaded ${chunks.length} chunks`);

  if (verbose) {
    // Show chunk statistics
    const byDocType: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const chunk of chunks) {
      byDocType[chunk.metadata.docType] = (byDocType[chunk.metadata.docType] || 0) + 1;
      bySource[chunk.metadata.source] = (bySource[chunk.metadata.source] || 0) + 1;
    }

    console.log("\n  Chunks by type:");
    for (const [type, count] of Object.entries(byDocType)) {
      console.log(`    ${type}: ${count}`);
    }

    console.log("\n  Chunks by source:");
    for (const [source, count] of Object.entries(bySource)) {
      const shortSource = source.length > 60 ? "..." + source.slice(-57) : source;
      console.log(`    ${shortSource}: ${count}`);
    }
  }

  // Index documents
  console.log("\nIndexing documents (this may take a while)...");

  const batchSize = 50;
  const totalBatches = Math.ceil(chunks.length / batchSize);

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    process.stdout.write(`  Processing batch ${batchNum}/${totalBatches}...`);

    await addDocuments(batch);

    console.log(" ✓");
  }

  console.log("  ✓ All documents indexed");

  // Show final statistics
  console.log("\nFinal collection statistics:");
  const stats = await getCollectionStats();
  console.log(`  Total documents: ${stats.count}`);
  console.log(`  Document types: ${JSON.stringify(stats.docTypes)}`);
  console.log(`  Unique sources: ${stats.sources.length}`);

  console.log("\n=== Ingestion Complete ===");
  console.log("\nYou can now use the RAG tools in MCP4EDA to search documentation.");
}

main().catch((error) => {
  console.error("\nIngestion failed:", error);
  process.exit(1);
});
