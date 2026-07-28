import fs from 'fs';
import path from 'path';
import { Document } from 'genkit';
import { getAi, schemaIndexer, schemaRetriever, queryIndexer, queryRetriever } from './index';

export interface ModelBlock {
  modelName: string;
  tableName: string;
  schema?: string;
  text: string;
  fields: Array<{ name: string; type: string; attributes?: string }>;
  relations: Array<{ name: string; target: string; foreignKey?: string; localKey?: string }>;
}

export function parseAn5Schema(schemaDir: string): ModelBlock[] {
  if (!fs.existsSync(schemaDir)) return [];
  const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.an5'));
  const models: ModelBlock[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let match;
    while ((match = modelRegex.exec(content)) !== null) {
      const modelName = match[1];
      const block = match[2];

      let tableName = modelName.toLowerCase() + 's';
      const mapMatch = block.match(/@@map\("(.+?)"\)/);
      if (mapMatch) tableName = mapMatch[1];

      let schema: string | undefined;
      const schemaMatch = block.match(/@@schema\("(.+?)"\)/);
      if (schemaMatch) schema = schemaMatch[1];

      const fields: ModelBlock['fields'] = [];
      const relations: ModelBlock['relations'] = [];
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('@@') || line.startsWith('//')) continue;
        const parts = line.split(/\s+/);
        const fieldName = parts[0];
        const fieldType = parts[1];
        if (!fieldName || !fieldType) continue;
        const cleanType = fieldType.replace('[]', '').replace('?', '');
        const attrs = line.substring(line.indexOf(fieldType) + fieldType.length).trim();
        fields.push({ name: fieldName, type: fieldType, attributes: attrs });
      }

      models.push({ modelName, tableName, schema, text: match[0], fields, relations });
    }
  }

  // Post-process: detect relations from field types matching model names
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
  lines.push('');
  lines.push('Fields:');
  for (const f of model.fields) {
    lines.push(`  - ${f.name} ${f.type}${f.attributes ? ' ' + f.attributes : ''}`);
  }
  if (model.relations.length > 0) {
    lines.push('');
    lines.push('Relations:');
    for (const r of model.relations) {
      const fk = r.foreignKey ? ` (fk: ${r.foreignKey} -> ${r.localKey || 'id'})` : '';
      lines.push(`  - ${r.name} -> ${r.target}${fk}`);
    }
  }
  return lines.join('\n');
}

export async function indexSchema(schemaDir: string): Promise<{ indexed: number }> {
  const ai = getAi();
  const models = parseAn5Schema(schemaDir);
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
