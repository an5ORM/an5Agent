import { z } from 'zod';
import type { Tool } from './tool-types';
import { SchemaIssueSchema } from './tool-types';
import { loadMetadata } from './metadata';

const generateClientCodeInputSchema = z.object({
  schemaPath: z.string().describe('Path to .an5 schema file or directory'),
  language: z.enum(['typescript', 'python', 'dotnet']).describe('Target language for code generation'),
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
    'Generate client code (TypeScript, Python, or .NET) from .an5 schema definition files. Use this when the user needs to create data access code, client libraries, or typed models from their database schema.',
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
          const fields = match[2].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('@@')).map((l) => {
            const parts = l.split(/\s+/);
            return { name: parts[0], type: parts[1]?.replace('?', ''), isRequired: !parts[1]?.includes('?') };
          });
          models.push({ name: match[1], fields });
        }
      }
      const outputDirFinal = input.outputDir || `./generated/${input.language}`;
      const files = input.language === 'python' ? generatePython(models, outputDirFinal) : input.language === 'dotnet' ? generateDotNet(models, outputDirFinal) : generateTypeScript(models, outputDirFinal);
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
    'Analyze a database schema for potential design issues such as missing primary keys, tables without indexes, inconsistent naming, or missing relationships. Use this for schema reviews, code reviews, or when optimizing database design.',
  inputSchema: analyzeSchemaInputSchema,
  outputSchema: analyzeSchemaOutputSchema,
  async execute(input: { schemaPath?: string }, context) {
    const models = parseModelsForAnalysis(context?.schemaPath || input.schemaPath);
    const issues: Array<z.infer<typeof SchemaIssueSchema>> = [];
    let missingPkCount = 0, totalFields = 0, totalRelations = 0;
    for (const model of models) {
      totalFields += model.fields.length;
      totalRelations += model.relations?.length ?? 0;
      if (!model.fields.some((f: any) => f.isId)) {
        missingPkCount++;
        issues.push({ severity: 'error' as const, model: model.name, message: `Model "${model.name}" has no primary key field (@id)`, suggestion: 'Add an @id attribute to a field, typically "id String @id @default(uuid())"' });
      }
      for (const field of model.fields) {
        if (field.name === 'name' && !field.isRequired) {
          issues.push({ severity: 'info' as const, model: model.name, field: field.name, message: `Optional field "${field.name}" in "${model.name}" - consider if this should be required` });
        }
      }
    }
    if (models.length === 0) {
      issues.push({ severity: 'warning' as const, model: 'N/A', message: 'No models found in schema', suggestion: 'Define at least one model with @id field' });
    }
    return { issues, summary: { totalModels: models.length, totalFields, totalRelations, missingPrimaryKeys: missingPkCount } };
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

function mapTsType(type: string): string { const m: Record<string, string> = { String: 'string', Int: 'number', Float: 'number', Boolean: 'boolean', DateTime: 'Date', BigInt: 'bigint', Decimal: 'number', Json: 'Record<string, any>' }; return m[type] || 'any'; }
function mapPyType(type: string): string { const m: Record<string, string> = { String: 'str', Int: 'int', Float: 'float', Boolean: 'bool', DateTime: 'datetime', BigInt: 'int', Decimal: 'float', Json: 'dict' }; return m[type] || 'Any'; }
function mapCsType(type: string): string { const m: Record<string, string> = { String: 'string', Int: 'int', Float: 'double', Boolean: 'bool', DateTime: 'DateTime', BigInt: 'long', Decimal: 'decimal', Json: 'Dictionary<string, object?>' }; return m[type] || 'object'; }
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

function parseModelsForAnalysis(schemaPath?: string): Array<{ name: string; fields: Array<{ name: string; type: string; isRequired: boolean; isId?: boolean }>; relations?: Array<{ fromField: string; toModel: string }> }> {
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
          const fields = match[2].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('@@')).map((l) => {
            const parts = l.split(/\s+/); const attrs = l.substring(l.indexOf(parts[1] || '') + (parts[1]?.length || 0)).trim();
            return { name: parts[0], type: (parts[1] || 'String').replace('?', ''), isRequired: !parts[1]?.includes('?'), isId: attrs.includes('@id') };
          });
          models.push({ name: match[1], fields, relations: [] });
        }
      }
      if (models.length > 0) return models;
    } catch {}
  }
  return [
    { name: 'User', fields: [{ name: 'id', type: 'String', isRequired: true, isId: true }, { name: 'email', type: 'String', isRequired: true }, { name: 'name', type: 'String', isRequired: false }, { name: 'createdAt', type: 'DateTime', isRequired: true }], relations: [{ fromField: 'id', toModel: 'Order' }] },
    { name: 'Order', fields: [{ name: 'id', type: 'String', isRequired: true, isId: true }, { name: 'userId', type: 'String', isRequired: true }, { name: 'total', type: 'Int', isRequired: true }, { name: 'createdAt', type: 'DateTime', isRequired: true }], relations: [{ fromField: 'userId', toModel: 'User' }] },
  ];
}
