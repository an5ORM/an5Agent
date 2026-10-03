const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('offline embedder executes with the installed Genkit and telemetry SDK', () => {
  execFileSync(process.execPath, ['-e', `
    (async () => {
      const assert = require('node:assert/strict');
      const {getAi} = require(${JSON.stringify(path.resolve(__dirname, '../dist/rag/index.js'))});
      const {customEmbedder} = require(${JSON.stringify(path.resolve(__dirname, '../dist/rag/embedder.js'))});
      const result = await getAi().embed({embedder:customEmbedder, content:'RAG runtime contract'});
      assert.equal(result.length,1);
      assert.equal(result[0].embedding.length,384);
      assert.ok(result[0].embedding.every(Number.isFinite));
      process.exit(0);
    })().catch(error => {console.error(error);process.exit(1)});
  `], { stdio: 'pipe', timeout: 30000, env: { ...process.env, ENABLE_FIREBASE_MONITORING: 'false' } });
});
