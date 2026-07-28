import { embedder } from 'genkit/plugin';
import http from 'http';
import https from 'https';
interface EmbedConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

let _cachedEmbedConfig: EmbedConfig | null | undefined = undefined;

function loadDbConfigModule(): any {
  try {
    return require(require('path').join(__dirname, '..', '..', 'an5Adapters', 'typescript', 'config'));
  } catch {
    return null;
  }
}

async function getConfig(): Promise<EmbedConfig | null> {
  if (_cachedEmbedConfig !== undefined) return _cachedEmbedConfig;

  const dbMod = loadDbConfigModule();
  if (!dbMod) { _cachedEmbedConfig = null; return null; }

  try {
    const db = await dbMod.getEmbeddingConfig();
    if (db && db.endpoint && db.apiKey) {
      _cachedEmbedConfig = { endpoint: db.endpoint, apiKey: db.apiKey, model: db.model || 'text-embedding-3-small' };
      return _cachedEmbedConfig;
    }
  } catch {}

  _cachedEmbedConfig = null;
  return null;
}

function fetchJson(url: string, options: any, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = /^https:/.test(url) ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Embedding request timed out')); });
    req.write(options.body || '');
    req.end();
  });
}

async function callEmbeddingEndpoint(texts: string[], config: EmbedConfig): Promise<number[][]> {
  const body = JSON.stringify({ model: config.model, input: texts });
  const response = await fetchJson(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body,
  });
  const parsed = JSON.parse(response);

  // OpenAI format: { data: [{ embedding: [...] }, ...] }
  if (parsed.data && Array.isArray(parsed.data)) {
    return parsed.data.map((d: any) => d.embedding);
  }
  // Cohere / generic format: { embeddings: [[...], ...] }
  if (parsed.embeddings && Array.isArray(parsed.embeddings)) {
    return parsed.embeddings;
  }
  throw new Error('Unknown embedding response format');
}

function dummyEmbed(text: string): number[] {
  // Deterministic hash-based fake vector for offline fallback (384 dims)
  const dim = 384;
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dim] = (vec[i % dim] + text.charCodeAt(i)) % 1000 / 1000;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const customEmbedder: any = embedder(
  { name: 'custom-embedder', info: { label: 'Custom Embedder', dimensions: 384 } },
  async (input: any) => {
    const config = await getConfig();
    const docs = input.input || input.embeddings || [];
    const texts = docs.map((d: any) => {
      const content = d.content || (d.text !== undefined ? d.text : d);
      return typeof content === 'string' ? content : JSON.stringify(content);
    });

    if (config && texts.length > 0) {
      try {
        const vectors = await callEmbeddingEndpoint(texts, config);
        return { embeddings: vectors.map((embedding: number[]) => ({ embedding })) };
      } catch (err: any) {
        console.warn(`[embedder] endpoint failed: ${err.message}, using dummy embeddings`);
      }
    }

    // Fallback: deterministic dummy embeddings (for offline development)
    return { embeddings: texts.map((t: string) => ({ embedding: dummyEmbed(t) })) };
  }
);
