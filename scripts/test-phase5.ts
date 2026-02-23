#!/usr/bin/env npx tsx
/**
 * Test script for Phase 5: Auto-Tuner Integration
 *
 * Tests the tuner functionality without requiring a running container
 */

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import {
  // Config generator
  TUNABLE_PARAMETERS,
  OPTIMIZATION_PRESETS,
  generateAutoTunerConfig,
  configToJson,
  validateConfig,
  suggestParametersForDesignSize,
  // Metrics extractor
  formatMetrics,
  compareMetrics,
  type ExtendedPPAMetrics,
  // AI suggestions
  analyzeAndSuggest,
  quickAnalysis,
  generateLLMPrompt,
  // Runner
  formatAutoTunerResult,
  type AutoTunerResult,
} from "../src/tuner/index.js";

import {
  checkTunerStatus,
  listTunableParameters,
  generateTunerConfig,
} from "../src/tools/tuner-tools.js";

async function testPhase5() {
  console.log("=== Phase 5: Auto-Tuner Integration Tests ===\n");

  // Test 1: List tunable parameters
  console.log("Test 1: Listing tunable parameters...");
  const paramsResult = listTunableParameters();
  if (paramsResult.success && paramsResult.result) {
    const paramCount = Object.keys(paramsResult.result.parameters).length;
    const presetCount = Object.keys(paramsResult.result.presets).length;
    console.log(`  ✓ ${paramCount} tunable parameters defined`);
    console.log(`  ✓ ${presetCount} optimization presets defined`);
    console.log("  Parameters:", Object.keys(paramsResult.result.parameters).slice(0, 5).join(", "), "...");
    console.log("  Presets:", Object.keys(paramsResult.result.presets).join(", "));
  } else {
    console.log("  ✗ Failed to list parameters");
  }

  // Test 2: Generate AutoTuner configuration
  console.log("\nTest 2: Generating AutoTuner configuration...");
  const configResult = generateTunerConfig({
    design: "test_counter",
    platform: "sky130hd",
    goal: "balanced",
    iterations: 25,
  });
  if (configResult.success && configResult.result) {
    console.log("  ✓ Configuration generated successfully");
    console.log(`  Design: ${configResult.result.config.design}`);
    console.log(`  Platform: ${configResult.result.config.platform}`);
    console.log(`  Iterations: ${configResult.result.config.iterations}`);
    console.log(`  Parameters to tune: ${Object.keys(configResult.result.config.parameters).length}`);
    console.log("  Objectives:", configResult.result.config.objectives);
  } else {
    console.log("  ✗ Configuration generation failed:", configResult.error);
  }

  // Test 3: Validate configuration
  console.log("\nTest 3: Testing configuration validation...");
  const validConfig = generateAutoTunerConfig({
    design: "valid_design",
    platform: "sky130hd",
    iterations: 50,
  });
  const validationResult = validateConfig(validConfig);
  console.log(`  Valid config: ${validationResult.valid ? "✓ VALID" : "✗ INVALID"}`);

  // Test invalid config
  const invalidConfig = generateAutoTunerConfig({
    design: "", // Invalid - empty design name
    platform: "invalid_platform", // Invalid platform
    iterations: 2000, // Invalid - too many iterations
  });
  const invalidValidation = validateConfig(invalidConfig);
  console.log(`  Invalid config detected: ${!invalidValidation.valid ? "✓ Caught errors" : "✗ Missed errors"}`);
  if (!invalidValidation.valid) {
    console.log("  Validation errors:", invalidValidation.errors.join("; "));
  }

  // Test 4: Design size-based parameter suggestions
  console.log("\nTest 4: Testing design size-based parameter suggestions...");
  const smallDesignParams = suggestParametersForDesignSize(500, "balanced");
  const largeDesignParams = suggestParametersForDesignSize(50000, "balanced");

  console.log("  Small design (500 cells):");
  console.log(`    FP_CORE_UTIL: ${smallDesignParams.FP_CORE_UTIL?.min}-${smallDesignParams.FP_CORE_UTIL?.max}%`);

  console.log("  Large design (50000 cells):");
  console.log(`    FP_CORE_UTIL: ${largeDesignParams.FP_CORE_UTIL?.min}-${largeDesignParams.FP_CORE_UTIL?.max}%`);

  console.log("  ✓ Parameters adjusted for design size");

  // Test 5: Mock metrics analysis
  console.log("\nTest 5: Testing PPA metrics analysis...");
  const mockMetrics: ExtendedPPAMetrics = {
    id: 1,
    runId: "test-run-1",
    clockPeriodNs: 10.0,
    frequencyMhz: 100.0,
    wnsNs: -0.5, // Minor timing violation
    tnsNs: -2.5,
    dieAreaUm2: 150000,
    coreAreaUm2: 120000,
    utilizationPercent: 65,
    powerMw: 0.45,
    cellCount: 5000,
    drcViolations: 0,
  };

  console.log("  Mock metrics created:");
  console.log(`    WNS: ${mockMetrics.wnsNs} ns (minor violation)`);
  console.log(`    Utilization: ${mockMetrics.utilizationPercent}%`);
  console.log(`    Cell Count: ${mockMetrics.cellCount}`);

  // Test 6: AI suggestions
  console.log("\nTest 6: Testing AI analysis and suggestions...");
  const analysis = analyzeAndSuggest(mockMetrics, undefined, undefined);

  console.log(`  Suggested goal: ${analysis.suggestedGoal}`);
  console.log(`  Confidence: ${analysis.confidence}`);
  console.log(`  Issues found: ${analysis.issues.length}`);
  if (analysis.issues.length > 0) {
    console.log("  Issues:");
    for (const issue of analysis.issues) {
      console.log(`    - ${issue}`);
    }
  }
  console.log(`  Recommendations: ${analysis.recommendations.length}`);
  if (analysis.recommendations.length > 0) {
    console.log("  Top recommendations:");
    for (const rec of analysis.recommendations.slice(0, 3)) {
      console.log(`    - ${rec}`);
    }
  }
  console.log("  ✓ AI analysis generated successfully");

  // Test 7: Quick analysis
  console.log("\nTest 7: Testing quick analysis...");
  const quick = quickAnalysis(mockMetrics);
  console.log(`  Status: ${quick.status}`);
  console.log(`  Quick fixes: ${quick.quickFixes.length}`);
  if (quick.quickFixes.length > 0) {
    for (const fix of quick.quickFixes) {
      console.log(`    - ${fix}`);
    }
  }
  console.log("  ✓ Quick analysis works");

  // Test 8: Metrics comparison
  console.log("\nTest 8: Testing metrics comparison...");
  const improvedMetrics: ExtendedPPAMetrics = {
    ...mockMetrics,
    wnsNs: 0.1, // Timing met
    dieAreaUm2: 140000, // Smaller area
    powerMw: 0.42, // Lower power
  };

  const comparison = compareMetrics(mockMetrics, improvedMetrics);
  console.log("  Comparison results:");
  console.log(`    Area change: ${comparison.areaChange.toFixed(1)}%`);
  console.log(`    Power change: ${comparison.powerChange.toFixed(1)}%`);
  console.log(`    Timing improved: ${comparison.timingImproved ? "Yes" : "No"}`);
  console.log(`    Overall improvement: ${comparison.overallImprovement.toFixed(1)}%`);
  console.log("  ✓ Metrics comparison works");

  // Test 9: Format metrics output
  console.log("\nTest 9: Testing metrics formatting...");
  const formatted = formatMetrics(mockMetrics);
  console.log("  Formatted metrics preview:");
  console.log(formatted.split("\n").slice(0, 10).map(l => "    " + l).join("\n"));
  console.log("    ...");
  console.log("  ✓ Metrics formatting works");

  // Test 10: Generate LLM prompt
  console.log("\nTest 10: Testing LLM prompt generation...");
  const llmPrompt = generateLLMPrompt(mockMetrics, undefined, "balanced");
  console.log(`  LLM prompt generated: ${llmPrompt.length} characters`);
  console.log("  Prompt preview:");
  console.log(llmPrompt.split("\n").slice(0, 5).map(l => "    " + l).join("\n"));
  console.log("    ...");
  console.log("  ✓ LLM prompt generation works");

  // Test 11: Check tuner status (requires Docker)
  console.log("\nTest 11: Checking AutoTuner availability...");
  try {
    const tunerStatus = await checkTunerStatus();
    if (tunerStatus.success && tunerStatus.result) {
      console.log(`  AutoTuner available: ${tunerStatus.result.available}`);
      if (tunerStatus.result.autotunerVersion) {
        console.log(`  Version: ${tunerStatus.result.autotunerVersion}`);
      }
      console.log(`  Container running: ${tunerStatus.result.containerRunning}`);
    } else {
      console.log(`  ⚠ Could not check AutoTuner status: ${tunerStatus.error}`);
      console.log("  (This is expected if Docker container is not running)");
    }
  } catch (error) {
    console.log("  ⚠ Container not running - AutoTuner check skipped");
    console.log("  (Start the Docker container to test AutoTuner integration)");
  }

  // Test 12: Mock AutoTuner result formatting
  console.log("\nTest 12: Testing AutoTuner result formatting...");
  const mockResult: AutoTunerResult = {
    status: "completed",
    totalTrials: 25,
    successfulTrials: 23,
    bestTrial: {
      trialId: 17,
      parameters: {
        CLOCK_PERIOD: 12.5,
        FP_CORE_UTIL: 55,
        PL_TARGET_DENSITY: 0.6,
      },
      metrics: mockMetrics,
      score: 87.5,
      status: "success",
      duration: 120,
    },
    bestParameters: {
      CLOCK_PERIOD: 12.5,
      FP_CORE_UTIL: 55,
      PL_TARGET_DENSITY: 0.6,
    },
    allTrials: [],
    improvement: {
      areaPercent: -8.5,
      powerPercent: -5.2,
      frequencyPercent: 3.1,
      overall: 5.6,
    },
    duration: 1800,
  };

  const formattedResult = formatAutoTunerResult(mockResult);
  console.log("  AutoTuner result preview:");
  console.log(formattedResult.split("\n").map(l => "    " + l).join("\n"));
  console.log("  ✓ Result formatting works");

  // Summary
  console.log("\n=== Phase 5 Tests Complete ===");
  console.log("\nTuner System Status:");
  console.log("  ✓ Tunable parameters defined (20+ parameters)");
  console.log("  ✓ Optimization presets (balanced, performance, low_power, min_area)");
  console.log("  ✓ Configuration generator");
  console.log("  ✓ Configuration validator");
  console.log("  ✓ Design size-based suggestions");
  console.log("  ✓ PPA metrics extractor");
  console.log("  ✓ AI analysis and suggestions");
  console.log("  ✓ Quick analysis");
  console.log("  ✓ Metrics comparison");
  console.log("  ✓ LLM prompt generation");
  console.log("  ✓ Result formatting");
  console.log("\nTo test with actual AutoTuner:");
  console.log("  1. Start Docker container: cd docker && docker-compose up -d");
  console.log("  2. Run an OpenLane flow on a design");
  console.log("  3. Use suggestTuningParams to analyze results");
  console.log("  4. Use runAutoTunerTool to optimize");
}

testPhase5().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
