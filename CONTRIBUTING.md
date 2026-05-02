# Contributing to VibeLock

## Development Setup

### Prerequisites
- Node.js 20+
- Python 3.10+
- Git

### Install
```bash
git clone https://github.com/irequena-dev/VibeLock.git
cd VibeLock
npm install
```

### TypeScript (CLI + SDK)
```bash
npm run build      # Compile TypeScript
npm run dev        # Run with tsx (no build)
npm test           # Run tests (vitest)
npm run lint       # Lint with eslint
```

### Python SDK
```bash
cd python-sdk
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
pytest              # Run tests
ruff check .        # Lint
ruff format .       # Format
mypy src/           # Type check
```

## Architecture

- `src/core/` — Crypto, vault, master key, permissions
- `src/cli/` — Commander CLI
- `src/sdk/` — Public API (`get`, `set`, `list`, `remove`, `init`, `getEnv`)
- `python-sdk/src/vibelock/` — Python SDK (sync, same vault format)
- `spec/vault-format.md` — Encryption specification

## Making Changes

1. Create a branch: `git checkout -b feature/my-change`
2. Make changes and add tests
3. Run `npm run build && npm test` (TypeScript)
4. Run `cd python-sdk && pytest` (Python)
5. Commit with conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
6. Push and open a Pull Request

## Pre-commit Hooks

```bash
pip install pre-commit
pre-commit install
```

Runs `ruff` on Python files automatically.

## Vault Format

Both SDKs share the same vault format (`spec/vault-format.md`). Changes to the vault format must be backwards-compatible and implemented in both SDKs simultaneously.

## Release

Releases are automated via GitHub Actions:
- Push a git tag → GitHub Release → npm + PyPI publish
- Ensure `NPM_TOKEN` and `PYPI_API_TOKEN` secrets are set
