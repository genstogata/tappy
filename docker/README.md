# Running Tappy with Docker

Tappy is a static site. The container serves files and **holds no data** — no
database, no volume, no server-side state. Every class, roster and session lives
in the browser on the teacher's own device.

This guide assumes you already run Docker and Cloudflare Tunnel on a VPS.

---

## Answering the obvious question first: is anything stored on the VPS?

**No.** Not the roster, not the timers, not the history, not the PIN. The
container is a file server; the browser is the database.

You can verify this yourself rather than taking it on trust:

```bash
# 1. The container's writable layer is empty — it wrote nothing at all.
docker diff tappy
#    (no output)

# 2. It has no volumes and no bind mounts.
docker inspect tappy --format '{{json .Mounts}}'
#    []

# 3. It runs with a read-only root filesystem, so it *cannot* write.
docker inspect tappy --format '{{.HostConfig.ReadonlyRootfs}}'
#    true
```

The compose file sets `read_only: true`, drops all Linux capabilities, and
forbids privilege escalation. If Tappy ever tried to persist something
server-side, it would fail loudly instead of quietly accumulating student data
on your VPS.

### What the VPS *does* see

| Thing | Stored on VPS? | Notes |
|---|---|---|
| Class names, rosters, student names | ❌ | Browser only |
| Timers, sessions, running history | ❌ | Browser only |
| The PIN | ❌ | Browser only (and it's a deterrent, not security) |
| The app's HTML/CSS/JS | ✅ | Read-only image contents |
| Docker image layers | ✅ | ~50 MB, no user data |
| **Cloudflare Tunnel access logs** | ⚠️ | See below |

### The one caveat: Cloudflare's logs, not yours

The container writes no access log (`access_log off` in `nginx.conf`), so your
VPS keeps no record of who used Tappy. But **Cloudflare terminates the TLS
connection**, so Cloudflare sees the request metadata — IP addresses, timestamps,
user agents — for every page load, and retains it according to your Cloudflare
plan and settings.

That is metadata about *which school opened the app and when*, not about
students. It is not student data. But if you want to minimise it:

- Cloudflare Zero Trust → your account → **Logs** settings control retention.
- Consider disabling or shortening log retention for the tunnel.
- The app itself makes no requests after first load, so a teacher who leaves the
  tab open all day generates almost no traffic.

### What is *not* protected

Being explicit, because it matters for a classroom device:

- **No encryption at rest.** Data sits in the browser's IndexedDB/localStorage in
  plain text. Anyone with the unlocked device *and* devtools can read it. OS
  device encryption (FileVault, BitLocker, iOS passcode) protects against theft
  and stolen backups; it does not protect against a curious student on an
  unattended tablet.
- **No cross-device sync.** By design — there is no server to sync through. Moving
  data between devices means exporting a CSV and importing it on the other device.
- **Clearing browser data deletes everything.** So does uninstalling the browser.
  Export regularly.

---

## Quick start

```bash
# 1. Pull the image. Pin the version in production — see "Versioning" below.
docker pull af416/tappy:v31

# 2. Run it (no ports published — the tunnel reaches it over the network)
docker run -d --name tappy --restart unless-stopped \
  --read-only --tmpfs /var/cache/nginx --tmpfs /tmp \
  --security-opt no-new-privileges:true --cap-drop ALL \
  --network your-tunnel-network \
  af416/tappy:v31
```

Then point your tunnel's public hostname at `http://tappy:8080`.

Or use the compose file in this directory:

```bash
cd docker
docker compose up -d
```

---

## Versioning

The image tag is derived from `APP_VERSION` in `app.js`, so there is exactly one
place to change a version.

| Tag | Moves? | Use it for |
|---|---|---|
| `v31` | ❌ never | **Production.** A deploy can't surprise you. |
| `latest` | ✅ | Whatever was pushed most recently to the default branch. |
| `beta` | ✅ | Beta testing (published from the `beta` branch). |
| `sha-abc1234` | ❌ never | Debugging a specific commit. |

> **Which branch feeds `latest`?** It is the *default branch of the repository
> the workflow runs in*, which differs per repo:
>
> | Repo | Default branch | Pushing this publishes `latest` |
> |---|---|---|
> | `genstogata/tappy` | `main` | `main` |
> | `genstogata/tappy-beta` | `beta` | `beta` |
>
> So today, pushing `beta` to `tappy-beta` publishes `latest` (and `beta`, and
> `v31`). Once the code is merged to `main` in `genstogata/tappy`, pushing
> `main` there will publish `latest` instead. Either way `latest` always points
> at the newest build from that repo's default branch.
>
> If you want a deploy that never changes under you, pin `v31`.

### Cutting a new version

```bash
./scripts/bump-version.sh 32     # bumps app.js + service-worker.js together
git add app.js service-worker.js
git commit -m "Bump version to v32"
git push beta beta               # or: git push origin main
```

The workflow then publishes `af416/tappy:v32` automatically, plus `beta` (or
`latest` when pushed to `main`).

`bump-version.sh` updates **both** version strings, because they must stay in
lockstep:

- `app.js` → `APP_VERSION` — shown in the footer
- `service-worker.js` → `CACHE_NAME` — forces browsers to fetch new files

If they drift apart, the service worker keeps serving stale files to anyone who
has already visited. The publish workflow **fails the build** if they disagree,
so this can't slip through.

### Updating a deployment

```bash
# Edit the pinned tag in docker-compose.yml, then:
docker compose pull && docker compose up -d
```

The app shell is served with `Cache-Control: no-cache`, so browsers pick up the
new version on their next load without a hard refresh.

---

## Attaching to an existing Cloudflare Tunnel

You have two options. **Option A is simpler** and is what most setups want.

### Option A — join the tunnel's network (recommended)

Find the network your `cloudflared` container is on:

```bash
docker inspect cloudflared --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

Then set that network in `docker/docker-compose.yml`:

```yaml
networks:
  tappy:
    name: <the-network-name-from-above>
    external: true
```

Bring Tappy up, and in the Cloudflare dashboard go to
**Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames → Add**:

| Field | Value |
|---|---|
| Subdomain | `tappy` (or whatever you like) |
| Domain | your domain |
| Type | `HTTP` |
| URL | `tappy:8080` |

`HTTP` is correct even though the public URL is HTTPS — Cloudflare terminates
TLS at its edge and talks plain HTTP to the container over the private Docker
network. Nothing is exposed to the internet directly.

### Option B — a dedicated tunnel for Tappy

Use `docker-compose.tunnel-example.yml`, which runs its own `cloudflared`
alongside Tappy. The tunnel token is read from a `.env` file, so start by
copying the template:

```bash
cd docker
cp sample.env .env
```

Then edit `.env` and replace the placeholder with your real token:

```
TUNNEL_TOKEN=eyJhIjoi...your-actual-token...
```

Get it from **Cloudflare dashboard → Zero Trust → Networks → Tunnels → your
tunnel → Install connector** (the token shown for a Docker connector). Finally:

```bash
docker compose -f docker-compose.tunnel-example.yml up -d
```

Docker Compose reads `.env` automatically from the directory containing the
compose file, which is what makes `${TUNNEL_TOKEN}` resolve. If you forget to
create it, Compose stops with a clear message rather than starting a broken
tunnel:

```
error: required variable TUNNEL_TOKEN is missing a value: TUNNEL_TOKEN is not set
- copy sample.env to .env and add your tunnel token
```

> **`.env` is a credential — never commit it.** It is already listed in the
> repository's `.gitignore`. Only `sample.env` (the placeholder template) is
> tracked in git.

---

## Why port 8080 and not 80

The image is based on `nginx-unprivileged`, which runs nginx as UID 101 rather
than root. That is what makes `read_only: true` + `cap_drop: ALL` possible: a
root nginx master process tries to `chown` its cache directories at startup,
which fails without `CAP_CHOWN` and the container exits with:

```
chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)
```

An unprivileged process cannot bind port 80, so the container listens on 8080.
This is invisible to users — Cloudflare maps the public hostname to `tappy:8080`.

---

## Updating

```bash
# Edit the pinned tag in docker-compose.yml, then:
docker compose pull && docker compose up -d
```

The app shell is served with `Cache-Control: no-cache`, so a browser picks up a
new version on its next load without needing a hard refresh. The service worker
also self-updates (see the footer's "Check for updates" button).

---

## Verifying a deployment

```bash
# Health
docker inspect tappy --format '{{.State.Health.Status}}'   # healthy

# Security headers are present (the main reason to self-host)
curl -sI https://tappy.example.com/ | grep -iE 'content-security|x-frame|referrer|permissions'

# The app is reachable and is the expected version
curl -s https://tappy.example.com/app.js | grep -o 'APP_VERSION = "v[0-9]*"'
```

---

## Building locally

From the repository root:

```bash
docker build -t tappy:local .
docker run -d --name tappy-local -p 127.0.0.1:8080:8080 \
  --read-only --tmpfs /var/cache/nginx --tmpfs /tmp \
  --security-opt no-new-privileges:true --cap-drop ALL tappy:local
```

Then open <http://127.0.0.1:8080>.

> **Note:** `http://127.0.0.1` counts as a secure context, so the service worker
> and offline mode work locally. A LAN IP such as `http://192.168.1.50:8080`
> does **not** — service workers require HTTPS or a loopback address. Always
> reach Tappy through the Cloudflare hostname in production.

---

## Publishing to Docker Hub

`.github/workflows/docker-publish.yml` builds `linux/amd64` + `linux/arm64` and
pushes on every push to `main` or `beta`, and on `v*` tags.

Add two repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Where to get it |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username (`af416`) |
| `DOCKERHUB_TOKEN` | Docker Hub → Account Settings → Security → New Access Token (needs **Read & Write**) |

> **Note:** the secrets must exist on whichever repository the branch is pushed
> to. `beta` is pushed to `genstogata/tappy-beta`, so that repo needs them too —
> otherwise the publish step fails with an auth error.

The workflow fails the build if:
- `APP_VERSION` and `CACHE_NAME` disagree,
- any asset returns non-200,
- the served version doesn't match the tag being published, or
- the container wrote to its filesystem.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Container exits, log shows `chown ... Operation not permitted` | You are using `nginx:alpine` instead of `nginx-unprivileged`, or you removed `cap_drop: ALL`'s companion tmpfs mounts. Use the provided Dockerfile. |
| Tunnel returns 502 | Wrong port. The container listens on **8080**, not 80. |
| App loads but no offline mode / no install prompt | Not a secure context. Use the HTTPS hostname, not a bare IP. |
| Data "disappeared" after moving to a new URL | Expected — storage is origin-scoped. Export from the old URL and import at the new one. |
| Data gone after ~7 days unused (Safari/iOS) | Safari evicts script-created data for origins with no interaction in 7 days. Install to the Home Screen and export regularly. |
