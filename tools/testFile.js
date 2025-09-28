const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const runProcess = ({ command, args, cwd, timeout = 10000 }) => {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ success: false, error: 'Test command timed out.' });
    }, timeout);

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
        resolve({ success: false, error: stderr.trim() || `Exited with code ${code}` });
      }
    });
  });
};

const testFile = async (relativePath) => {
  try {
    const sandbox = path.resolve(process.env.SANDBOX_DIR || './sandbox');
    const resolved = path.resolve(sandbox, relativePath);
    if (!resolved.startsWith(sandbox)) {
      throw new Error('Testing outside sandbox is forbidden.');
    }

    const packagePath = path.join(sandbox, 'package.json');
    if (fs.existsSync(packagePath)) {
      return await runProcess({
        command: 'npm',
        args: ['test', '--', '--runInBand'],
        cwd: sandbox
      });
    }

    if (resolved.endsWith('.js')) {
      return await runProcess({
        command: 'node',
        args: [resolved],
        cwd: sandbox
      });
    }

    return { success: true, output: 'No tests executed (unsupported file type).' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = testFile;
