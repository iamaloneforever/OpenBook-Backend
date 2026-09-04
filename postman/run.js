#!/usr/bin/env node
/**
 * Runs the OpenBook Postman collection via Newman.
 *
 * Usage:
 *   node postman/run.js                          # default: http://localhost:5000
 *   BASE_URL=http://host:port node postman/run.js
 */
const { execSync } = require('child_process');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const COLLECTION = path.join(__dirname, 'openbook-api.postman_collection.json');
const ENVIRONMENT = path.join(__dirname, 'environments/local.postman_environment.json');

const cmd = [
  'npx', 'newman', 'run', COLLECTION,
  '--environment', ENVIRONMENT,
  '--env-var', `baseUrl=${BASE_URL}`,
  '--timeout-request', '10000',
  '--reporters', 'cli',
].map((a) => `"${a}"`).join(' ');

console.log(`\n  Newman: running OpenBook API tests against ${BASE_URL}\n`);
try {
  execSync(cmd, { stdio: 'inherit' });
} catch {
  process.exit(1);
}
