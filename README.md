# Digital Print & Xerox Web Application

A complete, production-ready platform that replaces the "WhatsApp it to the shopkeeper" workflow
with: **Customer → Scan QR → Upload → Edit → Configure → Submit → Shopkeeper Dashboard → Print.**

## Components

| Component | Tech | Purpose |
|---|---|---|
| `client/` | React + Vite + TypeScript + Tailwind | Customer upload flow + admin dashboard |
| `server/` | Node.js + Express + TypeScript + MongoDB + Socket.IO | REST API, real-time events, file storage, print job orchestration |
| `print-agent/` | Node.js (Windows) | Local agent that receives jobs and prints on physical printers via SumatraPDF |

## Quick start (local development)

```bash
# 1. Backend
cd server
copy .env.example .env       # then edit values (PowerShell / Command Prompt)
npm install
npm run dev                  # runs on :4000 (uses in-memory MongoDB if MONGODB_URI=memory://)

# 2. Frontend
cd client
copy .env.example .env.local # set VITE_API_URL=http://localhost:4000
npm install
npm run dev                  # runs on :5173

# 3. Print agent (only needed for real printers)
cd print-agent
copy config.example.json config.json # set serverUrl, agentToken and SumatraPDF path
npm install
npm start
```

Default admin credentials are set from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `server/.env`
(seed runs automatically on first boot; change the password after first login).

For QR codes scanned by phones, set `PUBLIC_BASE_URL` in `server/.env` to the shop PC's
LAN IP and the Vite port (for example, `http://192.168.1.20:5173`). Keep
`VITE_API_URL` and `VITE_SOCKET_URL` empty so requests use Vite's API/socket proxy.
The phone must be connected to the same Wi-Fi network.

Full documentation: see [README.md](./README.md).

## Architecture

```
Customer phone ──QR──> /upload/:terminalCode
      │  (upload, edit, configure, submit)
      ▼
React client ──REST/Socket.IO──> Express server ──> MongoDB + file storage
                                      │
                                      ▼ (Socket.IO, authenticated, pull-model)
                              Local print agent (shop PC)
                                      │  SumatraPDF -print-to "<printer>"
                                      ▼
                              Physical USB / network printer
```

`PRINT_MODE=demo` simulates printing so the whole app can be tested without hardware.
