#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_ROOT = path.resolve(__dirname, '..', 'templates');
const SKILL_COMPONENTS = ['read-pdf', 'paper-analyst', 'paper-review'];
const CODEX_AGENT_COMPONENTS = ['paper-analyst-agent', 'paper-review-agent'];
const TARGETS = {
  codex: {
    label: 'Codex',
    skillBases: ['~/.codex/skills'],
    agentBase: '~/.codex/agents'
  },
  claude: {
    label: 'Claude Code',
    skillBases: ['~/.claude/skills', '~/.config/claude-code/skills', '~/.claude-code/skills'],
    agentBase: null
  }
};

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function c(text, ...styles) {
  return `${styles.join('')}${text}${ANSI.reset}`;
}

function expandHome(value) {
  if (!value.startsWith('~/')) return value;
  return path.join(os.homedir(), value.slice(2));
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function shellJoin(parts) {
  return parts.map((part) => shellQuote(part)).join(' ');
}

function quoted(parts) {
  return parts
    .map((part) => (part.includes(' ') ? `"${part}"` : part))
    .join(' ');
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function runCommand(cmd, args, cwd = process.cwd()) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error
  };
}

function buildBashTask(script) {
  return { cmd: 'bash', args: ['-lc', script] };
}

function firstWorkingCommand(candidates, args = ['--version']) {
  for (const candidate of uniq(candidates.map(expandHome))) {
    const result = runCommand(candidate, args);
    if (result.ok) {
      return candidate;
    }
  }
  return null;
}

function detectCondaCommand() {
  return firstWorkingCommand([
    'conda',
    '~/miniforge3/bin/conda',
    '~/mambaforge/bin/conda',
    '~/miniconda3/bin/conda',
    '~/anaconda3/bin/conda'
  ]);
}

function detectPythonCommand() {
  return firstWorkingCommand(['python3', 'python'], ['-V']);
}

function detectUvCommand() {
  return firstWorkingCommand(['uv', '~/.local/bin/uv', '~/bin/uv']);
}

function listCondaEnvs(condaCmd) {
  const result = runCommand(condaCmd, ['env', 'list']);
  if (!result.ok || !result.stdout) {
    return [];
  }

  const envs = [];
  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;

    const name = tokens[0] === '*' ? null : tokens[0];
    if (name) {
      envs.push(name);
    }
  }
  return uniq(envs);
}

function getCondaBase(condaCmd) {
  const result = runCommand(condaCmd, ['info', '--base']);
  if (result.ok && result.stdout) {
    return result.stdout;
  }

  const expanded = expandHome(condaCmd);
  if (expanded.includes(path.sep)) {
    return path.resolve(expanded, '..', '..');
  }
  return null;
}

function buildCondaShellScript(condaBase, envName, commandParts) {
  return [
    `source ${shellQuote(path.join(condaBase, 'etc', 'profile.d', 'conda.sh'))}`,
    `conda activate ${shellQuote(envName)}`,
    shellJoin(commandParts)
  ].join('\n');
}

function buildCondaWrapperBody(condaBase, envName) {
  return [
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `source ${shellQuote(path.join(condaBase, 'etc', 'profile.d', 'conda.sh'))}`,
    `conda activate ${shellQuote(envName)}`,
    'exec python "$SCRIPT_DIR/read_pdf.py" "$@"'
  ].join('\n');
}

function resolveSkillBase(targetKey) {
  for (const candidate of TARGETS[targetKey].skillBases) {
    const expanded = expandHome(candidate);
    if (existsSync(expanded)) {
      return expanded;
    }
  }
  return expandHome(TARGETS[targetKey].skillBases[0]);
}

function resolveAgentBase(targetKey) {
  const base = TARGETS[targetKey].agentBase;
  return base ? expandHome(base) : null;
}

function printBanner() {
  const bar = '='.repeat(64);
  console.log(c(bar, ANSI.cyan));
  console.log(c('paper-workbench installer', ANSI.bold, ANSI.cyan));
  console.log(c(bar, ANSI.cyan));
  console.log(c('Install flow: Environment -> PyMuPDF check -> Target install\n', ANSI.dim));
}

function printStep(index, total, title) {
  console.log(`\n${c(`[Step ${index}/${total}]`, ANSI.bold, ANSI.magenta)} ${c(title, ANSI.bold)}`);
}

function info(message) {
  console.log(`${c('[INFO]', ANSI.cyan)} ${message}`);
}

function ok(message) {
  console.log(`${c('[OK]', ANSI.green)} ${message}`);
}

function warn(message) {
  console.log(`${c('[WARN]', ANSI.yellow)} ${message}`);
}

async function askLine(rl, question, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function chooseOne(rl, title, options, defaultIndex = null) {
  console.log(`\n${title}`);
  options.forEach((option, index) => {
    const marker = defaultIndex === index ? c(' (default)', ANSI.dim) : '';
    console.log(`  ${index + 1}. ${option.label}${marker}`);
    if (option.hint) {
      console.log(c(`     ${option.hint}`, ANSI.dim));
    }
  });

  const prompt = defaultIndex === null ? 'Enter choice number: ' : `Enter choice number [${defaultIndex + 1}]: `;
  while (true) {
    const raw = (await rl.question(prompt)).trim();
    if (!raw && defaultIndex !== null) {
      return options[defaultIndex];
    }

    const selected = Number(raw);
    if (Number.isInteger(selected) && selected >= 1 && selected <= options.length) {
      return options[selected - 1];
    }
    warn('Invalid input. Please enter a valid number.');
  }
}

async function confirm(rl, question, defaultYes = true) {
  const suffix = defaultYes ? ' [Y/n]: ' : ' [y/N]: ';
  const raw = (await rl.question(question + suffix)).trim().toLowerCase();
  if (!raw) return defaultYes;
  if (['y', 'yes'].includes(raw)) return true;
  if (['n', 'no'].includes(raw)) return false;
  return defaultYes;
}

async function configureNative(rl) {
  const detected = detectPythonCommand();
  if (!detected) {
    throw new Error('Could not detect python3/python in PATH.');
  }

  info(`Detected Python command: ${detected}`);
  const useDetected = await confirm(rl, `Use ${detected}?`, true);
  const pythonCmd = useDetected ? detected : await askLine(rl, 'Python command', detected);

  return {
    type: 'native',
    name: `native (${pythonCmd})`,
    check: { cmd: pythonCmd, args: ['-V'] },
    detect: { cmd: pythonCmd, args: ['-c', 'import fitz'] },
    install: { cmd: pythonCmd, args: ['-m', 'pip', 'install', '--upgrade', 'PyMuPDF'] },
    manualCommandText: `${pythonCmd} scripts/read_pdf.py <pdf_path> [options]`,
    wrapperBody: [
      'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      `exec ${shellQuote(pythonCmd)} "$SCRIPT_DIR/read_pdf.py" "$@"`
    ].join('\n')
  };
}

async function configureConda(rl) {
  const condaCmd = detectCondaCommand();
  if (!condaCmd) {
    throw new Error('Conda was selected but no conda executable was found.');
  }

  const condaBase = getCondaBase(condaCmd);
  if (!condaBase) {
    throw new Error('Detected conda, but could not resolve its base directory.');
  }

  info(`Detected conda command: ${condaCmd}`);

  const envs = listCondaEnvs(condaCmd);
  let envName = 'base';
  if (envs.length) {
    const defaultIndex = envs.includes('torch_t') ? envs.indexOf('torch_t') : 0;
    const choice = await chooseOne(
      rl,
      'Select a conda environment:',
      [
        ...envs.map((name) => ({ label: name })),
        { label: 'Enter env name manually', hint: 'Use this if your env is not listed.' }
      ],
      defaultIndex
    );

    envName = choice.label === 'Enter env name manually'
      ? await askLine(rl, 'Conda env name', 'base')
      : choice.label;
  } else {
    warn('No conda envs were listed. Falling back to manual env name input.');
    envName = await askLine(rl, 'Conda env name', 'base');
  }

  return {
    type: 'conda',
    name: `conda (${envName})`,
    check: { cmd: condaCmd, args: ['--version'] },
    detect: buildBashTask(buildCondaShellScript(condaBase, envName, ['python', '-c', 'import fitz'])),
    install: buildBashTask(buildCondaShellScript(condaBase, envName, ['python', '-m', 'pip', 'install', '--upgrade', 'PyMuPDF'])),
    manualCommandText: `source ${path.join(condaBase, 'etc', 'profile.d', 'conda.sh')} && conda activate ${envName} && python scripts/read_pdf.py <pdf_path> [options]`,
    wrapperBody: buildCondaWrapperBody(condaBase, envName)
  };
}

async function configureUv(rl) {
  const uvCmd = detectUvCommand();
  if (!uvCmd) {
    throw new Error('uv was selected but no uv executable was found.');
  }

  info(`Detected uv command: ${uvCmd}`);
  info('uv managed mode can inject PyMuPDF without touching your current environment.');

  const useManaged = await confirm(
    rl,
    'Use uv managed mode (recommended, no manual PyMuPDF install needed)?',
    true
  );

  if (useManaged) {
    return {
      type: 'uv',
      name: 'uv (managed)',
      check: { cmd: uvCmd, args: ['--version'] },
      detect: { cmd: uvCmd, args: ['run', '--with', 'PyMuPDF', 'python', '-c', 'import fitz'] },
      install: null,
      manualCommandText: `${uvCmd} run --with PyMuPDF python scripts/read_pdf.py <pdf_path> [options]`,
      wrapperBody: [
        'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
        `exec ${shellQuote(uvCmd)} run --with PyMuPDF python "$SCRIPT_DIR/read_pdf.py" "$@"`
      ].join('\n')
    };
  }

  return {
    type: 'uv',
    name: 'uv (current env)',
    check: { cmd: uvCmd, args: ['--version'] },
    detect: { cmd: uvCmd, args: ['run', 'python', '-c', 'import fitz'] },
    install: { cmd: uvCmd, args: ['pip', 'install', '--upgrade', 'PyMuPDF'] },
    manualCommandText: `${uvCmd} run python scripts/read_pdf.py <pdf_path> [options]`,
    wrapperBody: [
      'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      `exec ${shellQuote(uvCmd)} run python "$SCRIPT_DIR/read_pdf.py" "$@"`
    ].join('\n')
  };
}

async function prepareEnvironment(rl) {
  const runtime = await chooseOne(rl, 'Select Python runtime type:', [
    { key: 'native', label: 'Native Python', hint: 'Use python3/python from PATH.' },
    { key: 'conda', label: 'Conda', hint: 'Activate a conda env and wrap read-pdf with it.' },
    { key: 'uv', label: 'uv', hint: 'Use uv in managed mode or from the current env.' }
  ], 1);

  if (runtime.key === 'native') return configureNative(rl);
  if (runtime.key === 'conda') return configureConda(rl);
  return configureUv(rl);
}

async function checkAndInstallDependency(rl, envConfig) {
  printStep(2, 3, `Checking PyMuPDF in ${envConfig.name}`);

  const detectResult = runCommand(envConfig.detect.cmd, envConfig.detect.args);
  if (detectResult.ok) {
    ok('PyMuPDF check passed.');
    return true;
  }

  warn('PyMuPDF is not available in the selected runtime.');
  if (!envConfig.install) {
    warn('No install step is required in managed uv mode, but runtime check still failed.');
    if (detectResult.stderr) {
      console.log(c(detectResult.stderr, ANSI.dim));
    }
    return false;
  }

  info(`Suggested install command:\n  ${quoted([envConfig.install.cmd, ...envConfig.install.args])}`);
  const shouldInstall = await confirm(rl, 'Install PyMuPDF now?', true);
  if (!shouldInstall) {
    return false;
  }

  info('Installing PyMuPDF...');
  const installResult = runCommand(envConfig.install.cmd, envConfig.install.args);
  if (!installResult.ok) {
    warn('Automatic installation failed.');
    if (installResult.stderr) {
      console.log(c(installResult.stderr, ANSI.dim));
    }
    return false;
  }

  ok('PyMuPDF installed successfully.');
  return true;
}

async function chooseTarget(rl) {
  printStep(3, 3, 'Select installation target');
  return chooseOne(rl, 'Where should paper-workbench be installed?', [
    {
      key: 'codex',
      label: 'Codex',
      hint: '~/.codex/skills plus ~/.codex/agents for the paper agents'
    },
    {
      key: 'claude',
      label: 'Claude Code',
      hint: '~/.claude/skills (skills only; agent profiles are skipped)'
    }
  ], 0);
}

function buildInstallPlan(targetKey) {
  const plan = [];
  const skillBase = resolveSkillBase(targetKey);
  for (const component of SKILL_COMPONENTS) {
    plan.push({
      component,
      kind: 'skill',
      templateDir: path.join(TEMPLATE_ROOT, component),
      destination: path.join(skillBase, component)
    });
  }

  const agentBase = resolveAgentBase(targetKey);
  if (agentBase) {
    for (const component of CODEX_AGENT_COMPONENTS) {
      plan.push({
        component,
        kind: 'agent',
        templateDir: path.join(TEMPLATE_ROOT, 'agents', component),
        destination: path.join(agentBase, component)
      });
    }
  }

  return plan;
}

async function ensureOverwrite(rl, plan) {
  const existing = plan.filter((item) => existsSync(item.destination));
  if (!existing.length) {
    return;
  }

  const preview = existing
    .map((item) => `- ${item.kind}: ${item.destination}`)
    .join('\n');
  const confirmed = await confirm(
    rl,
    `These components already exist and will be replaced:\n${preview}\nOverwrite them?`,
    false
  );
  if (!confirmed) {
    throw new Error('Installation cancelled by user.');
  }
}

async function finalizeReadPdfSkill(destination, envConfig) {
  const templatePath = path.join(destination, 'SKILL.template.md');
  const finalSkillPath = path.join(destination, 'SKILL.md');
  const template = await fs.readFile(templatePath, 'utf8');
  const finalContent = template
    .replaceAll('{{WRAPPER_COMMAND}}', 'bash scripts/run_read_pdf.sh <pdf_path> [options]')
    .replaceAll('{{MANUAL_COMMAND}}', envConfig.manualCommandText);

  await fs.writeFile(finalSkillPath, finalContent, 'utf8');
  await fs.rm(templatePath);

  const wrapperPath = path.join(destination, 'scripts', 'run_read_pdf.sh');
  const wrapper = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    envConfig.wrapperBody,
    ''
  ].join('\n');
  await fs.writeFile(wrapperPath, wrapper, 'utf8');
  await fs.chmod(wrapperPath, 0o755);
}

async function writeMetadata(destination, payload) {
  const metadataPath = path.join(destination, '.installer-meta.json');
  await fs.writeFile(metadataPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function installPlan(plan, targetKey, envConfig, dependencyReady) {
  const installed = [];

  for (const item of plan) {
    await fs.rm(item.destination, { recursive: true, force: true });
    await fs.mkdir(path.dirname(item.destination), { recursive: true });
    await fs.cp(item.templateDir, item.destination, { recursive: true });

    if (item.kind === 'skill' && item.component === 'read-pdf') {
      await finalizeReadPdfSkill(item.destination, envConfig);
    }

    await writeMetadata(item.destination, {
      installedAt: new Date().toISOString(),
      packageName: 'paper-workbench',
      target: targetKey,
      component: item.component,
      componentType: item.kind,
      environment: envConfig.type,
      dependencyReady
    });

    installed.push(item);
  }

  return installed;
}

async function main() {
  printBanner();

  const rl = createInterface({ input, output });
  try {
    printStep(1, 3, 'Select Python environment');
    const envConfig = await prepareEnvironment(rl);

    const checkResult = runCommand(envConfig.check.cmd, envConfig.check.args);
    if (!checkResult.ok) {
      throw new Error(`Failed to run runtime command: ${envConfig.check.cmd}`);
    }

    ok(`Runtime selected: ${envConfig.name}`);
    info(`Installed read-pdf wrapper will expose:\n  bash scripts/run_read_pdf.sh <pdf_path> [options]`);
    info(`Manual fallback command:\n  ${envConfig.manualCommandText}`);

    const dependencyReady = await checkAndInstallDependency(rl, envConfig);
    const target = await chooseTarget(rl);
    const plan = buildInstallPlan(target.key);
    await ensureOverwrite(rl, plan);
    const installed = await installPlan(plan, target.key, envConfig, dependencyReady);

    console.log('\n' + c('-'.repeat(64), ANSI.cyan));
    ok('Installation completed.');
    info(`Target: ${TARGETS[target.key].label}`);
    for (const item of installed) {
      info(`Installed ${item.kind}: ${item.destination}`);
    }
    if (target.key === 'claude') {
      warn('Claude Code installs the skill pack only. Codex-specific agents were skipped.');
    }
    if (!dependencyReady) {
      warn('PyMuPDF is not ready yet. Install it before using read-pdf.');
    }
    console.log(c('-'.repeat(64), ANSI.cyan));
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\n${c('[ERROR]', ANSI.red)} ${error.message}`);
  process.exitCode = 1;
});
