/**
 * AutoTuner Configuration Generator
 *
 * Generates configuration files for OpenROAD AutoTuner based on
 * design analysis and optimization goals.
 *
 * KEY CHANGE: Now uses AI-suggested parameter ranges by default instead of
 * hardcoded presets. The AI analyzes design characteristics (cell count,
 * complexity, goal) to suggest tighter, more appropriate ranges.
 */

/**
 * Design information for AI analysis
 */
export interface DesignInfo {
  designName: string;
  platform: string;
  cellCount?: number;
  hasMemory?: boolean;
  hasClock?: boolean;
  targetFrequencyMhz?: number;
  maxAreaUm2?: number;
  maxPowerMw?: number;
}

/**
 * Tunable parameter definition
 */
export interface TunableParameter {
  name: string;
  min: number;
  max: number;
  step: number;
  type: "int" | "float";
  description: string;
}

/**
 * AutoTuner configuration
 */
export interface AutoTunerConfig {
  // Design parameters
  platform: string;
  design: string;

  // Tunable parameters with ranges
  parameters: Record<
    string,
    {
      min: number;
      max: number;
      step: number;
    }
  >;

  // Optimization weights (must sum to 1.0)
  objectives: {
    performance: number; // Higher clock frequency
    power: number; // Lower power consumption
    area: number; // Smaller die area
  };

  // Tuning settings
  iterations: number;
  parallelTrials: number;
  seed?: number;
  algorithm?: "hyperopt" | "ax" | "optuna" | "nevergrad" | "random";

  // Optional constraints
  constraints?: {
    maxArea?: number;
    maxPower?: number;
    minFrequency?: number;
    maxWns?: number;
  };
}

/**
 * Optimization goal presets
 */
export type OptimizationGoal =
  | "balanced"
  | "performance"
  | "low_power"
  | "min_area";

/**
 * Standard tunable parameters for OpenLane/OpenROAD
 */
export const TUNABLE_PARAMETERS: Record<string, TunableParameter> = {
  // Clock and timing
  CLOCK_PERIOD: {
    name: "CLOCK_PERIOD",
    min: 5.0,
    max: 50.0,
    step: 1.0,
    type: "float",
    description: "Clock period in nanoseconds",
  },

  // Floorplanning
  FP_CORE_UTIL: {
    name: "FP_CORE_UTIL",
    min: 20,
    max: 80,
    step: 5,
    type: "int",
    description: "Core utilization percentage",
  },
  FP_ASPECT_RATIO: {
    name: "FP_ASPECT_RATIO",
    min: 0.5,
    max: 2.0,
    step: 0.25,
    type: "float",
    description: "Aspect ratio (height/width)",
  },
  FP_PDN_VPITCH: {
    name: "FP_PDN_VPITCH",
    min: 50,
    max: 200,
    step: 10,
    type: "int",
    description: "Vertical PDN pitch",
  },
  FP_PDN_HPITCH: {
    name: "FP_PDN_HPITCH",
    min: 50,
    max: 200,
    step: 10,
    type: "int",
    description: "Horizontal PDN pitch",
  },

  // Placement
  PL_TARGET_DENSITY: {
    name: "PL_TARGET_DENSITY",
    min: 0.3,
    max: 0.9,
    step: 0.05,
    type: "float",
    description: "Placement target density",
  },
  PL_TIME_DRIVEN: {
    name: "PL_TIME_DRIVEN",
    min: 0,
    max: 1,
    step: 1,
    type: "int",
    description: "Enable timing-driven placement (0/1)",
  },
  PL_ROUTABILITY_DRIVEN: {
    name: "PL_ROUTABILITY_DRIVEN",
    min: 0,
    max: 1,
    step: 1,
    type: "int",
    description: "Enable routability-driven placement (0/1)",
  },

  // Clock Tree Synthesis
  CTS_CLK_BUFFER_LIST: {
    name: "CTS_CLK_BUFFER_LIST",
    min: 0,
    max: 3,
    step: 1,
    type: "int",
    description: "Clock buffer list index",
  },
  CTS_SINK_CLUSTERING_SIZE: {
    name: "CTS_SINK_CLUSTERING_SIZE",
    min: 10,
    max: 50,
    step: 5,
    type: "int",
    description: "CTS sink clustering size",
  },
  CTS_SINK_CLUSTERING_MAX_DIAMETER: {
    name: "CTS_SINK_CLUSTERING_MAX_DIAMETER",
    min: 30,
    max: 100,
    step: 10,
    type: "int",
    description: "CTS sink clustering max diameter",
  },

  // Global Routing
  GRT_ADJUSTMENT: {
    name: "GRT_ADJUSTMENT",
    min: 0.0,
    max: 0.5,
    step: 0.05,
    type: "float",
    description: "Global routing adjustment factor",
  },
  // NOTE: GRT_OVERFLOW_ITERS is NOT tunable in ORFS AutoTuner
  // [ERROR TUN-0017] Variable GRT_OVERFLOW_ITERS is not tunable

  // Detailed Routing
  DRT_OPT_ITERS: {
    name: "DRT_OPT_ITERS",
    min: 32,
    max: 128,
    step: 16,
    type: "int",
    description: "Detailed routing optimization iterations",
  },

  // Synthesis
  SYNTH_STRATEGY: {
    name: "SYNTH_STRATEGY",
    min: 0,
    max: 3,
    step: 1,
    type: "int",
    description:
      "Synthesis strategy (0=AREA, 1=DELAY, 2=MIXED, 3=AREA_DELAY)",
  },
  SYNTH_SIZING: {
    name: "SYNTH_SIZING",
    min: 0,
    max: 1,
    step: 1,
    type: "int",
    description: "Enable gate sizing (0/1)",
  },
  SYNTH_BUFFERING: {
    name: "SYNTH_BUFFERING",
    min: 0,
    max: 1,
    step: 1,
    type: "int",
    description: "Enable buffering (0/1)",
  },

  // Resizer
  RSZ_DONT_TOUCH_RX: {
    name: "RSZ_DONT_TOUCH_RX",
    min: 0,
    max: 1,
    step: 1,
    type: "int",
    description: "Resizer dont touch regex enabled (0/1)",
  },
  RSZ_LIB_CORNER_MAX: {
    name: "RSZ_LIB_CORNER_MAX",
    min: 0,
    max: 1,
    step: 1,
    type: "int",
    description: "Use max liberty corner for resizing (0/1)",
  },

  // Antenna
  ANT_ITERS: {
    name: "ANT_ITERS",
    min: 1,
    max: 10,
    step: 1,
    type: "int",
    description: "Antenna repair iterations",
  },
};

/**
 * Parameter presets for different optimization goals
 */
export const OPTIMIZATION_PRESETS: Record<
  OptimizationGoal,
  {
    weights: { performance: number; power: number; area: number };
    parameterRanges: Record<string, { min: number; max: number; step: number }>;
  }
> = {
  balanced: {
    weights: { performance: 0.33, power: 0.33, area: 0.34 },
    parameterRanges: {
      CLOCK_PERIOD: { min: 10.0, max: 30.0, step: 2.0 },
      FP_CORE_UTIL: { min: 35, max: 65, step: 5 },
      PL_TARGET_DENSITY: { min: 0.4, max: 0.7, step: 0.05 },
      GRT_ADJUSTMENT: { min: 0.1, max: 0.3, step: 0.05 },
    },
  },
  performance: {
    weights: { performance: 0.6, power: 0.2, area: 0.2 },
    parameterRanges: {
      CLOCK_PERIOD: { min: 5.0, max: 20.0, step: 1.0 },
      FP_CORE_UTIL: { min: 30, max: 55, step: 5 },
      PL_TARGET_DENSITY: { min: 0.35, max: 0.6, step: 0.05 },
      PL_TIME_DRIVEN: { min: 1, max: 1, step: 1 },
      SYNTH_STRATEGY: { min: 1, max: 1, step: 1 }, // DELAY
      GRT_ADJUSTMENT: { min: 0.0, max: 0.2, step: 0.05 },
    },
  },
  low_power: {
    weights: { performance: 0.2, power: 0.6, area: 0.2 },
    parameterRanges: {
      CLOCK_PERIOD: { min: 15.0, max: 40.0, step: 2.0 },
      FP_CORE_UTIL: { min: 40, max: 70, step: 5 },
      PL_TARGET_DENSITY: { min: 0.45, max: 0.75, step: 0.05 },
      SYNTH_STRATEGY: { min: 0, max: 0, step: 1 }, // AREA (lower switching)
      SYNTH_SIZING: { min: 1, max: 1, step: 1 },
    },
  },
  min_area: {
    weights: { performance: 0.2, power: 0.2, area: 0.6 },
    parameterRanges: {
      CLOCK_PERIOD: { min: 20.0, max: 50.0, step: 2.0 },
      FP_CORE_UTIL: { min: 55, max: 80, step: 5 },
      PL_TARGET_DENSITY: { min: 0.6, max: 0.85, step: 0.05 },
      SYNTH_STRATEGY: { min: 0, max: 0, step: 1 }, // AREA
    },
  },
};

/**
 * Generate an AutoTuner configuration file
 */
export function generateAutoTunerConfig(options: {
  platform?: string;
  design: string;
  goal?: OptimizationGoal;
  customParameters?: Record<
    string,
    { min: number; max: number; step: number }
  >;
  customWeights?: { performance: number; power: number; area: number };
  iterations?: number;
  parallelTrials?: number;
  constraints?: AutoTunerConfig["constraints"];
}): AutoTunerConfig {
  const {
    platform = "sky130hd",
    design,
    goal = "balanced",
    customParameters,
    customWeights,
    iterations = 50,
    parallelTrials = 4,
    constraints,
  } = options;

  const preset = OPTIMIZATION_PRESETS[goal];

  // Merge preset parameters with custom overrides
  const parameters = {
    ...preset.parameterRanges,
    ...customParameters,
  };

  // Use custom weights or preset weights
  const objectives = customWeights || preset.weights;

  // Validate weights sum to 1.0
  const weightSum =
    objectives.performance + objectives.power + objectives.area;
  if (Math.abs(weightSum - 1.0) > 0.01) {
    // Normalize weights
    const normalizedObjectives = {
      performance: objectives.performance / weightSum,
      power: objectives.power / weightSum,
      area: objectives.area / weightSum,
    };
    return {
      platform,
      design,
      parameters,
      objectives: normalizedObjectives,
      iterations,
      parallelTrials,
      constraints,
    };
  }

  return {
    platform,
    design,
    parameters,
    objectives,
    iterations,
    parallelTrials,
    constraints,
  };
}

/**
 * ORFS parameter name mapping
 *
 * ORFS AutoTuner has specific naming conventions:
 * - Some parameters need underscore prefix (e.g., _SDC_CLK_PERIOD)
 * - Some parameters don't need prefix (e.g., CORE_UTILIZATION, PLACE_DENSITY_LB_ADDON)
 *
 * This maps our internal names to ORFS AutoTuner names.
 */
const ORFS_PARAMETER_NAMES: Record<string, string> = {
  // Parameters that need underscore prefix (SDC/timing related)
  "CLOCK_PERIOD": "_SDC_CLK_PERIOD",
  "SDC_CLK_PERIOD": "_SDC_CLK_PERIOD",

  // Parameters that don't need prefix (ORFS Makefile variables)
  "CORE_UTILIZATION": "CORE_UTILIZATION",
  "FP_CORE_UTIL": "CORE_UTILIZATION",
  "PLACE_DENSITY_LB_ADDON": "PLACE_DENSITY_LB_ADDON",
  "PL_TARGET_DENSITY": "PLACE_DENSITY_LB_ADDON",
  "CTS_CLUSTER_SIZE": "CTS_CLUSTER_SIZE",
  "CTS_SINK_CLUSTERING_SIZE": "CTS_CLUSTER_SIZE",
  "CTS_CLUSTER_DIAMETER": "CTS_CLUSTER_DIAMETER",
  "CTS_SINK_CLUSTERING_MAX_DIAMETER": "CTS_CLUSTER_DIAMETER",
  "GPL_TIMING_DRIVEN": "GPL_TIMING_DRIVEN",
  "GPL_ROUTABILITY_DRIVEN": "GPL_ROUTABILITY_DRIVEN",
  "GRT_ALLOW_CONGESTION": "GRT_ALLOW_CONGESTION",
  "GRT_OVERFLOW_ITERS": "GRT_OVERFLOW_ITERS",
  "DETAILED_ROUTE_END_ITERATION": "DETAILED_ROUTE_END_ITERATION",

  // Synthesis parameters
  "SYNTH_STRATEGY": "SYNTH_STRATEGY",
  "ABC_AREA": "ABC_AREA",

  // Aspect ratio
  "FP_ASPECT_RATIO": "FP_ASPECT_RATIO",
  "ASPECT_RATIO": "ASPECT_RATIO",
};

/**
 * List of parameters that are NOT tunable in ORFS AutoTuner
 * These will cause [ERROR TUN-0017] if included
 */
const NON_TUNABLE_PARAMETERS = [
  "GRT_OVERFLOW_ITERS",
  "coeff_perform",
  "coeff_power",
  "coeff_area",
];

/**
 * Convert AutoTuner config to JSON format for OpenROAD-flow-scripts AutoTuner
 *
 * ORFS AutoTuner expects format:
 * {
 *   "_SDC_FILE_PATH": "constraint.sdc",  // REQUIRED when using _SDC_CLK_PERIOD
 *   "PARAM_NAME": {"type": "float|int", "minmax": [min, max], "step": 0}
 * }
 *
 * Note: ORFS AutoTuner does NOT accept coeff_perform/coeff_power/coeff_area
 * as tunable parameters. Optimization weights are passed via command line.
 */
export function configToJson(config: AutoTunerConfig, sdcFilePath: string = "constraint.sdc"): string {
  const jsonConfig: Record<string, unknown> = {};

  // Track if we have clock period parameter (requires _SDC_FILE_PATH)
  let hasClockPeriod = false;

  // Parameter ranges in ORFS format
  for (const [name, range] of Object.entries(config.parameters)) {
    // Skip non-tunable parameters
    if (NON_TUNABLE_PARAMETERS.includes(name)) {
      console.warn(`Skipping non-tunable parameter: ${name}`);
      continue;
    }

    const paramDef = TUNABLE_PARAMETERS[name];
    const paramType = paramDef?.type || (Number.isInteger(range.min) && Number.isInteger(range.max) ? "int" : "float");

    // Map parameter name to ORFS format
    const orfsName = ORFS_PARAMETER_NAMES[name] || name;

    // Skip if the mapped name is non-tunable
    if (NON_TUNABLE_PARAMETERS.includes(orfsName)) {
      console.warn(`Skipping non-tunable parameter: ${orfsName}`);
      continue;
    }

    // Check if this is a clock period parameter
    if (orfsName === "_SDC_CLK_PERIOD") {
      hasClockPeriod = true;
    }

    jsonConfig[orfsName] = {
      type: paramType,
      minmax: [range.min, range.max],
      step: range.step > 0 ? range.step : 0  // ORFS uses step=0 for continuous
    };
  }

  // IMPORTANT: If _SDC_CLK_PERIOD is used, we MUST provide _SDC_FILE_PATH
  // Otherwise ORFS AutoTuner will fail with:
  // [ERROR TUN-0020] No SDC reference file provided.
  if (hasClockPeriod) {
    // Add _SDC_FILE_PATH at the beginning of the config
    const configWithSdc: Record<string, unknown> = {
      "_SDC_FILE_PATH": sdcFilePath,
      ...jsonConfig
    };
    return JSON.stringify(configWithSdc, null, 2);
  }

  return JSON.stringify(jsonConfig, null, 2);
}

/**
 * Generate full ORFS AutoTuner command with all options
 */
export function generateAutoTunerCommand(options: {
  design: string;
  platform: string;
  configPath: string;
  samples?: number;
  algorithm?: "hyperopt" | "ax" | "optuna" | "nevergrad" | "random";
  jobs?: number;
}): string {
  const {
    design,
    platform,
    configPath,
    samples = 50,
    algorithm = "hyperopt",
    jobs = 4
  } = options;

  // ORFS AutoTuner command format
  return `openroad_autotuner --design ${design} --platform ${platform} --config ${configPath} tune --samples ${samples} --algorithm ${algorithm} --jobs ${jobs}`;
}

/**
 * Generate a Ray Tune compatible config (for more advanced tuning)
 */
export function generateRayTuneConfig(config: AutoTunerConfig): string {
  const paramSpace: Record<string, unknown> = {};

  for (const [name, range] of Object.entries(config.parameters)) {
    const paramDef = TUNABLE_PARAMETERS[name];
    if (paramDef?.type === "int") {
      paramSpace[name] = {
        type: "randint",
        min: range.min,
        max: range.max + 1,
      };
    } else {
      paramSpace[name] = {
        type: "uniform",
        min: range.min,
        max: range.max,
      };
    }
  }

  const rayConfig = {
    param_space: paramSpace,
    num_samples: config.iterations,
    max_concurrent_trials: config.parallelTrials,
    objectives: ["metric_performance", "metric_power", "metric_area"],
    objective_weights: [
      config.objectives.performance,
      -config.objectives.power, // Minimize power
      -config.objectives.area, // Minimize area
    ],
  };

  return JSON.stringify(rayConfig, null, 2);
}

/**
 * Get suggested parameters for a design based on cell count
 */
export function suggestParametersForDesignSize(
  cellCount: number,
  goal: OptimizationGoal = "balanced"
): Record<string, { min: number; max: number; step: number }> {
  const base = OPTIMIZATION_PRESETS[goal].parameterRanges;
  const params = { ...base };

  // Adjust based on design size
  if (cellCount < 1000) {
    // Small design - can push utilization higher
    params.FP_CORE_UTIL = { min: 50, max: 80, step: 5 };
    params.PL_TARGET_DENSITY = { min: 0.55, max: 0.85, step: 0.05 };
  } else if (cellCount < 10000) {
    // Medium design - standard ranges
    params.FP_CORE_UTIL = { min: 40, max: 70, step: 5 };
    params.PL_TARGET_DENSITY = { min: 0.45, max: 0.75, step: 0.05 };
  } else if (cellCount < 100000) {
    // Large design - need more routing resources
    params.FP_CORE_UTIL = { min: 30, max: 60, step: 5 };
    params.PL_TARGET_DENSITY = { min: 0.35, max: 0.65, step: 0.05 };
    params.GRT_ADJUSTMENT = { min: 0.15, max: 0.35, step: 0.05 };
  } else {
    // Very large design - conservative settings
    params.FP_CORE_UTIL = { min: 25, max: 50, step: 5 };
    params.PL_TARGET_DENSITY = { min: 0.3, max: 0.55, step: 0.05 };
    params.GRT_ADJUSTMENT = { min: 0.2, max: 0.4, step: 0.05 };
  }

  return params;
}

/**
 * Validate an AutoTuner configuration
 */
export function validateConfig(
  config: AutoTunerConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check design name
  if (!config.design || config.design.trim() === "") {
    errors.push("Design name is required");
  }

  // Check platform
  const validPlatforms = [
    "sky130hd",
    "sky130hs",
    "asap7",
    "gf180",
    "ihp130",
  ];
  if (!validPlatforms.includes(config.platform)) {
    errors.push(
      `Invalid platform: ${config.platform}. Valid options: ${validPlatforms.join(", ")}`
    );
  }

  // Check objectives sum to 1.0
  const weightSum =
    config.objectives.performance +
    config.objectives.power +
    config.objectives.area;
  if (Math.abs(weightSum - 1.0) > 0.01) {
    errors.push(`Objective weights must sum to 1.0, got ${weightSum}`);
  }

  // Check parameter ranges
  for (const [name, range] of Object.entries(config.parameters)) {
    // Allow min=max for fixed-value parameters (e.g., PL_TIME_DRIVEN=1)
    if (range.min > range.max) {
      errors.push(`Parameter ${name}: min must be less than or equal to max`);
    }
    if (range.step <= 0) {
      errors.push(`Parameter ${name}: step must be positive`);
    }
    // Only check step size for tunable parameters (min != max)
    if (range.min !== range.max && (range.max - range.min) < range.step) {
      errors.push(`Parameter ${name}: range too small for step size`);
    }
  }

  // Check iterations
  if (config.iterations < 1 || config.iterations > 1000) {
    errors.push("Iterations must be between 1 and 1000");
  }

  // Check parallel trials
  if (config.parallelTrials < 1 || config.parallelTrials > 32) {
    errors.push("Parallel trials must be between 1 and 32");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// AI-SUGGESTED PARAMETER RANGES
// ============================================================================

/**
 * Result from AI parameter suggestion
 */
export interface AISuggestedRanges {
  parameters: Record<string, { min: number; max: number; step: number }>;
  reasoning: string;
  warnings: string[];
  tips: string[];
  confidence: "low" | "medium" | "high";
}

/**
 * Generate AI-suggested parameter ranges based on design characteristics
 *
 * This is the NEW default behavior - instead of using hardcoded OPTIMIZATION_PRESETS,
 * we analyze the design info to suggest tighter, more appropriate ranges.
 *
 * @param designInfo - Information about the design
 * @param goal - Optimization goal (performance, low_power, min_area, balanced)
 * @returns AI-suggested parameter ranges with reasoning
 */
export function getAISuggestedRanges(
  designInfo: DesignInfo,
  goal: OptimizationGoal = "balanced"
): AISuggestedRanges {
  const {
    designName,
    platform,
    cellCount = 5000,
    hasMemory = false,
    hasClock = true,
    targetFrequencyMhz,
    maxAreaUm2,
    maxPowerMw,
  } = designInfo;

  const warnings: string[] = [];
  const tips: string[] = [];
  const params: Record<string, { min: number; max: number; step: number }> = {};
  let reasoning = "";

  // Determine design size category
  const sizeCategory = cellCount < 1000 ? "small" :
                       cellCount < 10000 ? "medium" :
                       cellCount < 100000 ? "large" : "very_large";

  // ========== GOAL-SPECIFIC PARAMETER SUGGESTIONS ==========

  if (goal === "performance") {
    reasoning = `AI Analysis: Optimizing "${designName}" for MAXIMUM PERFORMANCE. ` +
      `Design size: ${sizeCategory} (~${cellCount} cells). ` +
      `Focus on achieving highest clock frequency with timing closure. ` +
      `Using lower utilization to give more slack for optimization.`;

    // Clock period - aggressive for performance
    const basePeriod = targetFrequencyMhz ? 1000 / targetFrequencyMhz : 10;
    params.CLOCK_PERIOD = {
      min: Math.max(2, basePeriod * 0.7),  // Try to push frequency
      max: basePeriod * 1.3,
      step: Math.max(0.5, basePeriod * 0.05),
    };

    // Lower utilization for better timing
    if (sizeCategory === "small") {
      params.FP_CORE_UTIL = { min: 35, max: 55, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.35, max: 0.55, step: 0.05 };
    } else if (sizeCategory === "medium") {
      params.FP_CORE_UTIL = { min: 30, max: 50, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.3, max: 0.5, step: 0.05 };
    } else {
      params.FP_CORE_UTIL = { min: 25, max: 45, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.25, max: 0.45, step: 0.05 };
    }

    // Enable timing-driven placement (fixed value)
    params.PL_TIME_DRIVEN = { min: 1, max: 1, step: 1 };

    // Synthesis strategy: DELAY focused
    params.SYNTH_STRATEGY = { min: 1, max: 1, step: 1 };

    // CTS for clock designs
    if (hasClock) {
      params.CTS_SINK_CLUSTERING_SIZE = {
        min: sizeCategory === "small" ? 10 : 15,
        max: sizeCategory === "small" ? 25 : 40,
        step: 5,
      };
    }

    tips.push("Performance mode: Using lower utilization for better timing slack");
    tips.push("Timing-driven placement is ENABLED to help meet timing");

  } else if (goal === "low_power") {
    reasoning = `AI Analysis: Optimizing "${designName}" for MINIMUM POWER. ` +
      `Design size: ${sizeCategory} (~${cellCount} cells). ` +
      `Will prefer smaller cells, lower activity, and relaxed timing.`;

    // Relaxed clock period for lower switching power
    const basePeriod = targetFrequencyMhz ? 1000 / targetFrequencyMhz : 20;
    params.CLOCK_PERIOD = {
      min: basePeriod,
      max: basePeriod * 2,
      step: 1,
    };

    // Medium-high utilization (smaller cells pack denser)
    if (sizeCategory === "small") {
      params.FP_CORE_UTIL = { min: 50, max: 70, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.5, max: 0.7, step: 0.05 };
    } else if (sizeCategory === "medium") {
      params.FP_CORE_UTIL = { min: 45, max: 65, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.45, max: 0.65, step: 0.05 };
    } else {
      params.FP_CORE_UTIL = { min: 40, max: 60, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.4, max: 0.6, step: 0.05 };
    }

    // Synthesis strategy: AREA (smaller cells = less leakage)
    params.SYNTH_STRATEGY = { min: 0, max: 0, step: 1 };
    params.SYNTH_SIZING = { min: 1, max: 1, step: 1 };

    tips.push("Power mode: Using relaxed clock period to reduce switching power");
    tips.push("AREA synthesis strategy selected for smaller cells (less leakage)");

    if (maxPowerMw) {
      tips.push(`Target max power: ${maxPowerMw} mW - ranges adjusted accordingly`);
    }

  } else if (goal === "min_area") {
    reasoning = `AI Analysis: Optimizing "${designName}" for MINIMUM AREA. ` +
      `Design size: ${sizeCategory} (~${cellCount} cells). ` +
      `Will maximize utilization and use smallest cells possible.`;

    // Very relaxed clock to allow dense packing
    const basePeriod = targetFrequencyMhz ? 1000 / targetFrequencyMhz : 25;
    params.CLOCK_PERIOD = {
      min: basePeriod * 1.2,
      max: basePeriod * 2.5,
      step: 2,
    };

    // High utilization for minimum area
    if (sizeCategory === "small") {
      params.FP_CORE_UTIL = { min: 60, max: 80, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.65, max: 0.85, step: 0.05 };
    } else if (sizeCategory === "medium") {
      params.FP_CORE_UTIL = { min: 55, max: 75, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.55, max: 0.75, step: 0.05 };
    } else {
      // Large designs can't push utilization as high
      params.FP_CORE_UTIL = { min: 45, max: 65, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.45, max: 0.65, step: 0.05 };
      warnings.push("High utilization on large designs may cause routing failures");
    }

    // AREA synthesis
    params.SYNTH_STRATEGY = { min: 0, max: 0, step: 1 };

    // Need more GRT adjustment for high utilization
    params.GRT_ADJUSTMENT = {
      min: 0.15,
      max: 0.35,
      step: 0.05,
    };

    tips.push("Area mode: High utilization ranges selected");
    tips.push("Watch for routing congestion - GRT_ADJUSTMENT range increased");

  } else {
    // BALANCED
    reasoning = `AI Analysis: BALANCED optimization for "${designName}". ` +
      `Design size: ${sizeCategory} (~${cellCount} cells). ` +
      `Finding best trade-off between performance, power, and area.`;

    const basePeriod = targetFrequencyMhz ? 1000 / targetFrequencyMhz : 15;
    params.CLOCK_PERIOD = {
      min: basePeriod * 0.8,
      max: basePeriod * 1.5,
      step: 1,
    };

    if (sizeCategory === "small") {
      params.FP_CORE_UTIL = { min: 45, max: 65, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.45, max: 0.7, step: 0.05 };
    } else if (sizeCategory === "medium") {
      params.FP_CORE_UTIL = { min: 40, max: 60, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.4, max: 0.65, step: 0.05 };
    } else {
      params.FP_CORE_UTIL = { min: 35, max: 55, step: 5 };
      params.PL_TARGET_DENSITY = { min: 0.35, max: 0.6, step: 0.05 };
    }

    // Allow synthesis strategy exploration
    params.SYNTH_STRATEGY = { min: 0, max: 3, step: 1 };

    // CTS for clock designs
    if (hasClock) {
      params.CTS_SINK_CLUSTERING_SIZE = {
        min: 15,
        max: 40,
        step: 5,
      };
    }

    tips.push("Balanced mode: Exploring wider parameter space");
    tips.push("Consider running with more iterations for better results");
  }

  // ========== COMMON PARAMETERS (all goals) ==========

  // Global routing adjustment (design-size dependent)
  if (!params.GRT_ADJUSTMENT) {
    if (sizeCategory === "large" || sizeCategory === "very_large") {
      params.GRT_ADJUSTMENT = { min: 0.15, max: 0.35, step: 0.05 };
    } else {
      params.GRT_ADJUSTMENT = { min: 0.05, max: 0.25, step: 0.05 };
    }
  }

  // ========== PLATFORM-SPECIFIC ADJUSTMENTS ==========

  if (platform === "sky130hd") {
    tips.push("Sky130HD: Using standard ranges for mature 130nm-equivalent process");
  } else if (platform === "asap7") {
    tips.push("ASAP7: 7nm allows higher utilization - ranges adjusted up");
    // ASAP7 can handle higher utilization
    if (params.FP_CORE_UTIL) {
      params.FP_CORE_UTIL.max = Math.min(85, params.FP_CORE_UTIL.max + 10);
    }
  } else if (platform === "gf180mcuD" || platform === "gf180") {
    tips.push("GF180: Larger feature size - keeping conservative utilization");
  } else if (platform === "ihp-sg13g2" || platform === "ihp130") {
    tips.push("IHP SG13G2: 130nm BiCMOS - standard ranges apply");
  }

  // ========== SIZE-SPECIFIC WARNINGS ==========

  if (sizeCategory === "very_large") {
    warnings.push("Very large design (>100K cells): expect 30-60+ min per trial");
    warnings.push("Consider reducing trial count to 10-15 or using parallel jobs");
  } else if (sizeCategory === "large") {
    warnings.push("Large design (10K-100K cells): expect 10-30 min per trial");
  }

  if (hasMemory) {
    warnings.push("Design contains memory macros - ensure macro placement is optimized first");
    tips.push("Tip: Pre-place memories before auto-tuning for better results");
  }

  // ========== CONSTRAINTS CHECKS ==========

  if (maxAreaUm2) {
    tips.push(`Target max area: ${maxAreaUm2} um² - prioritizing compact solutions`);
  }

  if (maxPowerMw) {
    tips.push(`Target max power: ${maxPowerMw} mW - avoiding high-frequency extremes`);
  }

  // ========== CONFIDENCE CALCULATION ==========

  let confidence: "low" | "medium" | "high";
  if (cellCount !== undefined && targetFrequencyMhz !== undefined) {
    confidence = "high";
  } else if (cellCount !== undefined || targetFrequencyMhz !== undefined) {
    confidence = "medium";
  } else {
    confidence = "low";
    warnings.push("Limited design info provided - using default estimates");
  }

  return {
    parameters: params,
    reasoning,
    warnings,
    tips,
    confidence,
  };
}

/**
 * Generate AutoTuner config with AI-suggested ranges (NEW DEFAULT)
 *
 * This replaces the old behavior of using hardcoded presets.
 * Now the AI analyzes design info to suggest appropriate ranges.
 */
export function generateAutoTunerConfigWithAI(options: {
  designInfo: DesignInfo;
  goal?: OptimizationGoal;
  customParameters?: Record<string, { min: number; max: number; step: number }>;
  customWeights?: { performance: number; power: number; area: number };
  iterations?: number;
  parallelTrials?: number;
  constraints?: AutoTunerConfig["constraints"];
}): { config: AutoTunerConfig; aiSuggestion: AISuggestedRanges } {
  const {
    designInfo,
    goal = "balanced",
    customParameters,
    customWeights,
    iterations = 50,
    parallelTrials = 4,
    constraints,
  } = options;

  // Get AI-suggested ranges
  const aiSuggestion = getAISuggestedRanges(designInfo, goal);

  // Merge AI suggestions with custom overrides (custom takes precedence)
  const parameters = {
    ...aiSuggestion.parameters,
    ...customParameters,
  };

  // Use preset weights or custom weights
  const preset = OPTIMIZATION_PRESETS[goal];
  const objectives = customWeights || preset.weights;

  // Normalize weights if needed
  const weightSum = objectives.performance + objectives.power + objectives.area;
  const normalizedObjectives = Math.abs(weightSum - 1.0) > 0.01
    ? {
        performance: objectives.performance / weightSum,
        power: objectives.power / weightSum,
        area: objectives.area / weightSum,
      }
    : objectives;

  const config: AutoTunerConfig = {
    platform: designInfo.platform,
    design: designInfo.designName,
    parameters,
    objectives: normalizedObjectives,
    iterations,
    parallelTrials,
    constraints,
  };

  return { config, aiSuggestion };
}

/**
 * Format AI suggestion for display
 */
export function formatAISuggestion(suggestion: AISuggestedRanges): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           AI-SUGGESTED PARAMETER RANGES                      ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`Confidence: ${suggestion.confidence.toUpperCase()}`);
  lines.push("");
  lines.push("Reasoning:");
  lines.push(`  ${suggestion.reasoning}`);
  lines.push("");
  lines.push("Suggested Parameter Ranges:");
  lines.push("─".repeat(55));

  for (const [name, range] of Object.entries(suggestion.parameters)) {
    const rangeStr = `[${range.min} - ${range.max}]`;
    const stepStr = range.step > 0 ? `step ${range.step}` : "continuous";
    lines.push(`  ${name.padEnd(25)} ${rangeStr.padEnd(15)} ${stepStr}`);
  }

  if (suggestion.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    suggestion.warnings.forEach(w => lines.push(`  ⚠️  ${w}`));
  }

  if (suggestion.tips.length > 0) {
    lines.push("");
    lines.push("Tips:");
    suggestion.tips.forEach(t => lines.push(`  💡 ${t}`));
  }

  return lines.join("\n");
}
