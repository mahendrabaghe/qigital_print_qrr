import { execFile } from 'node:child_process';

const PS_COMMAND =
  'Get-Printer | Select-Object Name, Type, PrinterStatus | ConvertTo-Json -Compress';

/**
 * Map the Windows PrinterStatus enum to our simple online/offline/unknown model.
 * 0 = Normal, 7 = Offline, everything else is a recoverable/busy state.
 */
function mapStatus(status) {
  if (status === 0) return 'online';
  if (status === 7) return 'offline';
  return 'unknown';
}

/** Get-Printer's Type is an enum that serialises as a number or a name. */
function mapType(type) {
  const s = String(type).toLowerCase();
  if (type === 1 || s.includes('net') || s.includes('tcp')) return 'network';
  return 'usb';
}

/**
 * Detect local Windows printers via PowerShell Get-Printer.
 * Returns [{ name, type, status }], excluding obvious non-printer targets.
 */
export function detectPrinters(excludeNames) {
  const excludes = new Set((excludeNames ?? []).map((n) => n.toLowerCase()));
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_COMMAND],
      { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve({ printers: [], error: err.message });
          return;
        }
        let printers = [];
        try {
          const parsed = JSON.parse(stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          printers = list
            .filter((p) => p && typeof p.Name === 'string' && p.Name.trim() !== '')
            .filter((p) => !excludes.has(p.Name.toLowerCase()))
            .map((p) => ({
              name: p.Name,
              type: mapType(p.Type),
              status: mapStatus(p.PrinterStatus),
            }));
        } catch {
          resolve({ printers: [], error: 'Could not parse Get-Printer output' });
          return;
        }
        resolve({ printers });
      }
    );
  });
}
