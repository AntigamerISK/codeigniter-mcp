# Security model

- **Zod validation** on every input, without exception.
- No tool passes raw user input to shell, SQL or filesystem without sanitizing
  it and running it through its schema.
- **Least privilege**: all paths are resolved with `resolveInAppRoot` (inside
  `APP_ROOT`); path traversal is blocked and reported as `ValidationError`.
- Every destructive operation requires explicit `confirm`/`overwrite: true`;
  without the flag the tool fails in a controlled way (zero executions).
- **Rate limiting** (token bucket) on the 3 heavy write tools:
  `scaffold_full_resource`, `scaffold_repository`, `run_migration`.
- Error messages **never expose** absolute system paths, credentials or stack
  traces (unexpected errors are replaced by a generic actionable message).
- The generated PHP code uses prepared statements and validates input in the
  Service (sanitization by default).

## Mechanism map

| Mechanism | Where | Behavior |
|---|---|---|
| Input validation | `src/schemas/*.ts` | Zod schemas: PascalCase regex, length limits, field-count limits, enum types |
| Path containment | `src/core/config.ts` — `resolveInAppRoot` | Any path escaping `APP_ROOT` → `ValidationError` |
| Safe writes | `src/core/fs-safe.ts` — `safeWriteFile` | Never overwrites without `overwrite: true`; `wx` flag prevents clobbering |
| Destructive guard | `src/tools/run-migration.ts` | `confirm !== true` → `DestructiveOpBlockedError`, zero executions |
| Rate limiting | `src/core/rate-limiter.ts` | Token bucket, 20/min default, injectable clock |
| No leaks | `src/core/errors.ts` — `toToolError` | Unknown errors → generic `InternalError` message |
| No SQL in controllers | `src/templates/controller.template.ts` — `assertNoSqlInController` | Build-time failure (`ConventionViolationError`) without writing the file |
| SQL-injection safe code | generated templates | PDO + prepared statements in repositories |

These guarantees are exercised by the test suite and by `npm run verify`
(see [testing.md](testing.md)): path traversal, destructive-op guard and
no-overwrite are verified end-to-end against a real running server.
