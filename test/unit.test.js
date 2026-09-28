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
  assertIncludes(content, 'schemaTool');
  assertIncludes(content, 'queryTool');
  assertIncludes(content, 'databaseTool');
  assertIncludes(content, 'retrieveTool');
  assertIncludes(content, 'taskTool');
});

// ─── Schema Tools ────────────────────────────────────────────────────────────

console.log('\nSchema Tools:');

test('schema-tools.ts exports schemaTool', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'schema-tools.ts'), 'utf8');
  assertIncludes(content, 'export const schemaTool');
  assertIncludes(content, "name: 'schema'");
  assertIncludes(content, "['list', 'describe', 'relations']");
});

// ─── Query Tools ─────────────────────────────────────────────────────────────

console.log('\nQuery Tools:');

test('query-tools.ts exports queryTool', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'query-tools.ts'), 'utf8');
  assertIncludes(content, 'export const queryTool');
  assertIncludes(content, "name: 'query'");
  assertIncludes(content, "['generate', 'explain', 'validate']");
});

// ─── Database Tools ──────────────────────────────────────────────────────────

console.log('\nDatabase Tools:');

test('database-tools.ts exports databaseTool', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'database-tools.ts'), 'utf8');
  assertIncludes(content, 'export const databaseTool');
  assertIncludes(content, "name: 'database'");
  assertIncludes(content, "['execute', 'describe', 'health']");
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

test('rag-tools.ts exports retrieveTool', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'rag-tools.ts'), 'utf8');
  assertIncludes(content, 'export const retrieveTool');
  assertIncludes(content, "name: 'retrieve'");
  assertIncludes(content, "['schema', 'queries']");
});

test('task-tools.ts exports taskTool', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'tools', 'task-tools.ts'), 'utf8');
  assertIncludes(content, 'export const taskTool');
  assertIncludes(content, "name: 'task'");
  assertIncludes(content, "['create', 'list', 'update', 'delete']");
});

// ─── RAG Pipeline ────────────────────────────────────────────────────────────

console.log('\nRAG Pipeline:');

test('rag/indexer.ts exports parseAn5Schema', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'rag', 'indexer.ts'), 'utf8');
  assertIncludes(content, 'export async function parseAn5Schema');
});

test('rag/indexer.ts reads schemas with the shared ORM parser', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'rag', 'indexer.ts'), 'utf8');
  assertIncludes(content, "require('@an5/orm/generator')");
  assertIncludes(content, 'SchemaParser');
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
  assertIncludes(pkg.name, '@an5/agent');
  assert(typeof pkg.dependencies === 'object', 'dependencies should be an object');
  assert('genkit' in pkg.dependencies, 'should have genkit dependency');
  assert('@an5/adapters' in pkg.dependencies, 'should have @an5/adapters dependency');
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
