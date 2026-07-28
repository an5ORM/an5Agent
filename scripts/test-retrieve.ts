import { retrieveSchema, retrieveQuerySamples } from '../src/rag/indexer';

async function main() {
  console.log('\n--- retrieveSchema: "user and orders" ---');
  const schema = await retrieveSchema('user and their orders');
  schema.slice(0, 2).forEach((d, i) => console.log(`\n[${i + 1}]\n${d.slice(0, 200)}`));

  console.log('\n\n--- retrieveQuerySamples: "find top customers" ---');
  const samples = await retrieveQuerySamples('find top customers by spend');
  samples.slice(0, 2).forEach((d, i) => console.log(`\n[${i + 1}]\n${d.slice(0, 200)}`));
}

main().catch(e => { console.error(e); process.exit(1); });
