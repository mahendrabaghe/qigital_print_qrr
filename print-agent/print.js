import { spawn } from 'node:child_process';

/**
 * Print a PDF with SumatraPDF and resolve when the print job has been handed to
 * the Windows spooler. Exit code 0 = success; anything else is a failure.
 *
 * The abort function lets the agent kill an in-flight print when the admin
 * cancels the job from the dashboard.
 */
export function printWithSumatra({ sumatraPath, filePath, printerName, printSettings, onSpawn }) {
  return new Promise((resolve, reject) => {
    const args = ['-print-to', printerName];
    if (printSettings) args.push('-print-settings', printSettings);
    args.push('-silent', filePath);

    let proc;
    try {
      proc = spawn(sumatraPath, args, { windowsHide: true });
    } catch (err) {
      reject(new Error(`Could not start SumatraPDF: ${err.message}`));
      return;
    }

    onSpawn?.(proc);

    let stderr = '';
    proc.stderr?.on('data', (d) => (stderr += String(d)));
    proc.on('error', (err) => {
      // ENOENT = sumatraPath points nowhere.
      reject(new Error(`SumatraPDF not found at "${sumatraPath}": ${err.message}`));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`SumatraPDF exited with code ${code}${stderr ? `: ${stderr.trim().slice(0, 300)}` : ''}`));
    });
  });
}
