/**
 * RAG Tools - MCP tools for documentation search
 *
 * Provides tools for searching OpenLane and AutoTuner documentation
 */

import {
  isRAGAvailable,
  searchOpenLaneDocs,
  searchAutoTunerDocs,
  searchAllDocs,
  searchConfigVariable,
  searchErrorHelp,
  searchAutoTunerParams,
  searchOpenLaneStep,
  getQuickHelp,
  getCollectionStats,
  type RAGSearchResult,
} from "../rag/index.js";

/**
 * RAG status result
 */
export interface RAGStatusResult {
  available: boolean;
  openaiConfigured: boolean;
  vectorstoreAvailable: boolean;
  documentCount: number;
  docTypes?: Record<string, number>;
  sources?: string[];
}

/**
 * Check RAG system status
 */
export async function checkRAGStatus(): Promise<RAGStatusResult> {
  const status = await isRAGAvailable();

  let docTypes: Record<string, number> | undefined;
  let sources: string[] | undefined;

  if (status.vectorstoreAvailable) {
    try {
      const stats = await getCollectionStats();
      docTypes = stats.docTypes;
      sources = stats.sources;
    } catch {
      // Stats not available
    }
  }

  return {
    ...status,
    docTypes,
    sources,
  };
}

/**
 * Format RAG search result for MCP response
 */
export function formatRAGResult(result: RAGSearchResult): string {
  const lines: string[] = [];

  lines.push("## Documentation Search Results");
  lines.push("");
  lines.push(`**Source Type:** ${result.docType}`);
  lines.push("");
  lines.push("### Content");
  lines.push("");
  lines.push(result.answer);
  lines.push("");

  if (result.sources.length > 0) {
    lines.push("### Sources");
    lines.push("");
    for (const source of result.sources) {
      const relevance = Math.round(source.relevance * 100);
      lines.push(`- **${source.title || "Documentation"}** (${relevance}% relevance)`);
      lines.push(`  ${source.source}`);
    }
  }

  return lines.join("\n");
}

/**
 * Search OpenLane documentation
 */
export async function searchOpenLane(
  query: string,
  limit = 5
): Promise<{ success: boolean; result?: RAGSearchResult; error?: string }> {
  const status = await isRAGAvailable();

  if (!status.available) {
    return {
      success: false,
      error: buildUnavailableError(status),
    };
  }

  try {
    const result = await searchOpenLaneDocs(query, limit);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Search AutoTuner documentation
 */
export async function searchAutoTuner(
  query: string,
  limit = 5
): Promise<{ success: boolean; result?: RAGSearchResult; error?: string }> {
  const status = await isRAGAvailable();

  if (!status.available) {
    return {
      success: false,
      error: buildUnavailableError(status),
    };
  }

  try {
    const result = await searchAutoTunerDocs(query, limit);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Search all EDA documentation
 */
export async function searchEDADocs(
  query: string,
  options: {
    limit?: number;
    docType?: "openlane" | "autotuner" | "all";
  } = {}
): Promise<{ success: boolean; result?: RAGSearchResult; error?: string }> {
  const { limit = 5, docType = "all" } = options;

  const status = await isRAGAvailable();

  if (!status.available) {
    return {
      success: false,
      error: buildUnavailableError(status),
    };
  }

  try {
    let result: RAGSearchResult;

    switch (docType) {
      case "openlane":
        result = await searchOpenLaneDocs(query, limit);
        break;
      case "autotuner":
        result = await searchAutoTunerDocs(query, limit);
        break;
      default:
        result = await searchAllDocs(query, limit);
    }

    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get help for a configuration variable
 */
export async function getConfigHelp(
  variableName: string
): Promise<{ success: boolean; result?: RAGSearchResult; error?: string }> {
  const status = await isRAGAvailable();

  if (!status.available) {
    return {
      success: false,
      error: buildUnavailableError(status),
    };
  }

  try {
    const result = await searchConfigVariable(variableName);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Explain an error message
 */
export async function explainError(
  errorMessage: string
): Promise<{ success: boolean; result?: RAGSearchResult; error?: string }> {
  const status = await isRAGAvailable();

  if (!status.available) {
    return {
      success: false,
      error: buildUnavailableError(status),
    };
  }

  try {
    const result = await searchErrorHelp(errorMessage);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get AutoTuner parameter recommendations
 */
export async function getAutoTunerHelp(
  objective: string,
  constraints?: string[]
): Promise<{ success: boolean; result?: RAGSearchResult; error?: string }> {
  const status = await isRAGAvailable();

  if (!status.available) {
    return {
      success: false,
      error: buildUnavailableError(status),
    };
  }

  try {
    const result = await searchAutoTunerParams(objective, constraints);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get OpenLane step information
 */
export async function getStepInfo(
  stepName: string
): Promise<{ success: boolean; result?: RAGSearchResult; error?: string }> {
  const status = await isRAGAvailable();

  if (!status.available) {
    return {
      success: false,
      error: buildUnavailableError(status),
    };
  }

  try {
    const result = await searchOpenLaneStep(stepName);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get quick help on a topic
 */
export async function getTopicHelp(
  topic: "getting_started" | "synthesis" | "placement" | "routing" | "signoff" | "autotuner" | "pdk"
): Promise<{ success: boolean; result?: RAGSearchResult; error?: string }> {
  const status = await isRAGAvailable();

  if (!status.available) {
    return {
      success: false,
      error: buildUnavailableError(status),
    };
  }

  try {
    const result = await getQuickHelp(topic);
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Build error message for unavailable RAG
 */
function buildUnavailableError(status: {
  openaiConfigured: boolean;
  vectorstoreAvailable: boolean;
  documentCount: number;
}): string {
  const issues: string[] = [];

  if (!status.openaiConfigured) {
    issues.push("OpenAI API key not configured (set OPENAI_API_KEY environment variable)");
  }

  if (!status.vectorstoreAvailable) {
    issues.push("ChromaDB vector store not available (ensure it's running on port 8000)");
  }

  if (status.openaiConfigured && status.vectorstoreAvailable && status.documentCount === 0) {
    issues.push("No documents indexed. Run the ingestion script to load documentation.");
  }

  return `RAG system unavailable:\n- ${issues.join("\n- ")}`;
}
