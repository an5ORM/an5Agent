import { z } from 'zod';
import type { Tool } from './tool-types';
import { ModelSchema } from './tool-types';
import { loadMetadata } from './metadata';

const listModelsInputSchema = z.object({
  schemaPath: z.string().optional().describe('Path to .an5 schema file or directory'),
});

const listModelsOutputSchema = z.object({
  models: z.array(
    z.object({
      name: z.string().describe('Model name'),
      schema: z.string().optional().describe('Database schema'),
      fieldCount: z.number().describe('Number of fields'),
      relationCount: z.number().describe('Number of relations'),
    })
  ),
  totalModels: z.number(),
});

export const listModels: Tool = {
  name: 'listModels',
  description:
    'List all models/tables defined in the schema. Use this when the user asks what tables exist, what models are available, or to get an overview of the database structure.',
  inputSchema: listModelsInputSchema,
  outputSchema: listModelsOutputSchema,
  async execute(input: { schemaPath?: string }, context) {
    const models = parseModels(context?.schemaPath || input.schemaPath);
    return {
      models: models.map((m) => ({
        name: m.name,
        schema: m.schema,
        fieldCount: m.fields.length,
        relationCount: m.relations?.length ?? 0,
      })),
      totalModels: models.length,
    };
  },
};

const describeModelInputSchema = z.object({
  modelName: z.string().describe('Name of the model to describe (case-sensitive)'),
  schemaPath: z.string().optional().describe('Path to .an5 schema file or directory'),
});

const describeModelOutputSchema = z.object({
  model: ModelSchema.nullable(),
  found: z.boolean(),
});

export const describeModel: Tool = {
  name: 'describeModel',
  description:
    'Get detailed information about a specific model including all its fields, types, constraints, and relations. Use this when the user asks about a specific table structure, columns, or relationships.',
  inputSchema: describeModelInputSchema,
  outputSchema: describeModelOutputSchema,
  async execute(input: { modelName: string; schemaPath?: string }, context) {
    const models = parseModels(context?.schemaPath || input.schemaPath);
    const raw = models.find((m) => m.name === input.modelName) ?? null;
    const model = raw
      ? {
          ...raw,
          relations: raw.relations?.map((r: any) => ({
            ...r,
            type: r.type as 'one-to-many' | 'many-to-one' | 'one-to-one' | 'many-to-many',
          })),
        }
      : null;
    return { model, found: model !== null };
  },
};

const getRelationsInputSchema = z.object({
  modelName: z.string().optional().describe('Optional: filter relations for a specific model'),
  schemaPath: z.string().optional().describe('Path to .an5 schema file or directory'),
});

const getRelationsOutputSchema = z.object({
  relations: z.array(
    z.object({
      fromModel: z.string(),
      fromField: z.string(),
      toModel: z.string(),
      toField: z.string(),
      type: z.enum(['one-to-many', 'many-to-one', 'one-to-one', 'many-to-many']),
    })
  ),
});

export const getRelations: Tool = {
  name: 'getRelations',
  description:
    'Get all relationships between models in the schema. Optionally filter by a specific model. Use this for understanding foreign key relationships, joining tables, or navigating related data.',
  inputSchema: getRelationsInputSchema,
  outputSchema: getRelationsOutputSchema,
  async execute(input: { modelName?: string; schemaPath?: string }, context) {
    const models = parseModels(context?.schemaPath || input.schemaPath);
    const allRelations = models.flatMap((m) =>
      (m.relations ?? []).map((r: any) => ({
        fromModel: m.name,
        fromField: r.fromField,
        toModel: r.toModel,
        toField: r.toField,
        type: r.type as 'one-to-many' | 'many-to-one' | 'one-to-one' | 'many-to-many',
      }))
    );
    const relations = input.modelName
      ? allRelations.filter((r: any) => r.fromModel === input.modelName || r.toModel === input.modelName)
      : allRelations;
    return { relations };
  },
};

function parseModels(schemaPath?: string): Array<{
  name: string;
  schema?: string;
  fields: Array<{
    name: string;
    type: string;
    isRequired: boolean;
    isUnique?: boolean;
    isId?: boolean;
    hasDefault?: boolean;
    dbType?: string;
    relation?: string;
  }>;
  relations?: Array<{
    fromField: string;
    toModel: string;
    toField: string;
    type: string;
  }>;
}> {
  // Try loading from an5Client metadata first
  const metadata = loadMetadata();
  if (metadata) {
    const { modelToTable, modelFields } = metadata;
    return Object.entries(modelToTable).map(([modelName, tableName]) => {
      const fields = modelFields[modelName] || {};
      const fieldList = Object.entries(fields).map(([fieldName, fieldDef]: [string, any]) => {
        const ts = typeof fieldDef === 'string' ? fieldDef : (fieldDef?.ts || '');
        const sql = typeof fieldDef === 'string' ? '' : (fieldDef?.sql || '');
        return {
          name: fieldName,
          type: ts,
          sqlType: sql,
          isRequired: !ts.endsWith('?'),
          isId: fieldName === 'id',
          hasDefault: fieldName === 'id' || fieldName === 'createdAt',
        };
      });
      const normalizedName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
      return { name: normalizedName, schema: 'dbo', fields: fieldList };
    });
  }

  // Fallback: parse .an5 files directly
  const target = schemaPath || defaultSchemaPath();
  if (target) {
    try {
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.resolve(target);
      const stat = fs.statSync(fullPath);
      const files = stat.isDirectory()
        ? fs.readdirSync(fullPath).filter((f: string) => f.endsWith('.an5'))
        : [path.basename(fullPath)];
      const allModels: any[] = [];
      for (const file of files) {
        const dir = stat.isDirectory() ? fullPath : path.dirname(fullPath);
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        allModels.push(...parseAn5Content(content));
      }
      if (allModels.length > 0) return allModels;
    } catch {}
  }
  return sampleModels();
}

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

function parseAn5Content(content: string): Array<{
  name: string;
  schema?: string;
  fields: any[];
  relations?: any[];
}> {
  const models: Array<{ name: string; schema?: string; fields: any[]; relations?: any[] }> = [];
  const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let match;
  while ((match = modelRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: any[] = [];
    const relations: any[] = [];
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('//') || line.startsWith('@@')) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const fieldName = parts[0];
      const fieldType = parts[1];
      const attrs = line.substring(line.indexOf(fieldType) + fieldType.length).trim();
      const isId = attrs.includes('@id');
      const isUnique = attrs.includes('@unique');
      const hasDefault = attrs.includes('@default');
      const dbMatch = attrs.match(/@db\.(\w+)/);
      const dbType = dbMatch ? dbMatch[1] : undefined;
      const relMatch = line.match(/(\w+)\s+(\w+)\s+@relation\(/);
      if (relMatch) {
        relations.push({
          fromField: relMatch[1],
          toModel: relMatch[2],
          toField: 'id',
          type: 'many-to-one',
        });
      }
      fields.push({
        name: fieldName,
        type: fieldType,
        isRequired: !fieldType.endsWith('?'),
        isUnique,
        isId,
        hasDefault,
        dbType,
        relation: relMatch ? relMatch[2] : undefined,
      });
    }
    models.push({ name, fields, relations });
  }
  return models;
}

function sampleModels() {
  return [
    {
      name: 'User',
      schema: 'dbo',
      fields: [
        { name: 'id', type: 'String', isRequired: true, isId: true, hasDefault: true, dbType: 'NVarChar(1000)' },
        { name: 'email', type: 'String', isRequired: true, isUnique: true, dbType: 'NVarChar(255)' },
        { name: 'name', type: 'String', isRequired: false, dbType: 'NVarChar(255)' },
        { name: 'createdAt', type: 'DateTime', isRequired: true, hasDefault: true, dbType: 'DateTime2' },
      ],
      relations: [
        { fromField: 'id', toModel: 'Order', toField: 'userId', type: 'one-to-many' },
      ],
    },
    {
      name: 'Order',
      schema: 'dbo',
      fields: [
        { name: 'id', type: 'String', isRequired: true, isId: true, hasDefault: true, dbType: 'NVarChar(1000)' },
        { name: 'userId', type: 'String', isRequired: true, dbType: 'NVarChar(1000)' },
        { name: 'total', type: 'Int', isRequired: true, hasDefault: true, dbType: 'Int' },
        { name: 'createdAt', type: 'DateTime', isRequired: true, hasDefault: true, dbType: 'DateTime2' },
      ],
      relations: [
        { fromField: 'userId', toModel: 'User', toField: 'id', type: 'many-to-one' },
      ],
    },
  ];
}
