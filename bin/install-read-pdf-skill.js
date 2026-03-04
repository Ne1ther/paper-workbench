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
const TEMPLATE_DIR = path.resolve(__dirname, '..', 'templates', 'read-pdf');

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

function expandHome(p) {
  if (!p.startsWith('~/')) return p;
  return path.join(os.homedir(), p.slice(2));
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

function quoted(parts) {
  return parts
    .map((part) => (part.includes(' ') ? `"${part}"` : part))
    .join(' ');
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function printBanner() {
  const bar = '='.repeat(64);
  console.log(c(bar, ANSI.cyan));
  console.log(c('read-pdf-skill installer', ANSI.bold, ANSI.cyan));
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
  options.forEach((option, idx) => {
    const marker = defaultIndex === idx ? c(' (default)', ANSI.dim) : '';
    console.log(`  ${idx + 1}. ${option.label}${marker}`);
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

    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1 && num <= options.length) {
      return options[num - 1];
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

function firstWorkingCommand(candidates, args = ['--version']) {
  for (const candidate of uniq(candidates.map(expandHome))) {
    const res = runCommand(candidate, args);
    if (res.ok) {
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

function listCondaEnvs(condaCmd) {
  const res = runCommand(condaCmd, ['env', 'list']);
  if (!res.ok || !res.stdout) {
    return [];
  }

  const envs = [];
  for (const line of res.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0] === '*' ? null : tokens[0];
    if (name && name !== '*') {
      envs.push(name);
    }
  }
  return uniq(envs);
}

function detectPythonCommand() {
  return firstWorkingCommand(['python3', 'python'], ['-V']);
}

function detectUvCommand() {
  return firstWorkingCommand(['uv', '~/.local/bin/uv', '~/bin/uv']);
}

function resolveTargetBase(target) {
  const map = {
    codex: ['~/.codex/skills'],
    claude: ['~/.claude/skills', '~/.config/claude-code/skills', '~/.claude-code/skills']
  };

  for (const cpath of map[target]) {
    const expanded = expandHome(cpath);
    if (existsSync(expanded)) {
      return expanded;
    }
  }
  return expandHome(map[target][0]);
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
    runCommandText: `${pythonCmd} scripts/read_pdf.py <pdf_path> [options]`
  };
}

async function configureConda(rl) {
  const condaCmd = detectCondaCommand();
  if (!condaCmd) {
    throw new Error('Conda was selected but no conda executable was found.');
  }

  info(`Detected conda command: ${condaCmd}`);

  const envs = listCondaEnvs(condaCmd);
  if (envs.length === 0) {
    warn('No conda envs were listed. Falling back to manual env name input.');
    const envName = await askLine(rl, 'Conda env name', 'base');
    return {
      type: 'conda',
      name: `conda (${envName})`,
      check: { cmd: condaCmd, args: ['--version'] },
      detect: { cmd: condaCmd, args: ['run', '-n', envName, 'python', '-c', 'import fitz'] },
      install: {
        cmd: condaCmd,
        args: ['run', '-n', envName, 'python', '-m', 'pip', 'install', '--upgrade', 'PyMuPDF']
      },
      runCommandText: `${condaCmd} run -n ${envName} python scripts/read_pdf.py <pdf_path> [options]`
    };
  }

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

  const envName = choice.label === 'Enter env name manually'
    ? await askLine(rl, 'Conda env name', 'base')
    : choice.label;

  return {
    type: 'conda',
    name: `conda (${envName})`,
    check: { cmd: condaCmd, args: ['--version'] },
    detect: { cmd: condaCmd, args: ['run', '-n', envName, 'python', '-c', 'import fitz'] },
    install: {
      cmd: condaCmd,
      args: ['run', '-n', envName, 'python', '-m', 'pip', 'install', '--upgrade', 'PyMuPDF']
    },
    runCommandText: `${condaCmd} run -n ${envName} python scripts/read_pdf.py <pdf_path> [options]`
  };
}

async function configureUv(rl) {
  const uvCmd = detectUvCommand();
  if (!uvCmd) {
    throw new Error('uv was selected but no uv executable was found.');
  }

  info(`Detected uv command: ${uvCmd}`);
  info('uv mode uses dependency injection for reliability: uv run --with PyMuPDF ...');

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
      runCommandText: `${uvCmd} run --with PyMuPDF python scripts/read_pdf.py <pdf_path> [options]`
    };
  }

  return {
    type: 'uv',
    name: 'uv (current env)',
    check: { cmd: uvCmd, args: ['--version'] },
    detect: { cmd: uvCmd, args: ['run', 'python', '-c', 'import fitz'] },
    install: { cmd: uvCmd, args: ['pip', 'install', '--upgrade', 'PyMuPDF'] },
    runCommandText: `${uvCmd} run python scripts/read_pdf.py <pdf_path> [options]`
  };
}

async function prepareEnvironment(rl) {
  const env = await chooseOne(rl, 'Select Python runtime type:', [
    { key: 'native', label: 'Native Python', hint: 'Use python3/python from PATH.' },
    { key: 'conda', label: 'Conda', hint: 'Auto-detect conda and list available envs.' },
    { key: 'uv', label: 'uv', hint: 'Auto-detect uv. Managed mode can inject PyMuPDF.' }
  ], 1);

  if (env.key === 'native') return configureNative(rl);
  if (env.key === 'conda') return configureConda(rl);
  return configureUv(rl);
}

async function checkAndInstallDependency(rl, envConfig) {
  printStep(2, 3, `Checking PyMuPDF in ${envConfig.name}`);

  const detectRes = runCommand(envConfig.detect.cmd, envConfig.detect.args);
  if (detectRes.ok) {
    ok('PyMuPDF check passed.');
    return true;
  }

  warn('PyMuPDF is not available in the selected runtime.');

  if (!envConfig.install) {
    warn('No install step is required in managed uv mode, but runtime check still failed.');
    if (detectRes.stderr) {
      console.log(c(detectRes.stderr, ANSI.dim));
    }
    return false;
  }

  info(`Suggested install command:\n  ${quoted([envConfig.install.cmd, ...envConfig.install.args])}`);
  const shouldInstall = await confirm(rl, 'Install PyMuPDF now?', true);
  if (!shouldInstall) {
    return false;
  }

  info('Installing PyMuPDF...');
  const installRes = runCommand(envConfig.install.cmd, envConfig.install.args);
  if (!installRes.ok) {
    warn('Automatic installation failed.');
    if (installRes.stderr) {
      console.log(c(installRes.stderr, ANSI.dim));
    }
    return false;
  }

  ok('PyMuPDF installed successfully.');
  return true;
}

async function installSkillFiles(rl, targetDir, runCommandText, envType, dependencyReady) {
  const destination = path.join(targetDir, 'read-pdf');

  if (existsSync(destination)) {
    const shouldOverwrite = await confirm(rl, `Target exists (${destination}). Overwrite?`, false);
    if (!shouldOverwrite) {
      throw new Error('Installation cancelled by user.');
    }
    await fs.rm(destination, { recursive: true, force: true });
  }

  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(TEMPLATE_DIR, destination, { recursive: true });

  const templatePath = path.join(destination, 'SKILL.template.md');
  const finalSkillPath = path.join(destination, 'SKILL.md');
  const templateContent = await fs.readFile(templatePath, 'utf8');
  const finalContent = templateContent.replace('{{RUN_COMMAND}}', runCommandText);

  await fs.writeFile(finalSkillPath, finalContent, 'utf8');
  await fs.rm(templatePath);

  const metaPath = path.join(destination, '.installer-meta.json');
  const metadata = {
    installedAt: new Date().toISOString(),
    environment: envType,
    runCommand: runCommandText,
    dependencyReady
  };
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

  return destination;
}

async function chooseTarget(rl) {
  printStep(3, 3, 'Select installation target');
  return chooseOne(rl, 'Where should read-pdf be installed?', [
    { key: 'codex', label: 'Codex', hint: '~/.codex/skills/read-pdf' },
    { key: 'claude', label: 'Claude Code', hint: '~/.claude/skills/read-pdf' }
  ], 0);
}

async function main() {
  printBanner();

  const rl = createInterface({ input, output });
  try {
    printStep(1, 3, 'Select Python environment');
    const envConfig = await prepareEnvironment(rl);

    const checkRes = runCommand(envConfig.check.cmd, envConfig.check.args);
    if (!checkRes.ok) {
      throw new Error(`Failed to run runtime command: ${envConfig.check.cmd}`);
    }

    ok(`Runtime selected: ${envConfig.name}`);
    info(`Skill run command will be:\n  ${envConfig.runCommandText}`);

    const dependencyReady = await checkAndInstallDependency(rl, envConfig);
    const target = await chooseTarget(rl);
    const targetBase = resolveTargetBase(target.key);

    const installedPath = await installSkillFiles(
      rl,
      targetBase,
      envConfig.runCommandText,
      envConfig.type,
      dependencyReady
    );

    console.log('\n' + c('-'.repeat(64), ANSI.cyan));
    ok('Installation completed.');
    info(`Installed path: ${installedPath}`);
    info(`Run command: ${envConfig.runCommandText}`);
    if (!dependencyReady) {
      warn('PyMuPDF is not ready yet. Install it before using the skill.');
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
