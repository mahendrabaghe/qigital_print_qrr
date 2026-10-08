import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_LOG_BYTES = 5 * 1024 * 1024;

export function createLogger(logDir) {
  const dir = path.isAbsolute(logDir) ? logDir : path.join(__dirname, logDir);
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, 'agent.log');

  // Rotate: keep one previous generation, cap size so it never grows unbounded.
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_BYTES) {
    try {
      fs.renameSync(logFile, `${logFile}.old`);
    } catch {
      /* best-effort */
    }
  }

  const stream = fs.createWriteStream(logFile, { flags: 'a' });

  function write(level, msg) {
    const line = `${new Date().toISOString()} [${level}] ${msg}`;
    console.log(line);
    stream.write(line + '\n');
  }

  return {
    info: (msg) => write('INFO', msg),
    warn: (msg) => write('WARN', msg),
    error: (msg) => write('ERROR', msg),
    close: () => stream.end(),
  };
}
