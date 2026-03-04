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

async function askLine(rl, question, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function chooseOne(rl, title, options) {
  console.log(`\n${title}`);
  options.forEach((option, idx) => {
    console.log(`  ${idx + 1}. ${option.label}`);
  });

  while (true) {
    const raw = (await rl.question('请输入编号: ')).trim();
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1 && num <= options.length) {
      return options[num - 1];
    }
    console.log('输入无效，请重新输入。');
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

function resolveTargetBase(target) {
  const map = {
    codex: ['~/.codex/skills'],
    claude: ['~/.claude/skills', '~/.config/claude-code/skills', '~/.claude-code/skills']
  };
  const candidates = map[target];
  for (const c of candidates) {
    const expanded = expandHome(c);
    if (existsSync(expanded)) {
      return expanded;
    }
  }
  return expandHome(candidates[0]);
}

async function prepareEnvironment(rl) {
  const env = await chooseOne(rl, 'Step 1/3 选择 Python 环境:', [
    { key: 'native', label: '原生 Python (python3 / 自定义 python 命令)' },
    { key: 'conda', label: 'Conda 环境' },
    { key: 'uv', label: 'uv 环境' }
  ]);

  if (env.key === 'native') {
    const pythonCmd = await askLine(rl, 'Python 命令', 'python3');
    return {
      type: 'native',
      check: { cmd: pythonCmd, args: ['-V'] },
      detect: { cmd: pythonCmd, args: ['-c', 'import fitz'] },
      install: { cmd: pythonCmd, args: ['-m', 'pip', 'install', '--upgrade', 'PyMuPDF'] },
      runCommandText: `${pythonCmd} scripts/read_pdf.py <pdf_path> [options]`
    };
  }

  if (env.key === 'conda') {
    const condaCmdInput = await askLine(rl, 'Conda 命令路径', 'conda');
    const condaCmd = expandHome(condaCmdInput);
    const envName = await askLine(rl, 'Conda 环境名', 'torch_t');
    return {
      type: 'conda',
      check: { cmd: condaCmd, args: ['--version'] },
      detect: { cmd: condaCmd, args: ['run', '-n', envName, 'python', '-c', 'import fitz'] },
      install: {
        cmd: condaCmd,
        args: ['run', '-n', envName, 'python', '-m', 'pip', 'install', '--upgrade', 'PyMuPDF']
      },
      runCommandText: `${condaCmdInput} run -n ${envName} python scripts/read_pdf.py <pdf_path> [options]`
    };
  }

  const uvCmdInput = await askLine(rl, 'uv 命令路径', 'uv');
  const uvCmd = expandHome(uvCmdInput);
  return {
    type: 'uv',
    check: { cmd: uvCmd, args: ['--version'] },
    detect: { cmd: uvCmd, args: ['run', 'python', '-c', 'import fitz'] },
    install: { cmd: uvCmd, args: ['pip', 'install', '--upgrade', 'PyMuPDF'] },
    runCommandText: `${uvCmdInput} run python scripts/read_pdf.py <pdf_path> [options]`
  };
}

async function installSkillFiles(rl, targetDir, runCommandText, envType, dependencyReady) {
  const destination = path.join(targetDir, 'read-pdf');

  if (existsSync(destination)) {
    const shouldOverwrite = await confirm(rl, `目标目录已存在: ${destination}，是否覆盖?`, false);
    if (!shouldOverwrite) {
      throw new Error('用户取消覆盖，安装终止。');
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

async function main() {
  console.log('read-pdf skill installer');
  console.log('此安装器会完成: 环境选择 -> PyMuPDF 检测 -> 安装目标选择。\n');

  const rl = createInterface({ input, output });
  try {
    const env = await prepareEnvironment(rl);

    const checkRes = runCommand(env.check.cmd, env.check.args);
    if (!checkRes.ok) {
      throw new Error(`找不到环境命令: ${env.check.cmd}\n${checkRes.error?.message || checkRes.stderr || ''}`.trim());
    }

    console.log('\nStep 2/3 检测 PyMuPDF (fitz) 是否存在...');
    const detectRes = runCommand(env.detect.cmd, env.detect.args);
    let dependencyReady = detectRes.ok;

    if (dependencyReady) {
      console.log('检测结果: 已安装 PyMuPDF。');
    } else {
      console.log('检测结果: 未检测到 PyMuPDF。');
      console.log(`建议安装命令: ${quoted([env.install.cmd, ...env.install.args])}`);
      const shouldInstall = await confirm(rl, '是否现在自动安装 PyMuPDF?', true);
      if (shouldInstall) {
        const installRes = runCommand(env.install.cmd, env.install.args);
        dependencyReady = installRes.ok;
        if (!installRes.ok) {
          console.log('自动安装失败，请手动执行上面的安装命令。');
          if (installRes.stderr) {
            console.log(`错误输出:\n${installRes.stderr}`);
          }
        } else {
          console.log('PyMuPDF 安装完成。');
        }
      }
    }

    const target = await chooseOne(rl, '\nStep 3/3 选择安装目标:', [
      { key: 'codex', label: 'Codex (~/.codex/skills/read-pdf)' },
      { key: 'claude', label: 'Claude Code (~/.claude/skills/read-pdf)' }
    ]);

    const targetBase = resolveTargetBase(target.key);
    const installedPath = await installSkillFiles(
      rl,
      targetBase,
      env.runCommandText,
      env.type,
      dependencyReady
    );

    console.log('\n安装完成。');
    console.log(`安装路径: ${installedPath}`);
    console.log(`运行命令模板: ${env.runCommandText}`);
    if (!dependencyReady) {
      console.log('注意: 依赖未就绪，请先安装 PyMuPDF 后再使用。');
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\n安装失败: ${error.message}`);
  process.exitCode = 1;
});
