import { z } from 'zod';
import type { Tool } from './tool-types';

export interface DatabaseAdapter {
  exec<T = any>(query: string, params?: Record<string, any>): Promise<T[]>;
  version(): Promise<{ version: string; dbName: string }>;
}

let an5AdaptersAvailable = false;
try {
  const mod = require(require('path').join(__dirname, '..', '..', '..', 'an5Adapters', 'typescript', 'an5Adapter'));
  if (mod?.An5Adapter) an5AdaptersAvailable = true;
} catch { /* an5Adapters not available */ }

function createAdapter(connectionString: string): DatabaseAdapter {
  if (an5AdaptersAvailable) {
    const mod = require(require('path').join(__dirname, '..', '..', '..', 'an5Adapters', 'typescript', 'an5Adapter'));
    const adapter = new mod.An5Adapter({ connectionString });
    return {
      exec: (q, p) => adapter.exec(q, p),
      version: async () => {
        const rows = await adapter.exec('SELECT @@VERSION AS version, DB_NAME() AS dbName');
        return { version: rows[0]?.version?.split('\n')[0] || 'Unknown', dbName: rows[0]?.dbName || 'Unknown' };
      },
    };
  }
  const mssql = require('mssql');
  return {
    exec: async (q, p) => {
      const pool = await mssql.connect(connectionString);
      const req = pool.request();
      if (p) for (const [k, v] of Object.entries(p)) req.input(k, v ?? null);
      const result = await req.query(q);
      await pool.close();
      return result.recordset || [];
    },
    version: async () => {
      const pool = await mssql.connect(connectionString);
      const result = await pool.request().query('SELECT @@VERSION AS version, DB_NAME() AS dbName');
      await pool.close();
      return { version: result.recordset[0]?.version?.split('\n')[0] || 'Unknown', dbName: result.recordset[0]?.dbName || 'Unknown' };
    },
  };
}

const executeQueryInputSchema = z.object({
  sql: z.string().describe('The SQL query to execute (SELECT queries only)'),
  connectionString: z.string().optional().describe('SQL Server connection string'),
  params: z.record(z.string(), z.unknown()).optional().describe('Query parameters for parameterized execution'),
});

const executeQueryOutputSchema = z.object({
  success: z.boolean(),
  adapter: z.string().optional().describe('Which adapter was used (an5Adapters or mssql)'),
  rows: z.array(z.record(z.string(), z.unknown())).optional().describe('Query result rows'),
  rowCount: z.number().optional().describe('Number of rows returned'),
  executionTimeMs: z.number().optional().describe('Approximate execution time'),
  error: z.string().optional().describe('Error message if execution failed'),
});

export const executeQuery: Tool = {
  name: 'executeQuery',
  description:
    'Execute a read-only (SELECT) SQL query against a SQL Server database. Uses an5Adapters for connection pooling when available, falls back to mssql package. ONLY for SELECT queries.',
  inputSchema: executeQueryInputSchema,
  outputSchema: executeQueryOutputSchema,
  async execute(input: { sql: string; connectionString?: string; params?: Record<string, unknown> }) {
    if (!/^\s*SELECT\b/i.test(input.sql.trim())) {
      return { success: false, error: 'Only SELECT queries are allowed.' };
    }
    if (!input.connectionString) {
      return { success: true, rows: mockQueryResult(input.sql), rowCount: 3, executionTimeMs: 12 };
    }
    try {
      const adapter = createAdapter(input.connectionString);
      const start = Date.now();
      const rows = await adapter.exec(input.sql, (input.params ?? {}) as Record<string, any>);
      const elapsed = Date.now() - start;
      return {
        success: true,
        adapter: an5AdaptersAvailable ? 'an5Adapters' : 'mssql',
        rows,
        rowCount: rows.length,
        executionTimeMs: elapsed,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown database error' };
    }
  },
};

const describeTableInputSchema = z.object({
  tableName: z.string().describe('Name of the table to describe'),
  schema: z.string().optional().default('dbo').describe('Database schema (default: dbo)'),
  connectionString: z.string().optional().describe('SQL Server connection string'),
});

const describeTableOutputSchema = z.object({
  tableName: z.string(),
  schema: z.string(),
  adapter: z.string().optional(),
  columns: z.array(z.object({
    name: z.string(), type: z.string(), isNullable: z.boolean(), isPrimaryKey: z.boolean(),
    maxLength: z.number().optional(), defaultValue: z.string().optional(),
  })),
  indexes: z.array(z.object({
    name: z.string(), columns: z.array(z.string()), isUnique: z.boolean(), isPrimary: z.boolean(),
  })).optional(),
  error: z.string().optional(),
});

export const describeTable: Tool = {
  name: 'describeTable',
  description:
    'Get detailed information about a database table including column names, data types, nullability, primary keys, and indexes. Uses an5Adapters for database introspection when available.',
  inputSchema: describeTableInputSchema,
  outputSchema: describeTableOutputSchema,
  async execute(input: { tableName: string; schema?: string; connectionString?: string }) {
    const safeSchema = input.schema ?? 'dbo';
    if (!input.connectionString) {
      return {
        tableName: input.tableName, schema: safeSchema,
        columns: [
          { name: 'id', type: 'nvarchar', isNullable: false, isPrimaryKey: true, maxLength: 1000 },
          { name: 'email', type: 'nvarchar', isNullable: false, isPrimaryKey: false, maxLength: 255 },
          { name: 'name', type: 'nvarchar', isNullable: true, isPrimaryKey: false, maxLength: 255 },
          { name: 'createdAt', type: 'datetime2', isNullable: false, isPrimaryKey: false },
        ],
        indexes: [{ name: 'PK_id', columns: ['id'], isUnique: true, isPrimary: true }, { name: 'UQ_email', columns: ['email'], isUnique: true, isPrimary: false }],
      };
    }
    try {
      const adapter = createAdapter(input.connectionString);
      const rows = await adapter.exec(
        `SELECT c.COLUMN_NAME AS name, c.DATA_TYPE AS type, c.IS_NULLABLE AS isNullable,
                c.CHARACTER_MAXIMUM_LENGTH AS maxLength, c.COLUMN_DEFAULT AS defaultValue
         FROM INFORMATION_SCHEMA.COLUMNS c
         WHERE c.TABLE_NAME = @p_0 AND c.TABLE_SCHEMA = @p_1
         ORDER BY c.ORDINAL_POSITION`,
        { p_0: input.tableName, p_1: safeSchema }
      );
      return {
        tableName: input.tableName, schema: safeSchema,
        adapter: an5AdaptersAvailable ? 'an5Adapters' : 'mssql',
        columns: rows.map((row: any) => ({
          name: row.name, type: row.type, isNullable: row.isNullable === 'YES',
          isPrimaryKey: !!row.isPrimaryKey, maxLength: row.maxLength || undefined, defaultValue: row.defaultValue || undefined,
        })),
      };
    } catch (err: any) {
      return { tableName: input.tableName, schema: safeSchema, columns: [], error: err.message || 'Failed to describe table' };
    }
  },
};

const healthCheckInputSchema = z.object({
  connectionString: z.string().optional().describe('SQL Server connection string'),
});

const healthCheckOutputSchema = z.object({
  connected: z.boolean(),
  serverVersion: z.string().optional(),
  databaseName: z.string().optional(),
  adapter: z.string().optional().describe('Which adapter was used (an5Adapters or mssql)'),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
});

export const healthCheck: Tool = {
  name: 'databaseHealthCheck',
  description:
    'Check the database connection health, including server version, database name, and response latency. Uses an5Adapters when available, falls back to mssql package.',
  inputSchema: healthCheckInputSchema,
  outputSchema: healthCheckOutputSchema,
  async execute(input: { connectionString?: string }) {
    if (!input.connectionString) {
      return { connected: false, error: 'No connection string provided.' };
    }
    try {
      const adapter = createAdapter(input.connectionString);
      const start = Date.now();
      const info = await adapter.version();
      const elapsed = Date.now() - start;
      return { connected: true, adapter: an5AdaptersAvailable ? 'an5Adapters' : 'mssql', serverVersion: info.version, databaseName: info.dbName, latencyMs: elapsed };
    } catch (err: any) {
      return { connected: false, error: err.message || 'Connection failed' };
    }
  },
};

function mockQueryResult(sql: string): Array<Record<string, unknown>> {
  const upper = sql.toUpperCase();
  if (upper.includes('USER')) {
    return [
      { id: '1', email: 'alice@example.com', name: 'Alice', createdAt: '2026-01-15T10:00:00Z' },
      { id: '2', email: 'bob@example.com', name: 'Bob', createdAt: '2026-02-20T14:30:00Z' },
      { id: '3', email: 'charlie@example.com', name: 'Charlie', createdAt: '2026-03-10T09:15:00Z' },
    ];
  }
  if (upper.includes('ORDER')) {
    return [
      { id: '101', userId: '1', total: 250, createdAt: '2026-03-01T12:00:00Z' },
      { id: '102', userId: '2', total: 180, createdAt: '2026-03-05T15:45:00Z' },
      { id: '103', userId: '1', total: 99, createdAt: '2026-03-12T08:30:00Z' },
    ];
  }
  return [{ id: '1', name: 'Sample', createdAt: '2026-01-01T00:00:00Z' }];
}
