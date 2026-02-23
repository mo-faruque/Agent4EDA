/**
 * OpenROAD Algorithm Definitions
 *
 * Comprehensive catalog of all available algorithms and optimization
 * methods in OpenROAD/OpenLane for each flow stage.
 */

/**
 * Synthesis algorithms and strategies
 */
export const SYNTHESIS_ALGORITHMS = {
  // ABC Synthesis Strategy
  STRATEGY: {
    AREA: {
      value: 0,
      description: "Optimize for minimum area",
      abc_script: "strash; &get -n; &dch -f; &nf; &put",
    },
    DELAY: {
      value: 1,
      description: "Optimize for minimum delay/maximum speed",
      abc_script: "strash; &get -n; &st; &dch; &nf; &put",
    },
    MIXED: {
      value: 2,
      description: "Balance area and delay",
      abc_script: "strash; &get -n; &dch -f; &nf -R 1000; &put",
    },
    AREA_DELAY: {
      value: 3,
      description: "Area optimization with delay consideration",
      abc_script: "strash; &get -n; &st; &dch -f; &nf -R 1000; &put",
    },
  },

  // Hierarchical synthesis
  HIERARCHICAL: {
    FLAT: { value: false, description: "Flatten entire design" },
    HIERARCHICAL: { value: true, description: "Preserve module hierarchy" },
  },

  // Memory handling
  MEMORY_HANDLING: {
    INFER: { description: "Infer memories from RTL" },
    MOCK: { description: "Mock large memories for rapid exploration" },
    BLACKBOX: { description: "Treat memories as black boxes" },
  },

  // Arithmetic optimization
  ARITHMETIC: {
    DEFAULT: { description: "Use Yosys default arithmetic" },
    WRAPPED_ADDERS: { description: "Use custom adder modules" },
    WRAPPED_MULTIPLIERS: { description: "Use custom multiplier modules" },
  },
} as const;

/**
 * Gate Resizer algorithms and optimization methods
 */
export const RESIZER_ALGORITHMS = {
  // Main optimization commands
  REPAIR_MODES: {
    REPAIR_DESIGN: {
      command: "repair_design",
      description: "Fix DRC violations (slew, capacitance, fanout)",
      options: [
        "-max_wire_length",
        "-max_slew_margin",
        "-max_cap_margin",
        "-max_utilization",
      ],
    },
    REPAIR_TIMING: {
      command: "repair_timing",
      description: "Fix setup/hold timing violations",
      options: [
        "-setup",
        "-hold",
        "-setup_margin",
        "-hold_margin",
        "-max_utilization",
        "-allow_setup_violations",
      ],
    },
    REPAIR_CLOCK_NETS: {
      command: "repair_clock_nets",
      description: "Repair clock network violations",
      options: ["-max_wire_length"],
    },
  },

  // Buffer insertion strategies
  BUFFER_STRATEGIES: {
    INPUT_PORT: { description: "Buffer between input port and loads" },
    OUTPUT_PORT: { description: "Buffer between driver and output port" },
    LOAD_SPLITTING: { description: "Split fanout with buffers" },
    WIRE_SEGMENTATION: { description: "Break long wires with buffers" },
  },

  // Gate sizing methods
  SIZING_METHODS: {
    DOWNSIZE: {
      description: "Size down gates on non-critical paths",
      reduces: "area, leakage power",
    },
    UPSIZE: {
      description: "Size up gates for timing",
      improves: "setup slack",
    },
    VT_SWAP: {
      description: "Swap between HVT/LVT variants",
      tradeoff: "speed vs leakage",
    },
    PIN_SWAP: {
      description: "Swap equivalent pins for timing",
      improves: "setup/hold",
    },
  },

  // Violation repair types
  VIOLATION_TYPES: {
    MAX_SLEW: { buffer_prefix: "load_slew", fix: "buffer insertion" },
    MAX_CAPACITANCE: { buffer_prefix: "max_cap", fix: "buffer insertion" },
    MAX_FANOUT: { buffer_prefix: "fanout", fix: "buffer tree" },
    MAX_WIRE_LENGTH: { buffer_prefix: "wire", fix: "wire splitting" },
    SETUP_VIOLATION: { fix: "upsizing, buffering, VT swap" },
    HOLD_VIOLATION: { fix: "delay cell insertion" },
  },

  // Power recovery
  POWER_RECOVERY: {
    description: "Recover power on paths with positive slack",
    methods: ["downsizing", "HVT swap"],
  },
} as const;

/**
 * Global Placement algorithms (RePlAce/GPL)
 */
export const PLACEMENT_ALGORITHMS = {
  // Main placement algorithm
  GLOBAL_PLACEMENT: {
    NESTEROV: {
      description: "Analytic placement using Nesterov's method",
      based_on: "RePlAce - electrostatic force equations",
      features: ["deterministic", "mixed-size support"],
    },
  },

  // Placement modes
  MODES: {
    STANDARD: {
      description: "Standard global placement",
      timing_driven: false,
      routability_driven: false,
    },
    TIMING_DRIVEN: {
      description: "Weight nets by timing criticality",
      timing_driven: true,
      features: ["virtual repair", "slack-based weighting"],
    },
    ROUTABILITY_DRIVEN: {
      description: "RUDY-based congestion estimation",
      routability_driven: true,
      features: ["cell inflation", "congestion reduction"],
    },
    INCREMENTAL: {
      description: "Refine pre-placed solutions",
      incremental: true,
    },
  },

  // Detailed placement
  DETAILED_PLACEMENT: {
    LEGALIZATION: { description: "Move cells to legal positions" },
    OPTIMIZATION: { description: "Optimize mirroring for HPWL" },
    FILLER_INSERTION: { description: "Insert filler cells for PDN" },
  },
} as const;

/**
 * Clock Tree Synthesis algorithms (TritonCTS)
 */
export const CTS_ALGORITHMS = {
  // Main CTS algorithm
  TREE_TOPOLOGY: {
    H_TREE: {
      description: "Hierarchical H-tree structure",
      features: ["balanced", "low skew"],
    },
  },

  // Clustering methods
  CLUSTERING: {
    CKMEANS: {
      description: "CKMeans clustering algorithm",
      configurable: ["cluster_size", "cluster_diameter"],
    },
    SEPARATE_MACRO_REG: {
      description: "Separate clustering for macros vs registers",
    },
  },

  // Buffering strategies
  BUFFER_STRATEGIES: {
    DISTANCE_BASED: { description: "Insert buffers based on wire distance" },
    OBSTRUCTION_AWARE: { description: "Avoid blockages and hard macros" },
    DELAY_BALANCING: { description: "Balance latencies between elements" },
    DUMMY_LOAD: { description: "Insert dummy loads at leaves" },
  },

  // NDR (Non-Default Rules) application
  NDR_STRATEGIES: {
    NONE: { value: "none", description: "No NDR rules" },
    ROOT_ONLY: { value: "root_only", description: "Apply NDR to root only" },
    HALF: { value: "half", description: "Apply NDR to upper half of tree" },
    FULL: { value: "full", description: "Apply NDR to entire tree" },
  },
} as const;

/**
 * Global Routing algorithms (FastRoute)
 */
export const GLOBAL_ROUTING_ALGORITHMS = {
  // Main algorithm
  CORE: {
    FASTROUTE: {
      description: "FastRoute4.1 from Iowa State",
      based_on: "Prim-Dijkstra tradeoff",
      features: ["RST generation", "layer assignment"],
    },
  },

  // Routing modes
  MODES: {
    STANDARD_2D: { description: "Standard 2D routing" },
    STANDARD_3D: { description: "3D routing with layer optimization" },
    RESISTANCE_AWARE: {
      description: "Resistance-aware routing (experimental)",
      status: "not production ready",
    },
    INCREMENTAL: {
      description: "Incremental routing updates",
      commands: ["-start_incremental", "-end_incremental"],
    },
  },

  // Congestion handling
  CONGESTION: {
    ITERATIVE_REMOVAL: {
      description: "Iteratively remove overflow",
      default_iterations: 50,
    },
    LAYER_ADJUSTMENT: {
      description: "Reduce assumed routing tracks per layer",
    },
    REGIONAL_ADJUSTMENT: {
      description: "Adjust capacity in specific regions",
    },
    CRITICAL_NETS: {
      description: "Prioritize timing-critical nets",
    },
  },
} as const;

/**
 * Detailed Routing algorithms (TritonRoute)
 */
export const DETAILED_ROUTING_ALGORITHMS = {
  // Main algorithm stages
  STAGES: {
    PIN_ACCESS: { description: "Analyze how nets connect to pins" },
    TRACK_ASSIGNMENT: { description: "Allocate routing tracks to nets" },
    INITIAL_ROUTING: { description: "Establish initial routes" },
    SEARCH_REPAIR: { description: "Optimize routes, fix violations" },
    MAZE_ROUTING: { description: "Path finding (debug mode)" },
  },

  // DRC handling
  DRC_OPTIONS: {
    REPORT_ITERATIONS: { description: "Report DRC at intervals" },
    OUTPUT_REPORT: { description: "Generate DRC report file" },
    CHECK_DRC: { command: "check_drc", description: "Validate DRC rules" },
  },

  // Via options
  VIA_OPTIONS: {
    VIA_IN_PIN: { description: "Via enclosure within pin boundaries" },
    MIN_ACCESS_POINTS: { description: "Minimum access points per pin" },
    DISABLE_VIA_GEN: { description: "Disable automatic via generation" },
  },

  // Optimization
  OPTIMIZATION: {
    CLEAN_PATCHES: { description: "Remove unnecessary routing" },
    CONGESTION_MAP: { description: "Output congestion mapping" },
    GUIDE_COVERAGE: { description: "Analyze route guide coverage" },
  },
} as const;

/**
 * Parasitic Extraction options (RCX)
 */
export const EXTRACTION_ALGORITHMS = {
  // Extraction versions
  VERSIONS: {
    V1: { description: "Original extraction model" },
    V2: { description: "Enhanced extraction model" },
  },

  // Extraction modes
  MODES: {
    COUPLED: {
      description: "Include coupling capacitance",
      default_threshold: 0.1, // fF
    },
    DECOUPLED: {
      description: "Ground capacitance only",
    },
  },

  // Corner handling
  CORNERS: {
    SINGLE: { description: "Single extraction corner" },
    MULTI_CORNER: { description: "Multiple PVT corners" },
  },

  // Resistance options
  RESISTANCE: {
    MERGED_VIA: { description: "Combine via resistance" },
    SEPARATE_VIA: { description: "Separate via resistance" },
    LEF_BASED: { description: "Use LEF resistance values" },
  },
} as const;

/**
 * IR Drop / Power Analysis (PDNSim)
 */
export const POWER_ANALYSIS_ALGORITHMS = {
  // Analysis types
  ANALYSIS: {
    STATIC_IR: {
      command: "analyze_power_grid",
      description: "Static IR drop analysis",
      outputs: ["worst IR drop", "current density"],
    },
    CHECK_GRID: {
      command: "check_power_grid",
      description: "Validate PDN connectivity",
    },
    SPICE_EXPORT: {
      command: "write_pg_spice",
      description: "Generate SPICE netlist",
    },
  },

  // Voltage source models
  SOURCE_MODELS: {
    FULL: { description: "All top-layer nodes as sources" },
    BUMPS: { description: "C4 bump grid array" },
    STRAPS: { description: "Power straps above top metal" },
  },

  // Optimization
  OPTIMIZATION: {
    DECAP_INSERTION: {
      description: "Insert decap cells in high IR-drop areas",
    },
  },
} as const;

/**
 * Antenna Checking and Repair
 */
export const ANTENNA_ALGORITHMS = {
  // Checking
  CHECK: {
    command: "check_antennas",
    description: "Detect antenna violations via wire graph traversal",
    metrics: ["PAR", "CAR"], // Partial/Cumulative Area Ratio
  },

  // Repair methods
  REPAIR: {
    DIODE_INSERTION: {
      description: "Insert diodes during global routing",
      trigger: "repair_design after GRT",
    },
    JUMPER_INSERTION: {
      description: "Add metal jumpers to break antenna",
    },
    ITERATIVE: {
      description: "Multiple repair iterations",
      parameter: "ANT_ITERS",
    },
  },
} as const;

/**
 * Static Timing Analysis (OpenSTA)
 */
export const TIMING_ANALYSIS = {
  // Analysis modes
  MODES: {
    SETUP: { description: "Setup time analysis" },
    HOLD: { description: "Hold time analysis" },
    RECOVERY: { description: "Recovery time analysis" },
    REMOVAL: { description: "Removal time analysis" },
  },

  // Clock handling
  CLOCKS: {
    PROPAGATED: { description: "Use actual clock tree delays" },
    IDEAL: { description: "Assume zero clock delay" },
    GENERATED: { description: "Support generated clocks" },
    MULTI_FREQUENCY: { description: "Multiple clock domains" },
  },

  // Exceptions
  EXCEPTIONS: {
    FALSE_PATH: { description: "Mark paths as false" },
    MULTICYCLE: { description: "Multi-cycle path exceptions" },
    MIN_MAX_DELAY: { description: "Min/max delay constraints" },
  },

  // Corner analysis
  CORNERS: {
    SLOW: { description: "Slow process corner" },
    FAST: { description: "Fast process corner" },
    TYPICAL: { description: "Typical process corner" },
  },
} as const;

/**
 * DRC/LVS Signoff (Magic + Netgen)
 */
export const SIGNOFF_ALGORITHMS = {
  // DRC checking (Magic)
  DRC: {
    MAGIC_DRC: {
      tool: "Magic",
      description: "Design Rule Checking",
      checks: [
        "spacing",
        "width",
        "enclosure",
        "overlap",
        "density",
      ],
    },
    XOR_CHECK: {
      tool: "Magic",
      description: "XOR sanity check between GDS versions",
    },
  },

  // LVS checking (Netgen)
  LVS: {
    NETGEN_LVS: {
      tool: "Netgen",
      description: "Layout vs Schematic comparison",
      compares: ["extracted netlist", "synthesized netlist"],
    },
  },

  // Antenna (Magic)
  ANTENNA: {
    MAGIC_ANTENNA: {
      tool: "Magic",
      description: "Antenna rule checking",
    },
  },
} as const;

/**
 * Optimization presets for different goals
 */
export const OPTIMIZATION_PRESETS = {
  TIMING_CLOSURE: {
    description: "Aggressive timing optimization",
    settings: {
      PL_TIME_DRIVEN: true,
      SETUP_SLACK_MARGIN: 0.1,
      HOLD_SLACK_MARGIN: 0.1,
      SYNTH_STRATEGY: "DELAY",
      SKIP_VT_SWAP: false,
      SKIP_PIN_SWAP: false,
      GRT_CRITICAL_NETS: true,
    },
  },
  LOW_POWER: {
    description: "Power-optimized flow",
    settings: {
      SYNTH_STRATEGY: "AREA",
      SKIP_VT_SWAP: false, // Enable HVT swap
      POWER_RECOVERY: true,
      CTS_OBSTRUCTION_AWARE: true,
    },
  },
  MIN_AREA: {
    description: "Minimum area flow",
    settings: {
      SYNTH_STRATEGY: "AREA",
      CORE_UTILIZATION: 70,
      PLACE_DENSITY: 0.85,
    },
  },
  DRC_CLEAN: {
    description: "Focus on DRC-clean output",
    settings: {
      GRT_LAYER_ADJUSTMENT: 0.2,
      DRT_OPT_ITERS: 64,
      CELL_PAD_IN_SITES: 4,
    },
  },
  SIGNOFF_READY: {
    description: "Production-ready signoff flow",
    settings: {
      MULTI_CORNER: true,
      RCX_MERGE_VIA_WIRE_RES: false,
      ANTENNA_CHECK: true,
      LVS_CHECK: true,
      DRC_CHECK: true,
      IR_DROP_CHECK: true,
    },
  },
} as const;

/**
 * Get all algorithms as a flat list for documentation
 */
export function getAllAlgorithms(): Record<string, unknown> {
  return {
    synthesis: SYNTHESIS_ALGORITHMS,
    resizer: RESIZER_ALGORITHMS,
    placement: PLACEMENT_ALGORITHMS,
    cts: CTS_ALGORITHMS,
    global_routing: GLOBAL_ROUTING_ALGORITHMS,
    detailed_routing: DETAILED_ROUTING_ALGORITHMS,
    extraction: EXTRACTION_ALGORITHMS,
    power_analysis: POWER_ANALYSIS_ALGORITHMS,
    antenna: ANTENNA_ALGORITHMS,
    timing: TIMING_ANALYSIS,
    signoff: SIGNOFF_ALGORITHMS,
    presets: OPTIMIZATION_PRESETS,
  };
}
