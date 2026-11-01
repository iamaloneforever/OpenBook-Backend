import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { expect, it } from 'vitest';

it('boots the compiled production entry point and enforces authentication', async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  if (!address || typeof address === 'string')
    throw new Error('No test port allocated');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );

  const child = spawn(
    process.execPath,
    ['--enable-source-maps', 'dist/main.js'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        JWT_ACCESS_SECRET: 'production-smoke-access-secret-32-characters',
        JWT_REFRESH_SECRET: 'production-smoke-refresh-secret-32-characters',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-32000);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-32000);
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 15000;
    let response: Response | undefined;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Production startup failed:\n${output}`);
      try {
        response = await fetch(base, { signal: AbortSignal.timeout(500) });
        break;
      } catch {
        await setTimeout(50);
      }
    }
    if (!response) throw new Error(`Production startup timed out:\n${output}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Hello World!');
    const protectedResponse = await fetch(`${base}/social/feed`, {
      signal: AbortSignal.timeout(1000),
    });
    expect(protectedResponse.status).toBe(401);
    await protectedResponse.body?.cancel();
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      const forceKill = globalThis.setTimeout(
        () => child.kill('SIGKILL'),
        3000,
      );
      try {
        await stopped;
      } finally {
        clearTimeout(forceKill);
      }
    }
  }
}, 20000);
