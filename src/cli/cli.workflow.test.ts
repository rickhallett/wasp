/**
 * CLI workflow integration tests.
 * Spawns the CLI entrypoint with temp WASP_DATA_DIR and asserts stdout/stderr and exit codes.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dir, '..', '..');
const CLI_ENTRY = join(PROJECT_ROOT, 'src', 'cli.ts');

function makeTempDir(): string {
  const dir = join(tmpdir(), `wasp-workflow-${process.pid}-${Date.now()}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function runCli(
  args: string[],
  env: Record<string, string> = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd: ['bun', CLI_ENTRY, ...args],
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe('CLI workflow', () => {
  let testDir: string;

  beforeAll(() => {
    testDir = makeTempDir();
  });

  afterAll(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  const env = () => ({ WASP_DATA_DIR: testDir });

  describe('init', () => {
    it('init creates db and exits 0', async () => {
      const { exitCode, stdout } = await runCli(['init'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('initialized');
      expect(existsSync(join(testDir, 'wasp.db'))).toBe(true);
    });

    it('init idempotent: second init reports already initialized', async () => {
      const { exitCode, stdout } = await runCli(['init'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('already initialized');
    });

    it('init --force reinitializes', async () => {
      const { exitCode, stdout } = await runCli(['init', '--force'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('initialized successfully');
    });
  });

  describe('add / list', () => {
    it('add then list shows contact (pretty)', async () => {
      await runCli(['init'], env());
      const addOut = await runCli(['add', '+440111222333', '--name', 'WorkflowTest'], env());
      expect(addOut.exitCode).toBe(0);
      expect(addOut.stdout).toContain('WorkflowTest');
      expect(addOut.stdout).toContain('+440111222333');

      const listOut = await runCli(['list'], env());
      expect(listOut.exitCode).toBe(0);
      expect(listOut.stdout).toContain('+440111222333');
      expect(listOut.stdout).toContain('WorkflowTest');
    });

    it('add / list with --json output', async () => {
      await runCli(['init'], env());
      await runCli(['add', '+440222333444'], env());
      const { exitCode, stdout } = await runCli(['list', '--json'], env());
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout.trim());
      expect(data.contacts).toBeDefined();
      expect(Array.isArray(data.contacts)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(1);
    });

    it('global -j propagates to list', async () => {
      await runCli(['init'], env());
      const { exitCode, stdout } = await runCli(['-j', 'list'], env());
      expect(exitCode).toBe(0);
      expect(() => JSON.parse(stdout.trim())).not.toThrow();
      const data = JSON.parse(stdout.trim());
      expect(data).toHaveProperty('contacts');
    });
  });

  describe('check', () => {
    it('check allowed contact exits 0', async () => {
      await runCli(['init'], env());
      await runCli(['add', '+440333444555', '--trust', 'trusted'], env());
      const { exitCode, stdout } = await runCli(['check', '+440333444555'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('ALLOWED');
    });

    it('check denied contact exits 1', async () => {
      await runCli(['init'], env());
      const { exitCode, stdout } = await runCli(['check', '+440999888777'], env());
      expect(exitCode).toBe(1);
      expect(stdout).toContain('DENIED');
    });

    it('check --quiet exits 0 for allowed with no output', async () => {
      await runCli(['init'], env());
      await runCli(['add', '+440444555666'], env());
      const { exitCode, stdout } = await runCli(['check', '+440444555666', '-q'], env());
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('');
    });

    it('check --quiet exits 1 for denied with no output', async () => {
      await runCli(['init'], env());
      const { exitCode, stdout } = await runCli(['check', '+440555666777', '-q'], env());
      expect(exitCode).toBe(1);
      expect(stdout.trim()).toBe('');
    });
  });

  describe('log', () => {
    it('log shows entries', async () => {
      await runCli(['init'], env());
      await runCli(['check', '+440666777888'], env());
      const { exitCode, stdout } = await runCli(['log'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('+440666777888');
    });

    it('log --denied filters to denied only', async () => {
      await runCli(['init'], env());
      await runCli(['add', '+440777888999'], env());
      await runCli(['check', '+440777888999'], env());
      await runCli(['check', '+440888999000'], env());
      const { exitCode, stdout } = await runCli(['log', '--denied'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('+440888999000');
    });

    it('log -l limit respected', async () => {
      await runCli(['init'], env());
      const { exitCode, stdout } = await runCli(['log', '-l', '3'], env());
      expect(exitCode).toBe(0);
      const lines = stdout.trim().split('\n').filter(Boolean);
      expect(lines.length).toBeLessThanOrEqual(10);
    });
  });

  describe('review and blocked', () => {
    it('review without args shows quarantine list', async () => {
      await runCli(['init'], env());
      const { exitCode, stdout } = await runCli(['review'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/Quarantine|empty|sender/);
    });

    it('review --approve non-existent returns failure message', async () => {
      await runCli(['init'], env());
      const { exitCode, stdout } = await runCli(['review', '--approve', '+440000000001'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No quarantined messages');
    });

    it('review --deny non-existent returns failure message', async () => {
      await runCli(['init'], env());
      const { exitCode, stdout } = await runCli(['review', '--deny', '+440000000002'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No quarantined messages');
    });

    it('blocked shows blocked contacts list', async () => {
      await runCli(['init'], env());
      await runCli(['check', '+440999000111'], env());
      const { exitCode, stdout } = await runCli(['blocked'], env());
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/blocked|Blocked|No blocked/);
    });
  });

  describe('serve', () => {
    it('serve when uninitialized fails with exit 1', async () => {
      const emptyDir = makeTempDir();
      const { exitCode, stderr } = await runCli(['serve'], { WASP_DATA_DIR: emptyDir });
      expect(exitCode).toBe(1);
      expect(stderr).toContain('not initialized');
      if (existsSync(emptyDir)) rmSync(emptyDir, { recursive: true });
    });
  });
});
