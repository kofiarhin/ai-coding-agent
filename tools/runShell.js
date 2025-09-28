const { spawn } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const ALLOW_CMDS = (process.env.ALLOW_CMDS || 'echo,ls,pwd,cat,npm,git').split(',').map((cmd) => cmd.trim());
const DENY_CMDS = ['rm', 'sudo', 'curl', 'wget', 'shutdown', 'reboot'];

const sanitizeArgs = (args) => {
  const forbidden = [';', '&&', '||', '|'];
  for (const token of forbidden) {
    if (args.includes(token)) {
      throw new Error('Command contains forbidden chaining operators.');
    }
  }
};

const runShell = async (command, args = []) => {
  try {
    if (!ALLOW_CMDS.includes(command)) {
      return { success: false, error: `Command ${command} is not in allow list.` };
    }
    if (DENY_CMDS.includes(command)) {
      return { success: false, error: `Command ${command} is denied.` };
    }
    sanitizeArgs(args.join(' '));
  } catch (error) {
    return { success: false, error: error.message };
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: path.resolve(process.env.SANDBOX_DIR || './sandbox'),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ success: false, error: 'Command timed out.' });
    }, 15000);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() });
      } else {
        resolve({ success: false, error: stderr.trim() || `Command exited with code ${code}` });
      }
    });
  });
};

module.exports = runShell;
