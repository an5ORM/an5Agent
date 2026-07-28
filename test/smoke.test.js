const assert = require('assert');
const { An5Agent, listModels, describeModel, generateQuery, analyzeSchema, executeQuery } = require('../dist/index.js');

async function run() {
  // Test 1: Agent instantiation
  const agent = new An5Agent();
  assert.ok(agent, 'Agent should be instantiated');
  assert.ok(agent.getTools().length >= 10, `Should have at least 10 tools, got ${agent.getTools().length}`);
  console.log(`✅ Agent created with ${agent.getTools().length} tools`);

  // Test 2: listModels tool
  const listResult = await agent.executeTool('listModels', {});
  assert.ok(listResult.models, 'listModels should return models');
  assert.ok(listResult.models.length > 0, 'Should have at least one model');
  console.log(`✅ listModels returned ${listResult.totalModels} models`);

  // Test 3: describeModel tool
  const descResult = await agent.executeTool('describeModel', { modelName: 'User' });
  assert.ok(descResult.found, 'User model should be found');
  assert.ok(descResult.model.fields.length > 0, 'User should have fields');
  console.log(`✅ describeModel found ${descResult.model.name} with ${descResult.model.fields.length} fields`);

  // Test 4: generateQuery tool
  const queryResult = await agent.executeTool('generateQuery', { description: 'list all users' });
  assert.ok(queryResult.sql, 'Should generate SQL');
  assert.ok(queryResult.sql.toLowerCase().includes('select'), 'SQL should be a SELECT');
  console.log(`✅ generateQuery:\n${queryResult.sql}`);

  // Test 5: validateQuery tool
  const validateResult = await agent.executeTool('validateQuery', { sql: 'SELECT * FROM [dbo].[Users] WITH (NOLOCK)' });
  assert.ok(validateResult.isValid, 'Valid query should pass');
  console.log(`✅ validateQuery: PASS`);

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
  assert.ok(typeof listModels.execute === 'function', 'listModels should have execute function');
  assert.ok(typeof generateQuery.execute === 'function', 'generateQuery should have execute function');
  console.log(`✅ Static tool exports verified`);

  // Test 9: Adapter detection (without connection string - will use mock)
  const mockExec = await executeQuery.execute({ sql: 'SELECT * FROM Users' });
  assert.ok(mockExec.success, 'Mock query should succeed');
  assert.ok(mockExec.rows.length > 0, 'Should return mock rows');
  console.log(`✅ Mock query via executeQuery with ${mockExec.rows.length} rows`);

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
