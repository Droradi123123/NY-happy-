/**
 * Runs after `astro build`: dist/build.json says which commit this build is, so the post-deploy smoke
 * test (scripts/live-check.mjs --wait-for <sha>) can tell when the push is live. Cloudflare Workers
 * Builds sets WORKERS_CI_COMMIT_SHA, GitHub Actions GITHUB_SHA.
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let commit = process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || '';
if (!commit) try { commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim(); } catch { /* not a checkout */ }
writeFileSync('dist/build.json', JSON.stringify({ commit, built: new Date().toISOString(), by: process.env.WORKERS_CI ? 'cloudflare' : process.env.GITHUB_ACTIONS ? 'github' : 'local' }));
console.log(`build stamp: ${commit.slice(0, 7) || 'unknown'}`);
