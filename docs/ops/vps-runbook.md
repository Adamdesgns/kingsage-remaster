# VPS Runbook — hosting the world server

> Phase B of the fully-functional plan. Adam chose a VPS 2026-08-29
> ("always-on world" — locked decision #2 done right). This document is a
> checklist, not a project: everything code-side already landed in Phase A
> (`KINGSAGE_BIND`, SecretConfig `BASE_URL`, rate limits, fogged events).
>
> Cost: ~$4–6/month. Provider suggestion: **Hetzner CX22** (~€4) or
> **DigitalOcean Basic 1GB** (~$6). The world server is a single Node
> process over one SQLite file — the smallest box is plenty.

## Adam's part (once, ~15 minutes — no assistant can do these)

1. Create the provider account and add the card.
2. Create the smallest **Ubuntu 24.04 LTS** server. Add an SSH key
   (Claude can generate one and hand you the public half to paste).
3. Note the server's IP. Optional but nicer: point a DNS name at it
   (any registrar, an `A` record like `world.yourdomain.com` → the IP).
4. Hand Claude the IP (and domain if any). Everything below is
   assistant-runnable over SSH with your say-so.

## Server setup (run as root on the fresh box)

```bash
# 1. Node 24+ (needs --experimental-strip-types and node:sqlite)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs git caddy

# 2. A user for the world, and the code
useradd -m -s /bin/bash kingsage
sudo -u kingsage git clone https://github.com/Adamdesgns/kingsage-remaster.git /home/kingsage/kingsage-remaster

# 3. The production secret - generated here, never committed anywhere
openssl rand -hex 24 > /home/kingsage/roblox-key
chmod 600 /home/kingsage/roblox-key && chown kingsage:kingsage /home/kingsage/roblox-key
```

## systemd unit — `/etc/systemd/system/kingsage-world.service`

```ini
[Unit]
Description=Kingsmarch world server
After=network.target

[Service]
User=kingsage
WorkingDirectory=/home/kingsage/kingsage-remaster/server
# Loopback bind: ONLY Caddy (TLS) faces the internet. Never 0.0.0.0 bare.
Environment=PORT=4174
Environment=KINGSAGE_BIND=127.0.0.1
Environment=KINGSAGE_DATABASE_PATH=/home/kingsage/world-data/kingsage.sqlite
Environment=KINGSAGE_AI_TICK_MS=45000
ExecStartPre=/usr/bin/install -d -o kingsage /home/kingsage/world-data
ExecStart=/bin/bash -c 'KINGSAGE_ROBLOX_KEY=$(cat /home/kingsage/roblox-key) exec node --experimental-strip-types src/index.ts'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now kingsage-world
curl -s http://127.0.0.1:4174/api/health   # → {"ok":true,...}
```

Production deliberately does NOT set the three `KINGSAGE_DEV_SEED_*` knobs
or `KINGSAGE_AUTO_RESOLVE_MS` — real timers, kingdoms start with nothing.

## TLS front door — `/etc/caddy/Caddyfile`

```
world.yourdomain.com {
    reverse_proxy 127.0.0.1:4174
}
```

`systemctl reload caddy`. Caddy fetches and renews the certificate itself.
(No domain? Caddy can't do TLS on a bare IP for Roblox's liking — get the
$3 domain. Roblox HttpService prefers https.)

## Point Roblox at it

In Studio, edit the gitignored `roblox/src/server/SecretConfig.luau`:

```lua
return {
	KEY = "<contents of /home/kingsage/roblox-key>",
	BASE_URL = "https://world.yourdomain.com",
}
```

Publish (PRIVATE — the allowlist and Roblox permissions still gate who
joins), enable **Allow HTTP Requests** in Game Settings → Security.

## Backups — `/etc/cron.daily/kingsage-backup` (chmod +x)

```bash
#!/bin/bash
# VACUUM INTO writes a complete, consistent copy even in WAL mode -
# a naive file copy without the -wal file restores a near-empty world.
set -e
d=/home/kingsage/backups
install -d -o kingsage "$d"
sudo -u kingsage sqlite3 /home/kingsage/world-data/kingsage.sqlite \
  "VACUUM INTO '$d/kingsage-$(date +%F).sqlite'"
ls -t "$d"/kingsage-*.sqlite | tail -n +15 | xargs -r rm --
```

(`apt-get install -y sqlite3` once.) **Restore drill** (do it once before
trusting it): stop the service, copy a backup over
`world-data/kingsage.sqlite`, delete any `-wal`/`-shm` files, start, and
check `/api/health` + a state pull.

## Updating the world

```bash
sudo -u kingsage git -C /home/kingsage/kingsage-remaster pull
systemctl restart kingsage-world
```

Migrations run on boot (conditional, schema-checked). Timers catch up on
the first read — a restart loses nothing (verified by test and by the
2026-08-29 live drill).

## What to check when something's wrong

- `journalctl -u kingsage-world -e` — the server's own words.
- `curl -s https://world.yourdomain.com/api/health` — the door.
- `systemctl status caddy` — the TLS front.
- Disk: the events/inbox tables grow without pruning (known audit gap) —
  watch `du -h /home/kingsage/world-data` monthly until pruning lands.
