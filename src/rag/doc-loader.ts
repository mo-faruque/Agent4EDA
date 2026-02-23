/**
 * Document Loader Module - Fetches and chunks documentation
 *
 * Handles loading documentation from:
 * - OpenLane GitHub docs
 * - AutoTuner documentation
 * - Local markdown/text files
 */

import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { readFile, readdir, stat } from "fs/promises";
import { join, extname, basename } from "path";
import type { DocumentMetadata } from "./vectorstore.js";

// Documentation sources - using ReadTheDocs HTML pages
export const DOC_SOURCES = {
  // LibreLane (OpenLane fork) documentation - comprehensive and up-to-date
  LIBRELANE: {
    BASE_URL: "https://librelane.readthedocs.io/en/latest/",
    PAGES: [
      // Main pages
      "index.html",
      "faq.html",
      "glossary.html",
      "additional_material.html",
      // Getting Started
      "getting_started/index.html",
      "getting_started/migrants/index.html",
      "getting_started/newcomers/index.html",
      // Reference Manual
      "reference/index.html",
      "reference/architecture.html",
      "reference/configuration.html",
      "reference/step_config_vars.html",
      "reference/pin_placement_cfg.html",
      // Usage guides
      "usage/index.html",
      "usage/about_pdks.html",
      "usage/pdn.html",
      "usage/timing_corners.html",
      "usage/using_macros.html",
      "usage/using_vhdl.html",
      "usage/writing_custom_flows.html",
      "usage/writing_custom_steps.html",
      "usage/writing_plugins.html",
      // Caravel tutorial
      "usage/caravel/index.html",
      // Timing closure
      "usage/timing_closure/index.html",
      // Contributors
      "contributors/index.html",
    ],
  },
  // OpenROAD documentation - detailed EDA tool documentation (correct path format: main/src/<module>/README.html)
  OPENROAD: {
    BASE_URL: "https://openroad.readthedocs.io/en/latest/",
    PAGES: [
      // Main pages
      "index.html",
      "main/README.html",
      // Core tools - using correct path format
      "main/src/odb/README.html",       // OpenDB - database
      "main/src/gui/README.html",       // GUI
      "main/src/ifp/README.html",       // Initialize Floorplan
      "main/src/ppl/README.html",       // Pin Placement
      "main/src/dft/README.html",       // Design for Test
      "main/src/pad/README.html",       // Pad placement
      "main/src/mpl/README.html",       // Macro Placement
      "main/src/tap/README.html",       // Tapcell placement
      // PDN and Power
      "main/src/pdn/README.html",       // PDN generation
      "main/src/upf/README.html",       // Unified Power Format
      "main/src/psm/README.html",       // Power analysis
      // Placement
      "main/src/gpl/README.html",       // Global Placement
      "main/src/dpl/README.html",       // Detailed Placement
      // Timing
      "main/src/sta/README.html",       // Static Timing Analysis
      "main/src/rsz/README.html",       // Gate Resizing
      // Clock
      "main/src/cts/README.html",       // Clock Tree Synthesis
      "main/src/grt/README.html",       // Global Routing
      // Routing
      "main/src/ant/README.html",       // Antenna checker
      "main/src/drt/README.html",       // Detailed Routing
      "main/src/fin/README.html",       // Metal fill
      // Extraction
      "main/src/rcx/README.html",       // Parasitic Extraction
    ],
  },
  // AutoTuner documentation
  AUTOTUNER: {
    BASE_URL: "https://raw.githubusercontent.com/The-OpenROAD-Project/OpenROAD-flow-scripts/master/",
    PAGES: [
      "docs/user/InstructionsForAutoTuner.md",
    ],
  },
  // OpenROAD Flow Scripts documentation
  ORFS: {
    BASE_URL: "https://openroad-flow-scripts.readthedocs.io/en/latest/",
    PAGES: [
      "index.html",
      "user/UserGuide.html",
      "user/BuildLocally.html",
      "user/BuildWithDocker.html",
      "user/InstructionsForAutoTuner.html",
      "user/AddingNewDesign.html",
      "user/FlowVariables.html",
      "user/FAQS.html",
    ],
  },
};

// Chunk configuration
const DEFAULT_CHUNK_SIZE = 1000;  // Characters per chunk
const DEFAULT_CHUNK_OVERLAP = 200; // Overlap between chunks

/**
 * Document chunk interface
 */
export interface DocumentChunk {
  id: string;
  content: string;
  metadata: DocumentMetadata;
}

/**
 * Generate a unique ID for a chunk
 */
function generateChunkId(source: string, chunkIndex: number): string {
  const hash = createHash("md5")
    .update(`${source}-${chunkIndex}`)
    .digest("hex")
    .substring(0, 12);
  return `chunk-${hash}`;
}

/**
 * Split text into overlapping chunks
 */
export function chunkText(
  text: string,
  options: {
    chunkSize?: number;
    chunkOverlap?: number;
    preserveParagraphs?: boolean;
  } = {}
): string[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    preserveParagraphs = true,
  } = options;

  // Clean text
  const cleanText = text.replace(/\r\n/g, "\n").trim();

  if (cleanText.length <= chunkSize) {
    return [cleanText];
  }

  const chunks: string[] = [];

  if (preserveParagraphs) {
    // Split by paragraphs first
    const paragraphs = cleanText.split(/\n\n+/);
    let currentChunk = "";

    for (const para of paragraphs) {
      if (currentChunk.length + para.length + 2 <= chunkSize) {
        currentChunk += (currentChunk ? "\n\n" : "") + para;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        // If single paragraph is too long, split it
        if (para.length > chunkSize) {
          const paraChunks = splitBySize(para, chunkSize, chunkOverlap);
          chunks.push(...paraChunks.slice(0, -1));
          currentChunk = paraChunks[paraChunks.length - 1] || "";
        } else {
          currentChunk = para;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  } else {
    // Simple character-based splitting
    return splitBySize(cleanText, chunkSize, chunkOverlap);
  }

  return chunks;
}

/**
 * Split text by size with overlap
 */
function splitBySize(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at word boundary
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + chunkSize / 2) {
        end = lastSpace;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;

    // Ensure we make progress
    if (start <= chunks.length - 1 ? 0 : start) {
      start = end;
    }
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Extract text from HTML
 */
export function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove script and style elements
  $("script, style, nav, footer, header").remove();

  // Get main content
  const mainContent = $("main, article, .content, .documentation, #content, body");
  const text = mainContent.first().text();

  // Clean up whitespace
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Extract title from HTML or markdown
 */
function extractTitle(content: string, isHtml: boolean): string | undefined {
  if (isHtml) {
    const $ = cheerio.load(content);
    return $("h1").first().text().trim() || $("title").text().trim() || undefined;
  } else {
    // Markdown - look for # heading
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim();
  }
}

/**
 * Fetch URL content with retry
 */
async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  // Dynamic import for node-fetch (ES module)
  const { default: fetch } = await import("node-fetch");

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "MCP4EDA-DocLoader/1.0",
          Accept: "text/html,text/plain,text/markdown,*/*",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw new Error("Failed to fetch after retries");
}

/**
 * Load document from URL
 */
export async function loadFromUrl(
  url: string,
  docType: "openlane" | "autotuner" | "general"
): Promise<DocumentChunk[]> {
  const content = await fetchWithRetry(url);
  const isHtml = url.endsWith(".html") || content.trim().startsWith("<!") || content.includes("<html");
  const isMarkdown = url.endsWith(".md");

  let text: string;
  if (isHtml) {
    text = extractTextFromHtml(content);
  } else {
    // Markdown or plain text - just clean it up
    text = content
      .replace(/```[\s\S]*?```/g, (match) => match) // Keep code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Convert links to text
      .trim();
  }

  const title = extractTitle(content, isHtml);
  const chunks = chunkText(text);

  return chunks.map((chunk, index) => ({
    id: generateChunkId(url, index),
    content: chunk,
    metadata: {
      source: url,
      title,
      docType,
      chunkIndex: index,
      totalChunks: chunks.length,
      lastUpdated: new Date().toISOString(),
    },
  }));
}

/**
 * Load document from local file
 */
export async function loadFromFile(
  filePath: string,
  docType: "openlane" | "autotuner" | "general"
): Promise<DocumentChunk[]> {
  const content = await readFile(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  let text: string;
  if (ext === ".html" || ext === ".htm") {
    text = extractTextFromHtml(content);
  } else {
    text = content;
  }

  const title = extractTitle(content, ext === ".html" || ext === ".htm") || basename(filePath);
  const chunks = chunkText(text);

  return chunks.map((chunk, index) => ({
    id: generateChunkId(filePath, index),
    content: chunk,
    metadata: {
      source: filePath,
      title,
      docType,
      chunkIndex: index,
      totalChunks: chunks.length,
      lastUpdated: new Date().toISOString(),
    },
  }));
}

/**
 * Load all files from a directory
 */
export async function loadFromDirectory(
  dirPath: string,
  docType: "openlane" | "autotuner" | "general",
  extensions = [".md", ".txt", ".html", ".rst"]
): Promise<DocumentChunk[]> {
  const allChunks: DocumentChunk[] = [];

  async function processDir(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await processDir(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          try {
            const chunks = await loadFromFile(fullPath, docType);
            allChunks.push(...chunks);
          } catch (error) {
            console.error(`Failed to load ${fullPath}:`, error);
          }
        }
      }
    }
  }

  await processDir(dirPath);
  return allChunks;
}

/**
 * Load LibreLane documentation from ReadTheDocs
 */
export async function loadLibreLaneDocs(): Promise<DocumentChunk[]> {
  const allChunks: DocumentChunk[] = [];

  for (const page of DOC_SOURCES.LIBRELANE.PAGES) {
    const url = DOC_SOURCES.LIBRELANE.BASE_URL + page;

    try {
      console.log(`Loading LibreLane doc: ${page}`);
      const chunks = await loadFromUrl(url, "openlane");
      allChunks.push(...chunks);
    } catch (error) {
      console.error(`Failed to load ${url}:`, error);
    }
  }

  return allChunks;
}

/**
 * Load OpenROAD documentation from ReadTheDocs
 */
export async function loadOpenROADDocs(): Promise<DocumentChunk[]> {
  const allChunks: DocumentChunk[] = [];

  for (const page of DOC_SOURCES.OPENROAD.PAGES) {
    const url = DOC_SOURCES.OPENROAD.BASE_URL + page;

    try {
      console.log(`Loading OpenROAD doc: ${page}`);
      const chunks = await loadFromUrl(url, "openlane");
      allChunks.push(...chunks);
    } catch (error) {
      console.error(`Failed to load ${url}:`, error);
    }
  }

  return allChunks;
}

/**
 * Load OpenROAD Flow Scripts documentation from ReadTheDocs
 */
export async function loadORFSDocs(): Promise<DocumentChunk[]> {
  const allChunks: DocumentChunk[] = [];

  for (const page of DOC_SOURCES.ORFS.PAGES) {
    const url = DOC_SOURCES.ORFS.BASE_URL + page;

    try {
      console.log(`Loading ORFS doc: ${page}`);
      const chunks = await loadFromUrl(url, "openlane");
      allChunks.push(...chunks);
    } catch (error) {
      console.error(`Failed to load ${url}:`, error);
    }
  }

  return allChunks;
}

/**
 * Load AutoTuner documentation from GitHub
 */
export async function loadAutoTunerDocs(): Promise<DocumentChunk[]> {
  const allChunks: DocumentChunk[] = [];

  for (const page of DOC_SOURCES.AUTOTUNER.PAGES) {
    const url = DOC_SOURCES.AUTOTUNER.BASE_URL + page;

    try {
      console.log(`Loading AutoTuner doc: ${page}`);
      const chunks = await loadFromUrl(url, "autotuner");
      allChunks.push(...chunks);
    } catch (error) {
      console.error(`Failed to load ${url}:`, error);
    }
  }

  return allChunks;
}

/**
 * Load all OpenLane/LibreLane related documentation
 */
export async function loadOpenLaneDocs(): Promise<DocumentChunk[]> {
  console.log("Loading all OpenLane-related documentation...");

  const [librelaneChunks, openroadChunks, orfsChunks] = await Promise.all([
    loadLibreLaneDocs(),
    loadOpenROADDocs(),
    loadORFSDocs(),
  ]);

  console.log(`Loaded: ${librelaneChunks.length} LibreLane, ${openroadChunks.length} OpenROAD, ${orfsChunks.length} ORFS chunks`);

  return [...librelaneChunks, ...openroadChunks, ...orfsChunks];
}

/**
 * Load all documentation (OpenLane + AutoTuner)
 */
export async function loadAllDocs(): Promise<DocumentChunk[]> {
  console.log("Loading all EDA documentation...");

  const [openlaneChunks, autotunerChunks] = await Promise.all([
    loadOpenLaneDocs(),
    loadAutoTunerDocs(),
  ]);

  console.log(`Total: ${openlaneChunks.length + autotunerChunks.length} chunks`);

  return [...openlaneChunks, ...autotunerChunks];
}
