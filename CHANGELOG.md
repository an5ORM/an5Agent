# Changelog

## [Unreleased]

### Fixed
- **`an5_query_database` accepted statements it meant to reject** — the
  `/^\s*SELECT\b/i` guard let `SELECT * INTO copy FROM users` through, and was defeated
  by a leading comment. A real lexer now skips `--` and `/* */` comments, honours `'`,
  `"`, backtick, `[...]` and `$tag$` quoting so `';DELETE'` inside a string is not read
  as a second statement, allows only one statement, and rejects `INTO`, `INSERT`,
  `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `ALTER`, `DROP`, `EXEC`, `EXECUTE`, `CALL`,
  `OUTFILE`, `DUMPFILE` and `LOCK`. Nested, unterminated and executable (`/*! */`)
  comments are refused.
- **`an5_describe_table` was SQL Server only and read a column that does not exist** —
  it queried `INFORMATION_SCHEMA.COLUMNS` and expected an `isPrimaryKey` column. It is
  dialect-aware now (SQLite `pragma_table_info`, others `INFORMATION_SCHEMA` plus a
  correlated constraint lookup), defaults to `public`/`dbo`/the current database per
  dialect, and throws explicitly where introspection is unsupported.
- **`describe` without a connection string invented four columns and two indexes** — it
  returns an empty column list and an error naming the cause.
- **A failed query leaked the connection pool** — each operation opens and closes its own
  connection in a `finally`.
- **`health` was MSSQL only** — it reports version and current database on PostgreSQL,
  MySQL and SQLite, and throws a clear error elsewhere.
- **The mock execution path reported a fabricated result** — it returned a hard-coded
  `rowCount: 3` and `executionTimeMs: 12`; it now reports its adapter and the real row
  count.
- **The MSSQL fallback required a sibling repository path** — it now uses the published
  `@an5/adapters` package, and the reported adapter is always `an5Adapters`.

### Changed
- The `schema` argument lost its `.default('dbo')`. Pass the schema explicitly, or rely on
  the per-dialect default that `describe` applies. Connection-string field descriptions
  now say "Database connection string" rather than naming one provider.

### Added
- `test/database-runtime.test.js` covers the SELECT guard, the mock path's honesty, the
  describe-without-connection error, and a real SQLite round trip including `health` and
  `isPrimaryKey`.
- `test/rag-runtime.test.js` exercises the offline embedder through the installed Genkit.

## [0.2.1] - 2026-10-02

### Fixed
- **A schema for another database was reported as broken** — `@an5/orm` validates field
  types per provider and defaults to SQL Server when none is passed, so every tool here
  that parsed a `.an5` file rejected a PostgreSQL or SQLite schema and fell back to the
  local parser, silently. The provider is now read from the project config, and both
  calls are guarded because the installed ORM may predate the export.
- **A generated column type named a SQL Server type for any database** — reading a
  client generated before the metadata carried `sql` still names types from the
  TypeScript type alone, and the list was SQL Server's: `NVARCHAR(255)`, `BIT`,
  `DATETIME2`. The mapping comes from `@an5/orm`'s `defaultSqlTypeForTs` now, per
  provider.

## [0.2.0] - 2026-10-01

### Added
- **Go and Rust in `generateClientCode`** — the tool can emit every language the
  ORM supports, not just TypeScript, Python, .NET and Go.
- **The real `@an5/orm` generator** — codegen runs the actual generator, so
  agent output matches `npm run generate` instead of an approximation.
- **`autoSyncSchemaIndex`** — a RAG helper to keep the schema index current.
- **Deeper `analyzeSchema`** with `autoFixSql` hints.

### Fixed
- **Schema descriptions and metadata are no longer dropped** — fields lost their
  `@description` text and several metadata properties never reached callers.
- **`parseModelsForAnalysis`** return type now includes `isUnique` and the
  index properties, so schema analysis saw them.
- **Schemas are indexed with the ORM's own parser** — the RAG indexer read
  `.an5` files with a private parser that drifted from
  `@an5/orm`'s `SchemaParser`. Both now go through the same one.
- **Strict flags enabled**, with the fallout fixed.

> Note: a `0.1.2` heading appeared in this changelog earlier but was never in
> `package.json` and never published to npm. Those changes ship as `0.2.0`.
## [0.1.2] - 2026-08-19

- chore: update build

## [0.1.1] - 2026-07-28

- chore

## [0.1.0] - 2026-07-04

- Initial release
  - 11 agent tools
  - Schema exploration, query generation, database operations

