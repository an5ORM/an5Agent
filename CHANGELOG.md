# Changelog

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

