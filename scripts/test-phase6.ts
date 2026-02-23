/**
 * Phase 6 Test Script - Signoff & Tapeout
 *
 * Tests the signoff checking, ECO optimization, and tapeout checklist functionality
 */

import {
  // Algorithms
  getAllAlgorithms,
  OPTIMIZATION_PRESETS,
  AUTOTUNER_SEARCH_ALGORITHMS,
  AUTOTUNER_PARAMETER_CATEGORIES,
  recommendSearchAlgorithm,
  generateAutoTunerJSON,

  // Signoff types
  type SignoffConfig,
  type SignoffCheckResult,

  // ECO types
  type ECOConfig,
  estimateTimingClosureEffort,
  generateECORecommendations,
  type TimingViolation,

  // Tapeout checklist
  type ChecklistConfig,
  type ReadinessScore,
} from "../src/signoff/index.js";

import { signoffToolDefinitions, signoffToolHandlers } from "../src/tools/signoff-tools.js";

console.log("=".repeat(60));
console.log("Phase 6 Test: Signoff & Tapeout Module");
console.log("=".repeat(60));

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean | Promise<boolean>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then((r) => {
        if (r) {
          console.log(`✓ ${name}`);
          passed++;
        } else {
          console.log(`✗ ${name}`);
          failed++;
        }
      });
    } else if (result) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name}`);
      failed++;
    }
  } catch (error) {
    console.log(`✗ ${name}: ${error}`);
    failed++;
  }
}

// Test 1: Algorithm catalog
console.log("\n--- Algorithm Catalog Tests ---");

test("getAllAlgorithms returns all categories", () => {
  const algorithms = getAllAlgorithms();
  const expectedCategories = [
    "synthesis",
    "resizer",
    "placement",
    "cts",
    "global_routing",
    "detailed_routing",
    "extraction",
    "power_analysis",
    "antenna",
    "timing",
    "signoff",
    "presets",
  ];
  return expectedCategories.every((cat) => cat in algorithms);
});

test("OPTIMIZATION_PRESETS has all presets", () => {
  const presets = ["TIMING_CLOSURE", "LOW_POWER", "MIN_AREA", "DRC_CLEAN", "SIGNOFF_READY"];
  return presets.every((p) => p in OPTIMIZATION_PRESETS);
});

test("OPTIMIZATION_PRESETS have settings", () => {
  return Object.values(OPTIMIZATION_PRESETS).every(
    (preset) => preset.description && preset.settings && Object.keys(preset.settings).length > 0
  );
});

// Test 2: AutoTuner algorithms
console.log("\n--- AutoTuner Algorithm Tests ---");

test("AUTOTUNER_SEARCH_ALGORITHMS has all algorithms", () => {
  const algorithms = ["RANDOM", "GRID", "PBT", "HYPEROPT", "AX", "OPTUNA", "NEVERGRAD"];
  return algorithms.every((a) => a in AUTOTUNER_SEARCH_ALGORITHMS);
});

test("AutoTuner algorithms have required fields", () => {
  return Object.values(AUTOTUNER_SEARCH_ALGORITHMS).every(
    (alg) => alg.name && alg.description && alg.pros && alg.cons
  );
});

test("AUTOTUNER_PARAMETER_CATEGORIES has all categories", () => {
  const categories = [
    "SDC",
    "FLOORPLAN",
    "PLACEMENT",
    "CTS",
    "GLOBAL_ROUTING",
    "DETAILED_ROUTING",
    "TIMING_REPAIR",
  ];
  return categories.every((c) => c in AUTOTUNER_PARAMETER_CATEGORIES);
});

test("recommendSearchAlgorithm returns valid algorithm", () => {
  const rec = recommendSearchAlgorithm({
    numParameters: 5,
    numTrials: 100,
    parallelWorkers: 4,
    parameterTypes: ["continuous", "continuous", "discrete", "continuous", "categorical"],
  });
  const validAlgorithms = ["random", "grid", "pbt", "hyperopt", "ax", "optuna", "nevergrad"];
  return validAlgorithms.includes(rec);
});

test("recommendSearchAlgorithm returns grid for small space", () => {
  const rec = recommendSearchAlgorithm({
    numParameters: 2,
    numTrials: 50,
    parallelWorkers: 1,
    parameterTypes: ["continuous", "discrete"],
  });
  return rec === "grid";
});

test("recommendSearchAlgorithm returns nevergrad for mostly discrete", () => {
  const rec = recommendSearchAlgorithm({
    numParameters: 5,
    numTrials: 100,
    parallelWorkers: 4,
    parameterTypes: ["discrete", "discrete", "categorical", "discrete", "categorical"],
  });
  return rec === "nevergrad";
});

test("generateAutoTunerJSON creates valid JSON", () => {
  const json = generateAutoTunerJSON({
    design: "gcd",
    platform: "sky130hd",
    algorithm: "HYPEROPT",
    mode: "TUNE",
    parameters: {
      CORE_UTILIZATION: { min: 30, max: 70, step: 5 },
      PLACE_DENSITY: { min: 0.5, max: 0.9 },
    },
    objectives: { performance: 0.4, power: 0.3, area: 0.3 },
    numTrials: 50,
    parallelTrials: 4,
    seed: 42,
  });

  const parsed = JSON.parse(json);
  return (
    parsed.design === "gcd" &&
    parsed.platform === "sky130hd" &&
    parsed.algorithm === "HYPEROPT" &&
    parsed.num_samples === 50 &&
    parsed.parameters.CORE_UTILIZATION.type === "discrete" &&
    parsed.parameters.PLACE_DENSITY.type === "continuous"
  );
});

// Test 3: ECO estimation
console.log("\n--- ECO Estimation Tests ---");

test("estimateTimingClosureEffort returns easy for met timing", () => {
  const result = estimateTimingClosureEffort(0.1, 0, 10000);
  return result.difficulty === "easy" && result.estimatedIterations === 0;
});

test("estimateTimingClosureEffort returns moderate for -1ns WNS", () => {
  const result = estimateTimingClosureEffort(-1.0, -10, 10000);
  return result.difficulty === "moderate" && result.estimatedIterations > 0;
});

test("estimateTimingClosureEffort returns hard for -3ns WNS", () => {
  const result = estimateTimingClosureEffort(-3.0, -100, 10000);
  return result.difficulty === "hard" && result.estimatedIterations >= 5;
});

test("estimateTimingClosureEffort returns very_hard for severe violations", () => {
  const result = estimateTimingClosureEffort(-10.0, -500, 10000);
  return result.difficulty === "very_hard" && result.recommendations.length > 0;
});

test("estimateTimingClosureEffort adjusts for large designs", () => {
  const small = estimateTimingClosureEffort(-2.0, -50, 10000);
  const large = estimateTimingClosureEffort(-2.0, -50, 200000);
  return large.estimatedIterations > small.estimatedIterations;
});

// Test 4: ECO recommendations
console.log("\n--- ECO Recommendation Tests ---");

test("generateECORecommendations creates fixes for setup violations", () => {
  const violations: TimingViolation[] = [
    {
      type: "setup",
      path: "reg1 -> reg2",
      slack: -0.5,
      startpoint: "reg1/Q",
      endpoint: "reg2/D",
      requiredTime: 10.0,
      arrivalTime: 10.5,
      clock: "clk",
    },
  ];

  const config: ECOConfig = {
    runDir: "/test",
    platform: "sky130hd",
    maxIterations: 1,
    setupMargin: 0.1,
    holdMargin: 0.05,
    maxUtilization: 90,
    enableBufferInsertion: true,
    enableGateSizing: true,
    enableVTSwap: true,
    enablePinSwap: true,
    targetWNS: 0,
    stopOnConvergence: true,
  };

  const fixes = generateECORecommendations(violations, config);
  return fixes.length > 0 && fixes.some((f) => f.type === "gate_resize");
});

test("generateECORecommendations creates buffer insertions for hold violations", () => {
  const violations: TimingViolation[] = [
    {
      type: "hold",
      path: "reg1 -> reg2",
      slack: -0.1,
      startpoint: "reg1/Q",
      endpoint: "reg2/D",
      requiredTime: 0.0,
      arrivalTime: -0.1,
      clock: "clk",
    },
  ];

  const config: ECOConfig = {
    runDir: "/test",
    platform: "sky130hd",
    maxIterations: 1,
    setupMargin: 0.1,
    holdMargin: 0.05,
    maxUtilization: 90,
    enableBufferInsertion: true,
    enableGateSizing: true,
    enableVTSwap: true,
    enablePinSwap: true,
    targetWNS: 0,
    stopOnConvergence: true,
  };

  const fixes = generateECORecommendations(violations, config);
  return fixes.length > 0 && fixes.some((f) => f.type === "buffer_insert");
});

test("generateECORecommendations respects disabled options", () => {
  const violations: TimingViolation[] = [
    {
      type: "setup",
      path: "reg1 -> reg2",
      slack: -0.5,
      startpoint: "reg1/Q",
      endpoint: "reg2/D",
      requiredTime: 10.0,
      arrivalTime: 10.5,
      clock: "clk",
    },
  ];

  const config: ECOConfig = {
    runDir: "/test",
    platform: "sky130hd",
    maxIterations: 1,
    setupMargin: 0.1,
    holdMargin: 0.05,
    maxUtilization: 90,
    enableBufferInsertion: true,
    enableGateSizing: false,
    enableVTSwap: false,
    enablePinSwap: false,
    targetWNS: 0,
    stopOnConvergence: true,
  };

  const fixes = generateECORecommendations(violations, config);
  return !fixes.some((f) => f.type === "gate_resize" || f.type === "vt_swap" || f.type === "pin_swap");
});

test("generateECORecommendations sorts by priority", () => {
  const violations: TimingViolation[] = [
    {
      type: "setup",
      path: "path1",
      slack: -0.1,
      startpoint: "a",
      endpoint: "b",
      requiredTime: 10,
      arrivalTime: 10.1,
      clock: "clk",
    },
    {
      type: "setup",
      path: "path2",
      slack: -1.0,
      startpoint: "c",
      endpoint: "d",
      requiredTime: 10,
      arrivalTime: 11.0,
      clock: "clk",
    },
  ];

  const config: ECOConfig = {
    runDir: "/test",
    platform: "sky130hd",
    maxIterations: 1,
    setupMargin: 0.1,
    holdMargin: 0.05,
    maxUtilization: 90,
    enableBufferInsertion: true,
    enableGateSizing: true,
    enableVTSwap: true,
    enablePinSwap: true,
    targetWNS: 0,
    stopOnConvergence: true,
  };

  const fixes = generateECORecommendations(violations, config);
  const priorities = fixes.map((f) => f.priority);
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  for (let i = 1; i < priorities.length; i++) {
    if (priorityOrder[priorities[i]] < priorityOrder[priorities[i - 1]]) {
      return false;
    }
  }
  return true;
});

// Test 5: MCP Tool definitions
console.log("\n--- MCP Tool Definition Tests ---");

test("signoffToolDefinitions has all tools", () => {
  const expectedTools = [
    "run_signoff_checks",
    "run_drc_check",
    "run_lvs_check",
    "run_timing_signoff",
    "run_ir_drop_analysis",
    "run_eco_optimization",
    "quick_timing_fix",
    "analyze_timing_violations",
    "get_eco_recommendations",
    "estimate_timing_closure",
    "run_tapeout_checklist",
    "quick_readiness_check",
    "get_algorithm_info",
    "get_optimization_preset",
    "recommend_search_algorithm",
  ];
  const toolNames = signoffToolDefinitions.map((t) => t.name);
  return expectedTools.every((t) => toolNames.includes(t));
});

test("All tool definitions have inputSchema", () => {
  return signoffToolDefinitions.every((t) => t.inputSchema !== undefined);
});

test("All tool definitions have handlers", () => {
  return signoffToolDefinitions.every((t) => t.name in signoffToolHandlers);
});

// Test 6: Tool handlers (non-Docker tests)
console.log("\n--- Tool Handler Tests ---");

test("get_algorithm_info returns synthesis algorithms", async () => {
  const result = (await signoffToolHandlers.get_algorithm_info({ category: "synthesis" })) as Record<
    string,
    unknown
  >;
  return result !== null && "STRATEGY" in result;
});

test("get_algorithm_info returns all algorithms", async () => {
  const result = (await signoffToolHandlers.get_algorithm_info({ category: "all" })) as Record<
    string,
    unknown
  >;
  return result !== null && "synthesis" in result && "placement" in result;
});

test("get_optimization_preset returns TIMING_CLOSURE", async () => {
  const result = (await signoffToolHandlers.get_optimization_preset({
    preset: "TIMING_CLOSURE",
  })) as Record<string, unknown>;
  return result !== null && result.description !== undefined;
});

test("recommend_search_algorithm returns valid result", async () => {
  const result = (await signoffToolHandlers.recommend_search_algorithm({
    numParameters: 5,
    numTrials: 100,
    parallelWorkers: 4,
    parameterTypes: ["continuous", "discrete", "continuous", "continuous", "categorical"],
  })) as { recommended: string; info: unknown };
  return result.recommended !== undefined && result.info !== null;
});

test("estimate_timing_closure returns valid result", async () => {
  const result = (await signoffToolHandlers.estimate_timing_closure({
    wns: -1.5,
    tns: -50,
    cellCount: 25000,
  })) as { difficulty: string; estimatedIterations: number };
  return result.difficulty !== undefined && result.estimatedIterations >= 0;
});

// Final summary
setTimeout(() => {
  console.log("\n" + "=".repeat(60));
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}, 1000);
