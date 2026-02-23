/**
 * Tools Index - Exports all EDA tools for MCP
 *
 * This module provides all the refactored tools that run in Docker
 */

// Synthesis tool
export {
  synthesizeVerilog,
  formatSynthesisResult,
  type SynthesisResult,
  type SynthesisOptions,
} from "./synthesis.js";

// Simulation tool
export {
  simulateVerilog,
  listVcdFiles,
  formatSimulationResult,
  type SimulationResult,
  type SimulationOptions,
} from "./simulation.js";

// OpenLane tool
export {
  runOpenlane,
  readOpenlaneReports,
  formatOpenlaneResult,
  formatReportsResult,
  type OpenlaneResult,
  type OpenlaneOptions,
} from "./openlane.js";

// Viewer tools
export {
  viewWaveform,
  viewGds,
  listGdsFiles,
  openFileViewer,
  getVncInfo,
  formatViewerResult,
  type ViewerResult,
} from "./viewers.js";

// RAG tools for documentation search
export {
  checkRAGStatus,
  formatRAGResult,
  searchOpenLane,
  searchAutoTuner,
  searchEDADocs,
  getConfigHelp,
  explainError,
  getAutoTunerHelp,
  getStepInfo,
  getTopicHelp,
  type RAGStatusResult,
} from "./rag-tools.js";

// Tuner tools for auto-tuning parameters
export {
  checkTunerStatus,
  suggestTuningParams,
  getPPAMetrics,
  generateTunerConfig,
  runAutoTunerTool,
  stopAutoTunerTool,
  getTuningResults,
  listTunableParameters,
  quickTuningAnalysis,
  generateExternalLLMPrompt,
  formatPPAMetrics,
  formatTunerResults,
  // Optimized run tool
  runOptimizedOpenlaneTool,
  formatOptimizedRunResult,
} from "./tuner-tools.js";

// Re-export project manager for convenience
export { projectManager } from "../files/project-manager.js";
export { fileManager } from "../files/file-manager.js";
export { pathResolver } from "../files/path-resolver.js";
export { dockerManager } from "../docker/docker-manager.js";
