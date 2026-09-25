import { z } from 'zod';
import type { Tool } from './tool-types';
import { ModelSchema } from './tool-types';
import { loadMetadata } from './metadata';

const schemaInputSchema = z.object({
  action: z.enum(['list', 'describe', 'relations']).describe('Action to perform'),
  schemaPath: z.string().optional().describe('Path to .an5 schema file or directory'),
  modelName: z.string().optional().describe('Model name (required for describe, optional for relations)'),
});

const schemaOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list'),
    models: z.array(
      z.object({
        name: z.string(),
        schema: z.string().optional(),
        fieldCount: z.number(),
        relationCount: z.number(),
      })
    ),
    totalModels: z.number(),
  }),
  z.object({
    action: z.literal('describe'),
    model: ModelSchema.nullable(),
    found: z.boolean(),
  }),
  z.object({
    action: z.literal('relations'),
    relations: z.array(
      z.object({
        fromModel: z.string(),
        fromField: z.string(),
        toModel: z.string(),
        toField: z.string(),
        type: z.enum(['one-to-many', 'many-to-one', 'one-to-one', 'many-to-many']),
      })
    ),
  }),
]);

export const schemaTool: Tool = {
  name: 'schema',
  description:
    'Explore data models and schema structure. Actions: list (all models), describe (model details), relations (foreign keys).',
  inputSchema: schemaInputSchema,
  outputSchema: schemaOutputSchema,
  async execute(input: z.infer<typeof schemaInputSchema>, context) {
    const models = parseModels(context?.schemaPath || input.schemaPath);

    switch (input.action) {
      case 'list': {
        return {
          action: 'list' as const,
          models: models.map((m) => ({
            name: m.name,
            schema: m.schema,
            fieldCount: m.fields.length,
            relationCount: m.relations?.length ?? 0,
          })),
          totalModels: models.length,
        };
      }
      case 'describe': {
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
        return { action: 'describe' as const, model, found: model !== null };
      }
      case 'relations': {
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
          ? allRelations.filter((r) => r.fromModel === input.modelName || r.toModel === input.modelName)
          : allRelations;
        return { action: 'relations' as const, relations };
      }
    }
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
  const metadata = loadMetadata();
  if (metadata) {
    const { modelToTable, modelFields } = metadata;
    return Object.entries(modelToTable).map(([modelName]) => {
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
    const name = match[1] ?? '';
    const body = match[2];
    if (body === undefined) continue;
    const fields: any[] = [];
    const relations: any[] = [];
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('//') || line.startsWith('@@')) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const fieldName = parts[0] ?? '';
      const fieldType = parts[1] ?? '';
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
