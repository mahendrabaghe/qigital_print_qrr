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

## Deploy the frontend with GitHub Pages

The source `client/index.html` belongs beside the Vite app; do not move it to the
repository root. The GitHub Actions workflow at `.github/workflows/deploy-pages.yml`
builds the frontend and publishes `client/dist`, including the generated
`index.html`. It also supports direct customer/admin links on GitHub Pages.

1. Deploy the backend separately (for example, to Render).
2. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**
   and add a repository variable named `VITE_API_URL` containing the backend's base URL,
   such as `https://your-backend.onrender.com` (no trailing slash or `/api`). If this is
   not configured yet, the frontend will still publish, but API-backed features will not
   work until you add the variable and redeploy.
3. In the backend host's environment settings, set `PUBLIC_BASE_URL` to the GitHub Pages
   site URL, such as `https://your-user.github.io/your-repository`.
4. In GitHub, open **Settings → Pages** and choose **GitHub Actions** as the build and
   deployment source. Do not select **Deploy from a branch**; that mode serves the
   repository README instead of the built frontend. Push to `main` or `master`, or run
   the workflow manually.

The API backend must allow requests from the Pages site. Do not put backend secrets in
`VITE_API_URL` or any other `VITE_*` variable; frontend build variables are public.

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
