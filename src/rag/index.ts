import { genkit } from 'genkit';
import { devLocalVectorstore, devLocalIndexerRef, devLocalRetrieverRef } from '@genkit-ai/dev-local-vectorstore';
import { customEmbedder } from './embedder';
import path from 'path';

export const VECTOR_SCHEMA = 'an5-schema';
export const VECTOR_QUERIES = 'an5-queries';

const vectorStoreDir = path.join(__dirname, '..', '..', '.genkit', 'vectorstore');

let aiInstance: ReturnType<typeof genkit> | null = null;

export function getAi() {
  if (aiInstance) return aiInstance;
  aiInstance = genkit({
    plugins: [
      devLocalVectorstore([
        { indexName: VECTOR_SCHEMA, embedder: customEmbedder },
        { indexName: VECTOR_QUERIES, embedder: customEmbedder },
      ]),
    ],
  });
  return aiInstance;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const schemaIndexer: any = devLocalIndexerRef(VECTOR_SCHEMA);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const schemaRetriever: any = devLocalRetrieverRef(VECTOR_SCHEMA);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const queryIndexer: any = devLocalIndexerRef(VECTOR_QUERIES);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const queryRetriever: any = devLocalRetrieverRef(VECTOR_QUERIES);

export { vectorStoreDir };
