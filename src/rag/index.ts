/**
 * RAG Module - Main exports for Retrieval Augmented Generation
 *
 * Provides documentation search for:
 * - OpenLane ASIC flow
 * - AutoTuner optimization
 */

// Embeddings
export {
  isOpenAIConfigured,
  generateEmbedding,
  generateEmbeddings,
  getEmbeddingDimensions,
  cosineSimilarity,
} from "./embeddings.js";

// Vectorstore
export {
  getCollection,
  ensureCollection,
  addDocuments,
  addDocument,
  searchDocuments,
  searchByDocType,
  deleteBySource,
  getCollectionStats,
  clearCollection,
  isVectorstoreAvailable,
  COLLECTIONS,
  type CollectionName,
  type DocumentMetadata,
  type SearchResult,
} from "./vectorstore.js";

// Document loading
export {
  DOC_SOURCES,
  chunkText,
  extractTextFromHtml,
  loadFromUrl,
  loadFromFile,
  loadFromDirectory,
  loadLibreLaneDocs,
  loadOpenROADDocs,
  loadORFSDocs,
  loadOpenLaneDocs,
  loadAutoTunerDocs,
  loadAllDocs,
  type DocumentChunk,
} from "./doc-loader.js";

// Search functions
export {
  isRAGAvailable,
  searchOpenLaneDocs,
  searchAutoTunerDocs,
  searchAllDocs,
  searchConfigVariable,
  searchErrorHelp,
  searchAutoTunerParams,
  searchOpenLaneStep,
  getQuickHelp,
  type RAGSearchResult,
} from "./search.js";
