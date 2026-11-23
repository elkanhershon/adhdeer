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
HTTPS address. Any HTTPS reverse proxy works — Caddy, nginx, or Tailscale
serve for your own devices:

```bash
tailscale serve https / http://localhost:8787
```

Then the app address is `https://<your-machine-name>.<your-tailnet>.ts.net`.

## Open it up for anyone (Cloudflare Tunnel)

Tailscale only reaches devices on your own tailnet. To let **anyone** make an
account from anywhere, put a Cloudflare Tunnel in front of the server — no
ports get opened on your router and it is free:

1. Add your domain to Cloudflare (dash.cloudflare.com, free plan).
2. In Cloudflare Zero Trust: **Networks > Tunnels > Create a tunnel**, pick
   **Cloudflared**, name it (e.g. `adhdeer`), and copy its token.
3. Run the connector on the NAS:

   ```bash
   docker run -d --name cloudflared --restart unless-stopped \
     cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TUNNEL_TOKEN>
   ```

4. Back in the tunnel settings add a **public hostname**:
   `adhdeer.yourdomain.com` → service `HTTP` → URL `localhost:8787`.
5. Give people that address: `https://adhdeer.yourdomain.com`.

## Who can sign up?

By default **anyone** can create an account. Two optional buffers, set when
you `docker run`:

- `-e INVITE_CODE=share-the-cheese` — sign-ups need this code; the app asks
  for it when it is required. Leave it unset for fully open sign-ups.
- Rate limiting is always on: each client gets 10 sign-in/sign-up attempts
  per 10 minutes (429 afterwards), so password guessing never gets far.

Back up `server/data/` before making the server public — that folder holds
every account and the token secret.

## Backing up

Copy the whole `server/data/` folder — that's everything (accounts, planner
data, token secret).
