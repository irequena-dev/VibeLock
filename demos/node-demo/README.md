# VibeLock Node.js Demo

This demo shows how to use VibeLock from a Node.js application to read encrypted secrets.

## What is VibeLock?

VibeLock encrypts your secrets so they never sit in plaintext `.env` files. Each project gets its own encrypted vault (`.vibe` / `secrets.vibe`) and a master key stored securely.

## Prerequisites

- Node.js 20+
- VibeLock built at the repo root:

```bash
# From the repo root
npm run build
```

## Setup

### Step 1: Initialize the vault

```bash
# From this directory (demos/node-demo/)
npx vibelock init -p demo-app
```

### Step 2: Add secrets

```bash
npx vibelock set API_KEY -p demo-app    # enter: sk-demo-abc123xyz
npx vibelock set DB_PASSWORD -p demo-app # enter: sup3r_s3cr3t!
npx vibelock set JWT_SECRET -p demo-app  # enter: my-jwt-secret-2024
```

### Step 3: Install dependencies

```bash
npm install
```

### Step 4: Run the demo

```bash
npm start
```

## Expected output

```
Secrets: [ 'API_KEY', 'DB_PASSWORD', 'JWT_SECRET' ]
API_KEY: sk-d••••3xyz
DB_PASSWORD: sup3••••3ct!
JWT_SECRET: my-j••••-2024

--- Simulated App Config ---
Connecting to DB with password: sup3••••3ct!
API client initialized with key: sk-d••••3xyz
JWT signing with secret: my-j••••-2024
App started successfully ✓
```

## Important

- Never commit `secrets.vibe` or `master.key` to git — they are already in `.gitignore`
- The master key lives at `~/.vibelock/demo-app.key` (chmod 600)
