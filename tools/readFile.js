const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const MAX_SIZE = 1024 * 1024; // 1MB

const readFile = async (target) => {
  try {
    if (!target) {
      throw new Error('No file specified.');
    }
    const sandbox = path.resolve(process.env.SANDBOX_DIR || './sandbox');
    const resolved = path.resolve(sandbox, target);
    if (!resolved.startsWith(sandbox)) {
      throw new Error('Access outside sandbox denied.');
    }
    const stats = await fs.promises.stat(resolved);
    if (stats.size > MAX_SIZE) {
      throw new Error('File exceeds maximum readable size.');
    }
    const content = await fs.promises.readFile(resolved, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = readFile;
