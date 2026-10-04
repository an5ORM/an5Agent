// Intentional Vietnamese requests verify multilingual input. an5:allow-non-english-file
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { An5Agent, generateCode } = require('../dist');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'an5-code-test-'));
const schemaPath = path.resolve(__dirname, 'fixtures/schema');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
test('detects every supported project language and returns real API references without writes', async () => {
  for (const [language, manifest] of Object.entries({typescript:'tsconfig.json',python:'pyproject.toml',dotnet:'App.csproj',golang:'go.mod',rust:'Cargo.toml'})) {
    const projectRoot = path.join(root, language); fs.mkdirSync(projectRoot); fs.writeFileSync(path.join(projectRoot, manifest), '{}');
    const output = await generateCode.execute({ request: 'Viết hàm lấy email của User', projectRoot, schemaPath });
    assert.equal(output.language, language); assert.equal(output.status, 'context_ready');
    assert.ok(output.files.length); assert.ok(output.models.some(m => m.name === 'User'));
    assert.deepEqual(fs.readdirSync(projectRoot), [manifest]);
  }
});
test('ambiguity, unsupported language and empty requests fail explicitly', async () => {
  const projectRoot = path.join(root, 'mixed'); fs.mkdirSync(projectRoot);
  fs.writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{}'); fs.writeFileSync(path.join(projectRoot, 'Cargo.toml'), '');
  await assert.rejects(generateCode.execute({request:'write code',projectRoot,schemaPath}), /Specify language/);
  await assert.rejects(generateCode.execute({request:'',projectRoot,schemaPath}), /./);
  await assert.rejects(generateCode.execute({request:'write code',language:'ruby',projectRoot,schemaPath}), /./);
  const output = await generateCode.execute({request:'write code',language:'rust',projectRoot,schemaPath});
  assert.equal(output.language, 'rust');
});
test('Vietnamese request invokes code provider once with schema grounding and never SQL tool', async () => {
  let calls = 0;
  const code = 'export const emails = (users: { email: string }[]) => users.map(user => user.email);';
  const output = await new An5Agent().process({ userQuestion:'Viết hàm lấy email của User', toolContext:{ projectRoot:path.join(root,'typescript'), schemaPath, generateCode:async context => {
    calls++; assert.equal(context.request, 'Viết hàm lấy email của User');
    assert.ok(context.models.find(m => m.name === 'User').fields.some(f => f.name === 'email'));
    assert.ok(context.files.some(f => f.content.includes('email'))); return code;
  } } });
  assert.equal(calls, 1); assert.equal(output.answer, code);
  assert.deepEqual(output.toolCalls.map(call => call.tool), ['generateCode']);
  const js = require('node:module').stripTypeScriptTypes(code).replace('export const emails =', 'exports.emails =');
  const exports = {}; new Function('exports',js)(exports);
  assert.deepEqual(exports.emails([{email:'user@example.test'}]), ['user@example.test']);
});
test('empty provider result is not reported as generated code', async () => {
  await assert.rejects(generateCode.execute({request:'write code',language:'typescript',projectRoot:root,schemaPath}, {generateCode:async () => ''}), /empty code/);
});
