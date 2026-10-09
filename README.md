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
sets GitHub Pages to use Actions, builds the frontend, and publishes `client/dist`,
including the generated `index.html`. It also supports direct customer/admin links
on GitHub Pages.

1. Deploy the backend separately (for example, to Render).
2. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**
   and optionally add a repository variable named `VITE_API_URL` to override the default
   backend URL `https://print-nazq.onrender.com` (no trailing slash or `/api`). The frontend
   workflow uses this Render URL by default.
3. In Render, open the service's **Environment** settings and set `PUBLIC_BASE_URL` to
   `https://mahendrabaghe.github.io/qigital_print_qrr`, then save and redeploy. Confirm generated QR
   links start with that URL. Reprint any QR stickers created before this change; printed
   codes containing a LAN address such as `192.168.x.x` will not work over the internet.
4. Push to `main` or `master`, or run the workflow manually. The workflow configures
   GitHub Actions as the Pages source so GitHub does not publish the repository README
   from the branch.

The API backend must allow requests from the Pages site. Do not put backend secrets in
`VITE_API_URL` or any other `VITE_*` variable; frontend build variables are public.

## Deploy the backend with Render

The root `render.yaml` configures the web service to build the backend in `server/`
and start it through the root-level `server.js` launcher. This matches Render's
repository-root service layout and avoids a missing `server.js` startup error.

To deploy with this configuration, create or sync a Render Blueprint from the repository.
Provide a MongoDB connection string (for example, from MongoDB Atlas), an admin email,
and a strong admin password when Render requests the unsynced environment variables.
Do not set `MONGODB_URI` to `memory://` in production. After deployment, set the
GitHub Actions repository variable `VITE_API_URL` to the Render service URL and
rerun the Pages workflow.

For Atlas connection failures, open the Render service's **Connect → Outbound** details
and add the listed outbound IP ranges to the Atlas project's **Security → Network
Access** IP access list. Also confirm the Atlas cluster is running and that `MONGODB_URI`
uses the correct database username and password; URL-encode special characters in the
password. Avoid `0.0.0.0/0` except as a brief diagnostic because it permits connections
from any IP address.

If you are keeping an existing Render Web Service instead of syncing the Blueprint,
update its settings to use the repository root, set the build command to
`npm --prefix server ci && npm --prefix server run build`, and set the start command
to `node server.js`. Then deploy the latest commit.

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
