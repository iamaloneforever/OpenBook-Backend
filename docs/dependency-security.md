# Dependency security status

Audit date: 2026-10-31. The installed application dependency tree was checked with `npm audit --json` after the existing dependency upgrade. That audit reported **zero known vulnerabilities**. The Prisma CLI, client, and PostgreSQL adapter are aligned at 7.10.1; older audit results for Prisma 7.8.0 no longer describe the current lockfile.

API verification uses the official `postman-cli` package, pinned to 1.83.0 as a development dependency. The production image excludes development dependencies, including the Postman runner and Prisma migration CLI. Migrations run from the builder image in a separate service.

To refresh the evidence for the current lockfile:

```sh
npm audit
npm audit --omit=dev
```

An audit reports advisories known to the configured registry at the time of the request. It does not assess application authorization, compiled binaries bundled by packages, deployment configuration, or undisclosed vulnerabilities. The project's security regression suites are documented in [the testing guide](testing.md); application controls and operational limits are documented in [the security policy](../SECURITY.md).

The [dependency upgrade notes](dependency-upgrade.md) explain the runtime, compiler, and framework compatibility choices. Re-run type checks, lint, unit tests, end-to-end tests, database integration, and the Postman collection after dependency changes.
