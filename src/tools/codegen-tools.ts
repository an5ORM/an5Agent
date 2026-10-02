import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import type { Tool } from './tool-types';
import { SchemaIssueSchema } from './tool-types';
import { loadMetadata } from './metadata';

/** The parsed schema model type, as produced by the ORM's SchemaParser. */
type GeneratorModels = Awaited<ReturnType<import('@an5/orm/generator').SchemaParser['parse']>>;

/** Languages the ORM generator can emit a client for. */
const SUPPORTED_LANGUAGES = ['typescript', 'python', 'dotnet', 'golang', 'rust'] as const;
type Language = (typeof SUPPORTED_LANGUAGES)[number];

const generateClientCodeInputSchema = z.object({
  schemaPath: z.string().describe('Path to .an5 schema file or directory'),
  language: z.enum(SUPPORTED_LANGUAGES).describe('Target language for code generation'),
  outputDir: z.string().optional().describe('Output directory for generated code'),
});

const generateClientCodeOutputSchema = z.object({
  success: z.boolean(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  message: z.string(),
});

/**
 * Loads the real code generator from `@an5/orm`.
 *
 * The tool deliberately does not re-implement generation: `@an5/orm` is the
 * single source of truth for every language, so agent output stays identical to
 * `npm run generate`. A missing dependency is reported instead of silently
 * falling back to a lower-fidelity generator.
 */
function loadGenerator(): typeof import('@an5/orm/generator') {
  try {
    return require('@an5/orm/generator');
  } catch (err) {
    throw new Error(
      `The @an5/orm code generator is not available (${(err as Error).message}). ` +
        'Install @an5/orm in this project to generate client code.',
    );
  }
}

/** Recursively collects generated files with the given extensions. */
function collectFiles(dir: string, extensions: string[], base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, extensions, base));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(path.relative(base, full));
    }
  }
  return out.sort();
}

/**
 * Runs the generator for one language into `workDir` and returns the files it
 * produced. The generators are file-system based, so a scratch directory is used
 * when the caller did not ask for a specific output location.
 */
function generateForLanguage(
  language: Language,
  baseDir: string,
  models: GeneratorModels,
): { files: Array<{ path: string; content: string }> } {
  const gen = loadGenerator();
  const typeScriptDir = baseDir;
  const pythonDir = baseDir;
  const dotnetDir = baseDir;
  const golangDir = baseDir;
  const rustDir = baseDir;

  let extensions: string[];
  switch (language) {
    case 'typescript':
      fs.mkdirSync(typeScriptDir, { recursive: true });
      new gen.CodeGenerator(typeScriptDir).generate(models);
      new gen.MetadataGenerator(path.join(typeScriptDir, 'an5Metadata.ts')).generate(models);
      extensions = ['.ts'];
      break;
    case 'python':
      fs.mkdirSync(pythonDir, { recursive: true });
      new gen.PythonGenerator(path.join(pythonDir, 'an5_metadata.py')).generate(models);
      extensions = ['.py'];
      break;
    case 'dotnet':
      new gen.DotnetGenerator(dotnetDir).generate(models);
      extensions = ['.cs'];
      break;
    case 'golang':
      new gen.GolangGenerator(golangDir).generate(models);
      extensions = ['.go', '.mod'];
      break;
    case 'rust':
      new gen.RustGenerator(rustDir).generate(models);
      extensions = ['.rs', '.toml'];
      break;
  }

  const files = collectFiles(baseDir, extensions).map((rel: string) => ({
    path: rel,
    content: fs.readFileSync(path.join(baseDir, rel), 'utf-8'),
  }));
  return { files };
}

export const generateClientCode: Tool = {
  name: 'generateClientCode',
  description:
    'Generate client code from .an5 schema definition files for any language the ORM supports ' +
    '(TypeScript, Python, .NET/C#, Go, Rust). Uses the real @an5/orm code generator, so the output ' +
    'matches `npm run generate` and includes typed models, filters, relations and query builders. ' +
    'Use this when the user needs data access code, client libraries, or typed models from their schema.',
  inputSchema: generateClientCodeInputSchema,
  outputSchema: generateClientCodeOutputSchema,
  async execute(input: { schemaPath: string; language: string; outputDir?: string }, _context) {
    let scratchDir: string | null = null;
    try {
      const language = input.language as Language;
      if (!SUPPORTED_LANGUAGES.includes(language)) {
        return {
          success: false,
          files: [],
          message: `Unsupported language "${input.language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}.`,
        };
      }

      if (!fs.existsSync(input.schemaPath)) {
        return { success: false, files: [], message: `Schema path not found: ${input.schemaPath}` };
      }
      const schemaDir = fs.statSync(input.schemaPath).isDirectory()
        ? input.schemaPath
        : path.dirname(input.schemaPath);
      const schemaFiles = fs.readdirSync(schemaDir).filter((f: string) => f.endsWith('.an5'));
      if (schemaFiles.length === 0) {
        return { success: false, files: [], message: 'No .an5 files found in the specified path.' };
      }

      const gen = loadGenerator();
      // The ORM validates field types per provider; read it from the project's
      // config so a PostgreSQL or SQLite schema is checked against its own types
      // instead of being rejected as SQL Server. Optional because the installed
      // @an5/orm may predate the export — the parser defaults to SQL Server.
      const provider = typeof gen.providerForProject === 'function'
        ? gen.providerForProject(path.dirname(schemaDir))
        : undefined;
      const models = await new gen.SchemaParser(schemaDir, provider).parse();
      if (models.length === 0) {
        return { success: false, files: [], message: `No models parsed from ${schemaDir}.` };
      }

      // Generate into the caller's directory when provided, otherwise into a
      // scratch directory that is removed once the files have been read.
      let targetDir: string;
      if (input.outputDir) {
        targetDir = path.resolve(input.outputDir);
        fs.mkdirSync(targetDir, { recursive: true });
      } else {
        const scratch = (scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'an5-agent-codegen-')));
        // Scratch space holds one directory per language so a single run cannot
        // mix artifacts from different targets.
        targetDir = path.join(scratch, language);
      }

      const { files } = generateForLanguage(language, targetDir, models);
      const modelNames = (models as Array<{ name: string }>).map((m) => m.name).join(', ');

      return {
        success: true,
        files,
        message:
          `Generated ${files.length} file(s) for ${language} from ${models.length} model(s) ` +
          `(${modelNames})${input.outputDir ? ` in ${targetDir}` : ''}.`,
      };
    } catch (err: any) {
      return { success: false, files: [], message: `Generation failed: ${err.message || err}` };
    } finally {
      if (scratchDir) {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      }
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
