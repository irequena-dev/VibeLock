# VibeLock Python SDK v1

Cross-platform secrets management for Python applications, encrypted with VibeLock.

**Status:** Core implementation complete — crypto, vault, master key, SDK, CLI, and interoperability tests done.

---

## Features
- AES-256-GCM encryption with 600k PBKDF2-SHA512 iterations
- File-based master key storage with atomic operations
- Configurable master key path (`keys_path` / `VIBELOCK_KEYS_PATH`)
- 100% compatible with VibeLock TypeScript SDK
- Simple async API: `init()`, `set()`, `get()`, `list()`, `remove()`
- Multi-project isolation
- Atomic vault operations

---

## Quick Start

```python
import vibelock
import asyncio

async def main():
    # Initialize new vault
    await vibelock.init()
    
    # Store secrets
    await vibelock.set("API_KEY", "sk-abc123def456")
    await vibelock.set("DATABASE_URL", "postgresql://user:pass@localhost/db")
    
    # Retrieve secrets
    api_key = await vibelock.get("API_KEY")
    db_url = await vibelock.get("DATABASE_URL")
    
    # List all secrets
    secrets = await vibelock.list()
    print(f"Available secrets: {secrets}")

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Installation

```bash
# Install from PyPI (when released)
pip install vibelock-python

# Install from source
git clone https://github.com/ismaibz/vibelock.git
cd vibelock/python-sdk
pip install -e .
```

---

## API Reference

### `vibelock.init(options=None)`
Initialize a new vault with master key.

```python
async def init(options: VibeLockOptions = None) -> None:
```

**Parameters:**
- `options` (VibeLockOptions, optional): Configuration options
  - `vault_path` (str): Path to vault file (default: "./secrets.vibe")
  - `project_id` (str): Project identifier (default: "default")
  - `keys_path` (str, optional): Custom master key storage directory

**Raises:**
- `FileExistsError`: If vault or master key already exists

### `vibelock.set(key, value, options=None)`
Encrypt and store a secret.

```python
async def set(key: str, value: str, options: VibeLockOptions = None) -> None:
```

### `vibelock.get(key, options=None)`
Decrypt and retrieve a secret.

```python
async def get(key: str, options: VibeLockOptions = None) -> str:
```

### `vibelock.list(options=None)`
List all secret names.

```python
async def list(options: VibeLockOptions = None) -> list[str]:
```

### `vibelock.remove(key, options=None)`
Delete a secret.

```python
async def remove(key: str, options: VibeLockOptions = None) -> None:
```

---

## Configuration

### `VibeLockOptions`
```python
@dataclass
class VibeLockOptions:
    vault_path: str = "./secrets.vibe"
    project_id: str = "default"
    keys_path: Optional[str] = None
```

### Custom Keys Path
```python
# Store master keys in a custom location
options = vibelock.VibeLockOptions(
    project_id="production",
    vault_path="./production.secrets",
    keys_path="/etc/vibelock/keys"
)

# Or via environment variable
import os
os.environ["VIBELOCK_KEYS_PATH"] = "/etc/vibelock/keys"
```

### Example
```python
import asyncio
from vibelock import get, get_env
from vibelock.config import VibeLockOptions

opts = VibeLockOptions(
    project_id="my-app",
    vault_path="./secrets.vibe"
)

async def main():
    # Retrieve an encrypted secret
    api_key = await get("API_KEY", options=opts)
    
    # Retrieve plaintext configuration
    db_url = await get_env("DB_URL", options=opts)
    
    print(f"Connecting to {db_url} with API key...")

asyncio.run(main())
```

### Multi-Project Example

```python
# Production vault
prod_options = vibelock.VibeLockOptions(
    project_id="production",
    vault_path="./secrets.prod.vibe"
)

# Staging vault  
staging_options = vibelock.VibeLockOptions(
    project_id="staging",
    vault_path="./staging.secrets"
)

await vibelock.set("API_KEY", "prod-key-123", prod_options)
await vibelock.set("API_KEY", "staging-key-456", staging_options)

prod_key = await vibelock.get("API_KEY", prod_options)
staging_key = await vibelock.get("API_KEY", staging_options)
```

---

## Security Features

### Encryption
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2-SHA512 with 600,000 iterations
- **IV Length**: 12 bytes (24 hex chars)
- **Auth Tag**: 16 bytes (32 hex chars)

### Storage
- **Master Key**: 32 bytes random, stored as file
- **File Permissions**: 0o600 for keys, 0o700 for directories
- **Vault Format**: JSON with atomic writes
- **Per-Salt**: Each secret gets unique salt for forward security

### Key Path Resolution
1. `keys_path` option (explicit)
2. `VIBELOCK_KEYS_PATH` environment variable
3. Default: `~/.vibelock/keys/`

---

## Interoperability

The Python SDK is 100% compatible with the TypeScript SDK:

```python
# Python and TypeScript SDKs can read each other's vaults
await vibelock.set("SHARED_SECRET", "cross-platform-value")

# TypeScript SDK can read: await get("SHARED_SECRET")
# Python SDK can read: await vibelock.get("SHARED_SECRET") 
```

**Vault Format**: Identical JSON structure, encoding, and cryptographic operations.

---

## Development

### Running Tests
```bash
# All tests
pytest

# With coverage
pytest --cov=vibelock

# Specific test categories
pytest tests/test_crypto.py
pytest tests/interoperability/
```

### Code Quality
```bash
# Format code
black .

# Lint code  
ruff check .

# Type checking
mypy src/
```

### Contributing
1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all linting checks pass
5. Submit pull request

---

## Architecture

```
src/vibelock/
├── __init__.py          # Public API exports
├── crypto.py            # AES-256-GCM, PBKDF2-SHA512
├── vault.py             # Vault JSON operations  
├── masterkey.py         # File-based key management
└── sdk.py               # High-level API coordination
```

### Implementation Phases
1. **Crypto**: Core cryptographic primitives
2. **Vault**: JSON file operations and validation
3. **Master Key**: Storage and retrieval
4. **SDK**: Public API coordination
5. **Interoperability**: Cross-SDK compatibility
6. **Packaging**: Distribution and documentation

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Issues

Report bugs and request features on [GitHub Issues](https://github.com/ismaibz/vibelock/issues).

---

## Support

- **Documentation**: [Full docs](https://github.com/ismaibz/vibelock/tree/main/python-sdk/README.md)
- **Issues**: [GitHub Issues](https://github.com/ismaibz/vibelock/issues)

---

*VibeLock - Secrets management for developers, encrypted and portable.*
