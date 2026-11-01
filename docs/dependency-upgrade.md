# Dependency upgrade — 2026-10-31

The upgrade targets the latest stable releases recorded from the official npm registry. The supported runtime is Node 26 LTS.
| Component | Upgrade target |
| --- | --- |
| Node.js | 26.13.0 |
| NestJS core / Express / testing | 12.3.2 |
| Prisma CLI / client / PostgreSQL adapter | 7.10.1 |
| TypeScript compiler | 7.0.2 |
| TypeScript API compatibility package | 6.0.2 |
| ESLint | 10.14.0 |
| Vitest / V8 coverage | 5.0.5 |
| Vite | 8.3.5 |
| htmlparser2 | 12.0.0 |

## Compiler and runtime compatibility

Nest 12 ships ESM packages and supports consuming them from CommonJS on modern Node. The application keeps its CommonJS output and uses Node 26 LTS for development, CI, and Docker. The Node distribution used for verification was downloaded from nodejs.org and checked against its published SHA-256 checksum. See the [Nest migration guide](https://docs.nestjs.com/migration-guide) and [Node release status](https://nodejs.org/en/about/previous-releases).

TypeScript 7 has a native compiler but does not expose the compiler API required by Nest CLI and typescript-eslint. The package aliases follow [Microsoft’s supported side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/): `typescript` resolves to `@typescript/typescript6` for tool APIs, and `@typescript/native` resolves to TypeScript 7 for the `tsc` executable. Type checking runs both compilers. No peer-dependency checks are disabled.

The deprecated `baseUrl` setting and source-root aliases are replaced with relative imports, which also resolve in the emitted production JavaScript. The build configuration explicitly sets `rootDir: src` and includes application sources, producing the `dist/main.js` used by deployment. See [TypeScript 6 migration notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html).

## Test and lint tooling

Vitest and coverage move together to version 5; Vite remains an explicit dependency. The migration reviews the new mock-reset defaults and preserves the authentication, privacy, RSS parsing, and database concurrency checks. A production end-to-end test boots the actual compiled entry point and checks the public root and protected social feed. `npm run test:e2e` builds the production artifact first. See the [Vitest 5 migration guide](https://main.vitest.dev/guide/migration/).

ESLint 10 retains the flat configuration and type-aware TypeScript rules. `npm run lint` checks without editing files; `npm run lint:fix` applies fixes. Generated Prisma files remain excluded from authored-source linting. See the [ESLint 10 migration guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0).

The unused legacy ESLint configuration bridge, Vite alias plugin, ts-node, ts-loader, tsconfig-paths, and source-map-support are removed from direct development dependencies. Production source maps use Node’s built-in support. `dotenv`, used directly by Prisma configuration, and the cache module’s `keyv` peer are declared explicitly.

## Prisma and deployment

Prisma 8 is a release candidate and lacks some of the transaction and nested-write features used here. The CLI, client, and adapter therefore move together to the latest stable 7.10.1 release. Its patch includes transaction isolation and dependency security fixes. The client is regenerated; the schema and existing database migration history are preserved. See [Prisma release status](https://www.prisma.io/docs/orm/release-status) and [7.10.1 release notes](https://github.com/prisma/orm/releases/tag/7.10.1).

Docker generates the client before compilation and includes `prisma.config.ts` in the deployment image so the migration service can read its database URL. Docker and CI use the same Node major as `.nvmrc`.

## Local use

```sh
nvm use
npm ci
npm run prisma:generate
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Database tests should use the isolated PostgreSQL setup in [the social API guide](social-api.md). The final audit and verification results are recorded in [dependency security status](dependency-security.md).

CI action releases were checked against their official release notes and pinned to full commit hashes: [cache v6.1.0](https://github.com/actions/cache/releases/tag/v6.1.0), [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1). The workflow uses read-only repository contents permission.
