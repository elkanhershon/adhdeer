# ADHdeer sync server

A tiny private sync server so the ADHdeer app can keep your planner in sync
across your devices with a plain username and password — **no Google account
needed**. It's a single Node script with zero dependencies.

Your data stays yours: each account is one JSON file in `server/data/`, and
nothing ever leaves your server.

## What it does

- `POST /api/register` — make an account (username + password, min 6 chars)
- `POST /api/login` — sign in, get a bearer token (valid 180 days)
- `GET /api/data` — download your planner copy
- `PUT /api/data` — upload your planner copy

Passwords are hashed with scrypt. Bearer tokens are HMAC-signed with a secret
key kept in `server/data/secret.key` (created on first run — keep this file
safe; it's what makes all existing tokens valid).

## Run it directly (Node 18 or newer)

```bash
cd server
node adhdeer-server.js          # listens on port 8787, set PORT= to change
```

## Run it with Docker

```bash
cd server
docker build -t adhdeer-server .
docker run -d --name adhdeer --restart unless-stopped -p 8787:8787 -v adhdeer-data:/app/data adhdeer-server
```

Your data lives in the `adhdeer-data` Docker volume (or mount a folder and
you'll see plain files like `data/<username>.json`).

## Using it from the app

In ADHdeer: **Settings → My account → Sign in / make an account**, then enter:

1. The server address, e.g. `https://adhdeer-sync.your-domain.example` or
   `http://192.168.1.50:8787`
2. A username (letters, numbers, dots, dashes)
3. A password (at least 6 characters)

If the username doesn't exist yet, the app offers to create it. Once signed
in, switch **Mirror my changes automatically** on and every change quietly
syncs a few seconds later. **Load from my account** pulls the latest copy
onto the current device.

## Important: Android needs HTTPS

The ADHdeer Android app can only reliably talk to `https://` addresses (plain
`http://` is treated as insecure on newer Android), so give the server an
HTTPS address. The easiest way on your network is what you already use for
your NAS:

```bash
tailscale serve https / http://localhost:8787
```

Then the app address is `https://<your-machine-name>.<your-tailnet>.ts.net`.
Any other HTTPS reverse proxy (Caddy, nginx, cloudflared) works the same way.

## Backing up

Copy the whole `server/data/` folder — that's everything (accounts, planner
data, token secret).
