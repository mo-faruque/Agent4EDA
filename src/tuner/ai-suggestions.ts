/**
 * AI-Based Parameter Suggestions
 *
 * Analyzes design characteristics and initial run results to suggest
 * optimal tuning parameters and ranges for AutoTuner.
 */

import type { ExtendedPPAMetrics, DesignComplexity } from "./metrics-extractor.js";
import {
  type AutoTunerConfig,
  type OptimizationGoal,
  TUNABLE_PARAMETERS,
  OPTIMIZATION_PRESETS,
  suggestParametersForDesignSize,
} from "./config-generator.js";

/**
 * Analysis result from AI suggestion engine
 */
export interface AnalysisResult {
  summary: string;
  issues: string[];
  recommendations: string[];
  suggestedGoal: OptimizationGoal;
  suggestedParameters: Record<string, { min: number; max: number; step: number }>;
  confidence: "low" | "medium" | "high";
}

/**
 * Analyze initial run results and suggest tuning parameters
 */
export function analyzeAndSuggest(
  metrics: ExtendedPPAMetrics,
  complexity?: DesignComplexity,
  targetGoal?: OptimizationGoal
): AnalysisResult {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let suggestedGoal: OptimizationGoal = targetGoal || "balanced";

  // Analyze timing
  const timingAnalysis = analyzeTimingIssues(metrics);
  issues.push(...timingAnalysis.issues);
  recommendations.push(...timingAnalysis.recommendations);

  // Analyze area/utilization
  const areaAnalysis = analyzeAreaIssues(metrics);
  issues.push(...areaAnalysis.issues);
  recommendations.push(...areaAnalysis.recommendations);

  // Analyze power
  const powerAnalysis = analyzePowerIssues(metrics);
  issues.push(...powerAnalysis.issues);
  recommendations.push(...powerAnalysis.recommendations);

  // Determine suggested goal based on issues
  if (!targetGoal) {
    suggestedGoal = determineOptimalGoal(timingAnalysis, areaAnalysis, powerAnalysis);
  }

  // Generate suggested parameters
  const cellCount = complexity?.cellCount || metrics.cellCount || 1000;
  const baseParams = suggestParametersForDesignSize(cellCount, suggestedGoal);
  const adjustedParams = adjustParametersForIssues(
    baseParams,
    metrics,
    timingAnalysis,
    areaAnalysis,
    powerAnalysis
  );

  // Calculate confidence
  const confidence = calculateConfidence(metrics, complexity);

  // Generate summary
  const summary = generateSummary(
    metrics,
    complexity,
    issues,
    recommendations,
    suggestedGoal
  );

  return {
    summary,
    issues,
    recommendations,
    suggestedGoal,
    suggestedParameters: adjustedParams,
    confidence,
  };
}

/**
 * Timing analysis
 */
interface TimingAnalysis {
  hasTiming: boolean;
  hasViolations: boolean;
  violationSeverity: "none" | "minor" | "major" | "critical";
  issues: string[];
  recommendations: string[];
}

function analyzeTimingIssues(metrics: ExtendedPPAMetrics): TimingAnalysis {
  const analysis: TimingAnalysis = {
    hasTiming: false,
    hasViolations: false,
    violationSeverity: "none",
    issues: [],
    recommendations: [],
  };

  if (metrics.wnsNs === undefined && metrics.tnsNs === undefined) {
    analysis.issues.push("No timing data available - run may have failed before timing analysis");
    return analysis;
  }

  analysis.hasTiming = true;

  // Analyze WNS (Worst Negative Slack)
  const wns = metrics.wnsNs || 0;
  const tns = metrics.tnsNs || 0;

  if (wns < 0) {
    analysis.hasViolations = true;

    if (wns < -5) {
      analysis.violationSeverity = "critical";
      analysis.issues.push(`Critical timing violation: WNS = ${wns.toFixed(3)} ns`);
      analysis.recommendations.push("Significantly increase clock period (by 50-100%)");
      analysis.recommendations.push("Reduce target density to allow better placement");
      analysis.recommendations.push("Enable timing-driven placement (PL_TIME_DRIVEN=1)");
    } else if (wns < -2) {
      analysis.violationSeverity = "major";
      analysis.issues.push(`Major timing violation: WNS = ${wns.toFixed(3)} ns`);
      analysis.recommendations.push("Increase clock period by 20-50%");
      analysis.recommendations.push("Consider lowering core utilization");
    } else if (wns < -0.5) {
      analysis.violationSeverity = "minor";
      analysis.issues.push(`Minor timing violation: WNS = ${wns.toFixed(3)} ns`);
      analysis.recommendations.push("Small clock period adjustment may help");
      analysis.recommendations.push("Enable additional optimization iterations");
    }

    // TNS analysis
    if (tns < -100) {
      analysis.issues.push(`High total negative slack: TNS = ${tns.toFixed(3)} ns`);
      analysis.recommendations.push("Multiple paths are failing - consider global adjustments");
    }
  } else if (wns > 5) {
    // Large positive slack - clock might be too conservative
    analysis.issues.push(`Excessive positive slack: WNS = ${wns.toFixed(3)} ns`);
    analysis.recommendations.push("Clock period may be too conservative - can push for higher frequency");
  }

  return analysis;
}

/**
 * Area/utilization analysis
 */
interface AreaAnalysis {
  hasArea: boolean;
  utilizationTooHigh: boolean;
  utilizationTooLow: boolean;
  issues: string[];
  recommendations: string[];
}

function analyzeAreaIssues(metrics: ExtendedPPAMetrics): AreaAnalysis {
  const analysis: AreaAnalysis = {
    hasArea: false,
    utilizationTooHigh: false,
    utilizationTooLow: false,
    issues: [],
    recommendations: [],
  };

  if (metrics.utilizationPercent === undefined && metrics.areaUm2 === undefined) {
    return analysis;
  }

  analysis.hasArea = true;

  const util = metrics.utilizationPercent || 50;

  if (util > 80) {
    analysis.utilizationTooHigh = true;
    analysis.issues.push(`Very high utilization: ${util.toFixed(1)}%`);
    analysis.recommendations.push("Reduce FP_CORE_UTIL to improve routability");
    analysis.recommendations.push("Reduce PL_TARGET_DENSITY for better placement");
    analysis.recommendations.push("Increase GRT_ADJUSTMENT to reserve routing resources");
  } else if (util > 70) {
    analysis.utilizationTooHigh = true;
    analysis.issues.push(`High utilization: ${util.toFixed(1)}%`);
    analysis.recommendations.push("Consider slightly reducing utilization targets");
  } else if (util < 30) {
    analysis.utilizationTooLow = true;
    analysis.issues.push(`Low utilization: ${util.toFixed(1)}% - area may be wasted`);
    analysis.recommendations.push("Increase FP_CORE_UTIL for smaller die area");
    analysis.recommendations.push("Increase PL_TARGET_DENSITY for denser placement");
  }

  return analysis;
}

/**
 * Power analysis
 */
interface PowerAnalysis {
  hasPower: boolean;
  isHighPower: boolean;
  issues: string[];
  recommendations: string[];
}

function analyzePowerIssues(metrics: ExtendedPPAMetrics): PowerAnalysis {
  const analysis: PowerAnalysis = {
    hasPower: false,
    isHighPower: false,
    issues: [],
    recommendations: [],
  };

  if (metrics.powerMw === undefined) {
    return analysis;
  }

  analysis.hasPower = true;

  // Check power breakdown
  const leakage = metrics.leakagePowerMw || 0;
  const total = metrics.powerMw;

  if (total > 0 && leakage / total > 0.5) {
    analysis.isHighPower = true;
    analysis.issues.push("High leakage power ratio - consider smaller cells");
    analysis.recommendations.push("Use SYNTH_STRATEGY=0 (AREA) to prefer smaller cells");
    analysis.recommendations.push("Enable gate sizing (SYNTH_SIZING=1)");
  }

  // If switching power is dominant, clock gating might help
  const switching = metrics.switchingPowerMw || 0;
  if (total > 0 && switching / total > 0.6) {
    analysis.issues.push("High switching power - consider clock optimization");
    analysis.recommendations.push("Optimize clock tree for lower switching activity");
  }

  return analysis;
}

/**
 * Determine optimal goal based on analysis
 */
function determineOptimalGoal(
  timing: TimingAnalysis,
  area: AreaAnalysis,
  power: PowerAnalysis
): OptimizationGoal {
  // If critical timing violations, focus on performance first
  if (timing.violationSeverity === "critical" || timing.violationSeverity === "major") {
    return "performance";
  }

  // If utilization is very high, prioritize area
  if (area.utilizationTooHigh) {
    return "min_area";
  }

  // If high power, optimize for that
  if (power.isHighPower) {
    return "low_power";
  }

  // Default to balanced
  return "balanced";
}

/**
 * Adjust parameters based on identified issues
 */
function adjustParametersForIssues(
  baseParams: Record<string, { min: number; max: number; step: number }>,
  metrics: ExtendedPPAMetrics,
  timing: TimingAnalysis,
  area: AreaAnalysis,
  power: PowerAnalysis
): Record<string, { min: number; max: number; step: number }> {
  const params = { ...baseParams };

  // Timing adjustments
  if (timing.hasViolations) {
    const currentPeriod = metrics.clockPeriodNs || 10;

    if (timing.violationSeverity === "critical") {
      // Need significant clock period increase
      params.CLOCK_PERIOD = {
        min: currentPeriod * 1.5,
        max: currentPeriod * 3.0,
        step: currentPeriod * 0.1,
      };
    } else if (timing.violationSeverity === "major") {
      params.CLOCK_PERIOD = {
        min: currentPeriod * 1.2,
        max: currentPeriod * 2.0,
        step: currentPeriod * 0.1,
      };
    } else {
      params.CLOCK_PERIOD = {
        min: currentPeriod,
        max: currentPeriod * 1.5,
        step: currentPeriod * 0.05,
      };
    }

    // Force timing-driven placement for timing issues
    params.PL_TIME_DRIVEN = { min: 1, max: 1, step: 1 };
  }

  // Area adjustments
  if (area.utilizationTooHigh) {
    const currentUtil = metrics.utilizationPercent || 70;
    params.FP_CORE_UTIL = {
      min: Math.max(20, currentUtil - 20),
      max: currentUtil - 5,
      step: 5,
    };
    params.PL_TARGET_DENSITY = {
      min: 0.3,
      max: Math.min(0.7, (currentUtil - 10) / 100),
      step: 0.05,
    };
  } else if (area.utilizationTooLow) {
    const currentUtil = metrics.utilizationPercent || 30;
    params.FP_CORE_UTIL = {
      min: currentUtil + 5,
      max: Math.min(80, currentUtil + 30),
      step: 5,
    };
    params.PL_TARGET_DENSITY = {
      min: Math.max(0.4, currentUtil / 100),
      max: 0.85,
      step: 0.05,
    };
  }

  // Power adjustments
  if (power.isHighPower) {
    params.SYNTH_STRATEGY = { min: 0, max: 0, step: 1 }; // Force AREA strategy
    params.SYNTH_SIZING = { min: 1, max: 1, step: 1 };
  }

  return params;
}

/**
 * Calculate confidence level based on available data
 */
function calculateConfidence(
  metrics: ExtendedPPAMetrics,
  complexity?: DesignComplexity
): "low" | "medium" | "high" {
  let score = 0;

  // Timing data
  if (metrics.wnsNs !== undefined) score += 2;
  if (metrics.tnsNs !== undefined) score += 1;
  if (metrics.clockPeriodNs !== undefined) score += 1;

  // Area data
  if (metrics.areaUm2 !== undefined) score += 2;
  if (metrics.utilizationPercent !== undefined) score += 2;

  // Power data
  if (metrics.powerMw !== undefined) score += 2;

  // Cell data
  if (metrics.cellCount !== undefined) score += 1;

  // Complexity data
  if (complexity) score += 2;

  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  metrics: ExtendedPPAMetrics,
  complexity: DesignComplexity | undefined,
  issues: string[],
  recommendations: string[],
  goal: OptimizationGoal
): string {
  const lines: string[] = [];

  lines.push("=== AI Analysis Summary ===");
  lines.push("");

  // Design overview
  if (complexity) {
    lines.push(`Design Complexity: ${complexity.complexityScore}`);
    lines.push(`  Cells: ${complexity.cellCount}`);
    lines.push(`  Hierarchy Depth: ${complexity.hierarchyDepth}`);
    if (complexity.macroCount > 0) {
      lines.push(`  Macros: ${complexity.macroCount}`);
    }
    lines.push("");
  } else if (metrics.cellCount) {
    lines.push(`Cell Count: ${metrics.cellCount}`);
    lines.push("");
  }

  // Current metrics summary
  lines.push("Current Metrics:");
  if (metrics.wnsNs !== undefined) {
    const status = metrics.wnsNs >= 0 ? "MET" : "VIOLATED";
    lines.push(`  Timing: ${status} (WNS: ${metrics.wnsNs.toFixed(3)} ns)`);
  }
  if (metrics.utilizationPercent !== undefined) {
    lines.push(`  Utilization: ${metrics.utilizationPercent.toFixed(1)}%`);
  }
  if (metrics.powerMw !== undefined) {
    lines.push(`  Power: ${metrics.powerMw.toFixed(4)} mW`);
  }
  lines.push("");

  // Issues found
  if (issues.length > 0) {
    lines.push("Issues Found:");
    for (const issue of issues) {
      lines.push(`  - ${issue}`);
    }
    lines.push("");
  }

  // Recommendations
  if (recommendations.length > 0) {
    lines.push("Recommendations:");
    for (const rec of recommendations) {
      lines.push(`  - ${rec}`);
    }
    lines.push("");
  }

  // Suggested optimization goal
  const goalDescriptions: Record<OptimizationGoal, string> = {
    balanced: "Balanced optimization (area, power, performance equally weighted)",
    performance: "Performance-focused (maximize frequency, accept larger area)",
    low_power: "Low-power optimization (minimize power consumption)",
    min_area: "Area-focused (minimize die size, accept slower clock)",
  };

  lines.push(`Suggested Goal: ${goal.toUpperCase()}`);
  lines.push(`  ${goalDescriptions[goal]}`);

  return lines.join("\n");
}

/**
 * Generate a prompt for external LLM to provide additional suggestions
 */
export function generateLLMPrompt(
  metrics: ExtendedPPAMetrics,
  complexity?: DesignComplexity,
  targetGoal?: OptimizationGoal
): string {
  const prompt = `You are an expert ASIC/FPGA design engineer. Analyze the following OpenLane run results and suggest optimal tuning parameters.

## Design Information
${complexity ? `- Cell Count: ${complexity.cellCount}
- Hierarchy Depth: ${complexity.hierarchyDepth}
- Complexity: ${complexity.complexityScore}
- Macros: ${complexity.macroCount}` : `- Cell Count: ${metrics.cellCount || "unknown"}`}

## Current PPA Metrics
- Clock Period: ${metrics.clockPeriodNs?.toFixed(2) || "unknown"} ns
- Frequency: ${metrics.frequencyMhz?.toFixed(2) || "unknown"} MHz
- WNS (Worst Negative Slack): ${metrics.wnsNs?.toFixed(3) || "unknown"} ns
- TNS (Total Negative Slack): ${metrics.tnsNs?.toFixed(3) || "unknown"} ns
- Die Area: ${metrics.dieAreaUm2?.toFixed(2) || "unknown"} um²
- Utilization: ${metrics.utilizationPercent?.toFixed(1) || "unknown"}%
- Total Power: ${metrics.powerMw?.toFixed(4) || "unknown"} mW
- DRC Violations: ${metrics.drcViolations ?? "unknown"}

## Optimization Goal
${targetGoal || "balanced"} - ${targetGoal === "performance" ? "maximize frequency" : targetGoal === "low_power" ? "minimize power" : targetGoal === "min_area" ? "minimize area" : "balance all metrics"}

## Questions
1. What are the main issues with the current results?
2. What specific OpenLane/OpenROAD parameters should be tuned?
3. What parameter ranges would you recommend for AutoTuner?
4. Are there any fundamental design changes needed?

Please provide specific, actionable recommendations.`;

  return prompt;
}

/**
 * Quick analysis for simple suggestions without full AI analysis
 */
export function quickAnalysis(metrics: ExtendedPPAMetrics): {
  status: "good" | "needs_tuning" | "needs_major_changes";
  quickFixes: string[];
} {
  const quickFixes: string[] = [];

  // Check timing
  const wns = metrics.wnsNs || 0;
  if (wns < -5) {
    return {
      status: "needs_major_changes",
      quickFixes: [
        "Increase clock period significantly",
        "Reduce design complexity or critical paths",
      ],
    };
  }

  if (wns < -1) {
    quickFixes.push("Increase CLOCK_PERIOD by 10-20%");
    quickFixes.push("Enable PL_TIME_DRIVEN=1");
  }

  // Check utilization
  const util = metrics.utilizationPercent || 50;
  if (util > 75) {
    quickFixes.push("Reduce FP_CORE_UTIL to 60-65%");
    quickFixes.push("Increase GRT_ADJUSTMENT to 0.2-0.3");
  } else if (util < 35) {
    quickFixes.push("Increase FP_CORE_UTIL to 50-60%");
  }

  // Check DRC
  if (metrics.drcViolations && metrics.drcViolations > 0) {
    quickFixes.push("Reduce density to help with DRC");
    quickFixes.push("Increase routing iterations");
  }

  const status = quickFixes.length > 2 ? "needs_tuning" :
                 quickFixes.length > 0 ? "needs_tuning" : "good";

  return { status, quickFixes };
}

// ============================================================================
// INITIAL AI SUGGESTIONS (BEFORE TUNING)
// ============================================================================

/**
 * Initial suggestion result - provided BEFORE tuning starts
 */
export interface InitialAISuggestion {
  goal: OptimizationGoal;
  reasoning: string;
  suggestedParameters: Record<string, { value: number; min: number; max: number; step: number }>;
  searchStrategy: "grid" | "random" | "bayesian" | "hyperopt";
  estimatedTrials: number;
  warnings: string[];
  tips: string[];
}

/**
 * AI suggests initial parameters based on user goal and design info
 * This is called BEFORE auto-tuning begins
 */
export function suggestInitialParameters(options: {
  designName: string;
  platform: string;
  goal: OptimizationGoal;
  cellCount?: number;
  hasMemory?: boolean;
  hasClock?: boolean;
  targetFrequencyMhz?: number;
  maxAreaUm2?: number;
  maxPowerMw?: number;
}): InitialAISuggestion {
  const {
    designName,
    platform,
    goal,
    cellCount = 5000,
    hasMemory = false,
    hasClock = true,
    targetFrequencyMhz,
    maxAreaUm2,
    maxPowerMw,
  } = options;

  const warnings: string[] = [];
  const tips: string[] = [];
  let reasoning = "";

  // Determine design size category
  const sizeCategory = cellCount < 1000 ? "small" : cellCount < 10000 ? "medium" : cellCount < 100000 ? "large" : "very_large";

  // Get base preset
  const preset = OPTIMIZATION_PRESETS[goal];
  const suggestedParameters: Record<string, { value: number; min: number; max: number; step: number }> = {};

  // ========== GOAL-SPECIFIC PARAMETER SUGGESTIONS ==========

  if (goal === "performance") {
    reasoning = `Optimizing ${designName} for MAXIMUM PERFORMANCE. ` +
      `Focus on achieving highest clock frequency with timing closure.`;

    // Clock period - aggressive
    const basePeriod = targetFrequencyMhz ? 1000 / targetFrequencyMhz : 10;
    suggestedParameters.CLOCK_PERIOD = {
      value: basePeriod,
      min: basePeriod * 0.8,
      max: basePeriod * 1.5,
      step: basePeriod * 0.05,
    };

    // Lower utilization for better timing
    suggestedParameters.FP_CORE_UTIL = {
      value: sizeCategory === "small" ? 45 : sizeCategory === "medium" ? 40 : 35,
      min: 25,
      max: 55,
      step: 5,
    };

    // Lower density for timing
    suggestedParameters.PL_TARGET_DENSITY = {
      value: 0.45,
      min: 0.35,
      max: 0.6,
      step: 0.05,
    };

    // Enable timing-driven placement
    suggestedParameters.PL_TIME_DRIVEN = { value: 1, min: 1, max: 1, step: 1 };

    // Synthesis strategy: DELAY
    suggestedParameters.SYNTH_STRATEGY = { value: 1, min: 1, max: 1, step: 1 };

    tips.push("Consider using high-VT cells for less critical paths to save power");
    tips.push("Enable hold time fixing after routing: repair_timing -hold");

  } else if (goal === "low_power") {
    reasoning = `Optimizing ${designName} for MINIMUM POWER consumption. ` +
      `Will prefer smaller cells and lower switching activity.`;

    // Relaxed clock period
    const basePeriod = targetFrequencyMhz ? 1000 / targetFrequencyMhz : 20;
    suggestedParameters.CLOCK_PERIOD = {
      value: basePeriod * 1.2,
      min: basePeriod,
      max: basePeriod * 2,
      step: 1,
    };

    // Medium utilization (smaller cells pack denser)
    suggestedParameters.FP_CORE_UTIL = {
      value: sizeCategory === "small" ? 55 : 50,
      min: 40,
      max: 65,
      step: 5,
    };

    // Medium density
    suggestedParameters.PL_TARGET_DENSITY = {
      value: 0.55,
      min: 0.45,
      max: 0.7,
      step: 0.05,
    };

    // Synthesis strategy: AREA (smaller cells = less leakage)
    suggestedParameters.SYNTH_STRATEGY = { value: 0, min: 0, max: 0, step: 1 };
    suggestedParameters.SYNTH_SIZING = { value: 1, min: 1, max: 1, step: 1 };

    tips.push("Consider clock gating for inactive modules");
    tips.push("Use multi-VT synthesis for power optimization");

  } else if (goal === "min_area") {
    reasoning = `Optimizing ${designName} for MINIMUM DIE AREA. ` +
      `Will maximize utilization and use smallest cells possible.`;

    // Relaxed clock
    const basePeriod = targetFrequencyMhz ? 1000 / targetFrequencyMhz : 25;
    suggestedParameters.CLOCK_PERIOD = {
      value: basePeriod * 1.5,
      min: basePeriod,
      max: basePeriod * 2.5,
      step: 2,
    };

    // High utilization
    suggestedParameters.FP_CORE_UTIL = {
      value: sizeCategory === "small" ? 70 : sizeCategory === "medium" ? 65 : 55,
      min: 50,
      max: 80,
      step: 5,
    };

    // High density
    suggestedParameters.PL_TARGET_DENSITY = {
      value: 0.7,
      min: 0.6,
      max: 0.85,
      step: 0.05,
    };

    // AREA synthesis
    suggestedParameters.SYNTH_STRATEGY = { value: 0, min: 0, max: 0, step: 1 };

    tips.push("Watch for routing congestion at high utilization");
    tips.push("May need to increase GRT_ADJUSTMENT if DRC violations occur");

    if (sizeCategory === "large" || sizeCategory === "very_large") {
      warnings.push("High utilization on large designs may cause routing failures");
    }

  } else {
    // Balanced
    reasoning = `Balanced optimization for ${designName}. ` +
      `Will find best trade-off between performance, power, and area.`;

    const basePeriod = targetFrequencyMhz ? 1000 / targetFrequencyMhz : 15;
    suggestedParameters.CLOCK_PERIOD = {
      value: basePeriod,
      min: basePeriod * 0.8,
      max: basePeriod * 1.5,
      step: 1,
    };

    suggestedParameters.FP_CORE_UTIL = {
      value: sizeCategory === "small" ? 55 : sizeCategory === "medium" ? 50 : 45,
      min: 35,
      max: 65,
      step: 5,
    };

    suggestedParameters.PL_TARGET_DENSITY = {
      value: 0.55,
      min: 0.4,
      max: 0.7,
      step: 0.05,
    };

    suggestedParameters.SYNTH_STRATEGY = { value: 2, min: 0, max: 3, step: 1 };

    tips.push("Balanced mode explores a wider parameter space");
    tips.push("Consider running with more iterations for better results");
  }

  // ========== COMMON PARAMETERS ==========

  // Global routing adjustment
  suggestedParameters.GRT_ADJUSTMENT = {
    value: sizeCategory === "large" || sizeCategory === "very_large" ? 0.2 : 0.1,
    min: 0.0,
    max: 0.4,
    step: 0.05,
  };

  // CTS parameters
  if (hasClock) {
    suggestedParameters.CTS_SINK_CLUSTERING_SIZE = {
      value: sizeCategory === "small" ? 15 : 25,
      min: 10,
      max: 50,
      step: 5,
    };
  }

  // ========== PLATFORM-SPECIFIC ADJUSTMENTS ==========

  if (platform === "sky130hd") {
    tips.push("Sky130HD: Consider using SYNTH_BUFFERING=1 for better timing");
  } else if (platform === "asap7") {
    tips.push("ASAP7: Smaller feature size allows higher utilization");
    if (suggestedParameters.FP_CORE_UTIL) {
      suggestedParameters.FP_CORE_UTIL.max = Math.min(85, suggestedParameters.FP_CORE_UTIL.max + 10);
    }
  } else if (platform === "gf180") {
    tips.push("GF180: Larger feature size, keep utilization conservative");
  }

  // ========== SIZE-SPECIFIC WARNINGS ==========

  if (sizeCategory === "very_large") {
    warnings.push("Very large design (>100K cells): expect long runtime per trial");
    warnings.push("Consider reducing trial count or using parallel execution");
  }

  if (hasMemory) {
    warnings.push("Design contains memory: ensure macro placement is optimized");
    tips.push("Pre-place memories before auto-tuning for better results");
  }

  // ========== CONSTRAINTS CHECKS ==========

  if (maxAreaUm2) {
    tips.push(`Target max area: ${maxAreaUm2} um² - will prioritize compact designs`);
  }

  if (maxPowerMw) {
    tips.push(`Target max power: ${maxPowerMw} mW - will avoid high-frequency solutions`);
  }

  // ========== SEARCH STRATEGY RECOMMENDATION ==========

  const paramCount = Object.keys(suggestedParameters).length;
  let searchStrategy: "grid" | "random" | "bayesian" | "hyperopt";
  let estimatedTrials: number;

  if (paramCount <= 3) {
    searchStrategy = "grid";
    estimatedTrials = 27; // 3^3
  } else if (paramCount <= 5) {
    searchStrategy = "bayesian";
    estimatedTrials = 50;
  } else {
    searchStrategy = "hyperopt";
    estimatedTrials = 100;
  }

  // Adjust for design size (larger designs = fewer trials due to runtime)
  if (sizeCategory === "large") {
    estimatedTrials = Math.min(estimatedTrials, 30);
  } else if (sizeCategory === "very_large") {
    estimatedTrials = Math.min(estimatedTrials, 15);
  }

  return {
    goal,
    reasoning,
    suggestedParameters,
    searchStrategy,
    estimatedTrials,
    warnings,
    tips,
  };
}

/**
 * Format initial AI suggestion for display
 */
export function formatInitialSuggestion(suggestion: InitialAISuggestion): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           AI INITIAL PARAMETER SUGGESTIONS                   ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`Goal: ${suggestion.goal.toUpperCase()}`);
  lines.push(`Reasoning: ${suggestion.reasoning}`);
  lines.push("");
  lines.push("Suggested Starting Parameters:");
  lines.push("─".repeat(50));

  for (const [name, param] of Object.entries(suggestion.suggestedParameters)) {
    lines.push(`  ${name}:`);
    lines.push(`    Initial: ${param.value}`);
    lines.push(`    Range: [${param.min} - ${param.max}] step ${param.step}`);
  }

  lines.push("");
  lines.push(`Search Strategy: ${suggestion.searchStrategy.toUpperCase()}`);
  lines.push(`Recommended Trials: ${suggestion.estimatedTrials}`);

  if (suggestion.warnings.length > 0) {
    lines.push("");
    lines.push("⚠️  Warnings:");
    suggestion.warnings.forEach(w => lines.push(`    - ${w}`));
  }

  if (suggestion.tips.length > 0) {
    lines.push("");
    lines.push("💡 Tips:");
    suggestion.tips.forEach(t => lines.push(`    - ${t}`));
  }

  return lines.join("\n");
}

// ============================================================================
// FINAL AI RECOMMENDATIONS (AFTER TUNING)
// ============================================================================

/**
 * Trial result for final analysis
 */
export interface TrialSummary {
  trialId: number;
  parameters: Record<string, number>;
  score: number;
  metrics: {
    wns?: number;
    tns?: number;
    power?: number;
    area?: number;
    utilization?: number;
  };
  status: "success" | "failed";
}

/**
 * Final AI recommendation after tuning completes
 */
export interface FinalAIRecommendation {
  summary: string;
  bestParameters: Record<string, number>;
  improvement: {
    overBaseline: number; // percentage
    description: string;
  };
  insights: string[];
  nextSteps: string[];
  parameterSensitivity: Array<{
    parameter: string;
    impact: "high" | "medium" | "low";
    recommendation: string;
  }>;
  alternativeConfigs: Array<{
    name: string;
    parameters: Record<string, number>;
    tradeoff: string;
  }>;
}

/**
 * AI analyzes tuning results and provides final recommendations
 * Called AFTER auto-tuning completes
 */
export function analyzeTuningResults(options: {
  goal: OptimizationGoal;
  trials: TrialSummary[];
  baselineMetrics?: ExtendedPPAMetrics;
  designName: string;
}): FinalAIRecommendation {
  const { goal, trials, baselineMetrics, designName } = options;

  const successfulTrials = trials.filter(t => t.status === "success");
  const insights: string[] = [];
  const nextSteps: string[] = [];

  if (successfulTrials.length === 0) {
    return {
      summary: `All ${trials.length} trials failed. Check design constraints and try relaxing parameters.`,
      bestParameters: {},
      improvement: { overBaseline: 0, description: "No successful trials" },
      insights: ["All trials failed - design may have fundamental issues"],
      nextSteps: [
        "Check for synthesis errors",
        "Verify SDC constraints are achievable",
        "Try with more relaxed clock period",
      ],
      parameterSensitivity: [],
      alternativeConfigs: [],
    };
  }

  // Find best trial
  const sortedTrials = [...successfulTrials].sort((a, b) => b.score - a.score);
  const bestTrial = sortedTrials[0];
  const worstTrial = sortedTrials[sortedTrials.length - 1];

  // ========== CALCULATE IMPROVEMENT ==========

  let improvementPercent = 0;
  let improvementDesc = "";

  if (baselineMetrics) {
    const baseScore = calculateScore(baselineMetrics, goal);
    improvementPercent = ((bestTrial.score - baseScore) / baseScore) * 100;
    improvementDesc = improvementPercent > 0
      ? `${improvementPercent.toFixed(1)}% improvement over baseline`
      : `${Math.abs(improvementPercent).toFixed(1)}% below baseline`;
  } else if (worstTrial.score > 0) {
    improvementPercent = ((bestTrial.score - worstTrial.score) / worstTrial.score) * 100;
    improvementDesc = `${improvementPercent.toFixed(1)}% improvement over worst trial`;
  }

  // ========== ANALYZE PARAMETER SENSITIVITY ==========

  const parameterSensitivity = analyzeParameterSensitivity(successfulTrials);

  // ========== GENERATE INSIGHTS ==========

  // Score distribution insight
  const scoreRange = bestTrial.score - worstTrial.score;
  if (scoreRange < bestTrial.score * 0.1) {
    insights.push("Parameter space is relatively flat - most configurations perform similarly");
  } else if (scoreRange > bestTrial.score * 0.5) {
    insights.push("Parameters have significant impact - careful tuning is important");
  }

  // Timing insight
  if (bestTrial.metrics.wns !== undefined) {
    if (bestTrial.metrics.wns >= 0) {
      insights.push(`Timing MET with WNS = ${bestTrial.metrics.wns.toFixed(3)} ns`);
    } else {
      insights.push(`Timing violated: WNS = ${bestTrial.metrics.wns.toFixed(3)} ns - may need relaxed constraints`);
      nextSteps.push("Consider increasing clock period by 10-20%");
    }
  }

  // Utilization insight
  if (bestTrial.metrics.utilization !== undefined) {
    const util = bestTrial.metrics.utilization;
    if (util > 75) {
      insights.push(`High utilization (${util.toFixed(1)}%) achieved`);
      nextSteps.push("Monitor for routing congestion in production");
    } else if (util < 40) {
      insights.push(`Low utilization (${util.toFixed(1)}%) - area could be reduced`);
      nextSteps.push("Consider increasing FP_CORE_UTIL for smaller die");
    }
  }

  // Goal-specific insights
  if (goal === "performance") {
    insights.push("Performance optimization prioritized timing closure");
    if (bestTrial.metrics.wns !== undefined && bestTrial.metrics.wns >= 0) {
      nextSteps.push("Try pushing clock period lower for even higher frequency");
    }
  } else if (goal === "low_power") {
    insights.push("Power optimization favored smaller cells and lower activity");
    nextSteps.push("Consider clock gating for additional power savings");
  } else if (goal === "min_area") {
    insights.push("Area optimization maximized utilization");
    nextSteps.push("Verify DRC clean at this utilization level");
  }

  // ========== FIND ALTERNATIVE CONFIGURATIONS ==========

  const alternativeConfigs = findAlternativeConfigs(sortedTrials, goal);

  // ========== GENERATE SUMMARY ==========

  const summary = generateFinalSummary(
    designName,
    goal,
    bestTrial,
    successfulTrials.length,
    trials.length,
    improvementDesc
  );

  return {
    summary,
    bestParameters: bestTrial.parameters,
    improvement: {
      overBaseline: improvementPercent,
      description: improvementDesc,
    },
    insights,
    nextSteps,
    parameterSensitivity,
    alternativeConfigs,
  };
}

/**
 * Analyze which parameters have most impact on results
 */
function analyzeParameterSensitivity(
  trials: TrialSummary[]
): Array<{ parameter: string; impact: "high" | "medium" | "low"; recommendation: string }> {
  const sensitivity: Array<{ parameter: string; impact: "high" | "medium" | "low"; recommendation: string }> = [];

  if (trials.length < 3) return sensitivity;

  // Get all parameter names
  const paramNames = Object.keys(trials[0].parameters);

  for (const paramName of paramNames) {
    // Calculate correlation between parameter value and score
    const values = trials.map(t => t.parameters[paramName] || 0);
    const scores = trials.map(t => t.score);

    const correlation = calculateCorrelation(values, scores);
    const absCorr = Math.abs(correlation);

    let impact: "high" | "medium" | "low";
    let recommendation: string;

    if (absCorr > 0.7) {
      impact = "high";
      recommendation = correlation > 0
        ? `Increase ${paramName} for better results`
        : `Decrease ${paramName} for better results`;
    } else if (absCorr > 0.3) {
      impact = "medium";
      recommendation = `${paramName} has moderate impact - fine-tune around best value`;
    } else {
      impact = "low";
      recommendation = `${paramName} has minimal impact - can use default value`;
    }

    sensitivity.push({ parameter: paramName, impact, recommendation });
  }

  // Sort by impact
  const impactOrder = { high: 0, medium: 1, low: 2 };
  sensitivity.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  return sensitivity;
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate score based on goal
 */
function calculateScore(metrics: ExtendedPPAMetrics, goal: OptimizationGoal): number {
  const preset = OPTIMIZATION_PRESETS[goal];
  let score = 0;

  // Normalize metrics (higher is better for all)
  const perfScore = metrics.frequencyMhz || (metrics.clockPeriodNs ? 1000 / metrics.clockPeriodNs : 100);
  const powerScore = metrics.powerMw ? 100 / metrics.powerMw : 50; // Lower power = higher score
  const areaScore = metrics.areaUm2 ? 1000000 / metrics.areaUm2 : 50; // Smaller area = higher score

  score = preset.weights.performance * perfScore +
          preset.weights.power * powerScore +
          preset.weights.area * areaScore;

  return score;
}

/**
 * Find alternative configurations that might be interesting
 */
function findAlternativeConfigs(
  sortedTrials: TrialSummary[],
  goal: OptimizationGoal
): Array<{ name: string; parameters: Record<string, number>; tradeoff: string }> {
  const alternatives: Array<{ name: string; parameters: Record<string, number>; tradeoff: string }> = [];

  if (sortedTrials.length < 3) return alternatives;

  const best = sortedTrials[0];

  // Find trial with best timing (if not already best)
  const bestTiming = sortedTrials
    .filter(t => t.metrics.wns !== undefined)
    .sort((a, b) => (b.metrics.wns || -999) - (a.metrics.wns || -999))[0];

  if (bestTiming && bestTiming.trialId !== best.trialId) {
    alternatives.push({
      name: "Best Timing",
      parameters: bestTiming.parameters,
      tradeoff: `Better timing (WNS: ${bestTiming.metrics.wns?.toFixed(3)}) but ${((best.score - bestTiming.score) / best.score * 100).toFixed(1)}% lower overall score`,
    });
  }

  // Find trial with lowest power
  const lowestPower = sortedTrials
    .filter(t => t.metrics.power !== undefined)
    .sort((a, b) => (a.metrics.power || 999) - (b.metrics.power || 999))[0];

  if (lowestPower && lowestPower.trialId !== best.trialId) {
    alternatives.push({
      name: "Lowest Power",
      parameters: lowestPower.parameters,
      tradeoff: `Lower power (${lowestPower.metrics.power?.toFixed(4)} mW) but ${((best.score - lowestPower.score) / best.score * 100).toFixed(1)}% lower overall score`,
    });
  }

  // Find trial with smallest area
  const smallestArea = sortedTrials
    .filter(t => t.metrics.area !== undefined)
    .sort((a, b) => (a.metrics.area || 999999) - (b.metrics.area || 999999))[0];

  if (smallestArea && smallestArea.trialId !== best.trialId) {
    alternatives.push({
      name: "Smallest Area",
      parameters: smallestArea.parameters,
      tradeoff: `Smaller area (${smallestArea.metrics.area?.toFixed(0)} um²) but ${((best.score - smallestArea.score) / best.score * 100).toFixed(1)}% lower overall score`,
    });
  }

  return alternatives;
}

/**
 * Generate final summary text
 */
function generateFinalSummary(
  designName: string,
  goal: OptimizationGoal,
  bestTrial: TrialSummary,
  successCount: number,
  totalCount: number,
  improvementDesc: string
): string {
  const goalNames: Record<OptimizationGoal, string> = {
    balanced: "balanced optimization",
    performance: "maximum performance",
    low_power: "minimum power",
    min_area: "minimum area",
  };

  return `Auto-tuning completed for "${designName}" with ${goalNames[goal]}. ` +
    `${successCount}/${totalCount} trials succeeded. ` +
    `Best configuration achieved score ${bestTrial.score.toFixed(2)}` +
    (improvementDesc ? ` (${improvementDesc})` : "") + ".";
}

/**
 * Format final AI recommendation for display
 */
export function formatFinalRecommendation(rec: FinalAIRecommendation): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║             AI FINAL RECOMMENDATIONS                         ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(rec.summary);
  lines.push("");

  lines.push("Best Parameters Found:");
  lines.push("─".repeat(50));
  for (const [name, value] of Object.entries(rec.bestParameters)) {
    lines.push(`  ${name}: ${typeof value === "number" ? value.toFixed(3) : value}`);
  }
  lines.push("");

  if (rec.improvement.overBaseline !== 0) {
    lines.push(`Improvement: ${rec.improvement.description}`);
    lines.push("");
  }

  if (rec.insights.length > 0) {
    lines.push("Key Insights:");
    rec.insights.forEach(i => lines.push(`  • ${i}`));
    lines.push("");
  }

  if (rec.parameterSensitivity.length > 0) {
    lines.push("Parameter Sensitivity:");
    rec.parameterSensitivity.forEach(p => {
      const icon = p.impact === "high" ? "🔴" : p.impact === "medium" ? "🟡" : "🟢";
      lines.push(`  ${icon} ${p.parameter} (${p.impact}): ${p.recommendation}`);
    });
    lines.push("");
  }

  if (rec.alternativeConfigs.length > 0) {
    lines.push("Alternative Configurations:");
    rec.alternativeConfigs.forEach(alt => {
      lines.push(`  [${alt.name}] ${alt.tradeoff}`);
    });
    lines.push("");
  }

  if (rec.nextSteps.length > 0) {
    lines.push("Recommended Next Steps:");
    rec.nextSteps.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
  }

  return lines.join("\n");
}
