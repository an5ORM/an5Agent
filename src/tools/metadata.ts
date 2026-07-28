import fs from 'fs';
import path from 'path';

export interface Metadata {
  modelToTable: Record<string, string>;
  relationMap: Record<string, any>;
  modelFields: Record<string, Record<string, { ts: string; sql: string }>>;
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
      mttMatch[1].split(',').forEach((line: string) => {
        const kv = line.trim().match(/(\w+)\s*:\s*"([^"]+)"/);
        if (kv) modelToTable[kv[1]] = kv[2];
      });
    }

    // Extract modelFields — supports both old flat format and new { ts, sql } format
    const mfMatch = cleaned.match(/export\s+const\s+modelFields[^=]+=\s*\{([\s\S]+?)\};/);
    const modelFields: Record<string, Record<string, { ts: string; sql: string }>> = {};
    if (mfMatch) {
      const block = mfMatch[1];
      const modelBlocks = block.match(/(\w+)\s*:\s*\{([^}]+)\}/g);
      if (modelBlocks) {
        modelBlocks.forEach((mb: string) => {
          const m = mb.match(/(\w+)\s*:\s*\{([^}]+)\}/);
          if (m) {
            const fields: Record<string, { ts: string; sql: string }> = {};
            m[2].split(',').forEach((fv: string) => {
              // New format: fieldName: { ts: "type", sql: "SQLTYPE" }
              const newFmt = fv.trim().match(/(\w+)\s*:\s*\{\s*ts\s*:\s*"([^"]+)"\s*,\s*sql\s*:\s*"([^"]+)"\s*\}/);
              if (newFmt) {
                fields[newFmt[1]] = { ts: newFmt[2], sql: newFmt[3] };
                return;
              }
              // Legacy format: fieldName: "type"
              const oldFmt = fv.trim().match(/(\w+)\s*:\s*"([^"]+)"/);
              if (oldFmt) {
                const raw = oldFmt[2];
                const clean = raw.replace('?', '');
                const sqlType = mapLegacyTsToSql(clean);
                fields[oldFmt[1]] = { ts: raw, sql: sqlType };
              }
            });
            modelFields[m[1]] = fields;
          }
        });
      }
    }

    // Extract relationMap
    const rmMatch = cleaned.match(/export\s+const\s+relationMap[^=]+=\s*\{([\s\S]+?)\};/);
    const relationMap: Record<string, any> = {};
    if (rmMatch) {
      const block = rmMatch[1];
      const modelBlocks = block.match(/(\w+)\s*:\s*\{([^}]*)\}/g);
      if (modelBlocks) {
        modelBlocks.forEach((mb: string) => {
          const m = mb.match(/(\w+)\s*:\s*\{([^}]*)\}/);
          if (m) relationMap[m[1]] = {};
        });
      }
    }

    if (Object.keys(modelToTable).length > 0) {
      return { modelToTable, relationMap, modelFields };
    }
  } catch {}
  return null;
}

function mapLegacyTsToSql(tsType: string): string {
  const map: Record<string, string> = {
    string: 'NVARCHAR(255)',
    number: 'INT',
    boolean: 'BIT',
    Date: 'DATETIME2',
    bigint: 'BIGINT',
    Buffer: 'VARBINARY(MAX)',
  };
  return map[tsType] || 'NVARCHAR(MAX)';
}

export function loadMetadata(): Metadata | null {
  try {
    const clientDir = path.join(__dirname, '..', '..', '..', 'an5Client', 'typescript');
    const tsPath = path.join(clientDir, 'an5Metadata.ts');
    const jsPath = path.join(clientDir, 'an5Metadata.js');
    return tryLoadFromFile(jsPath) || tryLoadFromFile(tsPath);
  } catch {}
  return null;
}
