/**
 * AutoTuner Search Algorithms and Configuration
 *
 * OpenROAD AutoTuner uses Ray Tune for distributed hyperparameter optimization.
 * It supports multiple search algorithms for finding optimal flow parameters.
 */

/**
 * AutoTuner search algorithms
 * These are the optimization algorithms AutoTuner uses to explore the parameter space
 */
export const AUTOTUNER_SEARCH_ALGORITHMS = {
  /**
   * Random/Grid Search - Exhaustive exploration
   * Best for: Small parameter spaces, baseline comparison
   */
  RANDOM: {
    name: "random",
    library: "Ray Tune built-in",
    description: "Random sampling of parameter space",
    pros: ["Simple", "No assumptions about parameter relationships"],
    cons: ["Inefficient for large spaces", "No learning from previous trials"],
    use_when: "Parameter space is small or want baseline comparison",
  },

  /**
   * Grid Search - Systematic exploration
   * Best for: Understanding parameter sensitivity
   */
  GRID: {
    name: "grid",
    library: "Ray Tune built-in",
    description: "Systematic grid-based exploration",
    pros: ["Covers entire space", "Reproducible"],
    cons: ["Exponential scaling", "Very slow for many parameters"],
    use_when: "Need to understand exact parameter behavior",
  },

  /**
   * Population Based Training (PBT) - DeepMind's evolutionary approach
   * Best for: Long-running optimizations
   */
  PBT: {
    name: "pbt",
    library: "Ray Tune PBT",
    description: "Evolutionary approach from DeepMind",
    pros: ["Adapts during training", "Good for long runs"],
    cons: ["Requires many parallel workers", "Complex to configure"],
    use_when: "Have many CPUs and long optimization time",
    features: ["mutation", "exploitation", "warm starting"],
  },

  /**
   * Tree Parzen Estimator (HyperOpt) - Probabilistic model
   * Best for: General purpose optimization
   */
  HYPEROPT: {
    name: "hyperopt",
    library: "HyperOpt",
    algorithm: "Tree Parzen Estimator (TPE)",
    description: "Probabilistic model-based optimization",
    pros: ["Efficient sampling", "Handles conditional parameters"],
    cons: ["Can get stuck in local optima"],
    use_when: "Default choice for most designs",
    features: ["surrogate model", "expected improvement"],
  },

  /**
   * Bayesian + Multi-Armed Bandit (AxSearch)
   * Best for: Expensive evaluations with exploration
   */
  AX: {
    name: "ax",
    library: "Ax (Facebook)",
    algorithm: "Bayesian Optimization + Thompson Sampling",
    description: "Combined Bayesian and bandit approach",
    pros: ["Balances exploration/exploitation", "Good for noisy objectives"],
    cons: ["More complex", "Requires more initial samples"],
    use_when: "Evaluation is expensive and noisy",
    features: ["Gaussian Process", "acquisition function", "Thompson sampling"],
  },

  /**
   * Optuna - Tree Parzen + CMA-ES hybrid
   * Best for: High-dimensional spaces
   */
  OPTUNA: {
    name: "optuna",
    library: "Optuna",
    algorithm: "TPE + CMA-ES hybrid",
    description: "State-of-the-art hyperparameter optimization",
    pros: ["Handles high dimensions", "Pruning support", "Multi-objective"],
    cons: ["More memory intensive"],
    use_when: "Many parameters to optimize simultaneously",
    features: ["pruning", "multi-objective", "define-by-run API"],
  },

  /**
   * Nevergrad - Evolutionary algorithms
   * Best for: Non-differentiable objectives
   */
  NEVERGRAD: {
    name: "nevergrad",
    library: "Nevergrad (Facebook)",
    algorithm: "Evolutionary algorithms",
    description: "Gradient-free optimization",
    pros: ["No gradient needed", "Handles discrete params well"],
    cons: ["May need many iterations"],
    use_when: "Parameters are mostly discrete/categorical",
    features: ["CMA-ES", "PSO", "differential evolution"],
  },
} as const;

/**
 * AutoTuner tunable parameter categories
 */
export const AUTOTUNER_PARAMETER_CATEGORIES = {
  /**
   * SDC (Timing Constraints) Parameters
   */
  SDC: {
    CLOCK_PERIOD: {
      description: "Clock period in nanoseconds",
      type: "float",
      range: { min: 1.0, max: 100.0 },
      impact: "timing, frequency",
    },
    CLOCK_UNCERTAINTY: {
      description: "Clock uncertainty/jitter",
      type: "float",
      range: { min: 0.0, max: 1.0 },
      impact: "timing margins",
    },
    IO_DELAY: {
      description: "Input/output delay constraints",
      type: "float",
      range: { min: 0.0, max: 10.0 },
      impact: "interface timing",
    },
  },

  /**
   * Floorplan Parameters
   */
  FLOORPLAN: {
    CORE_UTILIZATION: {
      description: "Target core utilization percentage",
      type: "int",
      range: { min: 10, max: 90 },
      impact: "area, routability",
    },
    CORE_ASPECT_RATIO: {
      description: "Die aspect ratio (height/width)",
      type: "float",
      range: { min: 0.25, max: 4.0 },
      impact: "routing, wirelength",
    },
    CORE_MARGIN: {
      description: "Margin around core area",
      type: "int",
      range: { min: 0, max: 20 },
      impact: "IO placement",
    },
  },

  /**
   * Placement Parameters
   */
  PLACEMENT: {
    PLACE_DENSITY: {
      description: "Target placement density (0=sparse, 1=dense)",
      type: "float",
      range: { min: 0.3, max: 0.95 },
      impact: "congestion, timing",
    },
    CELL_PAD_IN_SITES: {
      description: "Cell padding for detailed placement",
      type: "int",
      range: { min: 0, max: 8 },
      impact: "routability, area",
    },
    MACRO_HALO_X: {
      description: "Horizontal halo around macros",
      type: "int",
      range: { min: 0, max: 20 },
      impact: "routing around macros",
    },
    MACRO_HALO_Y: {
      description: "Vertical halo around macros",
      type: "int",
      range: { min: 0, max: 20 },
      impact: "routing around macros",
    },
  },

  /**
   * CTS Parameters
   */
  CTS: {
    CTS_BUF_DISTANCE: {
      description: "Distance between clock buffers (microns)",
      type: "int",
      range: { min: 10, max: 200 },
      impact: "skew, power",
    },
    CTS_CLUSTER_SIZE: {
      description: "Number of sinks per cluster",
      type: "int",
      range: { min: 5, max: 50 },
      impact: "tree depth, skew",
    },
    CTS_CLUSTER_DIAMETER: {
      description: "Maximum cluster diameter",
      type: "int",
      range: { min: 20, max: 200 },
      impact: "wirelength, skew",
    },
  },

  /**
   * Global Routing Parameters
   */
  GLOBAL_ROUTING: {
    GRT_LAYER_ADJUSTMENT: {
      description: "Reduce routing capacity per layer",
      type: "float",
      range: { min: 0.0, max: 0.5 },
      impact: "congestion margin",
    },
    GRT_OVERFLOW_ITERS: {
      description: "Iterations to remove overflow",
      type: "int",
      range: { min: 10, max: 200 },
      impact: "congestion resolution",
    },
    GRT_ANT_ITERS: {
      description: "Antenna repair iterations",
      type: "int",
      range: { min: 1, max: 20 },
      impact: "antenna violations",
    },
  },

  /**
   * Detailed Routing Parameters
   */
  DETAILED_ROUTING: {
    DRT_OPT_ITERS: {
      description: "Detailed routing optimization iterations",
      type: "int",
      range: { min: 16, max: 128 },
      impact: "DRC violations, runtime",
    },
    MIN_ROUTING_LAYER: {
      description: "Bottom routing layer",
      type: "int",
      range: { min: 1, max: 6 },
      impact: "routing resources",
    },
    MAX_ROUTING_LAYER: {
      description: "Top routing layer",
      type: "int",
      range: { min: 4, max: 10 },
      impact: "routing resources",
    },
  },

  /**
   * Timing Repair Parameters
   */
  TIMING_REPAIR: {
    SETUP_SLACK_MARGIN: {
      description: "Additional setup margin for repair",
      type: "float",
      range: { min: 0.0, max: 1.0 },
      impact: "overfix/underfix timing",
    },
    HOLD_SLACK_MARGIN: {
      description: "Additional hold margin for repair",
      type: "float",
      range: { min: 0.0, max: 0.5 },
      impact: "hold buffer insertion",
    },
    TNS_END_PERCENT: {
      description: "Percentage of TNS paths to repair",
      type: "int",
      range: { min: 10, max: 100 },
      impact: "timing closure aggressiveness",
    },
    SKIP_PIN_SWAP: {
      description: "Skip pin swapping optimization",
      type: "bool",
      impact: "timing optimization",
    },
    SKIP_VT_SWAP: {
      description: "Skip VT (threshold voltage) swapping",
      type: "bool",
      impact: "power vs timing tradeoff",
    },
  },
} as const;

/**
 * AutoTuner objective functions
 * These define how PPA metrics are combined into a single score
 */
export const AUTOTUNER_OBJECTIVES = {
  /**
   * Linear weighted sum (default)
   */
  WEIGHTED_SUM: {
    name: "weighted_sum",
    formula: "score = coeff_perform * (1/period) + coeff_power * (1/power) + coeff_area * (1/area)",
    description: "Linear combination of normalized metrics",
    parameters: {
      coeff_perform: { description: "Weight for performance (frequency)", default: 0.33 },
      coeff_power: { description: "Weight for power (minimize)", default: 0.33 },
      coeff_area: { description: "Weight for area (minimize)", default: 0.34 },
    },
  },

  /**
   * Performance-first with constraints
   */
  PERFORMANCE_CONSTRAINED: {
    name: "performance_constrained",
    formula: "score = frequency, subject to: area < max_area, power < max_power",
    description: "Maximize frequency within area/power budget",
    parameters: {
      max_area: { description: "Maximum allowed area", unit: "um²" },
      max_power: { description: "Maximum allowed power", unit: "mW" },
    },
  },

  /**
   * Area-first with timing constraint
   */
  AREA_CONSTRAINED: {
    name: "area_constrained",
    formula: "score = 1/area, subject to: WNS >= 0",
    description: "Minimize area while meeting timing",
    parameters: {
      min_slack: { description: "Minimum required slack", default: 0, unit: "ns" },
    },
  },
} as const;

/**
 * AutoTuner operation modes
 */
export const AUTOTUNER_MODES = {
  /**
   * Sweep mode - exhaustive search
   */
  SWEEP: {
    name: "sweep",
    description: "Test all parameter combinations",
    use_case: "Isolate impact of specific parameters",
    parallel: true,
    deterministic: true,
  },

  /**
   * Tune mode - intelligent search
   */
  TUNE: {
    name: "tune",
    description: "Use search algorithm to find optimal parameters",
    use_case: "Find best configuration efficiently",
    parallel: true,
    deterministic: false,
  },

  /**
   * Resume mode - continue previous run
   */
  RESUME: {
    name: "resume",
    description: "Continue from previous tuning session",
    use_case: "Extend optimization or recover from crash",
    requires: "previous experiment directory",
  },
} as const;

/**
 * Recommended algorithm selection based on use case
 */
export function recommendSearchAlgorithm(options: {
  numParameters: number;
  numTrials: number;
  parallelWorkers: number;
  parameterTypes: ("continuous" | "discrete" | "categorical")[];
}): string {
  const { numParameters, numTrials, parallelWorkers, parameterTypes } = options;

  // Small parameter space - use grid or random
  if (numParameters <= 3 && numTrials >= Math.pow(5, numParameters)) {
    return "grid";
  }

  // Few trials - use random
  if (numTrials < 20) {
    return "random";
  }

  // Many discrete/categorical parameters - use Nevergrad
  const discreteRatio = parameterTypes.filter(t => t !== "continuous").length / numParameters;
  if (discreteRatio > 0.7) {
    return "nevergrad";
  }

  // Many parallel workers - use PBT
  if (parallelWorkers >= 8 && numTrials >= 100) {
    return "pbt";
  }

  // High-dimensional space - use Optuna
  if (numParameters > 10) {
    return "optuna";
  }

  // Expensive evaluation with noise - use Ax
  if (numTrials < 50) {
    return "ax";
  }

  // Default - use HyperOpt
  return "hyperopt";
}

/**
 * Generate AutoTuner configuration JSON
 */
export function generateAutoTunerJSON(config: {
  design: string;
  platform: string;
  algorithm: keyof typeof AUTOTUNER_SEARCH_ALGORITHMS;
  mode: keyof typeof AUTOTUNER_MODES;
  parameters: Record<string, { min: number; max: number; step?: number }>;
  objectives: { performance: number; power: number; area: number };
  numTrials: number;
  parallelTrials: number;
  seed?: number;
}): string {
  const {
    design,
    platform,
    algorithm,
    mode,
    parameters,
    objectives,
    numTrials,
    parallelTrials,
    seed,
  } = config;

  const jsonConfig: Record<string, unknown> = {
    // Design info
    design,
    platform,

    // Tuning settings
    algorithm,
    mode,
    num_samples: numTrials,
    num_parallel: parallelTrials,

    // Parameter space
    parameters: Object.fromEntries(
      Object.entries(parameters).map(([name, range]) => [
        name,
        {
          type: range.step ? "discrete" : "continuous",
          min: range.min,
          max: range.max,
          ...(range.step && { step: range.step }),
        },
      ])
    ),

    // Objectives
    coeff_perform: objectives.performance,
    coeff_power: objectives.power,
    coeff_area: objectives.area,

    // Optional seed
    ...(seed !== undefined && { seed }),
  };

  return JSON.stringify(jsonConfig, null, 2);
}
