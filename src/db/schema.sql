-- MCP4EDA Database Schema
-- SQLite database for project and run tracking

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  design_name TEXT,
  top_module TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Runs table (synthesis, simulation, openlane, tuning)
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('synthesis', 'simulation', 'openlane', 'tuning')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed')),
  config TEXT,  -- JSON string
  results TEXT, -- JSON string
  started_at DATETIME,
  completed_at DATETIME,
  parent_run_id TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_run_id) REFERENCES runs(id) ON DELETE SET NULL
);

-- Files table (track all generated files)
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  run_id TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('input', 'output', 'report', 'gds', 'vcd', 'config')),
  file_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

-- PPA Metrics table (for analysis and comparison)
CREATE TABLE IF NOT EXISTS ppa_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  area_um2 REAL,
  power_mw REAL,
  frequency_mhz REAL,
  wns_ns REAL,
  tns_ns REAL,
  cell_count INTEGER,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_runs_project_id ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_run_id ON files(run_id);
CREATE INDEX IF NOT EXISTS idx_ppa_run_id ON ppa_metrics(run_id);

-- Trigger to update updated_at on projects
CREATE TRIGGER IF NOT EXISTS update_project_timestamp
AFTER UPDATE ON projects
BEGIN
  UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
