/**
 * ChromaDB Viewer - Shows collections and documents in ChromaDB
 *
 * Compatible with ChromaDB v1 and v2 APIs
 */

import { ChromaClient } from "chromadb";

const CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
const CHROMA_PORT = parseInt(process.env.CHROMA_PORT || "8000");

async function main() {
  console.log("=".repeat(60));
  console.log("ChromaDB Viewer");
  console.log("=".repeat(60));
  console.log(`\nConnecting to ChromaDB at http://${CHROMA_HOST}:${CHROMA_PORT}...\n`);

  try {
    // ChromaDB JS client v2.x uses path parameter
    const client = new ChromaClient({
      path: `http://${CHROMA_HOST}:${CHROMA_PORT}`,
    });

    // Test connection
    const heartbeat = await client.heartbeat();
    console.log(`✓ Connected! Heartbeat: ${JSON.stringify(heartbeat)}\n`);

    // List all collections
    const collections = await client.listCollections();
    console.log(`Found ${collections.length} collection(s):\n`);

    if (collections.length === 0) {
      console.log("  (No collections found - run ingest-docs.ts to populate)");
      return;
    }

    for (const collectionInfo of collections) {
      console.log(`\n${"─".repeat(50)}`);
      console.log(`Collection: ${collectionInfo.name}`);
      console.log(`${"─".repeat(50)}`);

      const collection = await client.getCollection({ name: collectionInfo.name });
      const count = await collection.count();
      console.log(`  Documents: ${count}`);

      if (count > 0) {
        // Get sample documents
        const sample = await collection.get({
          limit: 5,
          include: ["metadatas", "documents"],
        });

        // Show document types distribution
        const docTypes: Record<string, number> = {};
        const sources = new Set<string>();

        for (const meta of sample.metadatas || []) {
          if (meta) {
            const type = (meta.docType as string) || "unknown";
            docTypes[type] = (docTypes[type] || 0) + 1;
            if (meta.source) sources.add(meta.source as string);
          }
        }

        console.log(`  Doc Types: ${JSON.stringify(docTypes)}`);
        console.log(`  Sources (sample): ${Array.from(sources).slice(0, 3).join(", ")}`);

        // Show preview of first document
        if (sample.documents && sample.documents[0]) {
          const preview = sample.documents[0].substring(0, 200);
          console.log(`\n  Sample Document Preview:`);
          console.log(`  "${preview}..."`);
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Done!");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("✗ Error connecting to ChromaDB:");
    console.error(error instanceof Error ? error.message : error);
    console.log("\nMake sure ChromaDB server is running:");
    console.log("  cd docker && docker compose up -d");
  }
}

main();
