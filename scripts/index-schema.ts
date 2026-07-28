#!/usr/bin/env node
import path from 'path';
import { indexSchema, indexQuerySamples } from '../src/rag/indexer';

async function main() {
  const rootDir = path.resolve(__dirname, '..', '..');
  const schemaDir = process.argv[2] || path.join(rootDir, 'an5Schema');

  console.log(`\n📚 RAG Indexer\n`);
  console.log(`Schema dir: ${schemaDir}`);

  const schemaResult = await indexSchema(schemaDir);
  console.log(`✅ Schema: ${schemaResult.indexed} documents indexed`);

  const queryResult = await indexQuerySamples();
  console.log(`✅ Query samples: ${queryResult.indexed} documents indexed`);

  console.log(`\n✅ RAG indexing completed.\n`);
}

main().catch((err) => {
  console.error('❌ RAG indexing failed:', err);
  process.exit(1);
});
