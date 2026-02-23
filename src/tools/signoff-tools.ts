/**
 * MCP Tools for Signoff & Tapeout - Phase 6
 *
 * Tools for running signoff checks, ECO optimization, and tapeout readiness
 */

import { z } from "zod";
import {
  runDRCCheck,
  runLVSCheck,
  runAntennaCheck,
  runIRDropAnalysis,
  runTimingSignoff,
  runAllSignoffChecks,
  generateSignoffReport,
  quickDRCCheck,
  quickTimingCheck,
  analyzeTimingViolations,
  generateECORecommendations,
  runRepairDesign,
  runRepairTiming,
  runIterativeECO,
  quickTimingFix,
  estimateTimingClosureEffort,
  formatECOResult,
  runTapeoutChecklist,
  formatChecklistMarkdown,
  quickReadinessCheck,
  getAllAlgorithms,
  OPTIMIZATION_PRESETS,
  AUTOTUNER_SEARCH_ALGORITHMS,
  recommendSearchAlgorithm,
  type SignoffConfig,
  type ECOConfig,
  type ChecklistConfig,
} from "../signoff/index.js";
import { join } from "path";

/**
 * Tool definitions for MCP server registration
 */
export const signoffToolDefinitions = [
  {
    name: "run_signoff_checks",
    description:
      "Run comprehensive signoff checks including DRC, LVS, Antenna, IR Drop, and Timing analysis. Returns pass/fail status for each check.",
    inputSchema: z.object({
      runDir: z.string().describe("Path to the OpenLane/OpenROAD run directory"),
      gdsFile: z.string().describe("GDS file name (relative to runDir)"),
      netlistFile: z.string().describe("Netlist file name for LVS"),
      platform: z.string().describe("Platform/PDK name (e.g., sky130hd)"),
      checks: z
        .object({
          drc: z.boolean().default(true),
          lvs: z.boolean().default(true),
          antenna: z.boolean().default(true),
          irDrop: z.boolean().default(true),
          timing: z.boolean().default(true),
        })
        .optional()
        .describe("Which checks to run"),
      limits: z
        .object({
          maxIRDropMv: z.number().optional(),
          minSlackNs: z.number().optional(),
          maxDRCViolations: z.number().optional(),
        })
        .optional()
        .describe("Limits for pass/fail determination"),
    }),
  },
  {
    name: "run_drc_check",
    description: "Run DRC (Design Rule Check) using Magic. Returns violations categorized by rule type.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      gdsFile: z.string().describe("GDS file name"),
      platform: z.string().describe("Platform name"),
    }),
  },
  {
    name: "run_lvs_check",
    description: "Run LVS (Layout vs Schematic) check using Netgen. Compares extracted layout netlist against synthesized netlist.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      gdsFile: z.string().describe("GDS file name"),
      netlistFile: z.string().describe("Reference netlist file"),
      platform: z.string().describe("Platform name"),
    }),
  },
  {
    name: "run_timing_signoff",
    description: "Run timing signoff analysis using OpenSTA. Reports WNS, TNS, and violation counts.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      platform: z.string().describe("Platform name"),
    }),
  },
  {
    name: "run_ir_drop_analysis",
    description: "Run IR drop analysis using PDNSim. Reports worst-case voltage drop and hotspots.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      platform: z.string().describe("Platform name"),
      maxIRDropMv: z.number().default(50).describe("Maximum allowed IR drop in mV"),
    }),
  },
  {
    name: "run_eco_optimization",
    description:
      "Run iterative ECO (Engineering Change Order) optimization to fix timing violations. Uses buffer insertion, gate sizing, and VT swap.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      platform: z.string().describe("Platform name"),
      maxIterations: z.number().default(10).describe("Maximum optimization iterations"),
      setupMargin: z.number().default(0.1).describe("Setup timing margin in ns"),
      holdMargin: z.number().default(0.05).describe("Hold timing margin in ns"),
      maxUtilization: z.number().default(90).describe("Max cell utilization %"),
      enableBufferInsertion: z.boolean().default(true),
      enableGateSizing: z.boolean().default(true),
      enableVTSwap: z.boolean().default(true),
      enablePinSwap: z.boolean().default(true),
      targetWNS: z.number().default(0).describe("Target WNS to achieve"),
      stopOnConvergence: z.boolean().default(true),
    }),
  },
  {
    name: "quick_timing_fix",
    description: "Perform a single-iteration timing fix. Quick way to improve timing without full ECO loop.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      platform: z.string().describe("Platform name"),
      fixSetup: z.boolean().default(true).describe("Fix setup violations"),
      fixHold: z.boolean().default(true).describe("Fix hold violations"),
      margin: z.number().default(0.1).describe("Timing margin in ns"),
    }),
  },
  {
    name: "analyze_timing_violations",
    description: "Analyze current timing violations and get detailed path information for setup and hold failures.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      platform: z.string().describe("Platform name"),
    }),
  },
  {
    name: "get_eco_recommendations",
    description: "Get ECO fix recommendations for timing violations without applying them. Useful for reviewing before committing changes.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      platform: z.string().describe("Platform name"),
      enableBufferInsertion: z.boolean().default(true),
      enableGateSizing: z.boolean().default(true),
      enableVTSwap: z.boolean().default(true),
      enablePinSwap: z.boolean().default(true),
    }),
  },
  {
    name: "estimate_timing_closure",
    description: "Estimate the difficulty and effort required for timing closure based on current WNS/TNS.",
    inputSchema: z.object({
      wns: z.number().describe("Worst Negative Slack in ns"),
      tns: z.number().describe("Total Negative Slack in ns"),
      cellCount: z.number().describe("Number of cells in design"),
    }),
  },
  {
    name: "run_tapeout_checklist",
    description:
      "Run comprehensive tapeout checklist with GDS readiness scoring. Checks all requirements for foundry submission.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      platform: z.string().describe("Platform name"),
      design: z.string().describe("Design name"),
      requirements: z
        .object({
          minDensity: z.number().optional(),
          maxDensity: z.number().optional(),
          targetFrequency: z.number().optional(),
          maxPower: z.number().optional(),
          maxArea: z.number().optional(),
        })
        .optional()
        .describe("Design requirements for validation"),
    }),
  },
  {
    name: "quick_readiness_check",
    description: "Quick check if design is ready for tapeout. Checks critical files only for fast feedback.",
    inputSchema: z.object({
      runDir: z.string().describe("Run directory path"),
      design: z.string().describe("Design name"),
    }),
  },
  {
    name: "get_algorithm_info",
    description:
      "Get information about available OpenROAD algorithms for synthesis, placement, routing, etc. Useful for understanding optimization options.",
    inputSchema: z.object({
      category: z
        .enum([
          "all",
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
        ])
        .describe("Algorithm category to retrieve"),
    }),
  },
  {
    name: "get_optimization_preset",
    description: "Get predefined optimization preset for common goals like timing closure, low power, or minimum area.",
    inputSchema: z.object({
      preset: z
        .enum(["TIMING_CLOSURE", "LOW_POWER", "MIN_AREA", "DRC_CLEAN", "SIGNOFF_READY"])
        .describe("Optimization preset name"),
    }),
  },
  {
    name: "recommend_search_algorithm",
    description: "Get AutoTuner search algorithm recommendation based on your parameter space and resources.",
    inputSchema: z.object({
      numParameters: z.number().describe("Number of parameters to tune"),
      numTrials: z.number().describe("Number of trials/iterations to run"),
      parallelWorkers: z.number().describe("Number of parallel workers available"),
      parameterTypes: z
        .array(z.enum(["continuous", "discrete", "categorical"]))
        .describe("Types of parameters being tuned"),
    }),
  },
];

/**
 * Tool handlers
 */
export const signoffToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  run_signoff_checks: async (args) => {
    const config: SignoffConfig = {
      runDir: args.runDir as string,
      gdsFile: args.gdsFile as string,
      netlistFile: args.netlistFile as string,
      platform: args.platform as string,
      checks: (args.checks as SignoffConfig["checks"]) || {
        drc: true,
        lvs: true,
        antenna: true,
        irDrop: true,
        timing: true,
      },
      limits: (args.limits as SignoffConfig["limits"]) || {},
    };

    const report = await runAllSignoffChecks(config);

    // Generate report file
    const reportPath = join(config.runDir, "reports", "signoff", "signoff_report.md");
    await generateSignoffReport(report, reportPath);

    return {
      success: report.overallStatus !== "fail",
      overallStatus: report.overallStatus,
      tapeoutReady: report.tapeoutReady,
      checks: report.checks.map((c) => ({
        name: c.check,
        status: c.status,
        violations: c.violations,
        details: c.details,
      })),
      blockers: report.blockers,
      warnings: report.warnings,
      reportPath,
    };
  },

  run_drc_check: async (args) => {
    const result = await quickDRCCheck(
      args.runDir as string,
      args.gdsFile as string,
      args.platform as string
    );
    return result;
  },

  run_lvs_check: async (args) => {
    const config: SignoffConfig = {
      runDir: args.runDir as string,
      gdsFile: args.gdsFile as string,
      netlistFile: args.netlistFile as string,
      platform: args.platform as string,
      checks: { drc: false, lvs: true, antenna: false, irDrop: false, timing: false },
      limits: {},
    };
    const result = await runLVSCheck(config);
    return {
      pass: result.status === "pass",
      violations: result.violations,
      details: result.details,
      duration: result.duration,
    };
  },

  run_timing_signoff: async (args) => {
    const result = await quickTimingCheck(args.runDir as string, args.platform as string);
    return result;
  },

  run_ir_drop_analysis: async (args) => {
    const config: SignoffConfig = {
      runDir: args.runDir as string,
      gdsFile: "",
      netlistFile: "",
      platform: args.platform as string,
      checks: { drc: false, lvs: false, antenna: false, irDrop: true, timing: false },
      limits: { maxIRDropMv: args.maxIRDropMv as number },
    };
    const result = await runIRDropAnalysis(config);
    return {
      pass: result.status === "pass",
      violations: result.violations,
      details: result.details,
      duration: result.duration,
    };
  },

  run_eco_optimization: async (args) => {
    const config: ECOConfig = {
      runDir: args.runDir as string,
      platform: args.platform as string,
      maxIterations: args.maxIterations as number,
      setupMargin: args.setupMargin as number,
      holdMargin: args.holdMargin as number,
      maxUtilization: args.maxUtilization as number,
      enableBufferInsertion: args.enableBufferInsertion as boolean,
      enableGateSizing: args.enableGateSizing as boolean,
      enableVTSwap: args.enableVTSwap as boolean,
      enablePinSwap: args.enablePinSwap as boolean,
      targetWNS: args.targetWNS as number,
      stopOnConvergence: args.stopOnConvergence as boolean,
    };

    const result = await runIterativeECO(config);

    return {
      success: result.success,
      timingMet: result.timingMet,
      iterations: result.iterations.length,
      initialWNS: result.initialWNS,
      finalWNS: result.finalWNS,
      initialTNS: result.initialTNS,
      finalTNS: result.finalTNS,
      totalFixesApplied: result.totalFixesApplied,
      duration: result.duration,
      recommendations: result.recommendations.slice(0, 10),
      summary: formatECOResult(result),
    };
  },

  quick_timing_fix: async (args) => {
    const result = await quickTimingFix(args.runDir as string, args.platform as string, {
      fixSetup: args.fixSetup as boolean,
      fixHold: args.fixHold as boolean,
      margin: args.margin as number,
    });
    return result;
  },

  analyze_timing_violations: async (args) => {
    const config: ECOConfig = {
      runDir: args.runDir as string,
      platform: args.platform as string,
      maxIterations: 1,
      setupMargin: 0,
      holdMargin: 0,
      maxUtilization: 100,
      enableBufferInsertion: false,
      enableGateSizing: false,
      enableVTSwap: false,
      enablePinSwap: false,
      targetWNS: 0,
      stopOnConvergence: false,
    };

    const violations = await analyzeTimingViolations(config);

    return {
      totalViolations: violations.length,
      setupViolations: violations.filter((v) => v.type === "setup").length,
      holdViolations: violations.filter((v) => v.type === "hold").length,
      violations: violations.map((v) => ({
        type: v.type,
        slack: v.slack,
        path: v.path,
        startpoint: v.startpoint,
        endpoint: v.endpoint,
      })),
    };
  },

  get_eco_recommendations: async (args) => {
    const config: ECOConfig = {
      runDir: args.runDir as string,
      platform: args.platform as string,
      maxIterations: 1,
      setupMargin: 0.1,
      holdMargin: 0.05,
      maxUtilization: 90,
      enableBufferInsertion: args.enableBufferInsertion as boolean,
      enableGateSizing: args.enableGateSizing as boolean,
      enableVTSwap: args.enableVTSwap as boolean,
      enablePinSwap: args.enablePinSwap as boolean,
      targetWNS: 0,
      stopOnConvergence: false,
    };

    const violations = await analyzeTimingViolations(config);
    const recommendations = generateECORecommendations(violations, config);

    return {
      totalViolations: violations.length,
      recommendations: recommendations.map((r) => ({
        type: r.type,
        location: r.location,
        priority: r.priority,
        expectedImprovement: r.expectedImprovement,
        command: r.command,
      })),
    };
  },

  estimate_timing_closure: async (args) => {
    const result = estimateTimingClosureEffort(
      args.wns as number,
      args.tns as number,
      args.cellCount as number
    );
    return result;
  },

  run_tapeout_checklist: async (args) => {
    const config: ChecklistConfig = {
      runDir: args.runDir as string,
      platform: args.platform as string,
      design: args.design as string,
      requirements: args.requirements as ChecklistConfig["requirements"],
    };

    const checklist = await runTapeoutChecklist(config);

    return {
      design: checklist.design,
      score: checklist.score.overall,
      grade: checklist.score.grade,
      tapeoutReady: checklist.score.tapeoutReady,
      summary: checklist.summary,
      scoreBreakdown: checklist.score.breakdown,
      blockers: checklist.blockers,
      recommendations: checklist.recommendations,
      foundryReady: checklist.foundryReadiness.gdsReady,
      deliverables: checklist.foundryReadiness.deliverables,
      markdownReport: formatChecklistMarkdown(checklist),
    };
  },

  quick_readiness_check: async (args) => {
    const result = await quickReadinessCheck(args.runDir as string, args.design as string);
    return result;
  },

  get_algorithm_info: async (args) => {
    const category = args.category as string;
    const allAlgorithms = getAllAlgorithms();

    if (category === "all") {
      return allAlgorithms;
    }

    return allAlgorithms[category as keyof typeof allAlgorithms] || null;
  },

  get_optimization_preset: async (args) => {
    const preset = args.preset as keyof typeof OPTIMIZATION_PRESETS;
    return OPTIMIZATION_PRESETS[preset] || null;
  },

  recommend_search_algorithm: async (args) => {
    const recommendation = recommendSearchAlgorithm({
      numParameters: args.numParameters as number,
      numTrials: args.numTrials as number,
      parallelWorkers: args.parallelWorkers as number,
      parameterTypes: args.parameterTypes as ("continuous" | "discrete" | "categorical")[],
    });

    const algorithmInfo =
      AUTOTUNER_SEARCH_ALGORITHMS[
        recommendation.toUpperCase() as keyof typeof AUTOTUNER_SEARCH_ALGORITHMS
      ];

    return {
      recommended: recommendation,
      info: algorithmInfo || null,
      allAlgorithms: Object.keys(AUTOTUNER_SEARCH_ALGORITHMS).map((k) => k.toLowerCase()),
    };
  },
};

/**
 * Register signoff tools with MCP server
 */
export function registerSignoffTools(server: {
  tool: (name: string, schema: z.ZodSchema, handler: (args: unknown) => Promise<unknown>) => void;
}): void {
  for (const def of signoffToolDefinitions) {
    server.tool(def.name, def.inputSchema, async (args) => {
      try {
        const result = await signoffToolHandlers[def.name](args as Record<string, unknown>);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    });
  }
}
