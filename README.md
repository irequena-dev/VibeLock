# VibeLock

![Node CI](https://github.com/irequena-dev/VibeLock/actions/workflows/ci-node.yml/badge.svg)
![Python CI](https://github.com/irequena-dev/VibeLock/actions/workflows/ci-python.yml/badge.svg)
![Security](https://github.com/irequena-dev/VibeLock/actions/workflows/security.yml/badge.svg)
![npm version](https://img.shields.io/npm/v/vibelock)
![PyPI](https://img.shields.io/pypi/v/vibelock)
![License](https://img.shields.io/npm/l/vibelock)

**Replace `.env` files. One encrypted vault for all your config and secrets.**

---

## Why VibeLock?

`.env` files are the industry standard for managing environment variables. They're also:
- **Committed to git** (accidentally or on purpose)
- **Readable by anyone** with access to the machine
- **Split across files** (`.env`, `.env.local`, `.env.production`) with no encryption
- **Incompatible between teams** (Node, Python, Java — each has its own dotenv)

VibeLock replaces all of that with a **single file**:

```
secrets.vibe    ← encrypted secrets + plaintext config, all in one vault
```

- **Secrets** (API keys, passwords) are encrypted with AES-256-GCM
- **Config** (URLs, ports, log levels) is stored in plaintext
- `vibelock run` injects everything into your app — no code changes needed

---

## Quick Start

> **Requires**: Node.js 20+

```bash
npm install -g vibelock
```

```bash
$ vibelock init
? Project name: myapp
? Vault directory: ./
? Keys directory: ~/.vibelock/keys/myapp/

✓ Vault initialized successfully
  Project:    myapp
  Vault:      /home/user/project/secrets.vibe
  Master key: /home/user/.vibelock/keys/myapp/master.key
```

### Add your config and secrets

```bash
# Non-secret config (plaintext in vault)
vibelock set-env DB_URL "jdbc:postgresql://localhost:5432/myapp"
vibelock set-env SERVER_PORT "8080"
vibelock set-env LOG_LEVEL "INFO"
vibelock set-env CORS_ALLOWED_ORIGINS "http://localhost:5173"

# Secrets (encrypted with AES-256-GCM)
vibelock set DB_PASSWORD
vibelock set API_KEY
```

Or just edit `secrets.vibe` directly:

```json
{
  "version": 1,
  "projectId": "myapp",
  "env": {
    "DB_URL": "jdbc:postgresql://localhost:5432/myapp",
    "SERVER_PORT": "8080",
    "LOG_LEVEL": "INFO",
    "CORS_ALLOWED_ORIGINS": "http://localhost:5173"
  },
  "secrets": {
    "DB_PASSWORD": { "iv": "...", "tag": "...", "ciphertext": "...", "salt": "..." },
    "API_KEY": { "iv": "...", "tag": "...", "ciphertext": "...", "salt": "..." }
  }
}
```

### Run your app

```bash
# Before: dotenv -e .env -- npm start
# After:
vibelock run -- npm start
```

Your app reads `process.env` as usual. Zero code changes.

---

## Migration from `.env`

### Before (with dotenv-cli)

```
.env              ← plaintext secrets committed to git (oops)
.env.local        ← more secrets, different format per tool
```

```json
// package.json
{
  "scripts": {
    "dev": "dotenv -e ./backend/.env -- mvn spring-boot:run",
    "build": "dotenv -e ./backend/.env -- mvn clean package"
  }
}
```

### After (with VibeLock)

```
secrets.vibe      ← one file, secrets encrypted, config in plaintext
```

```json
// package.json
{
  "scripts": {
    "dev": "vibelock run --vault ./backend/secrets.vibe -- mvn spring-boot:run",
    "build": "vibelock run --vault ./backend/secrets.vibe -- mvn clean package"
  }
}
```

No more `dotenv-cli`. No more `.env` files. One vault per project.

---

## Production Deployment

### Standard Setup

```bash
# One-time on each server
vibelock init --project myapp

# Config
vibelock set-env DB_URL "jdbc:postgresql://prod-db:5432/myapp"
vibelock set-env SERVER_PORT "8080"
vibelock set-env LOG_LEVEL "WARN"

# Secrets (interactive — nothing in shell history)
vibelock set DB_PASSWORD
vibelock set API_KEY

# Run
vibelock run -- npm start
```

### Service User (`vibelock grant`)

When your app runs as a dedicated system user:

```bash
# 1. Create service user
sudo useradd -r -s /usr/sbin/nologin sentinel

# 2. Create vault (as admin)
vibelock init --keys-path /etc/vibelock/keys
vibelock set-env DB_URL "jdbc:postgresql://prod-db:5432/myapp"
vibelock set API_KEY

# 3. Transfer ownership
sudo vibelock grant sentinel

# 4. Make directories traversable
sudo chmod o+x /etc/vibelock /etc/vibelock/keys
```

```ini
# /etc/systemd/system/myapp.service
ExecStart=/usr/bin/vibelock run --vault /opt/myapp/secrets.vibe -- /usr/bin/node server.js
```

### Custom Paths

```bash
vibelock init --project myapp --keys-path /etc/vibelock/keys
# or
export VIBELOCK_KEYS_PATH=/etc/vibelock/keys
vibelock init --project myapp
```

The path is saved in the vault file — subsequent commands auto-discover it.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `vibelock init` | Initialize vault and master key |
| `vibelock set <key>` | Set a secret (interactive, input hidden) |
| `vibelock get <key>` | Print a decrypted secret |
| `vibelock list` | List all secret names |
| `vibelock remove <key>` | Remove a secret |
| `vibelock env [key]` | List or get environment variables |
| `vibelock set-env <key> <value>` | Set an environment variable |
| `vibelock remove-env <key>` | Remove an environment variable |
| `vibelock status` | Show vault info (secrets + env count) |
| `vibelock run -- <cmd>` | Run command with all vars injected |
| `vibelock grant <user>` | Transfer ownership to system user |
| `vibelock cleanup` | Delete vault and master key |

**Global options:** `-p, --project` · `-v, --vault` · `-k, --keys-path`

**Init options:** `-f, --force` · `-y, --yes`

**Run options:** `--only <keys>` · `--prefix <prefix>`

---

## SDK

**Node.js:**

```javascript
import vibelock from 'vibelock';

const apiKey = await vibelock.get('API_KEY');
const dbUrl = await vibelock.getEnv('DB_URL');
const prodKey = await vibelock.get('API_KEY', { projectId: 'production' });
```

**Python:**

```python
import vibelock

api_key = vibelock.get("API_KEY")
db_url = vibelock.get_env("DB_URL")

vibelock.init(vault_path="prod.vibe", project_id="production")
vibelock.set("API_KEY", "sk-prod-123", vault_path="prod.vibe")
```

Set the vault path via environment variable:

```bash
export VIBELOCK_VAULT_PATH=/opt/myapp/secrets.vibe
```

**Demos:** [Node.js](./demos/node-demo/) · [Python](./demos/python-demo/) · [Run](./demos/run-demo/)

---

## CI/CD

```yaml
- name: Setup test secrets
  run: |
    npm install -g vibelock
    vibelock init --project ci-test --keys-path $RUNNER_TEMP/vibelock-keys --yes
    echo "test-api-key" | vibelock set API_KEY --project ci-test

- name: Run tests
  run: vibelock run --project ci-test -- npm test
```

VibeLock lives on the server — not in the pipeline. Deploy code only:

```yaml
- name: Deploy
  run: ssh server "cd /app && git pull && systemctl restart myapp"
```

---

## Architecture

- **Vault file** (`secrets.vibe`): JSON with `env` (plaintext config) and `secrets` (AES-256-GCM encrypted). Gitignored. Permissions: `0600`.
- **Master key**: 32-byte random key at `~/.vibelock/keys/<project>/master.key`. Permissions: `0600`. Directories: `0700`.
- **Encryption**: AES-256-GCM + PBKDF2-SHA512 (600k iterations). Per-secret random salt and IV.
- **Integrity**: GCM auth tag rejects tampered vaults before decryption.
- **Injection**: `vibelock run` spawns a child process — parent and disk are never exposed.

See [`spec/vault-format.md`](spec/vault-format.md) for the full encryption specification.

---

## Contributing

```bash
npm install
npm test          # vitest
npm run build     # tsc (strict)
npm run dev       # tsx src/index.ts
```

Built by a Security Architect who believes encryption shouldn't require a DevOps team.
