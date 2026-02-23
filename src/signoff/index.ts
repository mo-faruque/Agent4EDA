/**
 * Signoff Module - Phase 6
 *
 * Complete signoff and tapeout readiness for OpenROAD/OpenLane flows:
 * - DRC/LVS/Antenna/IR Drop checks
 * - ECO timing closure optimization
 * - Tapeout checklist with GDS readiness scoring
 */

// Algorithm catalogs
export * from "./algorithms.js";
export * from "./autotuner-algorithms.js";

// Signoff checks
export {
  runDRCCheck,
  runLVSCheck,
  runAntennaCheck,
  runIRDropAnalysis,
  runTimingSignoff,
  runAllSignoffChecks,
  generateSignoffReport,
  quickDRCCheck,
  quickTimingCheck,
  type SignoffCheckResult,
  type SignoffReport,
  type SignoffConfig,
  type DRCViolation,
  type LVSResult,
  type IRDropResult,
  type TimingSignoffResult,
} from "./signoff-checker.js";

// ECO optimization
export {
  analyzeTimingViolations,
  generateECORecommendations,
  runRepairDesign,
  runRepairTiming,
  runIterativeECO,
  quickTimingFix,
  estimateTimingClosureEffort,
  formatECOResult,
  type TimingViolation,
  type ECOFix,
  type ECOIterationResult,
  type ECOResult,
  type ECOConfig,
} from "./eco-optimizer.js";

// Tapeout checklist
export {
  runTapeoutChecklist,
  formatChecklistMarkdown,
  quickReadinessCheck,
  type ChecklistItem,
  type ReadinessScore,
  type TapeoutChecklist,
  type FoundryReadiness,
  type ChecklistConfig,
  type CheckCategory,
} from "./tapeout-checklist.js";
