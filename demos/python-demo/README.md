# VibeLock Python Demo

This demo shows how to use VibeLock from a Python application to read encrypted secrets.

## What is VibeLock?

VibeLock encrypts your secrets so they never sit in plaintext `.env` files. Each project gets its own encrypted vault and a master key stored securely.

## Prerequisites

- Python 3.10+
- VibeLock CLI built at the repo root (Node.js required for CLI):

```bash
# From the repo root
npm run build
```

## Setup

### Step 1: Initialize the vault

```bash
# From this directory (demos/python-demo/)
npx vibelock init -p demo-app
```

### Step 2: Add secrets

```bash
npx vibelock set API_KEY -p demo-app    # enter: sk-demo-abc123xyz
npx vibelock set DB_PASSWORD -p demo-app # enter: sup3r_s3cr3t!
npx vibelock set JWT_SECRET -p demo-app  # enter: my-jwt-secret-2024
```

### Step 3: Install the Python SDK

```bash
# Using a virtual environment (recommended)
python3 -m venv .venv && source .venv/bin/activate && pip install -e ../../python-sdk
```

### Step 4: Run the demo

```bash
python demo.py
```

## Expected output

```
Secrets: ['API_KEY', 'DB_PASSWORD', 'JWT_SECRET']
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
