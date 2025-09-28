const fs = require('fs');
const path = require('path');
const prompts = require('prompts');
const dotenv = require('dotenv');

dotenv.config();

const MAX_FILES = 50;
const MAX_SIZE = 1024 * 1024;

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

const safeWriteFile = async ({ targetPath, content, autoConfirm = false }) => {
  try {
    const sandbox = path.resolve(process.env.SANDBOX_DIR || './sandbox');
    const resolved = path.resolve(sandbox, targetPath);
    if (!resolved.startsWith(sandbox)) {
      throw new Error('Attempted write outside sandbox.');
    }

    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });

    const fileCount = await countFiles(sandbox);
    if (fileCount >= MAX_FILES) {
      throw new Error('Sandbox file quota exceeded.');
    }

    if (Buffer.byteLength(content, 'utf8') > MAX_SIZE) {
      throw new Error('File exceeds maximum allowed size.');
    }

    let target = resolved;
    if (fs.existsSync(resolved)) {
      const confirmed = await confirmOverwrite({ autoConfirm, message: `Overwrite ${targetPath}?` });
      if (!confirmed) {
        return { success: false, error: 'User declined overwrite.' };
      }
    }

    const tempPath = `${resolved}.tmp-${Date.now()}`;
    await fs.promises.writeFile(tempPath, content, 'utf8');
    await fs.promises.rename(tempPath, target);

    return { success: true, path: target };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = safeWriteFile;
