# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately to the repository maintainer through an available private security reporting channel. Include the affected revision, prerequisites, reproduction steps, and expected impact. Do not put credentials, private library data, or working exploit details in a public issue.

## Implemented controls

- Passwords and persisted refresh tokens are hashed with Argon2. Access and refresh tokens use independent secrets and accept only HS256 signatures. Token subjects are checked before database lookup.
- Production startup rejects signing secrets shorter than 32 characters. Secret length is a minimum requirement; operators must generate random values.
- Login credentials are validated before Passport and database access. Authentication routes have account/token and IP limits; signup has an additional 10-per-minute IP limit.
- Refresh rotation uses a database compare-and-set operation. Replayed or concurrently consumed refresh tokens are rejected. Logout revokes the stored refresh token.
- Browser writes require a configured trusted Origin, with an additional Fetch Metadata check for cross-site requests without Origin. Refresh cookies are scoped, HttpOnly, SameSite=Lax, and Secure in production.
- Helmet sets security headers. Responses use `Cache-Control: no-store`, and framework identification is disabled. Internal response caches use account-specific keys.
- Books and reading lists enforce ownership. Tag enumeration and counts are scoped to the current account. Unauthorized resource access returns 404.
- EPUBs are outside the public static directory and require an owned-book download route. Uploads have size, part, extension, MIME, and signature checks. Failed requests clean up their newly uploaded files.
- Social profiles require explicit public opt-in. Public serializers exclude credentials and private library sources. RSS fetching checks public addresses, pins DNS results, validates redirects, and limits time, response size, and format. RSS parsing rejects DTD/entity input and strips active markup from imported summaries.

## Security boundaries and limits

Public trending metadata includes book titles, descriptions, cover URLs, owner IDs, and usernames. Cover images are publicly accessible. Social blocking applies to authenticated views; anonymous users can still view content from public profiles. Review these behaviors before publishing sensitive metadata.

Logout and a subsequent login revoke the refresh session, but do not immediately revoke existing access tokens. Those expire after 15 minutes. There is one refresh session per account. The application has no account-deletion API.

Rate limits and caches are in-memory per process. Configure shared or edge limits for multiple replicas. The API uses direct socket addresses by default; proxy trust must be configured for the actual deployment.

File signatures do not constitute antivirus scanning, image decoding, or complete EPUB validation. Treat uploaded files as untrusted. Apply storage quotas and malware scanning if required by the deployment. Successful book deletion and replacement currently leave their previous files on disk; use a reference-aware retention process.

## Compatibility changes in this hardening pass

- `GET /book/tags/all` now requires a bearer token and returns only the caller's tags and usage counts.
- EPUB clients must download through `GET /book/:id/file`. Direct `/uploads/...` EPUB access is no longer supported. Existing server-generated EPUB filenames are supported by the new route.
- Refresh cookies use `Path=/auth`; clients must retain the newest cookie. Logout clears both the new path and the legacy root cookie. Clear legacy root-scoped cookies during migration if duplicate cookies interfere with refresh.
- Signup usernames are limited to 3–64 ASCII letters, digits, underscores, periods, and hyphens. Passwords are 8–128 characters. Login accepts existing usernames of 1–64 characters and passwords of 1–128 characters. Audit existing accounts for longer credentials before rollout.
- Browser writes with untrusted origins fail with 403. Configure `CORS_ORIGINS` and `SOCIAL_PUBLIC_URL` before deploying browser clients.
- Production requires distinct signing secrets of at least 32 characters. Malformed pagination, unsupported sorts, duplicate normalized tags, and unknown input fields are rejected.

## Verification

Run the unit, end-to-end, PostgreSQL integration, and Postman suites described in [the testing guide](docs/testing.md). Refresh the dependency audit for each release; the current evidence is in [dependency security status](docs/dependency-security.md).

The HTTP controls follow the [OWASP REST Security guidance](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html). These controls do not replace deployment-specific threat assessment and operational monitoring.
