import fs from 'fs';
import path from 'path';

/** The database providers this workspace can target; see `@an5/orm`. */
type Provider = 'mssql' | 'postgres' | 'mysql' | 'sqlite' | 'googlesheets';

export interface Metadata {
  modelToTable: Record<string, string>;
  relationMap: Record<string, any>;
  modelFields: Record<string, Record<string, { ts: string; sql: string; description?: string }>>;
}

function tryLoadFromFile(filePath: string): Metadata | null {
  try {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) return null;
    const content = fs.readFileSync(absPath, 'utf-8');

    // Strip TS interface declarations
    const cleaned = content
      .replace(/export\s+interface\s+\w+[^}]+\}/gs, '')
      .replace(/\/\/.*$/gm, '')
      .trim();

    // Extract modelToTable
    const mttMatch = cleaned.match(/export\s+const\s+modelToTable[^=]+=\s*\{([^}]+)\}/);
    const modelToTable: Record<string, string> = {};
    if (mttMatch) {
      const body = mttMatch[1] ?? '';
      body.split(',').forEach((line: string) => {
        const kv = line.trim().match(/(\w+)\s*:\s*"([^"]+)"/);
        const k = kv?.[1];
        const v = kv?.[2];
        if (k !== undefined && v !== undefined) modelToTable[k] = v;
      });
    }

    // Extract modelFields — supports both old flat format and new { ts, sql } format
    const mfMatch = cleaned.match(/export\s+const\s+modelFields[^=]+=\s*\{([\s\S]+?)\};/);
    const modelFields: Record<string, Record<string, { ts: string; sql: string; description?: string }>> = {};
    if (mfMatch) {
      const block = mfMatch[1] ?? '';
      const modelBlocks = block.match(/(\w+)\s*:\s*\{([^}]+)\}/g);
      if (modelBlocks) {
        modelBlocks.forEach((mb: string) => {
          const m = mb.match(/(\w+)\s*:\s*\{([^}]+)\}/);
          if (m) {
            const fields: Record<string, { ts: string; sql: string; description?: string }> = {};
            const fieldBlock = m[2] ?? '';
            // A description may contain commas, so entries are split on the
            // `fieldName:` boundary rather than on every comma.
            fieldBlock.split(/(?=\w+\s*:)/).forEach((fv: string) => {
              // New format: fieldName: { ts: "...", sql: "...", description: "..." }
              const entry = fv.trim().match(/^(\w+)\s*:\s*\{([\s\S]*)\}$/);
              if (entry?.[1] !== undefined && entry[2] !== undefined) {
                const body = entry[2];
                const ts = body.match(/\bts\s*:\s*"([^"]*)"/)?.[1];
                const sql = body.match(/\bsql\s*:\s*"([^"]*)"/)?.[1];
                const description = body.match(/\bdescription\s*:\s*"([^"]*)"/)?.[1];
                if (ts !== undefined) {
                  fields[entry[1]] = {
                    ts,
                    sql: sql ?? '',
                    ...(description ? { description } : {}),
                  };
                }
                return;
              }
              // Legacy format: fieldName: "type"
              const oldFmt = fv.trim().match(/(\w+)\s*:\s*"([^"]+)"/);
              if (oldFmt) {
                const ok = oldFmt[1];
                const raw = oldFmt[2];
                if (ok === undefined || raw === undefined) return;
                const clean = raw.replace('?', '');
                const sqlType = mapLegacyTsToSql(clean);
                fields[ok] = { ts: raw, sql: sqlType };
              }
            });
            const modelKey = m[1];
            if (modelKey !== undefined) modelFields[modelKey] = fields;
          }
        });
      }
    }

    // Extract relationMap
    const rmMatch = cleaned.match(/export\s+const\s+relationMap[^=]+=\s*\{([\s\S]+?)\};/);
    const relationMap: Record<string, any> = {};
    if (rmMatch) {
      const block = rmMatch[1] ?? '';
      const modelBlocks = block.match(/(\w+)\s*:\s*\{([^}]*)\}/g);
      if (modelBlocks) {
        modelBlocks.forEach((mb: string) => {
          const m = mb.match(/(\w+)\s*:\s*\{([^}]*)\}/);
          const modelKey = m?.[1];
          if (modelKey !== undefined) relationMap[modelKey] = {};
        });
      }
    }

    if (Object.keys(modelToTable).length > 0) {
      return { modelToTable, relationMap, modelFields };
    }
  } catch {}
  return null;
}

/**
 * The database this workspace targets, or undefined when it cannot be told.
 *
 * Only used by the legacy path below; current generated metadata carries the type
 * the schema file declared.
 */
function projectProvider(): Provider | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const gen = require('@an5/orm/generator');
    if (typeof gen.providerForProject !== 'function') return undefined;
    return gen.providerForProject(path.resolve(__dirname, '..', '..', '..')) as Provider;
  } catch {
    return undefined;
  }
}

/**
 * A column type for a TypeScript type, for a client generated before the metadata
 * carried `sql`.
 *
 * Delegated to the ORM so the name is one that provider actually has: the previous
 * hardcoded SQL Server list produced `NVARCHAR(255)` and `BIT` for a PostgreSQL or
 * SQLite project, which the ORM's own validator then rejected.
 */
function mapLegacyTsToSql(tsType: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const gen = require('@an5/orm/generator');
    if (typeof gen.defaultSqlTypeForTs !== 'function') return 'NVARCHAR(MAX)';
    const provider = projectProvider();
    return provider
      ? gen.defaultSqlTypeForTs(tsType, provider)
      : gen.defaultSqlTypeForTs(tsType);
  } catch {
    return 'NVARCHAR(MAX)';
  }
}

export function loadMetadata(): Metadata | null {
  try {
    const clientDir = path.join(__dirname, '..', '..', '..', 'an5Client', 'typescript');
    const tsPath = path.join(clientDir, 'an5Metadata.ts');
    const jsPath = path.join(clientDir, 'an5Metadata.js');

    // The compiled metadata is CommonJS, so require it and read the real
    // objects instead of guessing at the source text.
    if (fs.existsSync(jsPath)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(jsPath) as Partial<Metadata>;
        if (mod.modelToTable || mod.modelFields) {
          return {
            modelToTable: mod.modelToTable ?? {},
            relationMap: mod.relationMap ?? {},
            modelFields: mod.modelFields ?? {},
          };
        }
      } catch {}
    }
    return tryLoadFromFile(jsPath) || tryLoadFromFile(tsPath);
  } catch {}
  return null;
}
