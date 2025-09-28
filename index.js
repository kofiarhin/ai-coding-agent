#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const dotenv = require('dotenv');
const prompts = require('prompts');
const ora = require('ora');

const llm = require('./llm');
const runShell = require('./tools/runShell');
const readFile = require('./tools/readFile');
const writeStreamFile = require('./tools/writeStreamFile');
const testFile = require('./tools/testFile');

dotenv.config();

const SANDBOX_DIR = path.resolve(process.env.SANDBOX_DIR || './sandbox');
const AUTO_APPROVE = String(process.env.AUTO_APPROVE || 'false').toLowerCase() === 'true';
const MAX_SELF_HEAL_RETRIES = parseInt(process.env.MAX_SELF_HEAL_RETRIES || '3', 10);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.cyan('AI-Terminal-Agent> ')
});

const logAudit = async (message) => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.promises.appendFile(path.resolve('audit.log'), line).catch(() => {});
};

const ensureSandbox = async () => {
  await fs.promises.mkdir(SANDBOX_DIR, { recursive: true });
};

const confirmAction = async (message) => {
  if (AUTO_APPROVE) {
    await logAudit(`AUTO_APPROVED: ${message}`);
    return true;
  }

  const response = await prompts({
    type: 'confirm',
    name: 'value',
    message,
    initial: false
  });

  const granted = Boolean(response.value);
  await logAudit(`CONFIRM ${granted ? 'YES' : 'NO'}: ${message}`);
  return granted;
};

const showHelp = () => {
  const help = `\n${chalk.bold('AI Terminal Agent Commands')}\n` +
    `  ${chalk.yellow(':help')} - Show this help message\n` +
    `  ${chalk.yellow(':exit')} - Exit the CLI\n` +
    `  ${chalk.yellow(':ls')} [path] - List sandbox contents\n` +
    `  ${chalk.yellow(':read <file>')} - Read sandbox file\n` +
    `  ${chalk.yellow(':run <command>')} - Run allowed shell command\n` +
    `  ${chalk.yellow(':audit')} - Show recent audit entries\n` +
    `  ${chalk.yellow(':reset')} - Wipe sandbox directory\n` +
    `  ${chalk.yellow('write <file> :: <prompt>')} - Generate code into file\n` +
    `  ${chalk.yellow('chat <prompt>')} - Ask the AI a question\n`;
  console.log(help);
};

const listSandbox = async (target) => {
  const safePath = target ? path.resolve(SANDBOX_DIR, target) : SANDBOX_DIR;
  if (!safePath.startsWith(SANDBOX_DIR)) {
    console.log(chalk.red('Path outside sandbox is not allowed.'));
    return;
  }
  try {
    const contents = await fs.promises.readdir(safePath);
    contents.forEach((item) => console.log(item));
  } catch (error) {
    console.log(chalk.red(`Unable to list directory: ${error.message}`));
  }
};

const readAudit = async () => {
  try {
    const file = await fs.promises.readFile(path.resolve('audit.log'), 'utf8');
    console.log(file.split('\n').slice(-20).join('\n'));
  } catch (error) {
    console.log(chalk.yellow('Audit log is empty.'));
  }
};

const resetSandbox = async () => {
  const confirmed = await confirmAction('This will remove all sandbox files. Continue?');
  if (!confirmed) {
    return;
  }

  try {
    const entries = await fs.promises.readdir(SANDBOX_DIR);
    await Promise.all(entries.map(async (entry) => {
      const target = path.join(SANDBOX_DIR, entry);
      await fs.promises.rm(target, { recursive: true, force: true });
    }));
    await logAudit('Sandbox reset.');
    console.log(chalk.green('Sandbox cleared.'));
  } catch (error) {
    console.log(chalk.red(`Failed to reset sandbox: ${error.message}`));
  }
};

const parseWriteCommand = (input) => {
  const separator = '::';
  const [left, ...rest] = input.split(separator);
  if (!rest.length) {
    return null;
  }
  const filePath = left.trim();
  const promptText = rest.join(separator).trim();
  if (!filePath || !promptText) {
    return null;
  }
  return { filePath, promptText };
};

const sanitizePrompt = (promptText) => {
  return promptText.replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, ''));
};

const runTestingLoop = async ({ filePath, originalPrompt, conversation, retries = 0 }) => {
  if (retries >= MAX_SELF_HEAL_RETRIES) {
    await logAudit(`Self-heal aborted for ${filePath} after ${retries} retries.`);
    return;
  }

  const testResult = await testFile(filePath);
  if (testResult.success) {
    await logAudit(`Tests passed for ${filePath}.`);
    if (testResult.output) {
      console.log(chalk.green(testResult.output));
    }
    return;
  }

  console.log(chalk.red('Tests failed. Attempting self-heal...'));
  await logAudit(`Tests failed for ${filePath}: ${testResult.error}`);

  const healingPrompt = `The previous attempt to create ${filePath} failed tests with the following errors:\n${testResult.error}\nPlease provide a fixed version of the file.`;
  const updatedConversation = [
    ...conversation,
    { role: 'user', content: `${originalPrompt}\n${healingPrompt}` }
  ];

  await writeStreamFile({
    conversation: updatedConversation,
    targetPath: filePath,
    autoConfirm: true,
    spinnerLabel: 'Healing file'
  });

  await runTestingLoop({ filePath, originalPrompt, conversation: updatedConversation, retries: retries + 1 });
};

const handleWrite = async ({ filePath, promptText, conversation }) => {
  const safe = await writeStreamFile({
    conversation: [
      ...conversation,
      {
        role: 'system',
        content: 'You are an AI that outputs code only when writing files.'
      },
      { role: 'user', content: promptText }
    ],
    targetPath: filePath,
    autoConfirm: false,
    spinnerLabel: 'Streaming code'
  });

  if (!safe) {
    console.log(chalk.yellow('Write cancelled.'));
    return;
  }

  await runTestingLoop({ filePath, originalPrompt: promptText, conversation });
};

const handleChat = async ({ promptText, conversation }) => {
  const spinner = ora('Contacting Groq...').start();
  try {
    const response = await llm([
      ...conversation,
      { role: 'user', content: promptText }
    ]);
    spinner.stop();
    console.log(chalk.green(response));
    return response;
  } catch (error) {
    spinner.stop();
    console.log(chalk.red(`Chat failed: ${error.message}`));
    return null;
  }
};

const handleRunCommand = async (command) => {
  const [exe, ...args] = command.split(' ').filter(Boolean);
  if (!exe) {
    console.log(chalk.yellow('No command provided.'));
    return;
  }
  const confirmed = await confirmAction(`Execute shell command: ${command}?`);
  if (!confirmed) {
    return;
  }
  const result = await runShell(exe, args);
  if (result.success) {
    console.log(chalk.green(result.output));
  } else {
    console.log(chalk.red(result.error));
  }
};

const handleReadCommand = async (target) => {
  const result = await readFile(target);
  if (result.success) {
    console.log(result.content);
  } else {
    console.log(chalk.red(result.error));
  }
};

const main = async () => {
  await ensureSandbox();
  await logAudit('CLI session started.');
  showHelp();

  const conversation = [];

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === ':exit') {
      await logAudit('CLI session terminated by user.');
      rl.close();
      return;
    }

    if (input === ':help') {
      showHelp();
      rl.prompt();
      return;
    }

    if (input.startsWith(':ls')) {
      const target = input.replace(':ls', '').trim();
      await listSandbox(target || '.');
      rl.prompt();
      return;
    }

    if (input === ':audit') {
      await readAudit();
      rl.prompt();
      return;
    }

    if (input === ':reset') {
      await resetSandbox();
      rl.prompt();
      return;
    }

    if (input.startsWith(':read')) {
      const target = input.replace(':read', '').trim();
      if (!target) {
        console.log(chalk.yellow('Specify a file to read.'));
      } else {
        await handleReadCommand(target);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith(':run')) {
      const command = input.replace(':run', '').trim();
      await handleRunCommand(command);
      rl.prompt();
      return;
    }

    if (input.startsWith('write ')) {
      const payload = input.replace('write ', '');
      const parsed = parseWriteCommand(payload);
      if (!parsed) {
        console.log(chalk.red('Use format: write <file> :: <prompt>'));
        rl.prompt();
        return;
      }
      const promptText = sanitizePrompt(parsed.promptText);
      await handleWrite({ filePath: parsed.filePath, promptText, conversation });
      rl.prompt();
      return;
    }

    if (input.startsWith('chat ')) {
      const promptText = sanitizePrompt(input.replace('chat ', ''));
      const answer = await handleChat({ promptText, conversation });
      if (answer) {
        conversation.push({ role: 'user', content: promptText });
        conversation.push({ role: 'assistant', content: answer });
      }
      rl.prompt();
      return;
    }

    console.log(chalk.yellow('Unknown command. Type :help for options.'));
    rl.prompt();
  });

  rl.on('close', async () => {
    console.log(chalk.cyan('Goodbye!'));
    await logAudit('CLI session closed.');
    process.exit(0);
  });
};

main().catch(async (error) => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  await logAudit(`Fatal error: ${error.message}`);
  process.exit(1);
});
