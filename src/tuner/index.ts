/**
 * Tuner Module Index
 *
 * Exports all tuner-related functionality
 */

// Config generator
export {
  type TunableParameter,
  type AutoTunerConfig,
  type OptimizationGoal,
  type DesignInfo,
  type AISuggestedRanges,
  TUNABLE_PARAMETERS,
  OPTIMIZATION_PRESETS,
  generateAutoTunerConfig,
  generateAutoTunerConfigWithAI,
  getAISuggestedRanges,
  formatAISuggestion,
  configToJson,
  generateAutoTunerCommand,
  generateRayTuneConfig,
  suggestParametersForDesignSize,
  validateConfig,
} from "./config-generator.js";

// Metrics extractor
export {
  type ExtendedPPAMetrics,
  type DesignComplexity,
  parseOpenLaneMetrics,
  analyzeDesignComplexity,
  compareMetrics,
  formatMetrics,
  findLatestRunDir,
} from "./metrics-extractor.js";

// AI suggestions
export {
  type AnalysisResult,
  analyzeAndSuggest,
  generateLLMPrompt,
  quickAnalysis,
} from "./ai-suggestions.js";

// ORFS setup for AutoTuner
export {
  type ORFSDesignConfig,
  type ORFSSetupResult,
  setupORFSDesign,
  cleanupORFSDesign,
  checkORFSDesignExists,
  copyProjectToORFS,
  getORFSPlatform,
  generateConfigMk,
  generateConstraintSdc,
} from "./orfs-setup.js";

// AutoTuner runner
export {
  type AutoTunerRunConfig,
  type TrialResult,
  type AutoTunerResult,
  type ProgressCallback,
  checkAutoTunerAvailable,
  prepareAutoTunerRun,
  runAutoTuner,
  stopAutoTuner,
  getAutoTunerStatus,
  cleanupAutoTunerDesign,
  formatAutoTunerResult,
} from "./autotuner-runner.js";

// Unified parameter mapping (LibreLane <-> ORFS)
export {
  type UnifiedParameter,
  UNIFIED_PARAMETERS,
  NON_TUNABLE_ORFS_PARAMS,
  toLibrelaneParam,
  toOrfsParam,
  fromLibrelaneParam,
  fromOrfsParam,
  getTunableParameters,
  getParametersByCategory,
  isTunable,
  toOrfsAutoTunerConfig,
  toLibrelaneConfig,
  orfsParamsToLibrelane,
  generateOptimizedLibrelaneConfig,
} from "./parameter-mapping.js";
