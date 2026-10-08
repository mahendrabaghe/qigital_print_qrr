import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  serverUrl: 'http://localhost:4000',
  agentToken: '',
  sumatraPath: 'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
  pollIntervalMs: 4000,
  printerRefreshMs: 60000,
  maxPrintRetries: 2,
  logDir: 'logs',
  tempDir: '',
  excludePrinters: ['Microsoft XPS Document Writer', 'OneNote (Desktop)', 'OneNote Printer', 'Fax'],
};

/** Load config.json next to the agent, with env-var overrides for secrets. */
export function loadConfig() {
  let file = {};
  const fileConfig = path.join(__dirname, 'config.json');
  if (fs.existsSync(fileConfig)) {
    try {
      file = JSON.parse(fs.readFileSync(fileConfig, 'utf8'));
    } catch (err) {
      console.error(`config.json is not valid JSON: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error('config.json not found. Copy config.example.json to config.json and fill it in.');
    process.exit(1);
  }

  const cfg = { ...DEFAULTS, ...file };
  // Environment overrides — never keep secrets only in files.
  if (process.env.SERVER_URL) cfg.serverUrl = process.env.SERVER_URL;
  if (process.env.AGENT_TOKEN) cfg.agentToken = process.env.AGENT_TOKEN;
  if (process.env.SUMATRA_PATH) cfg.sumatraPath = process.env.SUMATRA_PATH;

  cfg.serverUrl = String(cfg.serverUrl).replace(/\/+$/, '');

  if (!cfg.agentToken) {
    console.error('agentToken is missing. Copy it from Admin dashboard → Settings → Print agent token.');
    process.exit(1);
  }
  return cfg;
}
