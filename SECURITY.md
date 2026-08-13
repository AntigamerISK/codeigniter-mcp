# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security vulnerabilities. Report them
privately so they can be addressed before disclosure.

- **Preferred channel**: create a private advisory via
  [GitHub Security Advisories](https://github.com/AntigamerISK/codeigniter-mcp/security/advisories/new)
- **Alternative**: email the maintainers (the email in the latest commit on `main`).

You should receive an acknowledgement within 72 hours. Please include:

- The affected version and file/line where possible.
- A minimal reproduction (inputs passed to a tool, environment variables, etc.).
- The impact and any suggested fix (if you have one).

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |

## Security model of this project

- All tool inputs are validated with Zod schemas before any processing.
- No tool passes raw user input to shell, SQL or the filesystem without
  sanitization and without its schema.
- Paths are always resolved inside `APP_ROOT` (`resolveInAppRoot`); path
  traversal is blocked and reported as `ValidationError`.
- Destructive operations (`run_migration`, overwrites) require an explicit
  `confirm`/`overwrite: true` flag.
- Error messages never expose absolute system paths, credentials or stack
  traces.
- The generated PHP code uses PDO prepared statements and validates input in
  the Service layer.
