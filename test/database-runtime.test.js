const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { databaseTool } = require('../dist/tools/database-tools');

test('database rejects writes before connecting and reports correct mock row count', async () => {
  for (const sql of ['SELECT 1; DELETE FROM users', 'SELECT * INTO copy FROM users']) {
    assert.equal((await databaseTool.execute({ action: 'execute', sql })).success, false);
  }
  const result = await databaseTool.execute({ action: 'execute', sql: "SELECT ';' AS value" });
  assert.equal(result.adapter, 'mock');
  assert.equal(result.rowCount, result.rows.length);
  const described = await databaseTool.execute({ action: 'describe', tableName: 'nonexistent_review_table' });
  assert.deepEqual(described.columns, []);
  assert.match(described.error, /No connection string/);
});

test('database executes, describes and checks health through installed SQLite adapter', async () => {
  const { createAn5Adapter } = require('@an5/adapters');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an5-agent-db-'));
  const connectionString = path.join(dir, 'test.sqlite');
  const adapter = createAn5Adapter({ connectionString });
  try {
    await adapter.exec('CREATE TABLE review_unique_table (key INTEGER PRIMARY KEY, value TEXT)');
    await adapter.$disconnect();
    const health = await databaseTool.execute({ action: 'health', connectionString });
    assert.equal(health.connected, true, health.error);
    assert.match(health.serverVersion, /^\d+\./);
    const result = await databaseTool.execute({ action: 'execute', connectionString, sql: 'SELECT @value AS value', params: { value: 42 } });
    assert.equal(result.success, true, result.error);
    assert.equal(result.rows[0].value, 42);
    const described = await databaseTool.execute({ action: 'describe', connectionString, tableName: 'review_unique_table' });
    assert.equal(described.error, undefined);
    assert.equal(described.columns[0].isPrimaryKey, true);
    const failed = await databaseTool.execute({ action: 'execute', connectionString, sql: 'SELECT * FROM missing_table' });
    assert.equal(failed.success, false);
    assert.equal((await databaseTool.execute({ action: 'health', connectionString })).connected, true);
  } finally { await adapter.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); }
});
