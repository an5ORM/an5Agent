import fs from 'fs';
import path from 'path';
import { Document } from 'genkit';
import { getAi, schemaIndexer, schemaRetriever, queryIndexer, queryRetriever } from './index';

export interface ModelBlock {
  modelName: string;
  tableName: string;
  schema?: string | undefined;
  text: string;
  description?: string;
  fields: Array<{
    name: string;
    type: string;
    attributes?: string;
    description?: string;
    isId?: boolean;
    isUnique?: boolean;
    hasDefault?: boolean;
  }>;
  relations: Array<{
    name: string;
    target: string;
    foreignKey?: string;
    localKey?: string;
    description?: string;
    isArray?: boolean;
  }>;
}

/**
 * Parses a `.an5` schema with `@an5/orm`'s own SchemaParser.
 *
 * The ORM owns the syntax, so indexing through it keeps the retrieved context
 * identical to what the code generators see. Returns undefined when the
 * package is not installed, so a workspace without it still gets indexed by
 * the fallback below.
 *
 * The provider comes from the project's config: the ORM validates field types
 * per database, so parsing as SQL Server would reject a PostgreSQL or SQLite
 * schema and quietly drop this file from the index.
 */
async function parseWithOrmGenerator(schemaDir: string): Promise<ModelBlock[] | undefined> {
  if (!fs.existsSync(schemaDir)) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const gen = require('@an5/orm/generator');
    const provider = gen.providerForProject(path.dirname(schemaDir));
    const models = await new gen.SchemaParser(schemaDir, provider).parse();
    if (!models || models.length === 0) return undefined;

    return models.map((m: any) => ({
      modelName: m.name,
      tableName: m.tableName,
      schema: m.schemaName,
      text: '',
      ...(m.description ? { description: m.description } : {}),
      fields: m.fields.map((f: any) => ({
        name: f.name,
        type: f.type,
        ...(f.isId ? { isId: true } : {}),
        ...(f.isUnique ? { isUnique: true } : {}),
        ...(f.hasDefault ? { hasDefault: true } : {}),
        ...(f.description ? { description: f.description } : {}),
      })),
      relations: m.relations.map((r: any) => ({
        name: r.name,
        target: r.type,
        ...(r.foreignKey ? { foreignKey: r.foreignKey } : {}),
        ...(r.localKey ? { localKey: r.localKey } : {}),
        ...(r.isArray ? { isArray: true } : {}),
        ...(r.description ? { description: r.description } : {}),
      })),
    }));
  } catch {
    return undefined;
  }
}

/**
 * Reads a schema directory into model blocks.
 *
 * Prefers the ORM parser and falls back to a local reader for a workspace
 * where `@an5/orm` is not installed.
 */
export async function parseAn5Schema(schemaDir: string): Promise<ModelBlock[]> {
  if (!fs.existsSync(schemaDir)) return [];

  const viaGenerator = await parseWithOrmGenerator(schemaDir);
  if (viaGenerator) return viaGenerator;

  return parseAn5SchemaLocally(schemaDir);
}

/** Minimal `.an5` reader used when `@an5/orm` is not installed. */
function parseAn5SchemaLocally(schemaDir: string): ModelBlock[] {
  const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.an5'));
  const models: ModelBlock[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let match;
    while ((match = modelRegex.exec(content)) !== null) {
      const modelName = match[1];
      const block = match[2];
      if (modelName === undefined || block === undefined) continue;

      let tableName = modelName.toLowerCase() + 's';
      const mapMatch = block.match(/@@map\("(.+?)"\)/);
      if (mapMatch?.[1]) tableName = mapMatch[1];

      let schema: string | undefined;
      const schemaMatch = block.match(/@@schema\("(.+?)"\)/);
      if (schemaMatch?.[1]) schema = schemaMatch[1];

      const modelDescription = block.match(/@@description\("(.+?)"\)/)?.[1];
      const fields: ModelBlock['fields'] = [];
      const relations: ModelBlock['relations'] = [];
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('@@') || line.startsWith('//')) continue;
        const parts = line.split(/\s+/);
        const fieldName = parts[0];
        const fieldType = parts[1];
        if (!fieldName || !fieldType) continue;
        const attrs = line.substring(line.indexOf(fieldType) + fieldType.length).trim();
        const lineDescription = line.match(/@description\("(.+?)"\)/)?.[1];
        const isArray = fieldType.endsWith('[]');
        const baseType = fieldType.replace('[]', '').replace('?', '');

        // A line whose type is another model is a relation, not a field.
        if (isArray || /^[A-Z]/.test(baseType) || attrs.includes('@relation(')) {
          relations.push({
            name: fieldName,
            target: baseType,
            ...(isArray ? { isArray: true } : {}),
            // exactOptionalPropertyTypes: only set the keys when present.
            ...(line.match(/fields:\s*\[(\w+)\]/)?.[1]
              ? { foreignKey: line.match(/fields:\s*\[(\w+)\]/)?.[1] as string }
              : {}),
            ...(line.match(/references:\s*\[(\w+)\]/)?.[1]
              ? { localKey: line.match(/references:\s*\[(\w+)\]/)?.[1] as string }
              : {}),
            ...(lineDescription ? { description: lineDescription } : {}),
          });
          continue;
        }

        fields.push({
          name: fieldName,
          type: fieldType,
          attributes: attrs,
          ...(lineDescription ? { description: lineDescription } : {}),
        });
      }

      models.push({
        modelName,
        tableName,
        schema,
        text: match[0] ?? '',
        ...(modelDescription ? { description: modelDescription } : {}),
        fields,
        relations,
      });
    }
  }

  // Post-process: a relation line without an explicit @relation still points at
  // a model, and the key columns follow the conventional naming.
  const modelNames = new Set(models.map((m) => m.modelName));
  for (const m of models) {
    for (const f of m.fields) {
      const cleanType = f.type.replace('[]', '').replace('?', '');
      if (modelNames.has(cleanType) && !m.relations.find((r) => r.name === f.name)) {
        m.relations.push({ name: f.name, target: cleanType });
      }
    }
  }

  return models;
}

function buildSchemaDoc(model: ModelBlock): string {
  const lines: string[] = [];
  lines.push(`Model: ${model.modelName}`);
  lines.push(`Table: [${model.schema || 'dbo'}].[${model.tableName}]`);
  if (model.description) lines.push(`Description: ${model.description}`);
  lines.push('');
  lines.push('Fields:');
  for (const f of model.fields) {
    const flags = [f.isId ? 'primary key' : '', f.isUnique ? 'unique' : '', f.hasDefault ? 'has default' : '']
      .filter(Boolean)
      .join(', ');
    lines.push(`  - ${f.name} ${f.type}${flags ? ` (${flags})` : ''}`);
    if (f.description) lines.push(`      ${f.description}`);
  }
  if (model.relations.length > 0) {
    lines.push('');
    lines.push('Relations:');
    for (const r of model.relations) {
      const fk = r.foreignKey ? ` (fk: ${r.foreignKey} -> ${r.localKey || 'id'})` : '';
      lines.push(`  - ${r.name} -> ${r.target}${fk}`);
      if (r.description) lines.push(`      ${r.description}`);
    }
  }
  return lines.join('\n');
}

export async function indexSchema(schemaDir: string): Promise<{ indexed: number }> {
  const ai = getAi();
  const models = await parseAn5Schema(schemaDir);
  if (models.length === 0) {
    console.warn(`[rag] No models found in ${schemaDir}`);
    return { indexed: 0 };
  }
  const docs = models.map((m) =>
    Document.fromText(buildSchemaDoc(m), {
      modelName: m.modelName,
      tableName: m.tableName,
      source: 'schema',
    })
  );
  console.log(`[rag] Indexing ${docs.length} schema documents...`);
  await ai.index({ indexer: schemaIndexer, documents: docs });
  return { indexed: docs.length };
}

export async function indexQuerySamples(samplesFile?: string): Promise<{ indexed: number }> {
  const ai = getAi();
  const filePath = samplesFile || path.join(__dirname, '..', '..', 'query-samples.json');
  if (!fs.existsSync(filePath)) {
    console.log(`[rag] No query samples file at ${filePath}`);
    return { indexed: 0 };
  }
  const samples = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<{
    question: string;
    sql: string;
    tags?: string[];
  }>;
  const docs = samples.map((s) =>
    Document.fromText(`${s.question}\n\nSQL:\n${s.sql}`, {
      question: s.question,
      tags: s.tags || [],
      source: 'query-sample',
    })
  );
  console.log(`[rag] Indexing ${docs.length} query samples...`);
  await ai.index({ indexer: queryIndexer, documents: docs });
  return { indexed: docs.length };
}

export async function retrieveSchema(query: string, k = 3): Promise<string[]> {
  const ai = getAi();
  const result = await ai.retrieve({ retriever: schemaRetriever, query, options: { k } });
  return result.map((d: any) => (typeof d.content === 'string' ? d.content : JSON.stringify(d.content)));
}

export async function retrieveQuerySamples(query: string, k = 3): Promise<string[]> {
  const ai = getAi();
  const result = await ai.retrieve({ retriever: queryRetriever, query, options: { k } });
  return result.map((d: any) => {
    if (typeof d.content === 'string') return d.content;
    const dp = d.content?.[0]?.text || JSON.stringify(d.content);
    return dp;
  });
}

let lastSchemaHash = '';

function computeSchemaHash(schemaDir: string): string {
  if (!fs.existsSync(schemaDir)) return '';
  const crypto = require('crypto');
  const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.an5')).sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(fs.readFileSync(path.join(schemaDir, f), 'utf8'));
  }
  return hash.digest('hex');
}

export function checkSchemaIndexStale(schemaDir: string): boolean {
  const currentHash = computeSchemaHash(schemaDir);
  return currentHash !== '' && currentHash !== lastSchemaHash;
}

export async function autoSyncSchemaIndex(schemaDir: string): Promise<{ synced: boolean; indexed: number }> {
  const currentHash = computeSchemaHash(schemaDir);
  if (currentHash === '' || currentHash === lastSchemaHash) {
    return { synced: false, indexed: 0 };
  }
  console.log(`[rag] Auto-syncing schema index for ${schemaDir}...`);
  const result = await indexSchema(schemaDir);
  lastSchemaHash = currentHash;
  return { synced: true, indexed: result.indexed };
}
