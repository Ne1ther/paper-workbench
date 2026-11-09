import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildInstallPlan, inspectInstallPlan, installComponents, snapshot } from '../lib/installer.js';

const cli = fileURLToPath(new URL('../bin/install-paper-workbench.js', import.meta.url));
const options = { version: '0.5.0', target: 'codex', environment: 'native', dependencyReady: true };

async function fixture(t, target = 'codex') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-workbench-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, plan: buildInstallPlan(target, { root }) };
}

test('Codex uses discoverable skills and standalone agents; Claude only installs skills', () => {
  const codex = buildInstallPlan('codex', { root: '/staging' });
  assert.equal(codex.length, 5);
  assert.equal(codex[0].destination, '/staging/.agents/skills/read-pdf');
  assert.equal(codex[3].destination, '/staging/.codex/agents/paper-analyst-agent.toml');
  const claude = buildInstallPlan('claude', { root: '/staging' });
  assert.equal(claude.length, 3);
  assert(claude.every((item) => item.kind === 'skill' && item.destination.startsWith('/staging/.claude/skills/')));
});

test('new installation, trusted upgrade, and byte-preserving backups', async (t) => {
  const { plan } = await fixture(t);
  assert((await inspectInstallPlan(plan)).every((item) => item.status === 'new'));
  await installComponents(await inspectInstallPlan(plan), options);
  const before = await inspectInstallPlan(plan);
  assert(before.every((item) => item.status === 'managed'));
  const upgraded = await installComponents(before, { ...options, version: '0.5.1' });
  assert(upgraded.backups.every((entry) => !entry.backup.includes('/skills/') && !entry.backup.includes('/agents/')));
  for (const item of before) {
    const backup = upgraded.backups.find((entry) => entry.destination === item.destination);
    assert(backup);
    assert.equal(await snapshot(backup.backup), item.fingerprint);
    assert.equal(JSON.parse(await fs.readFile(item.metadata)).packageVersion, '0.5.1');
  }
  assert((await inspectInstallPlan(plan)).every((item) => item.status === 'managed'));
});

test('local edits and additional files are detected, runtime bytecode is ignored', async (t) => {
  const { plan } = await fixture(t);
  await installComponents(await inspectInstallPlan(plan), options);
  await fs.mkdir(path.join(plan[0].destination, '__pycache__'));
  await fs.writeFile(path.join(plan[0].destination, '__pycache__', 'runtime.pyc'), 'cache');
  assert.equal((await inspectInstallPlan(plan))[0].status, 'managed');
  await fs.writeFile(path.join(plan[0].destination, 'my-notes.md'), 'retain me');
  await fs.appendFile(plan[3].destination, '\n# local customization\n');
  const inspected = await inspectInstallPlan(plan);
  assert.equal(inspected[0].status, 'modified');
  assert.equal(inspected[3].status, 'modified');
});

test('a staging failure leaves every installed component intact', async (t) => {
  const { plan } = await fixture(t);
  await installComponents(await inspectInstallPlan(plan), options);
  const before = await inspectInstallPlan(plan);
  await assert.rejects(installComponents(before, {
    ...options, finalizeSkill: async () => { throw new Error('simulated preparation failure'); }
  }), /simulated preparation failure/);
  assert.deepEqual(await inspectInstallPlan(plan), before);
});

test('a replacement failure rolls back components and their metadata', async (t) => {
  const { plan } = await fixture(t);
  await installComponents(await inspectInstallPlan(plan), options);
  const before = await inspectInstallPlan(plan);
  let failed = false;
  await assert.rejects(installComponents(before, {
    ...options, version: '0.5.1', rename: async (source, destination) => {
      // Fail late, after a skill and native-agent metadata have already been replaced.
      if (!failed && destination === plan[4].destination && source.includes('.paper-workbench-stage-')) {
        failed = true;
        throw new Error('simulated disk failure');
      }
      return fs.rename(source, destination);
    }
  }), /simulated disk failure/);
  assert(failed);
  assert.deepEqual(await inspectInstallPlan(plan), before);
});

test('edits made after inspection are preserved and abort the transaction', async (t) => {
  const { plan } = await fixture(t);
  await installComponents(await inspectInstallPlan(plan), options);
  const inspected = await inspectInstallPlan(plan);
  const edited = path.join(plan[1].destination, 'SKILL.md');
  await fs.appendFile(edited, '\nUser edit during prompt.\n');
  await assert.rejects(installComponents(inspected, options), /changed during preparation/);
  assert.match(await fs.readFile(edited, 'utf8'), /User edit during prompt/);
  assert.equal(await snapshot(plan[0].destination), inspected[0].fingerprint);
});

test('backing up a symlink preserves its target without modifying external content', async (t) => {
  const { root, plan } = await fixture(t);
  const external = path.join(root, 'external-skill');
  await fs.mkdir(external);
  await fs.writeFile(path.join(external, 'keep.txt'), 'original');
  await fs.mkdir(path.dirname(plan[0].destination), { recursive: true });
  await fs.symlink(external, plan[0].destination);
  const installed = await installComponents(await inspectInstallPlan(plan), options);
  assert.equal(await fs.readFile(path.join(external, 'keep.txt'), 'utf8'), 'original');
  const backup = installed.backups.find((entry) => entry.destination === plan[0].destination);
  assert.equal(await fs.readlink(backup.backup), external);
});

test('CLI dry-run writes nothing and does not require a Python environment', async (t) => {
  const { root } = await fixture(t);
  const result = spawnSync(process.execPath, [cli, '--target', 'codex', '--dry-run', '--install-root', root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\.agents\/skills\/read-pdf/);
  assert.deepEqual(await fs.readdir(root), []);
});

test('unattended CLI refuses unmanaged files before executing the supplied runtime', async (t) => {
  const { root, plan } = await fixture(t);
  await fs.mkdir(plan[0].destination, { recursive: true });
  const userFile = path.join(plan[0].destination, 'custom.md');
  await fs.writeFile(userFile, 'user content');
  const result = spawnSync(process.execPath, [cli, '--target', 'codex', '--python', '/nonexistent/python', '--yes', '--install-root', root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /local changes or no trusted content manifest/);
  assert.equal(await fs.readFile(userFile, 'utf8'), 'user content');
});
