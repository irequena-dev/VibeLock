# VibeLock `run` Demo

This demo shows how to inject secrets as environment variables into any process using `vibelock run`. Your app never touches VibeLock directly — it just reads `process.env`.

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
# From this directory (demos/run-demo/)
npx vibelock init -p run-demo
```

### Step 2: Add secrets

```bash
npx vibelock set API_KEY -p run-demo     # enter: sk-demo-abc123xyz
npx vibelock set DB_PASSWORD -p run-demo  # enter: sup3r_s3cr3t!
npx vibelock set JWT_SECRET -p run-demo   # enter: my-jwt-secret-2024
```

### Step 3: Run your app with secrets injected

```bash
npx vibelock run -p run-demo -- node app.mjs
```

## Expected output

```
Secrets loaded from environment:
  API_KEY:     sk-d••••3xyz
  DB_PASSWORD: sup3••••3ct!
  JWT_SECRET:  my-j••••-2024

--- Simulated App Config ---
Connecting to DB with password: sup3••••3ct!
API client initialized with key: sk-d••••3xyz
JWT signing with secret: my-j••••-2024
App started successfully ✓
```

## Variations

### Inject only specific secrets

```bash
npx vibelock run -p run-demo --only API_KEY,DB_PASSWORD -- node app.mjs
```

### Add a prefix to env var names

```bash
npx vibelock run -p run-demo --prefix APP_ -- node -e "console.log(process.env.APP_API_KEY)"
```

### Shell one-liner

```bash
npx vibelock run -p run-demo -- sh -c 'echo "API_KEY=$API_KEY"'
```

### Custom vault path

```bash
npx vibelock run -p run-demo --vault ./custom.vibe -- node app.mjs
```

## Cleanup

```bash
npx vibelock cleanup -p run-demo -f
```

## Key takeaway

The app (`app.mjs`) has **zero dependency on VibeLock**. It only reads `process.env`. Secrets are injected at runtime by the `vibelock run` wrapper and never written to disk in plaintext.
