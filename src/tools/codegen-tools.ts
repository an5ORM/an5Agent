import { z } from 'zod';
import type { Tool } from './tool-types';
import { SchemaIssueSchema } from './tool-types';
import { loadMetadata } from './metadata';

const generateClientCodeInputSchema = z.object({
  schemaPath: z.string().describe('Path to .an5 schema file or directory'),
  language: z.enum(['typescript', 'python', 'dotnet', 'golang', 'rust']).describe('Target language for code generation'),
  outputDir: z.string().optional().describe('Output directory for generated code'),
});

const generateClientCodeOutputSchema = z.object({
  success: z.boolean(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  message: z.string(),
});

export const generateClientCode: Tool = {
  name: 'generateClientCode',
  description:
    'Generate client code (TypeScript, Python, .NET, Go, or Rust) from .an5 schema definition files. Use this when the user needs to create data access code, client libraries, or typed models from their database schema.',
  inputSchema: generateClientCodeInputSchema,
  outputSchema: generateClientCodeOutputSchema,
  async execute(input: { schemaPath: string; language: string; outputDir?: string }, _context) {
    try {
      const fs = require('fs');
      const path = require('path');
      const schemaDir = fs.statSync(input.schemaPath).isDirectory() ? input.schemaPath : path.dirname(input.schemaPath);
      const schemaFiles = fs.readdirSync(schemaDir).filter((f: string) => f.endsWith('.an5'));
      if (schemaFiles.length === 0) {
        return { success: false, files: [], message: 'No .an5 files found in the specified path.' };
      }
      const models: Array<{ name: string; fields: Array<{ name: string; type: string; isRequired: boolean }> }> = [];
      for (const file of schemaFiles) {
        const content = fs.readFileSync(path.join(schemaDir, file), 'utf-8');
        const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
        let match;
        while ((match = modelRegex.exec(content)) !== null) {
          const modelName = match[1] ?? '';
          const fields = (match[2] ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('@@')).map((l) => {
            const parts = l.split(/\s+/);
            const name = parts[0] ?? '';
            const rawType = parts[1] ?? '';
            return { name, type: rawType.replace('?', ''), isRequired: !rawType.includes('?') };
          });
          models.push({ name: modelName, fields });
        }
      }
      const outputDirFinal = input.outputDir || `./generated/${input.language}`;
      const files = input.language === 'python' ? generatePython(models, outputDirFinal) : input.language === 'dotnet' ? generateDotNet(models, outputDirFinal) : input.language === 'golang' ? generateGolang(models, outputDirFinal) : input.language === 'rust' ? generateRust(models, outputDirFinal) : generateTypeScript(models, outputDirFinal);
      return { success: true, files, message: `Generated ${files.length} file(s) for ${input.language} in ${outputDirFinal}` };
    } catch (err: any) {
      return { success: false, files: [], message: `Generation failed: ${err.message || err}` };
    }
  },
};

const analyzeSchemaInputSchema = z.object({
  schemaPath: z.string().optional().describe('Path to .an5 schema file or directory'),
});

const analyzeSchemaOutputSchema = z.object({
  issues: z.array(SchemaIssueSchema),
  summary: z.object({ totalModels: z.number(), totalFields: z.number(), totalRelations: z.number(), missingPrimaryKeys: z.number(), missingIndexes: z.number().optional() }),
});

export const analyzeSchema: Tool = {
  name: 'analyzeSchema',
  description:
    'Analyze a database schema for design issues such as missing primary keys, unindexed foreign key fields, missing audit timestamps, unindexed unique candidates, and naming convention violations. Use this for schema reviews and database optimization.',
  inputSchema: analyzeSchemaInputSchema,
  outputSchema: analyzeSchemaOutputSchema,
  async execute(input: { schemaPath?: string }, context) {
    const models = parseModelsForAnalysis(context?.schemaPath || input.schemaPath);
    const issues: Array<z.infer<typeof SchemaIssueSchema>> = [];
    let missingPkCount = 0, missingIndexCount = 0, totalFields = 0, totalRelations = 0;

    for (const model of models) {
      totalFields += model.fields.length;
      totalRelations += model.relations?.length ?? 0;

      // Rule 1: Check Primary Key (@id)
      if (!model.fields.some((f: any) => f.isId)) {
        missingPkCount++;
        issues.push({
          severity: 'error' as const,
          model: model.name,
          category: 'pk',
          message: `Model "${model.name}" has no primary key field (@id)`,
          suggestion: 'Add an @id attribute to a primary key field',
          autoFixSql: `id String @id @default(uuid())`,
        });
      }

      // Rule 2: Naming Conventions (PascalCase for Model)
      const firstChar = model.name[0];
      if (model.name && firstChar !== undefined && firstChar !== firstChar.toUpperCase()) {
        issues.push({
          severity: 'warning' as const,
          model: model.name,
          category: 'naming',
          message: `Model name "${model.name}" should use PascalCase`,
          suggestion: `Rename model "${model.name}" to "${model.name.charAt(0).toUpperCase() + model.name.slice(1)}"`,
        });
      }

      // Rule 3: Check Audit Timestamps
      const hasCreatedAt = model.fields.some((f: any) => f.name === 'createdAt' || f.name === 'created_at');
      if (!hasCreatedAt) {
        issues.push({
          severity: 'info' as const,
          model: model.name,
          category: 'audit',
          message: `Model "${model.name}" lacks a "createdAt" audit timestamp`,
          suggestion: 'Add a createdAt DateTime @default(now()) field to track record creation time',
          autoFixSql: `createdAt DateTime @default(now())`,
        });
      }

      for (const field of model.fields) {
        // Rule 4: Foreign Key Indexing (*Id fields or relation references)
        const isFkCandidate = (field.name.endsWith('Id') && field.name !== 'id') || field.isFk;
        if (isFkCandidate && !field.isIndexed && !model.indexes?.includes(field.name)) {
          missingIndexCount++;
          issues.push({
            severity: 'warning' as const,
            model: model.name,
            field: field.name,
            category: 'index',
            message: `Foreign key field "${field.name}" in "${model.name}" is not indexed`,
            suggestion: `Add an @index or @@index([${field.name}]) attribute to improve query JOIN performance`,
            autoFixSql: `@@index([${field.name}])`,
          });
        }

        // Rule 5: Unique Candidates (email, username, slug, code, sku)
        const uniqueCandidates = ['email', 'username', 'slug', 'sku', 'code'];
        if (uniqueCandidates.includes(field.name.toLowerCase()) && !field.isUnique && !field.isId) {
          issues.push({
            severity: 'warning' as const,
            model: model.name,
            field: field.name,
            category: 'unique',
            message: `Candidate unique field "${field.name}" in "${model.name}" lacks @unique attribute`,
            suggestion: `Consider adding @unique to enforce uniqueness on "${field.name}"`,
            autoFixSql: `${field.name} ${field.type} @unique`,
          });
        }
      }
    }

    if (models.length === 0) {
      issues.push({
        severity: 'warning' as const,
        model: 'N/A',
        category: 'empty',
        message: 'No models found in schema',
        suggestion: 'Define at least one model with @id field',
      });
    }

    return {
      issues,
      summary: {
        totalModels: models.length,
        totalFields,
        totalRelations,
        missingPrimaryKeys: missingPkCount,
        missingIndexes: missingIndexCount,
      },
    };
  },
};

function generateTypeScript(models: Array<{ name: string; fields: Array<{ name: string; type: string; isRequired: boolean }> }>, outputDir: string) {
  const types = models.map((m) => {
    const fields = m.fields.map((f) => `  ${f.name}${f.isRequired ? '' : '?'}: ${mapTsType(f.type)};`).join('\n');
    return `export interface ${m.name} {\n${fields}\n}`;
  });
  return [{ path: `${outputDir}/index.ts`, content: `// Auto-generated by an5Agent\n\n${types.join('\n\n')}\n` }];
}

function generatePython(models: Array<{ name: string; fields: Array<{ name: string; type: string; isRequired: boolean }> }>, outputDir: string) {
  const classes = models.map((m) => {
    const fields = m.fields.map((f) => `    ${f.name}: ${mapPyType(f.type)}${f.isRequired ? '' : ' = None'}`).join('\n');
    return `@dataclass\nclass ${m.name}:\n${fields}`;
  });
  return [{ path: `${outputDir}/models.py`, content: `# Auto-generated by an5Agent\nfrom dataclasses import dataclass\nfrom datetime import datetime\nfrom typing import Optional, Any\n\n${classes.join('\n\n')}\n` }];
}

function generateDotNet(models: Array<{ name: string; fields: Array<{ name: string; type: string; isRequired: boolean }> }>, outputDir: string) {
  return models.map((m) => ({
    path: `${outputDir}/${m.name}.cs`,
    content: `// Auto-generated by an5Agent\nnamespace An5Client.Models\n{\n    public class ${m.name}\n    {\n${m.fields.map((f) => `        public ${mapCsType(f.type)} ${capitalize(f.name)} { get; set; }`).join('\n')}\n    }\n}\n`,
  }));
}

function generateGolang(models: Array<{ name: string; fields: Array<{ name: string; type: string; isRequired: boolean }> }>, outputDir: string) {
  const structs = models.map((m) => {
    const fields = m.fields.map((f) => `\t${capitalize(f.name)} ${mapGoType(f.type)} \`json:"${f.name}"\``).join('\n');
    return `type ${m.name} struct {\n${fields}\n}`;
  });
  return [{ path: `${outputDir}/models.go`, content: `// Auto-generated by an5Agent\npackage an5client\n\n${structs.join('\n\n')}\n` }];
}

function generateRust(models: Array<{ name: string; fields: Array<{ name: string; type: string; isRequired: boolean }> }>, outputDir: string) {
  const structs = models.map((m) => {
    const fields = m.fields.map((f) => `    pub ${toSnake(f.name)}: ${mapRsType(f.type, !f.isRequired)},`).join('\n');
    return `#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]\npub struct ${m.name} {\n${fields}\n}`;
  });
  return [{ path: `${outputDir}/src/models.rs`, content: `//! Auto-generated by an5Agent\nuse chrono::{DateTime, Utc};\n\n${structs.join('\n\n')}\n` }];
}

function toSnake(s: string): string { return s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase(); }

function mapTsType(type: string): string { const m: Record<string, string> = { String: 'string', Int: 'number', Float: 'number', Boolean: 'boolean', DateTime: 'Date', BigInt: 'bigint', Decimal: 'number', Json: 'Record<string, any>' }; return m[type] || 'any'; }
function mapPyType(type: string): string { const m: Record<string, string> = { String: 'str', Int: 'int', Float: 'float', Boolean: 'bool', DateTime: 'datetime', BigInt: 'int', Decimal: 'float', Json: 'dict' }; return m[type] || 'Any'; }
function mapCsType(type: string): string { const m: Record<string, string> = { String: 'string', Int: 'int', Float: 'double', Boolean: 'bool', DateTime: 'DateTime', BigInt: 'long', Decimal: 'decimal', Json: 'Dictionary<string, object?>' }; return m[type] || 'object'; }
function mapGoType(type: string): string { const m: Record<string, string> = { String: 'string', Int: 'int', Float: 'float64', Boolean: 'bool', DateTime: 'time.Time', BigInt: 'int64', Decimal: 'float64', Json: 'string' }; return m[type] || 'string'; }
function mapRsType(type: string, optional: boolean): string { const m: Record<string, string> = { String: 'String', Int: 'i32', Float: 'f64', Boolean: 'bool', DateTime: 'DateTime<Utc>', BigInt: 'i64', Decimal: 'f64', Json: 'String' }; const t = m[type] || 'String'; return optional ? `Option<${t}>` : t; }
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function defaultSchemaPath(): string | undefined {
  const path = require('path');
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'an5Schema'),
    path.join(process.cwd(), 'an5Schema'),
    path.join(process.cwd(), 'schema'),
  ];
  try {
    const fs = require('fs');
    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.an5'));
        if (files.length > 0) return dir;
      }
    }
  } catch {}
  return undefined;
}

function parseModelsForAnalysis(schemaPath?: string): Array<{
  name: string;
  indexes?: string[];
  fields: Array<{
    name: string;
    type: string;
    isRequired: boolean;
    isId?: boolean;
    isUnique?: boolean;
    isIndexed?: boolean;
    isFk?: boolean;
  }>;
  relations?: Array<{ fromField: string; toModel: string }>;
}> {
  // Try loading from an5Client metadata first
  const metadata = loadMetadata();
  if (metadata) {
    const { modelToTable, modelFields, relationMap } = metadata;
    const modelsResult = Object.entries(modelToTable).map(([modelName]) => {
      const fields = modelFields[modelName] || {};
      const fieldList = Object.entries(fields).map(([fieldName, fieldDef]: [string, any]) => {
        const ts = typeof fieldDef === 'string' ? fieldDef : (fieldDef?.ts || '');
        const cleanTs = ts.replace('?', '');
        return {
          name: fieldName,
          type: cleanTs,
          isRequired: !ts.endsWith('?'),
          isId: fieldName === 'id',
          isUnique: fieldName === 'email' || fieldName === 'username',
          isIndexed: fieldName === 'id',
          isFk: fieldName.endsWith('Id') && fieldName !== 'id',
        };
      });
      const rels = Object.entries(relationMap)
        .filter(([k]) => k.startsWith(modelName + '.'))
        .map(([k, v]: [string, any]) => ({ fromField: k.split('.')[1] || k, toModel: String(v.targetModel || v) }));
      const normalizedName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
      return { name: normalizedName, fields: fieldList, relations: rels };
    });
    if (modelsResult.length > 0) return modelsResult;
  }
  const target = schemaPath || defaultSchemaPath();
  if (target) {
    try {
      const fs = require('fs'); const path = require('path');
      const fullPath = path.resolve(target);
      const stat = fs.statSync(fullPath);
      const files = stat.isDirectory() ? fs.readdirSync(fullPath).filter((f: string) => f.endsWith('.an5')) : [path.basename(fullPath)];
      const models: any[] = [];
      for (const file of files) {
        const dir = stat.isDirectory() ? fullPath : path.dirname(fullPath);
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g; let match;
        while ((match = modelRegex.exec(content)) !== null) {
          const body = match[2];
          if (body === undefined) continue;
          const modelIndexes: string[] = [];
          const idxMatch = body.match(/@@index\(\[([^\]]+)\]\)/);
          if (idxMatch?.[1]) {
            modelIndexes.push(...idxMatch[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')));
          }
          const fields = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('@@')).map((l) => {
            const parts = l.split(/\s+/);
            const partName = parts[0] ?? '';
            const rawType = parts[1];
            const attrs = l.substring(l.indexOf(rawType ?? '') + (rawType?.length ?? 0)).trim();
            const isId = attrs.includes('@id');
            const isUnique = attrs.includes('@unique');
            const isIndexed = attrs.includes('@index') || modelIndexes.includes(partName);
            const isFk = (partName.endsWith('Id') && partName !== 'id') || attrs.includes('@relation');
            return {
              name: partName,
              type: (rawType ?? 'String').replace('?', ''),
              isRequired: !(rawType ?? '').includes('?'),
              isId,
              isUnique,
              isIndexed,
              isFk,
            };
          });
          models.push({ name: match[1] ?? '', indexes: modelIndexes, fields, relations: [] });
        }
      }
      if (models.length > 0) return models;
    } catch {}
  }
  return [
    { name: 'User', fields: [{ name: 'id', type: 'String', isRequired: true, isId: true }, { name: 'email', type: 'String', isRequired: true, isUnique: true }, { name: 'name', type: 'String', isRequired: false }, { name: 'createdAt', type: 'DateTime', isRequired: true }], relations: [{ fromField: 'id', toModel: 'Order' }] },
    { name: 'Order', fields: [{ name: 'id', type: 'String', isRequired: true, isId: true }, { name: 'userId', type: 'String', isRequired: true, isFk: true }, { name: 'total', type: 'Int', isRequired: true }, { name: 'createdAt', type: 'DateTime', isRequired: true }], relations: [{ fromField: 'userId', toModel: 'User' }] },
  ];
}
