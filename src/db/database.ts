/**
 * Database - SQLite connection and queries for MCP4EDA
 */

import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  Project,
  Run,
  TrackedFile,
  PPAMetrics,
  RunType,
  RunStatus,
  FileType,
  CreateProjectInput,
  CreateRunInput,
} from "../types/project.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Calculate the MCP4EDA root directory (two levels up from src/db/)
const MCP4EDA_ROOT = join(__dirname, "..", "..");

/**
 * Database manager singleton
 */
class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    // Use MCP4EDA_ROOT to ensure consistent database location regardless of working directory
    // (fixes issue when running from Claude Desktop vs Claude Code CLI)
    this.dbPath = process.env.MCP4EDA_DB_PATH || join(MCP4EDA_ROOT, "mcp4eda.db");
  }

  /**
   * Get database instance, creating if needed
   */
  getDb(): Database.Database {
    if (!this.db) {
      this.db = new Database(this.dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      this.initSchema();
    }
    return this.db;
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    const schemaPath = join(__dirname, "schema.sql");
    try {
      const schema = readFileSync(schemaPath, "utf-8");
      this.db!.exec(schema);
      // Migration: add parent_run_id column if it doesn't exist
      this.migrateSchema();
    } catch (error) {
      // Schema file might not exist in built version, use inline schema
      this.db!.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          design_name TEXT,
          top_module TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          run_type TEXT NOT NULL,
          status TEXT NOT NULL,
          config TEXT,
          results TEXT,
          started_at DATETIME,
          completed_at DATETIME,
          parent_run_id TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_run_id) REFERENCES runs(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          run_id TEXT,
          file_type TEXT NOT NULL,
          file_path TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
        );

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
      `);
      // Migration: add parent_run_id column if it doesn't exist
      this.migrateSchema();
    }
  }

  /**
   * Migrate schema to add missing columns
   */
  private migrateSchema(): void {
    try {
      // Check if parent_run_id column exists
      const tableInfo = this.db!.prepare("PRAGMA table_info(runs)").all() as any[];
      const hasParentRunId = tableInfo.some((col: any) => col.name === "parent_run_id");

      if (!hasParentRunId) {
        this.db!.exec("ALTER TABLE runs ADD COLUMN parent_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL");
      }
    } catch (error) {
      // Ignore migration errors - column might already exist
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ==================== Project Operations ====================

  /**
   * Create a new project
   */
  createProject(input: CreateProjectInput): Project {
    const db = this.getDb();
    const id = this.generateId("proj");
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO projects (id, name, design_name, top_module, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, input.name, input.designName || null, input.topModule || null, now, now);

    return {
      id,
      name: input.name,
      designName: input.designName,
      topModule: input.topModule,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Get project by ID
   */
  getProject(id: string): Project | null {
    const db = this.getDb();
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;

    if (!row) return null;

    return this.rowToProject(row);
  }

  /**
   * Get all projects
   */
  getAllProjects(): Project[] {
    const db = this.getDb();
    const rows = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as any[];

    return rows.map(this.rowToProject);
  }

  /**
   * Update project
   */
  updateProject(id: string, updates: Partial<CreateProjectInput>): Project | null {
    const db = this.getDb();
    const existing = this.getProject(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.designName !== undefined) {
      fields.push("design_name = ?");
      values.push(updates.designName);
    }
    if (updates.topModule !== undefined) {
      fields.push("top_module = ?");
      values.push(updates.topModule);
    }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }

    return this.getProject(id);
  }

  /**
   * Delete project
   */
  deleteProject(id: string): boolean {
    const db = this.getDb();
    const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ==================== Run Operations ====================

  /**
   * Create a new run
   */
  createRun(input: CreateRunInput): Run {
    const db = this.getDb();
    const id = this.generateId("run");
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO runs (id, project_id, run_type, status, config, started_at, parent_run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.projectId,
      input.runType,
      "pending",
      input.config ? JSON.stringify(input.config) : null,
      now,
      input.parentRunId || null
    );

    return {
      id,
      projectId: input.projectId,
      runType: input.runType,
      status: "pending",
      config: input.config,
      startedAt: new Date(now),
      parentRunId: input.parentRunId,
    };
  }

  /**
   * Get run by ID
   */
  getRun(id: string): Run | null {
    const db = this.getDb();
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as any;

    if (!row) return null;

    return this.rowToRun(row);
  }

  /**
   * Get runs for a project
   */
  getRunsByProject(projectId: string): Run[] {
    const db = this.getDb();
    const rows = db
      .prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC")
      .all(projectId) as any[];

    return rows.map(this.rowToRun);
  }

  /**
   * Update run status
   */
  updateRunStatus(id: string, status: RunStatus, results?: Record<string, any>): Run | null {
    const db = this.getDb();
    const now = new Date().toISOString();

    if (status === "running") {
      db.prepare("UPDATE runs SET status = ?, started_at = ? WHERE id = ?").run(status, now, id);
    } else if (status === "success" || status === "failed") {
      db.prepare("UPDATE runs SET status = ?, results = ?, completed_at = ? WHERE id = ?").run(
        status,
        results ? JSON.stringify(results) : null,
        now,
        id
      );
    } else {
      db.prepare("UPDATE runs SET status = ? WHERE id = ?").run(status, id);
    }

    return this.getRun(id);
  }

  // ==================== File Operations ====================

  /**
   * Track a file
   */
  trackFile(projectId: string, fileType: FileType, filePath: string, runId?: string): TrackedFile {
    const db = this.getDb();

    const stmt = db.prepare(`
      INSERT INTO files (project_id, run_id, file_type, file_path)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(projectId, runId || null, fileType, filePath);

    return {
      id: result.lastInsertRowid as number,
      projectId,
      runId,
      fileType,
      filePath,
      createdAt: new Date(),
    };
  }

  /**
   * Get files for a project
   */
  getFilesByProject(projectId: string): TrackedFile[] {
    const db = this.getDb();
    const rows = db
      .prepare("SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as any[];

    return rows.map(this.rowToFile);
  }

  /**
   * Get files for a run
   */
  getFilesByRun(runId: string): TrackedFile[] {
    const db = this.getDb();
    const rows = db
      .prepare("SELECT * FROM files WHERE run_id = ? ORDER BY created_at DESC")
      .all(runId) as any[];

    return rows.map(this.rowToFile);
  }

  // ==================== PPA Metrics Operations ====================

  /**
   * Save PPA metrics
   */
  savePPAMetrics(runId: string, metrics: Omit<PPAMetrics, "id" | "runId">): PPAMetrics {
    const db = this.getDb();

    const stmt = db.prepare(`
      INSERT INTO ppa_metrics (run_id, area_um2, power_mw, frequency_mhz, wns_ns, tns_ns, cell_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      runId,
      metrics.areaUm2 || null,
      metrics.powerMw || null,
      metrics.frequencyMhz || null,
      metrics.wnsNs || null,
      metrics.tnsNs || null,
      metrics.cellCount || null
    );

    return {
      id: result.lastInsertRowid as number,
      runId,
      ...metrics,
    };
  }

  /**
   * Get PPA metrics for a run
   */
  getPPAMetrics(runId: string): PPAMetrics | null {
    const db = this.getDb();
    const row = db.prepare("SELECT * FROM ppa_metrics WHERE run_id = ?").get(runId) as any;

    if (!row) return null;

    return {
      id: row.id,
      runId: row.run_id,
      areaUm2: row.area_um2,
      powerMw: row.power_mw,
      frequencyMhz: row.frequency_mhz,
      wnsNs: row.wns_ns,
      tnsNs: row.tns_ns,
      cellCount: row.cell_count,
    };
  }

  /**
   * Get PPA history for a project
   */
  getPPAHistory(projectId: string): PPAMetrics[] {
    const db = this.getDb();
    const rows = db
      .prepare(
        `
      SELECT ppa.* FROM ppa_metrics ppa
      JOIN runs r ON ppa.run_id = r.id
      WHERE r.project_id = ?
      ORDER BY r.completed_at DESC
    `
      )
      .all(projectId) as any[];

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      areaUm2: row.area_um2,
      powerMw: row.power_mw,
      frequencyMhz: row.frequency_mhz,
      wnsNs: row.wns_ns,
      tnsNs: row.tns_ns,
      cellCount: row.cell_count,
    }));
  }

  // ==================== Cleanup Operations ====================

  /**
   * Get projects older than N days
   */
  getOldProjects(days: number): Project[] {
    const db = this.getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const rows = db
      .prepare("SELECT * FROM projects WHERE updated_at < ?")
      .all(cutoff) as any[];

    return rows.map(this.rowToProject);
  }

  /**
   * Delete old projects
   */
  deleteOldProjects(days: number): number {
    const db = this.getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const result = db.prepare("DELETE FROM projects WHERE updated_at < ?").run(cutoff);
    return result.changes;
  }

  // ==================== Helper Methods ====================

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }

  private rowToProject(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      designName: row.design_name,
      topModule: row.top_module,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToRun(row: any): Run {
    return {
      id: row.id,
      projectId: row.project_id,
      runType: row.run_type as RunType,
      status: row.status as RunStatus,
      config: row.config ? JSON.parse(row.config) : undefined,
      results: row.results ? JSON.parse(row.results) : undefined,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      parentRunId: row.parent_run_id || undefined,
    };
  }

  private rowToFile(row: any): TrackedFile {
    return {
      id: row.id,
      projectId: row.project_id,
      runId: row.run_id,
      fileType: row.file_type as FileType,
      filePath: row.file_path,
      createdAt: new Date(row.created_at),
    };
  }
}

// Export singleton instance
export const database = new DatabaseManager();
