/**
 * an5Agent Unit Tests
 * Tests for agent tools structure and API.
 * Run: node test/unit.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assertIncludes(str, substr, msg) {
  if (!str || !str.includes(substr)) {
    throw new Error(`${msg || 'Assert'}: missing "${substr}"`);
  }
}

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
}

console.log('\n=== an5Agent Unit Tests ===\n');

// ─── Agent core ──────────────────────────────────────────────────────────────

console.log('Agent Core:');

test('src/index.ts exists with An5Agent class', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  assertIncludes(content, 'export class An5Agent');
  assertIncludes(content, 'export function createAgent');
  assertIncludes(content, 'async process');
  assertIncludes(content, 'async executeTool');
});

test('An5Agent has tool management methods', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  assertIncludes(content, 'getTools()');
  assertIncludes(content, 'getTool(');
  assertIncludes(content, 'addTool(');
});

test('Agent exports all tool types', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  assertIncludes(content, 'export type { Tool, ToolContext }');
  assertIncludes(content, 'export interface AgentContext');
  assertIncludes(content, 'export interface AgentResponse');
});

test('Agent has DEFAULT_TOOLS list', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  assertIncludes(content, 'DEFAULT_TOOLS');
  assertIncludes(content, 'listModels');
  assertIncludes(content, 'describeModel');
  assertIncludes(content, 'generateQuery');
  assertIncludes(content, 'executeQuery');
});

// ─── Schema Tools ────────────────────────────────────────────────────────────

console.log('\nSchema Tools:');

test('schema-tools.ts exports listModels', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'schema-tools.ts'), 'utf8');
  assertIncludes(content, 'export const listModels');
  assertIncludes(content, "name: 'listModels'");
});

test('schema-tools.ts exports describeModel', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'schema-tools.ts'), 'utf8');
  assertIncludes(content, 'export const describeModel');
  assertIncludes(content, "name: 'describeModel'");
});

test('schema-tools.ts exports getRelations', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'schema-tools.ts'), 'utf8');
  assertIncludes(content, 'export const getRelations');
  assertIncludes(content, "name: 'getRelations'");
});

// ─── Query Tools ─────────────────────────────────────────────────────────────

console.log('\nQuery Tools:');

test('query-tools.ts exports generateQuery', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'query-tools.ts'), 'utf8');
  assertIncludes(content, 'export const generateQuery');
  assertIncludes(content, "name: 'generateQuery'");
});

test('query-tools.ts exports explainQuery', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'query-tools.ts'), 'utf8');
  assertIncludes(content, 'export const explainQuery');
  assertIncludes(content, "name: 'explainQuery'");
});

test('query-tools.ts exports validateQuery', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'query-tools.ts'), 'utf8');
  assertIncludes(content, 'export const validateQuery');
  assertIncludes(content, "name: 'validateQuery'");
});

// ─── Database Tools ──────────────────────────────────────────────────────────

console.log('\nDatabase Tools:');

test('database-tools.ts exports executeQuery', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'database-tools.ts'), 'utf8');
  assertIncludes(content, 'export const executeQuery');
  assertIncludes(content, "name: 'executeQuery'");
});

test('database-tools.ts exports healthCheck', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'database-tools.ts'), 'utf8');
  assertIncludes(content, 'export const healthCheck');
  assertIncludes(content, "name: 'databaseHealthCheck'");
});

test('database-tools.ts exports describeTable', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'database-tools.ts'), 'utf8');
  assertIncludes(content, 'export const describeTable');
  assertIncludes(content, "name: 'describeTable'");
});

// ─── Codegen Tools ───────────────────────────────────────────────────────────

console.log('\nCodegen Tools:');

test('codegen-tools.ts exports generateClientCode', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'codegen-tools.ts'), 'utf8');
  assertIncludes(content, 'export const generateClientCode');
  assertIncludes(content, "name: 'generateClientCode'");
});

test('codegen-tools.ts exports analyzeSchema', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'codegen-tools.ts'), 'utf8');
  assertIncludes(content, 'export const analyzeSchema');
  assertIncludes(content, "name: 'analyzeSchema'");
});

// ─── RAG Tools ───────────────────────────────────────────────────────────────

console.log('\nRAG Tools:');

test('rag-tools.ts exports retrieveSchemaTool', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'rag-tools.ts'), 'utf8');
  assertIncludes(content, 'export const retrieveSchemaTool');
  assertIncludes(content, "name: 'retrieveSchema'");
});

test('rag-tools.ts exports retrieveQuerySamplesTool', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'rag-tools.ts'), 'utf8');
  assertIncludes(content, 'export const retrieveQuerySamplesTool');
  assertIncludes(content, "name: 'retrieveQuerySamples'");
});

// ─── RAG Pipeline ────────────────────────────────────────────────────────────

console.log('\nRAG Pipeline:');

test('rag/indexer.ts exports parseAn5Schema', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'rag', 'indexer.ts'), 'utf8');
  assertIncludes(content, 'export function parseAn5Schema');
});

test('rag/indexer.ts exports indexSchema', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'rag', 'indexer.ts'), 'utf8');
  assertIncludes(content, 'export async function indexSchema');
});

test('rag/indexer.ts exports retrieveSchema', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'rag', 'indexer.ts'), 'utf8');
  assertIncludes(content, 'export async function retrieveSchema');
});

test('rag/embedder.ts exists', () => {
  assertExists(path.join(__dirname, '..', 'src', 'rag', 'embedder.ts'));
});

test('rag/index.ts exists', () => {
  assertExists(path.join(__dirname, '..', 'src', 'rag', 'index.ts'));
});

// ─── Tool Types ──────────────────────────────────────────────────────────────

console.log('\nTool Types:');

test('tool-types.ts exports Tool interface', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'tool-types.ts'), 'utf8');
  assertIncludes(content, 'export interface Tool');
  assertIncludes(content, 'export interface ToolContext');
});

test('tool-tools.ts has Zod schemas', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'tool-types.ts'), 'utf8');
  assertIncludes(content, 'z.object');
});

// ─── Package & Config ────────────────────────────────────────────────────────

console.log('\nPackage & Config:');

test('package.json is valid with dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assertIncludes(pkg.name, 'an5-agent');
  assert(typeof pkg.dependencies === 'object', 'dependencies should be an object');
  assert('genkit' in pkg.dependencies, 'should have genkit dependency');
  assert('an5-adapters' in pkg.dependencies, 'should have an5-adapters dependency');
});

test('AGENTS.md exists with purpose', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'AGENTS.md'), 'utf8');
  assertIncludes(content, 'Purpose');
  assertIncludes(content, 'Responsibilities');
});

test('tsconfig.json exists', () => {
  assertExists(path.join(__dirname, '..', 'tsconfig.json'));
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
