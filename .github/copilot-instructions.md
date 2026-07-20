# Copilot instructions for OpenBook (backend)

Purpose: help future Copilot CLI/agents quickly understand project layout, how to build/test/lint, and repository-specific conventions used by engineers.

---

## Quick commands

- Install deps: `npm install`
- Build: `npm run build` (uses `nest build`)
- Dev server: `npm run start:dev` (watch mode)
- Production start: `npm run start:prod` (runs `node dist/main`)
- Lint: `npm run lint` (ESLint)
- Tests: `npm run test` (runs Vitest)
- E2E tests: `npm run test:e2e` (Vitest e2e config)
- Test watch: `npm run test:watch`
- Coverage: `npm run test:coverage`

Run a single test file or test name (Vitest):
- By file: `npx vitest run path/to/file.spec.ts`
- By name: `npx vitest -t "my test name"`

Prisma migrations:
- `npx prisma migrate dev`

---

## High-level architecture

- NestJS (module/controller/service) structure. Key modules: `AuthModule`, `BookModule`, `UserModule`, `ReadListModule`, `PrismaModule`.
- Entry point: `src/main.ts` — registers global ValidationPipe, cookie parser, starts server (default port 5000).
- Prisma: `src/prisma/prisma.service.ts` extends PrismaClient and uses `@prisma/adapter-pg` with `DATABASE_URL`.
- Auth: JWT access + refresh tokens. Refresh tokens are stored hashed in DB. `AuthService` handles signup/login/refresh/generateTokens and revocation.
- File uploads: multer-based interceptor `BookUploadInterceptor` writes to `./uploads/books/{covers,files}` and filenames are uuid+ext. Static files served at `/uploads` via ServeStaticModule.
- Ownership checks: `Owner` decorator + `OwnerGuard` use `OWNER_CONFIG` mapping to verify resource owner via Prisma delegate.
- Caching: `@nestjs/cache-manager` configured globally; controllers use `CacheInterceptor` + `@CacheTTL` on read endpoints.
- DTOs & validation: ValidationPipe configured with `whitelist`, `forbidNonWhitelisted`, and `transform`. DTOs live under `src/common/dtos` and custom validators (e.g., `IsCuid`) live in `src/common/validators`.
- Error handling: services have `handleError` helpers and translate Prisma error codes (e.g., P2002 -> conflict, P2025 -> not found).

---

## Key conventions and patterns (project-specific)

- DTO naming: `create-*`, `update-*`, `*IdParamDto` for route params, and domain subfolders (`book/`, `auth/`, `read-list/`).
- Validation: rely on class-validator decorators + global ValidationPipe. Always prefer DTO classes for incoming payloads.
- Owner pattern: routes requiring resource ownership use `@Owner('book'|'readList')` on controller handlers and `OwnerGuard` is used to enforce. `OWNER_CONFIG` maps resource -> Prisma delegate and owner field.
- Upload fields: book uploads use fields named `cover` (single image) and `file` (single EPUB). File size limit: 50 MB. Allowed cover extensions: .jpg/.jpeg/.png/.webp; EPUB only for `file` field.
- Book model semantics: `BookType` is DIGITAL or PHYSICAL. Digital books may have a URL or an EPUB file (not both). Physical books must have `physicalBook` data and no EPUB.
- Authentication:
  - Login uses `LocalAuthGuard` (username + password), then `AuthService.generateTokens` issues access + refresh tokens.
  - Refresh token is stored hashed (argon2) on the user record. `refresh` endpoint reads cookie `refreshToken` and rotates it.
  - Cookie settings: refresh cookie named `refreshToken`, httpOnly, sameSite: 'lax', secure used in production (NODE_ENV === 'production').
  - Logout revokes stored refresh token (clear DB hash) and clears cookie; endpoints that require a logged in user use `JwtAuthGuard`.
- Error translation: Prisma errors are mapped to Nest exceptions inside service `handleError` helpers — follow this pattern when adding services.
- Responses: many controllers/services return `{ message }` or `{ data, meta }` shaped responses. Keep consistency.

---

## Files & locations to inspect when changing behavior

- Auth flows: `src/auth/*` (controller + service + local/jwt strategies in `common/guards`)
- DB models: `prisma/schema.prisma` (check migrations and types) and generated client: `src/generated/prisma/client`
- Upload/serve: `src/common/config/multer.config.ts`, `AppModule` ServeStatic config
- Ownership: `src/common/decorators/owner.decorator.ts`, `src/common/config/owner.config.ts`, `src/common/guards/auth/owner.guard.ts`
- DTOs/validators: `src/common/dtos/**`, `src/common/validators/**`

---

## Integration with other AI assistant configs

No repository-level Claude/Cursor/Agent/Windsurf/Aider/Cline files detected during scan. If any added later, merge important rules into this document.

---

## Helpful notes for Copilot sessions

- Prefer direct edits (grep/view/edit) over spinning sub-agents for small tasks (<5 file ops).
- When running tests use vitest CLI examples above; for multi-file changes run targeted tests first.
- Keep ValidationPipe expectations in mind: unknown fields will be forbidden by default.

---

Created: .github/copilot-instructions.md — intended as the single source for Copilot sessions. Update as project evolves.
