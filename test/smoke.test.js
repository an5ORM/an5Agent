const assert = require('assert');
const { An5Agent, schemaTool, queryTool, databaseTool, analyzeSchema } = require('../dist/index.js');

async function run() {
  // Test 1: Agent instantiation
  const agent = new An5Agent();
  assert.ok(agent, 'Agent should be instantiated');
  assert.ok(agent.getTools().length >= 7, `Should have at least 7 tools, got ${agent.getTools().length}`);
  console.log(`✅ Agent created with ${agent.getTools().length} tools`);

  // Test 2: schema tool - list action
  const listResult = await agent.executeTool('schema', { action: 'list' });
  assert.ok(listResult.models, 'schema list should return models');
  assert.ok(listResult.models.length > 0, 'Should have at least one model');
  console.log(`✅ schema(list) returned ${listResult.totalModels} models`);

  // Test 3: schema tool - describe action
  const descResult = await agent.executeTool('schema', { action: 'describe', modelName: 'User' });
  assert.ok(descResult.found, 'User model should be found');
  assert.ok(descResult.model.fields.length > 0, 'User should have fields');
  console.log(`✅ schema(describe) found ${descResult.model.name} with ${descResult.model.fields.length} fields`);

  // Test 4: query tool - generate action
  const queryResult = await agent.executeTool('query', { action: 'generate', description: 'list all users' });
  assert.ok(queryResult.sql, 'Should generate SQL');
  assert.ok(queryResult.sql.toLowerCase().includes('select'), 'SQL should be a SELECT');
  console.log(`✅ query(generate):\n${queryResult.sql}`);

  // Test 5: query tool - validate action
  const validateResult = await agent.executeTool('query', { action: 'validate', sql: 'SELECT * FROM [dbo].[Users] WITH (NOLOCK)' });
  assert.ok(validateResult.isValid, 'Valid query should pass');
  console.log(`✅ query(validate): PASS`);

  // Test 6: analyzeSchema tool
  const analysis = await agent.executeTool('analyzeSchema', {});
  assert.ok(analysis.issues, 'Should have issues array');
  assert.ok(analysis.summary.totalModels > 0, 'Should analyze at least one model');
  console.log(`✅ analyzeSchema: ${analysis.summary.totalModels} models, ${analysis.issues.length} issues`);

  // Test 7: Agent.process() with natural language
  const response = await agent.process({ userQuestion: 'What tables do we have in the schema?' });
  assert.ok(response.answer, 'Should have an answer');
  assert.ok(response.toolCalls.length > 0, 'Should have triggered tools');
  console.log(`✅ Agent.process() triggered ${response.toolCalls.length} tool(s)`);

  // Test 8: Static tool export (direct usage)
  assert.ok(typeof schemaTool.execute === 'function', 'schemaTool should have execute function');
  assert.ok(typeof queryTool.execute === 'function', 'queryTool should have execute function');
  console.log(`✅ Static tool exports verified`);

  // Test 9: generateClientCode supports every language the ORM generates
  const { generateClientCode } = require('../dist/index.js');
  const supported = [
    'typescript',
    'python',
    'dotnet',
    'golang',
    'rust',
  ];
  const schemaPath = require('path').join(__dirname, 'fixtures', 'schema');
  for (const language of supported) {
    const result = await generateClientCode.execute({ schemaPath, language });
    assert.ok(result.success, `generateClientCode should support ${language}: ${result.message}`);
    assert.ok(result.files.length > 0, `${language} should produce files`);
    const totalBytes = result.files.reduce((sum, f) => sum + f.content.length, 0);
    assert.ok(totalBytes > 500, `${language} output looks too small (${totalBytes} bytes)`);
    console.log(`✅ generateClientCode(${language}): ${result.files.length} file(s), ${totalBytes} bytes`);
  }

  // Test 9: database tool - execute action (mock)
  const mockExec = await databaseTool.execute({ action: 'execute', sql: 'SELECT * FROM Users' });
  assert.ok(mockExec.success, 'Mock query should succeed');
  assert.ok(mockExec.rows.length > 0, 'Should return mock rows');
  console.log(`✅ Mock query via database(execute) with ${mockExec.rows.length} rows`);

  // Test 10: Agent.process() with SQL query
  const sqlResponse = await agent.process({
    userQuestion: 'Can you explain this query: ```sql\nSELECT u.name, o.total\nFROM Users u JOIN Orders o ON u.id = o.userId\n```',
  });
  assert.ok(sqlResponse.toolCalls.length > 0, 'SQL query should trigger tools');
  console.log(`✅ SQL explanation triggered ${sqlResponse.toolCalls.length} tool(s)`);

  console.log('\n🎉 All smoke tests passed!');
}

run().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
