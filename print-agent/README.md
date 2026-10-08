# Local Print Agent (Windows)

A small Node.js service that runs on the shopkeeper's PC, pulls print jobs from the
cloud server, and sends them to the physical printer via **SumatraPDF**.

Browsers cannot talk to USB printers directly, so the agent is the bridge:

```
Customer phone ──> Cloud server (this repo's server/) ──> Print agent (this folder) ──> Printer
```

It connects to the server over Socket.IO (instant dispatch) and falls back to HTTP
polling if the socket drops, so jobs continue even behind strict firewalls.

## Requirements

- Windows 10/11 with the printer installed and set as the default or shared printer
- Node.js 18 or newer
- [SumatraPDF](https://www.sumatrapdfreader.org/download-free-pdf-viewer) (the print engine)

## Setup

1. Install SumatraPDF with the default options. Note the install path, typically:

   ```
   C:\Program Files\SumatraPDF\SumatraPDF.exe
   ```

2. Install agent dependencies:

   ```
   cd print-agent
   npm install
   ```

3. Copy the example config and edit it:

   ```
   copy config.example.json config.json
   ```

   | Key | Meaning |
   |---|---|
   | `serverUrl` | Base URL of the cloud app (e.g. `https://print.yourshop.com`) |
   | `agentToken` | From Admin dashboard → Settings → Print agent → **Copy token** |
   | `sumatraPath` | Full path to `SumatraPDF.exe` |
   | `pollIntervalMs` | HTTP poll interval while the socket is down (default 4000) |
   | `printerRefreshMs` | How often to re-detect printers (default 60000) |
   | `maxPrintRetries` | Retries per job before reporting failure (default 2) |
   | `logDir` | Folder for `agent.log` (default `logs`) |
   | `tempDir` | Where job PDFs are downloaded (default OS temp + `print-agent`) |
   | `excludePrinters` | Windows pseudo-printers to hide (XPS Writer, Fax, ...) |

   `SERVER_URL`, `AGENT_TOKEN` and `SUMATRA_PATH` environment variables override the file.

4. Start the agent:

   ```
   npm start
   ```

   On success you will see `connected`, a printer list, and in the admin dashboard
   the printers appear with source **agent**. Print something to verify.

## How jobs flow

1. Agent connects and emits `agent:ready` with its printer names.
2. Server assigns the next queued job for one of those printers (`job:assigned`).
3. Agent reports `printing`, downloads the print-ready PDF to `tempDir`,
   and prints it with:

   ```
   SumatraPDF.exe -print-to "<printer name>" -print-settings "<args>" -silent <file>
   ```

   The server bakes page ranges, N-up layout and image scaling into the PDF;
   `sumatraArgs` carries copies, duplex, color mode and scaling.
4. Agent reports `completed` (or `failed` after retries) and deletes the temp file.
5. If a job is cancelled mid-print, the server pushes `job:cancelled` and the
   agent kills the SumatraPDF process immediately.

Jobs are printed one at a time, in queue order.

## Run at startup (Task Scheduler)

Run automatically when Windows logs in:

1. Open **Task Scheduler** → Create Task.
2. General: name `Print Agent`, run only when user is logged on.
3. Triggers: New → At log on (your user).
4. Actions: New → Start a program:
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `agent.js`
   - Start in: `C:\path\to\printer\print-agent`
5. Settings: uncheck "Stop the task if it runs longer than..." so it stays alive.

Alternatively use [NSSM](https://nssm.cc/) to run it as a Windows service.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `AGENT_UNAUTHORIZED` on startup | Token is wrong or was rotated. Copy the current token from Admin → Settings. |
| `connect_error` but agent keeps retrying | `serverUrl` unreachable or wrong port. Check the URL and that the server is running. |
| `ENOENT ... SumatraPDF.exe` | `sumatraPath` in config.json doesn't match the installed path. |
| Printer not listed in dashboard | It may be in `excludePrinters`, or Get-Printer doesn't see it. Run `Get-Printer` in PowerShell to confirm the exact name. |
| Job stuck on "printing" | Check `logs/agent.log` and the printer's own queue (spooler may be paused). |
| Jobs only print when agent restarts | Socket.IO may be blocked. The HTTP poll fallback (default every 4 s) should still deliver jobs; check the server URL uses the correct public host/port. |

Logs live in `print-agent/logs/agent.log` (rotates at 5 MB to `agent.log.old`).
Downloaded job PDFs are deleted after each print attempt and any leftovers older
than an hour are cleaned up when the agent starts.
