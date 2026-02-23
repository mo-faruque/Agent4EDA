/**
 * Search Module - High-level search functions for RAG
 *
 * Provides specialized search functions for:
 * - OpenLane configuration and usage
 * - AutoTuner parameters and optimization
 * - Error explanation and troubleshooting
 */

import {
  searchDocuments,
  searchByDocType,
  isVectorstoreAvailable,
  getCollectionStats,
  type SearchResult,
} from "./vectorstore.js";
import { isOpenAIConfigured } from "./embeddings.js";

/**
 * Search result with context for display
 */
export interface RAGSearchResult {
  answer: string;
  sources: Array<{
    title?: string;
    source: string;
    relevance: number;
  }>;
  docType: "openlane" | "autotuner" | "general" | "mixed";
}

/**
 * Check if RAG system is available
 */
export async function isRAGAvailable(): Promise<{
  available: boolean;
  openaiConfigured: boolean;
  vectorstoreAvailable: boolean;
  documentCount: number;
}> {
  const openaiConfigured = isOpenAIConfigured();
  let vectorstoreAvailable = false;
  let documentCount = 0;

  if (openaiConfigured) {
    vectorstoreAvailable = await isVectorstoreAvailable();

    if (vectorstoreAvailable) {
      try {
        const stats = await getCollectionStats();
        documentCount = stats.count;
      } catch {
        // Collection might not exist yet
      }
    }
  }

  return {
    available: openaiConfigured && vectorstoreAvailable && documentCount > 0,
    openaiConfigured,
    vectorstoreAvailable,
    documentCount,
  };
}

/**
 * Format search results into a readable context
 */
function formatResultsAsContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No relevant documentation found.";
  }

  return results
    .map((r, i) => {
      const title = r.metadata.title || "Documentation";
      const source = r.metadata.source;
      return `[${i + 1}] ${title}\nSource: ${source}\n\n${r.content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Search OpenLane documentation
 */
export async function searchOpenLaneDocs(
  query: string,
  limit = 5
): Promise<RAGSearchResult> {
  const results = await searchByDocType(query, "openlane", limit);

  return {
    answer: formatResultsAsContext(results),
    sources: results.map(r => ({
      title: r.metadata.title,
      source: r.metadata.source,
      relevance: r.similarity,
    })),
    docType: "openlane",
  };
}

/**
 * Search AutoTuner documentation
 */
export async function searchAutoTunerDocs(
  query: string,
  limit = 5
): Promise<RAGSearchResult> {
  const results = await searchByDocType(query, "autotuner", limit);

  return {
    answer: formatResultsAsContext(results),
    sources: results.map(r => ({
      title: r.metadata.title,
      source: r.metadata.source,
      relevance: r.similarity,
    })),
    docType: "autotuner",
  };
}

/**
 * Search all documentation (OpenLane + AutoTuner)
 */
export async function searchAllDocs(
  query: string,
  limit = 5
): Promise<RAGSearchResult> {
  const results = await searchDocuments(query, { limit });

  // Determine primary doc type
  const docTypes = results.map(r => r.metadata.docType);
  const uniqueTypes = new Set(docTypes);
  let docType: RAGSearchResult["docType"];

  if (uniqueTypes.size === 1) {
    docType = docTypes[0] || "general";
  } else if (uniqueTypes.size > 1) {
    docType = "mixed";
  } else {
    docType = "general";
  }

  return {
    answer: formatResultsAsContext(results),
    sources: results.map(r => ({
      title: r.metadata.title,
      source: r.metadata.source,
      relevance: r.similarity,
    })),
    docType,
  };
}

/**
 * Search for configuration variable help
 */
export async function searchConfigVariable(
  variableName: string
): Promise<RAGSearchResult> {
  // Search with variable name and context
  const query = `configuration variable ${variableName} parameter setting`;
  const results = await searchDocuments(query, { limit: 3 });

  return {
    answer: formatResultsAsContext(results),
    sources: results.map(r => ({
      title: r.metadata.title,
      source: r.metadata.source,
      relevance: r.similarity,
    })),
    docType: "mixed",
  };
}

/**
 * Search for error explanation and troubleshooting
 */
export async function searchErrorHelp(
  errorMessage: string
): Promise<RAGSearchResult> {
  // Clean up error message for better search
  const cleanError = errorMessage
    .replace(/[0-9a-f]{8,}/gi, "") // Remove long hex values
    .replace(/\/[^\s]+/g, "") // Remove paths
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200); // Limit length

  const query = `error troubleshooting ${cleanError}`;
  const results = await searchDocuments(query, { limit: 5 });

  return {
    answer: formatResultsAsContext(results),
    sources: results.map(r => ({
      title: r.metadata.title,
      source: r.metadata.source,
      relevance: r.similarity,
    })),
    docType: "mixed",
  };
}

/**
 * Search for AutoTuner parameter optimization
 */
export async function searchAutoTunerParams(
  objective: string,
  constraints?: string[]
): Promise<RAGSearchResult> {
  let query = `AutoTuner optimization parameter ${objective}`;

  if (constraints && constraints.length > 0) {
    query += ` constraints ${constraints.join(" ")}`;
  }

  const results = await searchByDocType(query, "autotuner", 5);

  return {
    answer: formatResultsAsContext(results),
    sources: results.map(r => ({
      title: r.metadata.title,
      source: r.metadata.source,
      relevance: r.similarity,
    })),
    docType: "autotuner",
  };
}

/**
 * Search for OpenLane step/flow information
 */
export async function searchOpenLaneStep(
  stepName: string
): Promise<RAGSearchResult> {
  const query = `OpenLane step ${stepName} flow stage configuration`;
  const results = await searchByDocType(query, "openlane", 5);

  return {
    answer: formatResultsAsContext(results),
    sources: results.map(r => ({
      title: r.metadata.title,
      source: r.metadata.source,
      relevance: r.similarity,
    })),
    docType: "openlane",
  };
}

/**
 * Get quick help for common topics
 */
export async function getQuickHelp(
  topic: "getting_started" | "synthesis" | "placement" | "routing" | "signoff" | "autotuner" | "pdk"
): Promise<RAGSearchResult> {
  const queries: Record<typeof topic, string> = {
    getting_started: "OpenLane getting started tutorial newcomers guide",
    synthesis: "OpenLane synthesis Yosys RTL netlist",
    placement: "OpenLane placement floorplan cell placement",
    routing: "OpenLane routing global detailed routing",
    signoff: "OpenLane signoff timing DRC LVS verification",
    autotuner: "AutoTuner optimization hyperparameter tuning",
    pdk: "PDK process design kit sky130 configuration",
  };

  return searchAllDocs(queries[topic], 5);
}
