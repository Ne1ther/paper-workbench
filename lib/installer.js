import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_ROOT = fileURLToPath(new URL('../templates/', import.meta.url));
const SKILLS = ['read-pdf', 'paper-analyst', 'paper-review'];
const AGENTS = ['paper-analyst-agent', 'paper-review-agent'];
const META_NAME = '.installer-meta.json';

export function buildInstallPlan(target, { root = os.homedir(), templateRoot = TEMPLATE_ROOT } = {}) {
  if (!['codex', 'claude'].includes(target)) throw new Error(`Unknown target: ${target}`);
  const skillBase = path.join(root, target === 'codex' ? '.agents' : '.claude', 'skills');
  const plan = SKILLS.map((component) => ({
    component, kind: 'skill',
    template: path.join(templateRoot, component),
    destination: path.join(skillBase, component),
    backupBase: path.join(root, target === 'codex' ? '.agents' : '.claude', '.paper-workbench-backups'),
    metadata: path.join(skillBase, component, META_NAME)
  }));
  if (target === 'codex') {
    const agentBase = path.join(root, '.codex', 'agents');
    for (const component of AGENTS) {
      plan.push({
        component, kind: 'agent',
        template: path.join(templateRoot, 'agents', `${component}.toml`),
        destination: path.join(agentBase, `${component}.toml`),
        backupBase: path.join(root, '.codex', '.paper-workbench-backups'),
        metadata: path.join(agentBase, '.paper-workbench', `${component}.json`)
      });
    }
  }
  return plan;
}

function ignored(name) {
  return name === '__pycache__' || name.endsWith('.pyc') || name === '.DS_Store';
}

export async function snapshot(entry) {
  const records = [];
  async function visit(current, relative) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) {
      records.push([relative, 'symlink', await fs.readlink(current)]);
    } else if (stat.isDirectory()) {
      records.push([relative, 'directory']);
      for (const name of (await fs.readdir(current)).sort()) {
        if (!ignored(name) && name !== META_NAME) await visit(path.join(current, name), path.join(relative, name));
      }
    } else if (stat.isFile()) {
      records.push([relative, 'file', stat.mode & 0o111,
        createHash('sha256').update(await fs.readFile(current)).digest('hex')]);
    } else {
      throw new Error(`Unsupported installation entry: ${current}`);
    }
  }
  try {
    await visit(entry, '.');
  } catch (error) {
    if (error.code === 'ENOENT' && records.length === 0) return null;
    throw error;
  }
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

export async function inspectInstallPlan(plan) {
  return Promise.all(plan.map(async (item) => {
    const fingerprint = await snapshot(item.destination);
    const metadataFingerprint = await snapshot(item.metadata);
    let metadata = null;
    try {
      metadata = JSON.parse(await fs.readFile(item.metadata, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    const managed = metadata?.packageName === 'paper-workbench' && metadata?.component === item.component;
    const status = fingerprint === null ? 'new'
      : !managed || !metadata.fingerprint ? 'unmanaged'
        : metadata.fingerprint === fingerprint ? 'managed' : 'modified';
    return { ...item, fingerprint, metadataFingerprint, status };
  }));
}

export async function findLegacyEntries(target, root = os.homedir()) {
  const candidates = target === 'codex'
    ? [
      ...SKILLS.map((name) => path.join(root, '.codex', 'skills', name)),
      ...AGENTS.map((name) => path.join(root, '.codex', 'agents', name))
    ]
    : ['.config/claude-code/skills', '.claude-code/skills'].flatMap((base) =>
      SKILLS.map((name) => path.join(root, base, name)));
  const found = [];
  for (const candidate of candidates) {
    if (await snapshot(candidate) !== null) found.push(candidate);
  }
  return found;
}

// All replacements are prepared before any installed component is moved.
// rename is injectable so failure recovery can be exercised without damaging a real installation.
export async function installComponents(inspections, {
  version, target, environment, dependencyReady, finalizeSkill = async () => {}, rename = fs.rename
}) {
  const transaction = `${Date.now()}-${randomUUID()}`;
  const stages = [];
  const operations = [];
  const applied = [];
  try {
    for (const item of inspections) {
      const parent = path.dirname(item.destination);
      await fs.mkdir(parent, { recursive: true });
      const stage = await fs.mkdtemp(path.join(path.dirname(item.backupBase), '.paper-workbench-stage-'));
      stages.push(stage);
      const staged = path.join(stage, path.basename(item.destination));
      await fs.cp(item.template, staged, { recursive: true, filter: (source) => !ignored(path.basename(source)) });
      if (item.kind === 'skill') await finalizeSkill(item.component, staged);
      const metadata = {
        packageName: 'paper-workbench', packageVersion: version,
        component: item.component, componentType: item.kind,
        target, environment, dependencyReady, installedAt: new Date().toISOString(),
        fingerprint: await snapshot(staged)
      };
      const stagedMetadata = item.kind === 'skill' ? path.join(staged, META_NAME) : path.join(stage, 'metadata.json');
      await fs.writeFile(stagedMetadata, JSON.stringify(metadata, null, 2) + '\n');
      operations.push({ destination: item.destination, staged, expected: item.fingerprint, backupBase: item.backupBase });
      if (item.kind === 'agent') {
        operations.push({ destination: item.metadata, staged: stagedMetadata, expected: item.metadataFingerprint, backupBase: item.backupBase });
      }
    }

    // Refuse a changed source of truth, including edits made during a confirmation prompt.
    for (const item of inspections) {
      if (await snapshot(item.metadata) !== item.metadataFingerprint) {
        throw new Error(`Installation metadata changed during preparation: ${item.metadata}. Run again.`);
      }
    }
    for (const operation of operations) {
      if (await snapshot(operation.destination) !== operation.expected) {
        throw new Error(`Installation changed during preparation: ${operation.destination}. Run again.`);
      }
    }

    for (const operation of operations) {
      const entry = { ...operation, backup: null, installed: false };
      applied.push(entry);
      await fs.mkdir(path.dirname(entry.destination), { recursive: true });
      if (entry.expected !== null) {
        const backup = path.join(entry.backupBase, transaction, path.basename(entry.destination));
        await fs.mkdir(path.dirname(backup), { recursive: true });
        await rename(entry.destination, backup);
        entry.backup = backup;
      }
      await rename(entry.staged, entry.destination);
      entry.installed = true;
    }
    return {
      installed: inspections,
      backups: applied.filter((item) => item.backup).map(({ destination, backup }) => ({ destination, backup }))
    };
  } catch (error) {
    const recoveryErrors = [];
    for (const entry of applied.reverse()) {
      try {
        if (entry.installed) await fs.rm(entry.destination, { recursive: true, force: true });
        if (entry.backup) await fs.rename(entry.backup, entry.destination);
      } catch (recoveryError) {
        recoveryErrors.push(`${entry.destination}: ${recoveryError.message}; backup: ${entry.backup || 'none'}`);
      }
    }
    if (recoveryErrors.length) error.message += `\nRecovery requires attention:\n${recoveryErrors.join('\n')}`;
    throw error;
  } finally {
    for (const stage of stages) await fs.rm(stage, { recursive: true, force: true });
  }
}
