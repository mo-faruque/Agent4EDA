/**
 * ECO (Engineering Change Order) Optimizer
 *
 * Post-route optimization for timing closure:
 * - Buffer insertion for setup/hold fixing
 * - Gate sizing recommendations
 * - Timing violation fixer
 * - Iterative optimization loop
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, access } from "fs/promises";
import { join } from "path";
import type { ExtendedPPAMetrics } from "../tuner/metrics-extractor.js";

const execAsync = promisify(exec);

/**
 * Timing violation info
 */
export interface TimingViolation {
  type: "setup" | "hold";
  path: string;
  slack: number;
  startpoint: string;
  endpoint: string;
  requiredTime: number;
  arrivalTime: number;
  clock: string;
}

/**
 * ECO fix recommendation
 */
export interface ECOFix {
  type: "buffer_insert" | "gate_resize" | "vt_swap" | "pin_swap" | "clone_gate";
  location: string;
  currentCell?: string;
  suggestedCell?: string;
  expectedImprovement: number; // ps
  priority: "critical" | "high" | "medium" | "low";
  command: string; // OpenROAD command to apply fix
}

/**
 * ECO iteration result
 */
export interface ECOIterationResult {
  iteration: number;
  beforeWNS: number;
  afterWNS: number;
  beforeTNS: number;
  afterTNS: number;
  fixesApplied: number;
  setupViolationsRemaining: number;
  holdViolationsRemaining: number;
  duration: number;
  converged: boolean;
}

/**
 * ECO optimization result
 */
export interface ECOResult {
  success: boolean;
  iterations: ECOIterationResult[];
  totalFixesApplied: number;
  initialWNS: number;
  finalWNS: number;
  initialTNS: number;
  finalTNS: number;
  timingMet: boolean;
  duration: number;
  recommendations: ECOFix[];
}

/**
 * ECO configuration
 */
export interface ECOConfig {
  runDir: string;
  platform: string;
  containerName?: string;
  maxIterations: number;
  setupMargin: number; // ns
  holdMargin: number; // ns
  maxUtilization: number; // %
  enableBufferInsertion: boolean;
  enableGateSizing: boolean;
  enableVTSwap: boolean;
  enablePinSwap: boolean;
  targetWNS: number; // Target WNS (default 0)
  stopOnConvergence: boolean;
}

/**
 * Analyze timing violations and get details
 */
export async function analyzeTimingViolations(
  config: ECOConfig
): Promise<TimingViolation[]> {
  const containerName = config.containerName || "mcp4eda";
  const containerRunDir = config.runDir.replace(/\\/g, "/").replace(/^[A-Z]:/, "/workspace");
  const violations: TimingViolation[] = [];

  try {
    // Get setup violations
    const { stdout: setupOut } = await execAsync(
      `docker exec ${containerName} bash -c "cd ${containerRunDir} && openroad -no_init -exit <<EOF
        read_lef ${config.platform}.lef
        read_def results/final.def
        read_liberty ${config.platform}.lib
        read_spef results/final.spef
        read_sdc results/final.sdc
        report_checks -path_delay max -slack_max 0 -format full_clock_expanded
        EOF"`,
      { timeout: 300000 }
    );

    // Parse setup violations
    const pathMatches = setupOut.matchAll(
      /Startpoint:\s*(\S+).*?Endpoint:\s*(\S+).*?slack\s*\(VIOLATED\)\s*([-\d.]+)/gs
    );
    for (const match of pathMatches) {
      violations.push({
        type: "setup",
        path: `${match[1]} -> ${match[2]}`,
        slack: parseFloat(match[3]),
        startpoint: match[1],
        endpoint: match[2],
        requiredTime: 0,
        arrivalTime: 0,
        clock: "clk",
      });
    }

    // Get hold violations
    const { stdout: holdOut } = await execAsync(
      `docker exec ${containerName} bash -c "cd ${containerRunDir} && openroad -no_init -exit <<EOF
        read_lef ${config.platform}.lef
        read_def results/final.def
        read_liberty ${config.platform}.lib
        read_spef results/final.spef
        read_sdc results/final.sdc
        report_checks -path_delay min -slack_max 0 -format full_clock_expanded
        EOF"`,
      { timeout: 300000 }
    );

    // Parse hold violations
    const holdMatches = holdOut.matchAll(
      /Startpoint:\s*(\S+).*?Endpoint:\s*(\S+).*?slack\s*\(VIOLATED\)\s*([-\d.]+)/gs
    );
    for (const match of holdMatches) {
      violations.push({
        type: "hold",
        path: `${match[1]} -> ${match[2]}`,
        slack: parseFloat(match[3]),
        startpoint: match[1],
        endpoint: match[2],
        requiredTime: 0,
        arrivalTime: 0,
        clock: "clk",
      });
    }

    return violations;
  } catch (error) {
    console.error("Error analyzing timing violations:", error);
    return [];
  }
}

/**
 * Generate ECO fix recommendations based on violations
 */
export function generateECORecommendations(
  violations: TimingViolation[],
  config: ECOConfig
): ECOFix[] {
  const fixes: ECOFix[] = [];

  for (const violation of violations) {
    const severity = Math.abs(violation.slack);

    if (violation.type === "setup") {
      // Setup violation fixes

      // 1. Gate upsizing (most common) - handled by repair_timing -setup
      if (config.enableGateSizing) {
        fixes.push({
          type: "gate_resize",
          location: violation.endpoint,
          expectedImprovement: Math.min(severity * 0.3, 100), // Estimate 30% improvement
          priority: severity > 0.5 ? "critical" : severity > 0.2 ? "high" : "medium",
          command: `repair_timing -setup -setup_margin ${config.setupMargin}`,
        });
      }

      // 2. VT swap (if allowed) - handled by repair_timing without -skip_vt_swap
      if (config.enableVTSwap && severity > 0.1) {
        fixes.push({
          type: "vt_swap",
          location: violation.endpoint,
          expectedImprovement: Math.min(severity * 0.2, 50),
          priority: "medium",
          command: `repair_timing -setup -setup_margin ${config.setupMargin}`,
        });
      }

      // 3. Pin swap (least disruptive) - handled by repair_timing without -skip_pin_swap
      if (config.enablePinSwap) {
        fixes.push({
          type: "pin_swap",
          location: violation.endpoint,
          expectedImprovement: Math.min(severity * 0.1, 20),
          priority: "low",
          command: `repair_timing -setup -setup_margin ${config.setupMargin}`,
        });
      }

    } else {
      // Hold violation fixes

      // 1. Buffer insertion (primary fix for hold) - handled by repair_timing -hold
      if (config.enableBufferInsertion) {
        fixes.push({
          type: "buffer_insert",
          location: violation.path,
          expectedImprovement: Math.abs(violation.slack),
          priority: severity > 0.1 ? "critical" : "high",
          command: `repair_timing -hold -hold_margin ${config.holdMargin}`,
        });
      }
    }
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  fixes.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return fixes;
}

/**
 * Run repair_design command for DRC fixing
 */
export async function runRepairDesign(
  config: ECOConfig
): Promise<{ success: boolean; changes: number; output: string }> {
  const containerName = config.containerName || "mcp4eda";
  const containerRunDir = config.runDir.replace(/\\/g, "/").replace(/^[A-Z]:/, "/workspace");

  try {
    const { stdout, stderr } = await execAsync(
      `docker exec ${containerName} bash -c "cd ${containerRunDir} && openroad -no_init -exit <<EOF
        read_lef ${config.platform}.lef
        read_def results/final.def
        read_liberty ${config.platform}.lib
        read_sdc results/final.sdc

        set_wire_rc -layer met1
        estimate_parasitics -placement

        repair_design -max_wire_length 100 -slew_margin 20 -cap_margin 20

        write_def results/eco_repaired.def
        EOF"`,
      { timeout: 600000 }
    );

    const changesMatch = stdout.match(/(\d+)\s*buffers?\s*inserted/i);
    const changes = changesMatch ? parseInt(changesMatch[1]) : 0;

    return {
      success: !stderr.toLowerCase().includes("error"),
      changes,
      output: stdout,
    };
  } catch (error) {
    return {
      success: false,
      changes: 0,
      output: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Run repair_timing command for timing fixes
 */
export async function runRepairTiming(
  config: ECOConfig,
  fixSetup: boolean = true,
  fixHold: boolean = true
): Promise<{ wns: number; tns: number; changes: number; success: boolean }> {
  const containerName = config.containerName || "mcp4eda";
  const containerRunDir = config.runDir.replace(/\\/g, "/").replace(/^[A-Z]:/, "/workspace");

  try {
    const repairOptions = [
      fixSetup ? "-setup" : "",
      fixHold ? "-hold" : "",
      `-setup_margin ${config.setupMargin}`,
      `-hold_margin ${config.holdMargin}`,
      `-max_utilization ${config.maxUtilization}`,
      config.enableVTSwap ? "" : "-skip_vt_swap",
      config.enablePinSwap ? "" : "-skip_pin_swap",
    ].filter(Boolean).join(" ");

    const { stdout, stderr } = await execAsync(
      `docker exec ${containerName} bash -c "cd ${containerRunDir} && openroad -no_init -exit <<EOF
        read_lef ${config.platform}.lef
        read_def results/final.def
        read_liberty ${config.platform}.lib
        read_spef results/final.spef
        read_sdc results/final.sdc

        repair_timing ${repairOptions}

        report_wns
        report_tns

        write_def results/eco_timing_repaired.def
        EOF"`,
      { timeout: 900000 } // 15 minutes
    );

    // Parse results
    const wnsMatch = stdout.match(/wns[:\s]+([-\d.]+)/i);
    const tnsMatch = stdout.match(/tns[:\s]+([-\d.]+)/i);
    const changesMatch = stdout.match(/(\d+)\s*(?:buffers?|cells?)\s*(?:inserted|resized)/gi);

    let changes = 0;
    if (changesMatch) {
      for (const m of changesMatch) {
        const num = m.match(/\d+/);
        if (num) changes += parseInt(num[0]);
      }
    }

    return {
      wns: wnsMatch ? parseFloat(wnsMatch[1]) : 0,
      tns: tnsMatch ? parseFloat(tnsMatch[1]) : 0,
      changes,
      success: !stderr.toLowerCase().includes("error"),
    };
  } catch (error) {
    return {
      wns: -999,
      tns: -999,
      changes: 0,
      success: false,
    };
  }
}

/**
 * Run iterative ECO optimization loop
 */
export async function runIterativeECO(
  config: ECOConfig,
  onProgress?: (iteration: number, wns: number) => void
): Promise<ECOResult> {
  const startTime = Date.now();
  const iterations: ECOIterationResult[] = [];
  let totalFixes = 0;

  // Get initial timing
  const initialTiming = await runRepairTiming(config, false, false);
  const initialWNS = initialTiming.wns;
  const initialTNS = initialTiming.tns;

  console.log(`\nInitial timing: WNS = ${initialWNS.toFixed(3)} ns, TNS = ${initialTNS.toFixed(3)} ns`);

  let currentWNS = initialWNS;
  let currentTNS = initialTNS;
  let converged = false;

  for (let i = 0; i < config.maxIterations; i++) {
    const iterStart = Date.now();
    console.log(`\n--- ECO Iteration ${i + 1}/${config.maxIterations} ---`);

    // Run repair_timing
    const result = await runRepairTiming(config, true, true);

    const iterResult: ECOIterationResult = {
      iteration: i + 1,
      beforeWNS: currentWNS,
      afterWNS: result.wns,
      beforeTNS: currentTNS,
      afterTNS: result.tns,
      fixesApplied: result.changes,
      setupViolationsRemaining: result.wns < 0 ? 1 : 0,
      holdViolationsRemaining: 0,
      duration: (Date.now() - iterStart) / 1000,
      converged: false,
    };

    iterations.push(iterResult);
    totalFixes += result.changes;

    // Report progress
    if (onProgress) {
      onProgress(i + 1, result.wns);
    }

    console.log(`  WNS: ${currentWNS.toFixed(3)} -> ${result.wns.toFixed(3)} ns`);
    console.log(`  TNS: ${currentTNS.toFixed(3)} -> ${result.tns.toFixed(3)} ns`);
    console.log(`  Fixes applied: ${result.changes}`);

    // Check for convergence
    const improvement = currentWNS - result.wns;
    if (Math.abs(improvement) < 0.001 || result.changes === 0) {
      console.log("  Converged - no further improvement possible");
      iterResult.converged = true;
      converged = true;
      if (config.stopOnConvergence) break;
    }

    // Check if timing met
    if (result.wns >= config.targetWNS) {
      console.log("  Target WNS achieved!");
      converged = true;
      if (config.stopOnConvergence) break;
    }

    currentWNS = result.wns;
    currentTNS = result.tns;
  }

  // Get final violations for recommendations
  const violations = await analyzeTimingViolations(config);
  const recommendations = generateECORecommendations(violations, config);

  const finalWNS = currentWNS;
  const finalTNS = currentTNS;
  const timingMet = finalWNS >= config.targetWNS;

  return {
    success: timingMet || converged,
    iterations,
    totalFixesApplied: totalFixes,
    initialWNS,
    finalWNS,
    initialTNS,
    finalTNS,
    timingMet,
    duration: (Date.now() - startTime) / 1000,
    recommendations: timingMet ? [] : recommendations,
  };
}

/**
 * Quick single-iteration timing fix
 */
export async function quickTimingFix(
  runDir: string,
  platform: string,
  options: {
    fixSetup?: boolean;
    fixHold?: boolean;
    margin?: number;
  } = {}
): Promise<{ improved: boolean; beforeWNS: number; afterWNS: number }> {
  const config: ECOConfig = {
    runDir,
    platform,
    maxIterations: 1,
    setupMargin: options.margin || 0.1,
    holdMargin: options.margin || 0.05,
    maxUtilization: 90,
    enableBufferInsertion: true,
    enableGateSizing: true,
    enableVTSwap: true,
    enablePinSwap: true,
    targetWNS: 0,
    stopOnConvergence: true,
  };

  const initialTiming = await runRepairTiming(config, false, false);
  const result = await runRepairTiming(
    config,
    options.fixSetup !== false,
    options.fixHold !== false
  );

  return {
    improved: result.wns > initialTiming.wns,
    beforeWNS: initialTiming.wns,
    afterWNS: result.wns,
  };
}

/**
 * Estimate effort needed for timing closure
 */
export function estimateTimingClosureEffort(
  wns: number,
  tns: number,
  cellCount: number
): {
  difficulty: "easy" | "moderate" | "hard" | "very_hard";
  estimatedIterations: number;
  recommendations: string[];
} {
  const recommendations: string[] = [];
  let difficulty: "easy" | "moderate" | "hard" | "very_hard";
  let iterations: number;

  if (wns >= 0) {
    difficulty = "easy";
    iterations = 0;
    recommendations.push("Timing already met - no ECO needed");
  } else if (wns >= -0.5) {
    difficulty = "easy";
    iterations = 2;
    recommendations.push("Minor timing violations - should close easily");
    recommendations.push("Try buffer insertion and gate sizing");
  } else if (wns >= -2.0) {
    difficulty = "moderate";
    iterations = 5;
    recommendations.push("Moderate timing violations");
    recommendations.push("Consider relaxing clock period by 10-20%");
    recommendations.push("Enable VT swap for critical paths");
  } else if (wns >= -5.0) {
    difficulty = "hard";
    iterations = 10;
    recommendations.push("Significant timing violations");
    recommendations.push("Relax clock period or re-run placement");
    recommendations.push("Check for long wire paths");
    recommendations.push("Consider reducing utilization");
  } else {
    difficulty = "very_hard";
    iterations = 20;
    recommendations.push("Severe timing violations - ECO may not be sufficient");
    recommendations.push("Re-evaluate clock constraints");
    recommendations.push("Consider architectural changes");
    recommendations.push("May need to re-run entire flow");
  }

  // Adjust for design size
  if (cellCount > 100000) {
    iterations = Math.ceil(iterations * 1.5);
    recommendations.push("Large design - expect longer optimization time");
  }

  return { difficulty, estimatedIterations: iterations, recommendations };
}

/**
 * Format ECO result for display
 */
export function formatECOResult(result: ECOResult): string {
  const lines: string[] = [];

  lines.push("=== ECO Optimization Results ===");
  lines.push("");
  lines.push(`Status: ${result.timingMet ? "TIMING MET" : "TIMING NOT MET"}`);
  lines.push(`Duration: ${(result.duration / 60).toFixed(1)} minutes`);
  lines.push(`Iterations: ${result.iterations.length}`);
  lines.push(`Total fixes applied: ${result.totalFixesApplied}`);
  lines.push("");
  lines.push("Timing Improvement:");
  lines.push(`  WNS: ${result.initialWNS.toFixed(3)} -> ${result.finalWNS.toFixed(3)} ns`);
  lines.push(`  TNS: ${result.initialTNS.toFixed(3)} -> ${result.finalTNS.toFixed(3)} ns`);

  if (result.recommendations.length > 0) {
    lines.push("");
    lines.push("Remaining recommendations:");
    for (const rec of result.recommendations.slice(0, 5)) {
      lines.push(`  - ${rec.type} at ${rec.location} (${rec.priority})`);
    }
    if (result.recommendations.length > 5) {
      lines.push(`  ... and ${result.recommendations.length - 5} more`);
    }
  }

  return lines.join("\n");
}
