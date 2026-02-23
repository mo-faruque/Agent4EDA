/**
 * Vectorstore Module - ChromaDB vector storage for RAG
 *
 * Stores document embeddings for OpenLane and AutoTuner documentation
 */

import { ChromaClient, Collection, IncludeEnum } from "chromadb";
import { generateEmbedding, generateEmbeddings, getEmbeddingDimensions } from "./embeddings.js";

// ChromaDB configuration
const CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
const CHROMA_PORT = parseInt(process.env.CHROMA_PORT || "8000");

// Collection names
const COLLECTIONS = {
  OPENLANE: "openlane_docs",
  AUTOTUNER: "autotuner_docs",
  COMBINED: "eda_docs",
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

// Document metadata interface
export interface DocumentMetadata {
  source: string;          // URL or file path
  title?: string;          // Document title
  section?: string;        // Section/chapter name
  docType: "openlane" | "autotuner" | "general";
  chunkIndex?: number;     // Index within the source document
  totalChunks?: number;    // Total chunks from this source
  lastUpdated?: string;    // ISO timestamp
}

// Search result interface
export interface SearchResult {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  similarity: number;
}

// ChromaDB client singleton
let chromaClient: ChromaClient | null = null;

/**
 * Get ChromaDB client instance
 */
function getChromaClient(): ChromaClient {
  if (!chromaClient) {
    chromaClient = new ChromaClient({
      path: `http://${CHROMA_HOST}:${CHROMA_PORT}`,
    });
  }
  return chromaClient;
}

/**
 * Initialize or get a collection
 */
export async function getCollection(name: CollectionName = COLLECTIONS.COMBINED): Promise<Collection> {
  const client = getChromaClient();

  try {
    // Try to get existing collection
    return await client.getCollection({ name });
  } catch {
    // Create if doesn't exist
    return await client.createCollection({
      name,
      metadata: {
        description: `EDA documentation for ${name}`,
        dimensions: getEmbeddingDimensions(),
      },
    });
  }
}

/**
 * Get or create a collection (ensures it exists)
 */
export async function ensureCollection(name: CollectionName = COLLECTIONS.COMBINED): Promise<Collection> {
  const client = getChromaClient();

  return await client.getOrCreateCollection({
    name,
    metadata: {
      description: `EDA documentation for ${name}`,
      dimensions: getEmbeddingDimensions(),
    },
  });
}

/**
 * Add documents to the vectorstore
 */
export async function addDocuments(
  documents: Array<{
    id: string;
    content: string;
    metadata: DocumentMetadata;
  }>,
  collectionName: CollectionName = COLLECTIONS.COMBINED
): Promise<void> {
  if (documents.length === 0) return;

  const collection = await ensureCollection(collectionName);

  // Generate embeddings for all documents
  const contents = documents.map(d => d.content);
  const embeddings = await generateEmbeddings(contents);

  // Add to collection - convert metadata to chromadb-compatible format
  await collection.add({
    ids: documents.map(d => d.id),
    embeddings,
    documents: contents,
    metadatas: documents.map(d => ({
      source: d.metadata.source,
      title: d.metadata.title || "",
      section: d.metadata.section || "",
      docType: d.metadata.docType,
      chunkIndex: d.metadata.chunkIndex || 0,
      totalChunks: d.metadata.totalChunks || 1,
      lastUpdated: d.metadata.lastUpdated || new Date().toISOString(),
    })),
  });
}

/**
 * Add a single document
 */
export async function addDocument(
  id: string,
  content: string,
  metadata: DocumentMetadata,
  collectionName: CollectionName = COLLECTIONS.COMBINED
): Promise<void> {
  await addDocuments([{ id, content, metadata }], collectionName);
}

/**
 * Search for similar documents
 */
export async function searchDocuments(
  query: string,
  options: {
    limit?: number;
    collectionName?: CollectionName;
    filter?: Record<string, string>;
    minSimilarity?: number;
  } = {}
): Promise<SearchResult[]> {
  const {
    limit = 5,
    collectionName = COLLECTIONS.COMBINED,
    filter,
    minSimilarity = 0.0,
  } = options;

  const collection = await getCollection(collectionName);

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Search
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: limit,
    where: filter,
  });

  // Transform results
  const searchResults: SearchResult[] = [];

  if (results.ids[0]) {
    for (let i = 0; i < results.ids[0].length; i++) {
      const distance = results.distances?.[0]?.[i] ?? 1;
      // ChromaDB returns L2 distance, convert to similarity (0-1)
      const similarity = 1 / (1 + distance);

      if (similarity >= minSimilarity) {
        const rawMeta = results.metadatas?.[0]?.[i] || {};
        searchResults.push({
          id: results.ids[0][i],
          content: results.documents?.[0]?.[i] || "",
          metadata: {
            source: (rawMeta.source as string) || "",
            title: rawMeta.title as string | undefined,
            section: rawMeta.section as string | undefined,
            docType: (rawMeta.docType as "openlane" | "autotuner" | "general") || "general",
            chunkIndex: rawMeta.chunkIndex as number | undefined,
            totalChunks: rawMeta.totalChunks as number | undefined,
            lastUpdated: rawMeta.lastUpdated as string | undefined,
          },
          similarity,
        });
      }
    }
  }

  return searchResults;
}

/**
 * Search by document type (OpenLane or AutoTuner)
 */
export async function searchByDocType(
  query: string,
  docType: "openlane" | "autotuner" | "general",
  limit = 5
): Promise<SearchResult[]> {
  return searchDocuments(query, {
    limit,
    filter: { docType },
  });
}

/**
 * Delete documents by source
 */
export async function deleteBySource(
  source: string,
  collectionName: CollectionName = COLLECTIONS.COMBINED
): Promise<void> {
  const collection = await getCollection(collectionName);

  // Get all documents with this source
  const results = await collection.get({
    where: { source },
  });

  if (results.ids.length > 0) {
    await collection.delete({
      ids: results.ids,
    });
  }
}

/**
 * Get collection statistics
 */
export async function getCollectionStats(
  collectionName: CollectionName = COLLECTIONS.COMBINED
): Promise<{
  count: number;
  sources: string[];
  docTypes: Record<string, number>;
}> {
  const collection = await getCollection(collectionName);

  const count = await collection.count();

  // Get all metadata to compute stats
  const allDocs = await collection.get({
    include: [IncludeEnum.Metadatas],
  });

  const sources = new Set<string>();
  const docTypes: Record<string, number> = {};

  for (const meta of allDocs.metadatas || []) {
    if (meta?.source) {
      sources.add(meta.source as string);
    }
    const type = (meta?.docType as string) || "unknown";
    docTypes[type] = (docTypes[type] || 0) + 1;
  }

  return {
    count,
    sources: Array.from(sources),
    docTypes,
  };
}

/**
 * Clear all documents from a collection
 */
export async function clearCollection(
  collectionName: CollectionName = COLLECTIONS.COMBINED
): Promise<void> {
  const client = getChromaClient();

  try {
    await client.deleteCollection({ name: collectionName });
  } catch {
    // Collection doesn't exist, nothing to clear
  }
}

/**
 * Check if ChromaDB is available
 */
export async function isVectorstoreAvailable(): Promise<boolean> {
  try {
    const client = getChromaClient();
    await client.heartbeat();
    return true;
  } catch {
    return false;
  }
}

// Export collection names
export { COLLECTIONS };
