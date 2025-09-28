const fs = require('fs');
const path = require('path');
const prompts = require('prompts');
const chalk = require('chalk');
const dotenv = require('dotenv');

const llmStream = require('../llmStream');

dotenv.config();

const MAX_FILES = 50;
const MAX_SIZE = 1024 * 1024;

const logAudit = async (message) => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.promises.appendFile(path.resolve('audit.log'), line).catch(() => {});
};

const countFiles = async (dir) => {
  const entries = await fs.promises.readdir(dir);
  let count = 0;
  for (const entry of entries) {
    const target = path.join(dir, entry);
    const stats = await fs.promises.stat(target);
    if (stats.isDirectory()) {
      count += await countFiles(target);
    } else {
      count += 1;
    }
  }
  return count;
};

const confirmOverwrite = async ({ autoConfirm, message }) => {
  if (autoConfirm) {
    return true;
  }
  const { value } = await prompts({
    type: 'confirm',
    name: 'value',
    message,
    initial: false
  });
  return Boolean(value);
};

const sanitizeChunk = (chunk) => {
  return chunk.replace(/```/g, '');
};

const writeStreamFile = async ({ conversation, targetPath, autoConfirm = false, spinnerLabel = 'Streaming' }) => {
  const sandbox = path.resolve(process.env.SANDBOX_DIR || './sandbox');
  const resolved = path.resolve(sandbox, targetPath);

  if (!resolved.startsWith(sandbox)) {
    console.log(chalk.red('Write path outside sandbox.'));
    return false;
  }

  await fs.promises.mkdir(path.dirname(resolved), { recursive: true });

  const fileCount = await countFiles(sandbox);
  if (fileCount >= MAX_FILES && !fs.existsSync(resolved)) {
    console.log(chalk.red('Sandbox file quota exceeded.'));
    return false;
  }

  if (fs.existsSync(resolved)) {
    const confirmed = await confirmOverwrite({ autoConfirm, message: `Overwrite ${targetPath}?` });
    if (!confirmed) {
      await logAudit(`WRITE_ABORTED ${targetPath}`);
      return false;
    }
  }

  const tempPath = `${resolved}.tmp-${Date.now()}`;
  const stream = fs.createWriteStream(tempPath, { encoding: 'utf8' });

  let totalBytes = 0;
  let failed = false;

  const writeToken = async (token) => {
    const cleaned = sanitizeChunk(token);
    totalBytes += Buffer.byteLength(cleaned, 'utf8');
    if (totalBytes > MAX_SIZE) {
      failed = true;
      throw new Error('Stream exceeded maximum file size.');
    }
    process.stdout.write(cleaned);
    stream.write(cleaned);
  };

  try {
    await logAudit(`WRITE_STREAM_START ${targetPath}`);
    await llmStream({
      messages: conversation,
      onToken: writeToken
    });
    stream.end();
    if (failed) {
      throw new Error('Stream failed due to quota.');
    }
    await fs.promises.rename(tempPath, resolved);
    await logAudit(`WRITE_STREAM_SUCCESS ${targetPath}`);
    console.log(`\n${chalk.green(`${spinnerLabel} complete.`)}`);
    return true;
  } catch (error) {
    stream.destroy();
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    await logAudit(`WRITE_STREAM_FAIL ${targetPath}: ${error.message}`);
    console.log(`\n${chalk.red(`Stream failed: ${error.message}`)}`);
    return false;
  }
};

module.exports = writeStreamFile;
