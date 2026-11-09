#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { buildInstallPlan, findLegacyEntries, inspectInstallPlan, installComponents } from '../lib/installer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
const TARGETS = {
  codex: {
    label: 'Codex'
  },
  claude: {
    label: 'Claude Code'
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

function printBanner() {
  const bar = '='.repeat(64);
  console.log(c(bar, ANSI.cyan));
  console.log(c(`paper-workbench ${PACKAGE.version} installer`, ANSI.bold, ANSI.cyan));
  console.log(c(bar, ANSI.cyan));
  console.log(c('Install flow: Target preview -> Environment -> PyMuPDF check -> Safe install\n', ANSI.dim));
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

async function configureNative(rl, suppliedPython) {
  const detected = suppliedPython || detectPythonCommand();
  if (!detected) {
    throw new Error('Could not detect python3/python in PATH.');
  }

  info(`Detected Python command: ${detected}`);
  const useDetected = suppliedPython || await confirm(rl, `Use ${detected}?`, true);
  const pythonCmd = useDetected ? detected : await askLine(rl, 'Python command', detected);

  return {
    type: 'native',
    name: `native (${pythonCmd})`,
    check: { cmd: pythonCmd, args: ['-V'] },
    detect: { cmd: pythonCmd, args: ['-c', 'import pymupdf'] },
    install: { cmd: pythonCmd, args: ['-m', 'pip', 'install', '--upgrade', 'PyMuPDF'] },
    manualCommandText: `${shellQuote(pythonCmd)} scripts/read_pdf.py <pdf_path> [options]`,
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
    detect: buildBashTask(buildCondaShellScript(condaBase, envName, ['python', '-c', 'import pymupdf'])),
    install: buildBashTask(buildCondaShellScript(condaBase, envName, ['python', '-m', 'pip', 'install', '--upgrade', 'PyMuPDF'])),
    manualCommandText: `source ${shellQuote(path.join(condaBase, 'etc', 'profile.d', 'conda.sh'))} && conda activate ${shellQuote(envName)} && python scripts/read_pdf.py <pdf_path> [options]`,
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
      detect: { cmd: uvCmd, args: ['run', '--with', 'PyMuPDF', 'python', '-c', 'import pymupdf'] },
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
    detect: { cmd: uvCmd, args: ['run', 'python', '-c', 'import pymupdf'] },
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

async function checkAndInstallDependency(rl, envConfig, unattended = false) {
  printStep(3, 3, `Checking PyMuPDF in ${envConfig.name}`);

  const detectResult = runCommand(envConfig.detect.cmd, envConfig.detect.args);
  if (detectResult.ok) {
    ok('PyMuPDF check passed.');
    return true;
  }

  warn('PyMuPDF is not available in the selected runtime.');
  if (unattended) {
    throw new Error(`PyMuPDF check failed. Install it in the selected Python runtime before retrying.\n${detectResult.stderr}`);
  }
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

  const recheck = runCommand(envConfig.detect.cmd, envConfig.detect.args);
  if (!recheck.ok) throw new Error(`PyMuPDF import still fails after installation.\n${recheck.stderr}`);
  ok('PyMuPDF installed and import verified.');
  return true;
}

async function chooseTarget(rl) {
  printStep(1, 3, 'Select installation target');
  return chooseOne(rl, 'Where should paper-workbench be installed?', [
    {
      key: 'codex',
      label: 'Codex',
      hint: '~/.agents/skills plus native TOML agents in ~/.codex/agents'
    },
    {
      key: 'claude',
      label: 'Claude Code',
      hint: '~/.claude/skills (skills only; agent profiles are skipped)'
    }
  ], 0);
}

async function ensureOverwrite(rl, inspections, options) {
  const existing = inspections.filter((item) => item.status !== 'new');
  if (!existing.length) {
    return;
  }

  const preview = existing
    .map((item) => `- ${item.status}: ${item.destination}`)
    .join('\n');
  const conflicts = existing.filter((item) => item.status !== 'managed');
  if (options.yes) {
    if (conflicts.length && !options.force) {
      throw new Error(`Existing components have local changes or no trusted content manifest:\n${preview}\nInspect them first. Use --force --yes to replace with backups.`);
    }
    return;
  }
  const confirmed = await confirm(
    rl,
    `These components already exist:\n${preview}\nReplace them and retain backups?`,
    false
  );
  if (!confirmed) {
    throw new Error('Installation cancelled by user.');
  }
}

async function finalizeReadPdfSkill(destination, envConfig, installedDestination = destination) {
  const templatePath = path.join(destination, 'SKILL.template.md');
  const finalSkillPath = path.join(destination, 'SKILL.md');
  const template = await fs.readFile(templatePath, 'utf8');
  const finalContent = template
    .replaceAll('{{WRAPPER_COMMAND}}', `bash ${shellQuote(path.join(installedDestination, 'scripts', 'run_read_pdf.sh'))} <pdf_path> [options]`)
    .replaceAll('{{SKILL_DIRECTORY}}', shellQuote(installedDestination))
    .replaceAll('{{MANUAL_COMMAND}}', envConfig.manualCommandText.replace('scripts/read_pdf.py', shellQuote(path.join(installedDestination, 'scripts', 'read_pdf.py'))));

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

function parseOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (['--target', '--python', '--install-root'].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = argv[++i];
    } else if (['--yes', '--force', '--dry-run', '--help', '--version'].includes(arg)) {
      options[arg.slice(2)] = true;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.target && !TARGETS[options.target]) throw new Error('Target must be codex or claude.');
  if (options.yes && (!options.target || !options.python)) throw new Error('--yes requires --target and --python.');
  if (options.force && !options.yes) throw new Error('--force requires --yes. Interactive installs ask before overwriting.');
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('paper-workbench [--target codex|claude] [--python /path/to/python] [--yes [--force]] [--dry-run]\n\n--dry-run       Inspect destinations and local changes without writing or checking dependencies.\n--yes           Install using the supplied Python; refuse unmanaged or modified components.\n--force         Allow those replacements with retained backups. No dependency installation in --yes mode.\n--install-root  Use a separate home-style layout, for staging or isolated validation.\n--version       Print the package version.');
    return;
  }
  if (options.version) { console.log(PACKAGE.version); return; }
  printBanner();
  if (!input.isTTY && !options.target) throw new Error('Specify --target codex or --target claude in non-interactive mode.');

  const rl = createInterface({ input, output });
  try {
    const target = options.target ? { key: options.target } : await chooseTarget(rl);
    const installRoot = options['install-root'] ? path.resolve(expandHome(options['install-root'])) : os.homedir();
    const plan = buildInstallPlan(target.key, { root: installRoot });
    const inspections = await inspectInstallPlan(plan);
    for (const item of inspections) info(`${item.status}: ${item.kind} ${item.destination}`);
    for (const legacy of await findLegacyEntries(target.key, installRoot)) warn(`Legacy entry preserved: ${legacy}`);
    if (options['dry-run']) return;
    if (!input.isTTY && !options.yes) throw new Error('Non-interactive installation requires --target, --python, and --yes.');
    await ensureOverwrite(rl, inspections, options);
    printStep(2, 3, 'Select Python environment');
    const envConfig = options.python ? await configureNative(rl, options.python) : await prepareEnvironment(rl);

    const checkResult = runCommand(envConfig.check.cmd, envConfig.check.args);
    if (!checkResult.ok) {
      throw new Error(`Failed to run runtime command: ${envConfig.check.cmd}`);
    }

    ok(`Runtime selected: ${envConfig.name}`);
    info(`Installed read-pdf wrapper:\n  bash ${shellQuote(path.join(plan[0].destination, 'scripts/run_read_pdf.sh'))} <pdf_path> [options]`);
    info(`Manual fallback command:\n  ${envConfig.manualCommandText}`);

    const dependencyReady = await checkAndInstallDependency(rl, envConfig, options.yes);
    if (!dependencyReady) throw new Error('Installation stopped because PyMuPDF is not ready. Existing components were preserved.');
    const { installed, backups } = await installComponents(inspections, {
      version: PACKAGE.version, target: target.key, environment: envConfig.type, dependencyReady,
      finalizeSkill: async (component, staged) => {
        if (component === 'read-pdf') await finalizeReadPdfSkill(staged, envConfig, plan.find((item) => item.component === component).destination);
      }
    });

    console.log('\n' + c('-'.repeat(64), ANSI.cyan));
    ok('Installation completed.');
    info(`Target: ${TARGETS[target.key].label}`);
    for (const item of installed) {
      info(`Installed ${item.kind}: ${item.destination}`);
    }
    for (const item of backups) info(`Backup: ${item.backup}`);
    if (target.key === 'claude') {
      warn('Claude Code installs the skill pack only. Codex-specific agents were skipped.');
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
