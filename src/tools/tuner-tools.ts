/**
 * MCP Tools for Auto-Tuner Integration
 *
 * Provides tools for:
 * - Analyzing design results and suggesting tuning parameters
 * - Running OpenROAD AutoTuner
 * - Getting tuning results
 */

import {
  // Config generator
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
  validateConfig,
  // Metrics extractor
  type ExtendedPPAMetrics,
  parseOpenLaneMetrics,
  analyzeDesignComplexity,
  formatMetrics,
  findLatestRunDir,
  // AI suggestions
  type AnalysisResult,
  analyzeAndSuggest,
  generateLLMPrompt,
  quickAnalysis,
  // AutoTuner runner
  type AutoTunerResult,
  checkAutoTunerAvailable,
  runAutoTuner,
  stopAutoTuner,
  getAutoTunerStatus,
  formatAutoTunerResult,
  // Parameter mapping for optimized runs
  orfsParamsToLibrelane,
  generateOptimizedLibrelaneConfig,
} from "../tuner/index.js";

import { runOpenlane, type OpenlaneOptions, type OpenlaneResult } from "./openlane.js";
import { projectManager } from "../files/project-manager.js";
import { fileManager } from "../files/file-manager.js";

/**
 * Tool result type
 */
interface ToolResult<T> {
  success: boolean;
  result?: T;
  error?: string;
}

/**
 * Check AutoTuner system status
 */
export async function checkTunerStatus(): Promise<
  ToolResult<{
    available: boolean;
    autotunerVersion?: string;
    containerRunning: boolean;
  }>
> {
  try {
    const available = await checkAutoTunerAvailable();

    return {
      success: true,
      result: {
        available: available.available,
        autotunerVersion: available.version,
        containerRunning: true, // If we got here, container responded
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Analyze a completed OpenLane run and suggest tuning parameters
 */
export async function suggestTuningParams(
  projectDir: string,
  options: {
    goal?: OptimizationGoal;
    runDir?: string;
  } = {}
): Promise<ToolResult<AnalysisResult>> {
  try {
    // Find the run directory
    const runDir = options.runDir || (await findLatestRunDir(projectDir));
    if (!runDir) {
      return {
        success: false,
        error: "No OpenLane run found in project directory",
      };
    }

    // Parse metrics from the run
    const metrics = await parseOpenLaneMetrics(runDir);
    if (!metrics) {
      return {
        success: false,
        error: "Could not parse metrics from run reports",
      };
    }

    // Analyze design complexity
    const complexity = await analyzeDesignComplexity(runDir);

    // Generate AI suggestions
    const analysis = analyzeAndSuggest(metrics, complexity || undefined, options.goal);

    return {
      success: true,
      result: analysis,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get PPA metrics from a completed run
 */
export async function getPPAMetrics(
  projectDir: string,
  runDir?: string
): Promise<ToolResult<ExtendedPPAMetrics>> {
  try {
    const targetRunDir = runDir || (await findLatestRunDir(projectDir));
    if (!targetRunDir) {
      return {
        success: false,
        error: "No OpenLane run found",
      };
    }

    const metrics = await parseOpenLaneMetrics(targetRunDir);
    if (!metrics) {
      return {
        success: false,
        error: "Could not parse metrics from reports",
      };
    }

    return {
      success: true,
      result: metrics,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate AutoTuner configuration with AI-suggested parameter ranges
 *
 * NEW BEHAVIOR: Uses AI to analyze design characteristics and suggest
 * appropriate parameter ranges instead of hardcoded presets.
 *
 * Returns:
 * - config: The AutoTunerConfig object
 * - json: ORFS-compatible JSON config (ready to save to config.json)
 * - command: The full command to run AutoTuner in Docker
 * - usage: Instructions for Claude Desktop/Code on how to use this
 * - aiSuggestion: The AI analysis with reasoning and tips
 */
// Map MCP tool goal names to internal OptimizationGoal names
const GOAL_MAPPING: Record<string, OptimizationGoal> = {
  "timing": "performance",
  "performance": "performance",
  "area": "min_area",
  "min_area": "min_area",
  "power": "low_power",
  "low_power": "low_power",
  "balanced": "balanced",
};

export function generateTunerConfig(options: {
  design: string;
  platform?: string;
  goal?: OptimizationGoal | string;
  iterations?: number;
  algorithm?: "hyperopt" | "ax" | "optuna" | "nevergrad" | "random";
  customParameters?: Record<string, { min: number; max: number; step: number }>;
  customWeights?: { performance: number; power: number; area: number };
  // NEW: Design info for AI analysis
  cellCount?: number;
  targetFrequencyMhz?: number;
  hasMemory?: boolean;
  hasClock?: boolean;
  // NEW: Option to disable AI suggestions and use old presets
  useAISuggestions?: boolean;
}): ToolResult<{
  config: AutoTunerConfig;
  json: string;
  command: string;
  usage: string;
  aiSuggestion?: AISuggestedRanges;
  aiSuggestionFormatted?: string;
}> {
  try {
    const platform = options.platform || "sky130hd";
    const algorithm = options.algorithm || "hyperopt";
    const iterations = options.iterations || 50;
    const useAI = options.useAISuggestions !== false; // Default: use AI

    // Map goal name to internal OptimizationGoal
    const goalInput = options.goal || "balanced";
    const goal: OptimizationGoal = GOAL_MAPPING[goalInput] || "balanced";

    let config: AutoTunerConfig;
    let aiSuggestion: AISuggestedRanges | undefined;

    if (useAI) {
      // NEW: Use AI-suggested ranges based on design info
      const designInfo: DesignInfo = {
        designName: options.design,
        platform,
        cellCount: options.cellCount,
        hasMemory: options.hasMemory,
        hasClock: options.hasClock ?? true, // Default: assume has clock
        targetFrequencyMhz: options.targetFrequencyMhz,
      };

      const result = generateAutoTunerConfigWithAI({
        designInfo,
        goal,
        iterations,
        customParameters: options.customParameters,
        customWeights: options.customWeights,
      });

      config = result.config;
      aiSuggestion = result.aiSuggestion;
    } else {
      // OLD: Use hardcoded presets (for backwards compatibility)
      config = generateAutoTunerConfig({
        design: options.design,
        platform,
        goal,
        iterations,
        customParameters: options.customParameters,
        customWeights: options.customWeights,
      });
    }

    // Add algorithm to config
    config.algorithm = algorithm;

    const validation = validateConfig(config);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid configuration: ${validation.errors.join(", ")}`,
      };
    }

    // Generate ORFS-compatible JSON
    const json = configToJson(config);

    // Generate the command (assumes config is saved to /workspace/projects/<project>/autotuner/config.json)
    const command = generateAutoTunerCommand({
      design: options.design,
      platform,
      configPath: "/workspace/projects/<project_id>/autotuner/config.json",
      samples: iterations,
      algorithm,
      jobs: config.parallelTrials,
    });

    const usage = `## AutoTuner Usage

1. Save the JSON config to: /workspace/projects/<project_id>/autotuner/config.json
2. Run the command in the Docker container:
   ${command}

### AI-Suggested Parameter Ranges
${useAI && aiSuggestion ? `
The parameter ranges were suggested by MCP4EDA AI based on:
- Design name: ${options.design}
- Platform: ${platform}
- Cell count: ${options.cellCount || "estimated"}
- Optimization goal: ${goal}

Confidence: ${aiSuggestion.confidence.toUpperCase()}
` : "Using default preset ranges (AI suggestions disabled)"}

### ORFS AutoTuner JSON Format:
- Parameters use format: {"_PARAM_NAME": {"type": "float|int", "minmax": [min, max], "step": 0}}
- Optimization weights: coeff_perform, coeff_power, coeff_area (sum to 1.0)

### Available Algorithms:
- hyperopt: Bayesian optimization (default, good balance)
- ax: Facebook's Ax platform (advanced Bayesian)
- optuna: Efficient sampling with pruning
- nevergrad: Gradient-free optimization
- random: Random search (baseline)

### What AutoTuner Returns:
- Best parameter configuration found
- PPA metrics for each trial
- Optimization history/convergence
`;

    return {
      success: true,
      result: {
        config,
        json,
        command,
        usage,
        aiSuggestion,
        aiSuggestionFormatted: aiSuggestion ? formatAISuggestion(aiSuggestion) : undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Run AutoTuner on a project
 *
 * This tool runs the ORFS AutoTuner to optimize design parameters.
 * Sets up the proper ORFS Makefile-based flow structure and executes AutoTuner.
 * Returns the best parameters found and improvement metrics.
 */
export async function runAutoTunerTool(options: {
  projectDir: string;
  designName: string;
  platform?: string;
  goal?: OptimizationGoal;
  iterations?: number;
  algorithm?: "hyperopt" | "ax" | "optuna" | "nevergrad" | "random";
  timeout?: number;
  // Design info (required for ORFS setup)
  verilogCode?: string;
  clockPort?: string;
  clockPeriod?: number;
  onProgress?: (progress: {
    currentTrial: number;
    totalTrials: number;
    bestScore: number;
    currentStatus: string;
  }) => void;
}): Promise<ToolResult<AutoTunerResult & { configUsed: string; commandUsed: string }>> {
  try {
    // Check if AutoTuner is available
    const status = await checkAutoTunerAvailable();
    if (!status.available) {
      return {
        success: false,
        error: `AutoTuner not available: ${status.error}. Run 'docker-compose build' to rebuild with AutoTuner.`,
      };
    }

    // Try to read Verilog from project if not provided
    let verilogCode = options.verilogCode;
    if (!verilogCode) {
      // Try to read from project directory
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      const { execSync } = await import("child_process");

      try {
        // Convert host path to container path
        // Host: C:\Users\...\MCP4EDA\projects\proj_xxx or /path/to/MCP4EDA/projects/proj_xxx
        // Container: /workspace/projects/proj_xxx
        const hostPath = options.projectDir.replace(/\\/g, "/");
        const projectIdMatch = hostPath.match(/projects[\/\\]?(proj_[^\/\\]+)/);
        const projectId = projectIdMatch ? projectIdMatch[1] : hostPath.split("/").pop();
        const containerPath = `/workspace/projects/${projectId}`;

        const verilogPath = `${containerPath}/src/${options.designName}.v`;
        const result = execSync(
          `docker exec mcp4eda bash -c "cat ${verilogPath} 2>/dev/null || cat ${containerPath}/${options.designName}.v 2>/dev/null"`,
          { encoding: "utf-8", timeout: 5000 }
        );
        verilogCode = result.trim();
      } catch {
        return {
          success: false,
          error: "Verilog code required but not found in project. Provide verilog_code parameter or ensure ${designName}.v exists in project.",
        };
      }
    }

    if (!verilogCode) {
      return {
        success: false,
        error: "Verilog code is required for ORFS AutoTuner setup.",
      };
    }

    // Generate config
    const configResult = generateTunerConfig({
      design: options.designName,
      platform: options.platform,
      goal: options.goal,
      iterations: options.iterations,
      algorithm: options.algorithm,
    });

    if (!configResult.success || !configResult.result) {
      return {
        success: false,
        error: configResult.error || "Failed to generate config",
      };
    }

    // Run AutoTuner with ORFS flow setup
    const result = await runAutoTuner(
      {
        projectDir: options.projectDir,
        designName: options.designName,
        platform: options.platform || "sky130hd",
        verilogCode,
        clockPort: options.clockPort || "clk",
        clockPeriod: options.clockPeriod || 10.0,
        config: configResult.result.config,
        timeout: options.timeout || 60,
      },
      options.onProgress
    );

    return {
      success: result.status === "completed",
      result: {
        ...result,
        configUsed: configResult.result.json,
        commandUsed: configResult.result.command,
      },
      error: result.status === "failed" ? result.errorMessage : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Stop a running AutoTuner process
 */
export async function stopAutoTunerTool(): Promise<ToolResult<boolean>> {
  try {
    const stopped = await stopAutoTuner();
    return {
      success: stopped,
      result: stopped,
      error: stopped ? undefined : "Failed to stop AutoTuner",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get tuning results from a completed run
 */
export async function getTuningResults(
  projectDir: string
): Promise<ToolResult<AutoTunerResult>> {
  try {
    const status = await getAutoTunerStatus(projectDir);

    if (status.running) {
      return {
        success: false,
        error: "AutoTuner is still running",
      };
    }

    // Read results file
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");

    const resultsPath = join(projectDir, "autotuner", "results", "results.json");
    const content = await readFile(resultsPath, "utf-8");
    const results = JSON.parse(content) as AutoTunerResult;

    return {
      success: true,
      result: results,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Results not found",
    };
  }
}

/**
 * List available tunable parameters
 */
export function listTunableParameters(): ToolResult<{
  parameters: typeof TUNABLE_PARAMETERS;
  presets: typeof OPTIMIZATION_PRESETS;
}> {
  return {
    success: true,
    result: {
      parameters: TUNABLE_PARAMETERS,
      presets: OPTIMIZATION_PRESETS,
    },
  };
}

/**
 * Quick analysis for simple parameter suggestions
 */
export async function quickTuningAnalysis(
  projectDir: string
): Promise<
  ToolResult<{
    status: "good" | "needs_tuning" | "needs_major_changes";
    quickFixes: string[];
    metrics?: ExtendedPPAMetrics;
  }>
> {
  try {
    const runDir = await findLatestRunDir(projectDir);
    if (!runDir) {
      return {
        success: false,
        error: "No OpenLane run found",
      };
    }

    const metrics = await parseOpenLaneMetrics(runDir);
    if (!metrics) {
      return {
        success: false,
        error: "Could not parse metrics",
      };
    }

    const analysis = quickAnalysis(metrics);

    return {
      success: true,
      result: {
        ...analysis,
        metrics,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate a prompt for external LLM analysis
 */
export async function generateExternalLLMPrompt(
  projectDir: string,
  goal?: OptimizationGoal
): Promise<ToolResult<string>> {
  try {
    const runDir = await findLatestRunDir(projectDir);
    if (!runDir) {
      return {
        success: false,
        error: "No OpenLane run found",
      };
    }

    const metrics = await parseOpenLaneMetrics(runDir);
    if (!metrics) {
      return {
        success: false,
        error: "Could not parse metrics",
      };
    }

    const complexity = await analyzeDesignComplexity(runDir);
    const prompt = generateLLMPrompt(metrics, complexity || undefined, goal);

    return {
      success: true,
      result: prompt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Format metrics for display
 */
export function formatPPAMetrics(metrics: ExtendedPPAMetrics): string {
  return formatMetrics(metrics);
}

/**
 * Format AutoTuner results for display
 */
export function formatTunerResults(result: AutoTunerResult): string {
  return formatAutoTunerResult(result);
}

/**
 * Run LibreLane with optimized parameters from AutoTuner
 *
 * This tool automatically applies the best parameters found by AutoTuner
 * and re-runs the LibreLane flow with the optimized configuration.
 *
 * Flow:
 * 1. Read existing config.json from project
 * 2. Convert best ORFS parameters to LibreLane format
 * 3. Merge optimized params with existing config
 * 4. Save new optimized config.json
 * 5. Run LibreLane with optimized config
 *
 * @param options.projectId - Existing project ID with previous LibreLane run
 * @param options.bestParameters - Best parameters from AutoTuner (ORFS format)
 *                                  OR provide autoTunerResult to extract bestParameters
 * @param options.autoTunerResult - Full AutoTuner result (alternative to bestParameters)
 * @param options.saveOriginalConfig - Save backup of original config (default: true)
 */
export async function runOptimizedOpenlaneTool(options: {
  projectId: string;
  bestParameters?: Record<string, number>;  // ORFS format params from AutoTuner
  autoTunerResult?: AutoTunerResult;         // OR full result to extract params from
  saveOriginalConfig?: boolean;
}): Promise<
  ToolResult<{
    originalConfig: Record<string, unknown>;
    optimizedConfig: Record<string, unknown>;
    parametersApplied: Record<string, unknown>;
    openlaneResult: OpenlaneResult;
  }>
> {
  try {
    const { projectId, saveOriginalConfig = true } = options;

    // Get best parameters from either direct input or AutoTuner result
    let bestParams = options.bestParameters;
    if (!bestParams && options.autoTunerResult?.bestParameters) {
      bestParams = options.autoTunerResult.bestParameters;
    }

    if (!bestParams || Object.keys(bestParams).length === 0) {
      return {
        success: false,
        error: "No best parameters provided. Either provide 'bestParameters' (ORFS format) or 'autoTunerResult' with bestParameters.",
      };
    }

    // Get project
    const project = projectManager.getProject(projectId);
    if (!project) {
      return {
        success: false,
        error: `Project ${projectId} not found`,
      };
    }

    const paths = projectManager.getProjectPaths(projectId);

    // Read existing config.json
    let originalConfig: Record<string, unknown>;
    try {
      const configContent = fileManager.readFile(projectId, "config.json");
      if (!configContent) {
        return {
          success: false,
          error: "No existing config.json found in project. Run initial OpenLane flow first.",
        };
      }
      originalConfig = JSON.parse(configContent);
    } catch (e) {
      return {
        success: false,
        error: `Failed to read config.json: ${e instanceof Error ? e.message : "unknown error"}`,
      };
    }

    // Save backup of original config if requested
    if (saveOriginalConfig) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      fileManager.writeFile(
        projectId,
        `config.original.${timestamp}.json`,
        JSON.stringify(originalConfig, null, 2),
        "config"
      );
    }

    // Convert ORFS params to LibreLane format and merge
    const librelaneParams = orfsParamsToLibrelane(bestParams);
    const optimizedConfig = generateOptimizedLibrelaneConfig(originalConfig, bestParams);

    // Save optimized config
    fileManager.writeFile(
      projectId,
      "config.json",
      JSON.stringify(optimizedConfig, null, 2),
      "config"
    );

    console.error(`Applied ${Object.keys(librelaneParams).length} optimized parameters to config.json`);
    console.error("Optimized parameters:", JSON.stringify(librelaneParams, null, 2));

    // Extract design info from original config
    const designName = (originalConfig.DESIGN_NAME as string) || project.designName || project.topModule || "design";
    const clockPort = (originalConfig.CLOCK_PORT as string) || "clk";
    const clockPeriod = (originalConfig.CLOCK_PERIOD as number) || 10.0;
    const pdk = (originalConfig.PDK as string) || "sky130A";

    // Run LibreLane with the optimized config
    // Use the project's existing Verilog files
    const openlaneResult = await runOpenlane({
      projectId,
      designName,
      clockPort,
      clockPeriod,
      pdk: pdk as OpenlaneOptions["pdk"],
      // userConfig will be merged, but config.json already contains optimized values
    });

    return {
      success: openlaneResult.success,
      result: {
        originalConfig,
        optimizedConfig,
        parametersApplied: librelaneParams,
        openlaneResult,
      },
      error: openlaneResult.success ? undefined : openlaneResult.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Format optimized run result for display
 */
export function formatOptimizedRunResult(
  result: Awaited<ReturnType<typeof runOptimizedOpenlaneTool>>
): string {
  if (!result.success || !result.result) {
    return JSON.stringify({ success: false, error: result.error }, null, 2);
  }

  const { originalConfig, optimizedConfig, parametersApplied, openlaneResult } = result.result;

  // Calculate improvements
  const improvements: Record<string, string> = {};
  const origMetrics = openlaneResult.ppaMetrics;

  return JSON.stringify({
    success: true,
    parameters_applied: parametersApplied,
    original_config_backup: "Saved to config.original.<timestamp>.json",
    optimized_config_summary: {
      DESIGN_NAME: optimizedConfig.DESIGN_NAME,
      FP_CORE_UTIL: optimizedConfig.FP_CORE_UTIL,
      PL_TARGET_DENSITY_PCT: optimizedConfig.PL_TARGET_DENSITY_PCT,
      CLOCK_PERIOD: optimizedConfig.CLOCK_PERIOD,
    },
    openlane_result: {
      success: openlaneResult.success,
      project_id: openlaneResult.projectId,
      run_id: openlaneResult.runId,
      gds_file: openlaneResult.gdsFile,
      signoff_status: openlaneResult.signoffStatus,
      ppa_metrics: {
        area_um2: origMetrics?.areaUm2,
        power_mw: origMetrics?.totalPowerMw,
        frequency_mhz: origMetrics?.frequencyMhz,
        setup_wns: origMetrics?.setupWns,
        hold_wns: origMetrics?.holdWns,
      },
    },
    note: openlaneResult.success
      ? "LibreLane completed with optimized parameters. Compare metrics with initial run to measure improvement."
      : `LibreLane failed: ${openlaneResult.error}`,
  }, null, 2);
}
