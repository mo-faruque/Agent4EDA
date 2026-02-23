/**
 * Unified EDA Parameter Definitions
 *
 * Maps between LibreLane (JSON config), ORFS (Makefile/SDC), and AutoTuner formats.
 * This provides a single source of truth for parameter naming across all tools.
 *
 * Usage:
 * - Use canonical names in MCP4EDA internal logic
 * - Use toLibrelaneParam() when generating config.json
 * - Use toOrfsParam() when generating config.mk or autotuner.json
 */

/**
 * Unified parameter definition
 */
export interface UnifiedParameter {
  name: string;              // Canonical name used in MCP4EDA
  librelane: string;         // LibreLane config.json key
  orfs: string;              // ORFS config.mk / AutoTuner key
  type: 'int' | 'float';
  defaultRange: { min: number; max: number; step: number };
  description: string;
  tunable: boolean;          // Whether this can be tuned by AutoTuner
  category: 'timing' | 'floorplan' | 'placement' | 'cts' | 'routing' | 'synthesis';
}

/**
 * Complete unified parameter definitions
 *
 * Canonical names are chosen to be clear and consistent.
 * Mappings to LibreLane and ORFS are documented here.
 */
export const UNIFIED_PARAMETERS: Record<string, UnifiedParameter> = {
  // ============================================
  // TIMING PARAMETERS
  // ============================================
  CLOCK_PERIOD: {
    name: 'CLOCK_PERIOD',
    librelane: 'CLOCK_PERIOD',
    orfs: '_SDC_CLK_PERIOD',  // Underscore prefix for SDC parameters in ORFS
    type: 'float',
    defaultRange: { min: 5, max: 50, step: 1 },
    description: 'Clock period in nanoseconds',
    tunable: true,
    category: 'timing',
  },

  // ============================================
  // FLOORPLAN PARAMETERS
  // ============================================
  CORE_UTILIZATION: {
    name: 'CORE_UTILIZATION',
    librelane: 'FP_CORE_UTIL',
    orfs: 'CORE_UTILIZATION',
    type: 'int',
    defaultRange: { min: 20, max: 80, step: 5 },
    description: 'Core utilization percentage (0-100)',
    tunable: true,
    category: 'floorplan',
  },

  ASPECT_RATIO: {
    name: 'ASPECT_RATIO',
    librelane: 'FP_ASPECT_RATIO',
    orfs: 'ASPECT_RATIO',
    type: 'float',
    defaultRange: { min: 0.5, max: 2.0, step: 0.25 },
    description: 'Die aspect ratio (height/width)',
    tunable: true,
    category: 'floorplan',
  },

  PDN_VPITCH: {
    name: 'PDN_VPITCH',
    librelane: 'FP_PDN_VPITCH',
    orfs: 'PDN_VPITCH',
    type: 'int',
    defaultRange: { min: 50, max: 200, step: 10 },
    description: 'Vertical power distribution network pitch',
    tunable: false,  // Not commonly tuned
    category: 'floorplan',
  },

  PDN_HPITCH: {
    name: 'PDN_HPITCH',
    librelane: 'FP_PDN_HPITCH',
    orfs: 'PDN_HPITCH',
    type: 'int',
    defaultRange: { min: 50, max: 200, step: 10 },
    description: 'Horizontal power distribution network pitch',
    tunable: false,
    category: 'floorplan',
  },

  // ============================================
  // PLACEMENT PARAMETERS
  // ============================================
  PLACEMENT_DENSITY: {
    name: 'PLACEMENT_DENSITY',
    librelane: 'PL_TARGET_DENSITY_PCT',
    orfs: 'PLACE_DENSITY_LB_ADDON',
    type: 'float',
    defaultRange: { min: 0.3, max: 0.9, step: 0.05 },
    description: 'Placement target density (0.0-1.0 or addon value)',
    tunable: true,
    category: 'placement',
  },

  GPL_TIMING_DRIVEN: {
    name: 'GPL_TIMING_DRIVEN',
    librelane: 'PL_TIME_DRIVEN',
    orfs: 'GPL_TIMING_DRIVEN',
    type: 'int',
    defaultRange: { min: 0, max: 1, step: 1 },
    description: 'Enable timing-driven global placement (0/1)',
    tunable: true,
    category: 'placement',
  },

  GPL_ROUTABILITY_DRIVEN: {
    name: 'GPL_ROUTABILITY_DRIVEN',
    librelane: 'PL_ROUTABILITY_DRIVEN',
    orfs: 'GPL_ROUTABILITY_DRIVEN',
    type: 'int',
    defaultRange: { min: 0, max: 1, step: 1 },
    description: 'Enable routability-driven global placement (0/1)',
    tunable: true,
    category: 'placement',
  },

  // ============================================
  // CLOCK TREE SYNTHESIS PARAMETERS
  // ============================================
  CTS_CLUSTER_SIZE: {
    name: 'CTS_CLUSTER_SIZE',
    librelane: 'CTS_SINK_CLUSTERING_SIZE',
    orfs: 'CTS_CLUSTER_SIZE',
    type: 'int',
    defaultRange: { min: 10, max: 60, step: 5 },
    description: 'CTS sink clustering size',
    tunable: true,
    category: 'cts',
  },

  CTS_CLUSTER_DIAMETER: {
    name: 'CTS_CLUSTER_DIAMETER',
    librelane: 'CTS_SINK_CLUSTERING_MAX_DIAMETER',
    orfs: 'CTS_CLUSTER_DIAMETER',
    type: 'int',
    defaultRange: { min: 30, max: 100, step: 10 },
    description: 'CTS sink clustering max diameter',
    tunable: true,
    category: 'cts',
  },

  // ============================================
  // ROUTING PARAMETERS
  // ============================================
  GRT_ADJUSTMENT: {
    name: 'GRT_ADJUSTMENT',
    librelane: 'GRT_ADJUSTMENT',
    orfs: 'GRT_ADJUSTMENT',
    type: 'float',
    defaultRange: { min: 0.0, max: 0.5, step: 0.05 },
    description: 'Global routing resource adjustment factor',
    tunable: true,
    category: 'routing',
  },

  GRT_ALLOW_CONGESTION: {
    name: 'GRT_ALLOW_CONGESTION',
    librelane: 'GRT_ALLOW_CONGESTION',
    orfs: 'GRT_ALLOW_CONGESTION',
    type: 'int',
    defaultRange: { min: 0, max: 1, step: 1 },
    description: 'Allow global routing congestion (0/1)',
    tunable: true,
    category: 'routing',
  },

  DETAILED_ROUTE_END_ITERATION: {
    name: 'DETAILED_ROUTE_END_ITERATION',
    librelane: 'DRT_OPT_ITERS',
    orfs: 'DETAILED_ROUTE_END_ITERATION',
    type: 'int',
    defaultRange: { min: 32, max: 128, step: 16 },
    description: 'Detailed routing optimization iterations',
    tunable: true,
    category: 'routing',
  },

  // Note: GRT_OVERFLOW_ITERS is NOT tunable in ORFS AutoTuner
  // It will cause [ERROR TUN-0017] if included

  // ============================================
  // SYNTHESIS PARAMETERS
  // ============================================
  SYNTH_STRATEGY: {
    name: 'SYNTH_STRATEGY',
    librelane: 'SYNTH_STRATEGY',
    orfs: 'SYNTH_STRATEGY',
    type: 'int',
    defaultRange: { min: 0, max: 3, step: 1 },
    description: 'Synthesis strategy (0=AREA, 1=DELAY, 2=MIXED, 3=AREA_DELAY)',
    tunable: true,
    category: 'synthesis',
  },

  ABC_AREA: {
    name: 'ABC_AREA',
    librelane: 'SYNTH_SIZING',
    orfs: 'ABC_AREA',
    type: 'int',
    defaultRange: { min: 0, max: 1, step: 1 },
    description: 'Enable ABC area optimization (0/1)',
    tunable: true,
    category: 'synthesis',
  },
};

/**
 * Convert canonical parameter name to LibreLane format
 */
export function toLibrelaneParam(canonical: string): string {
  const param = UNIFIED_PARAMETERS[canonical];
  if (!param) {
    // If not in our mapping, return as-is (might be a custom param)
    return canonical;
  }
  return param.librelane;
}

/**
 * Convert canonical parameter name to ORFS format
 */
export function toOrfsParam(canonical: string): string {
  const param = UNIFIED_PARAMETERS[canonical];
  if (!param) {
    return canonical;
  }
  return param.orfs;
}

/**
 * Convert LibreLane parameter name to canonical format
 */
export function fromLibrelaneParam(librelane: string): string | undefined {
  for (const [canonical, param] of Object.entries(UNIFIED_PARAMETERS)) {
    if (param.librelane === librelane) {
      return canonical;
    }
  }
  return undefined;
}

/**
 * Convert ORFS parameter name to canonical format
 */
export function fromOrfsParam(orfs: string): string | undefined {
  for (const [canonical, param] of Object.entries(UNIFIED_PARAMETERS)) {
    if (param.orfs === orfs) {
      return canonical;
    }
  }
  return undefined;
}

/**
 * Get all tunable parameters
 */
export function getTunableParameters(): UnifiedParameter[] {
  return Object.values(UNIFIED_PARAMETERS).filter(p => p.tunable);
}

/**
 * Get parameters by category
 */
export function getParametersByCategory(category: UnifiedParameter['category']): UnifiedParameter[] {
  return Object.values(UNIFIED_PARAMETERS).filter(p => p.category === category);
}

/**
 * Check if a parameter is tunable by AutoTuner
 */
export function isTunable(canonical: string): boolean {
  const param = UNIFIED_PARAMETERS[canonical];
  return param?.tunable ?? false;
}

/**
 * List of parameters that are known to NOT be tunable in ORFS AutoTuner
 * Including these will cause [ERROR TUN-0017]
 */
export const NON_TUNABLE_ORFS_PARAMS = [
  'GRT_OVERFLOW_ITERS',
  'coeff_perform',
  'coeff_power',
  'coeff_area',
];

/**
 * Convert a set of parameters from canonical names to ORFS AutoTuner format
 *
 * @param params - Record of canonical param names to {min, max, step} ranges
 * @param sdcFilePath - Path to SDC file (required if CLOCK_PERIOD is included)
 * @returns ORFS AutoTuner JSON config object
 */
export function toOrfsAutoTunerConfig(
  params: Record<string, { min: number; max: number; step: number }>,
  sdcFilePath: string = 'constraint.sdc'
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  let hasClockPeriod = false;

  for (const [canonical, range] of Object.entries(params)) {
    // Skip known non-tunable parameters
    if (NON_TUNABLE_ORFS_PARAMS.includes(canonical)) {
      continue;
    }

    const param = UNIFIED_PARAMETERS[canonical];
    if (!param) {
      // Unknown parameter - skip with warning
      console.warn(`Unknown parameter: ${canonical}, skipping`);
      continue;
    }

    if (!param.tunable) {
      console.warn(`Parameter ${canonical} is not tunable, skipping`);
      continue;
    }

    const orfsName = param.orfs;

    // Check for clock period
    if (orfsName === '_SDC_CLK_PERIOD') {
      hasClockPeriod = true;
    }

    config[orfsName] = {
      type: param.type,
      minmax: [range.min, range.max],
      step: range.step > 0 ? range.step : 0,
    };
  }

  // IMPORTANT: If _SDC_CLK_PERIOD is used, we MUST provide _SDC_FILE_PATH
  // Otherwise ORFS AutoTuner will fail with:
  // [ERROR TUN-0020] No SDC reference file provided.
  if (hasClockPeriod) {
    return {
      '_SDC_FILE_PATH': sdcFilePath,
      ...config,
    };
  }

  return config;
}

/**
 * Convert a set of parameters from canonical names to LibreLane config format
 */
export function toLibrelaneConfig(
  params: Record<string, number>
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const [canonical, value] of Object.entries(params)) {
    const param = UNIFIED_PARAMETERS[canonical];
    const librelaneKey = param?.librelane ?? canonical;
    config[librelaneKey] = value;
  }

  return config;
}

/**
 * Convert ORFS parameter names to LibreLane format
 *
 * This is used to take best parameters from AutoTuner (ORFS format)
 * and convert them for use in a LibreLane run.
 */
export function orfsParamsToLibrelane(
  orfsParams: Record<string, number>
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const [orfsName, value] of Object.entries(orfsParams)) {
    // Find the canonical name from ORFS param
    const canonical = fromOrfsParam(orfsName);
    if (canonical) {
      const param = UNIFIED_PARAMETERS[canonical];
      if (param) {
        config[param.librelane] = value;
      }
    } else {
      // Unknown ORFS param - try direct mapping
      // Some params have same name in both systems
      config[orfsName] = value;
    }
  }

  return config;
}

/**
 * Generate a complete LibreLane config with optimized parameters
 *
 * Takes a base config and merges in optimized parameters from AutoTuner
 */
export function generateOptimizedLibrelaneConfig(
  baseConfig: Record<string, unknown>,
  bestParams: Record<string, number>
): Record<string, unknown> {
  // Convert ORFS params to LibreLane format
  const optimizedParams = orfsParamsToLibrelane(bestParams);

  // Merge with base config (optimized params override base)
  return {
    ...baseConfig,
    ...optimizedParams,
  };
}
