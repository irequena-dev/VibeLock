import os
from pathlib import Path
from typing import Dict, Union

from .crypto import derive_key, encrypt, decrypt
from .vault import (
    get_secret,
    add_secret,
    remove_secret,
    exists,
    get_vault_keys_path,
    get_vault_project_id,
    get_vault_env,
    EncryptedSecret,
)
from .masterkey import get_master_key_provider

DEFAULT_VAULT_PATH = "./secrets.vibe"


def _resolve_vault_path(vault_path: str | None = None) -> Path:
    path = vault_path or os.environ.get("VIBELOCK_VAULT_PATH") or DEFAULT_VAULT_PATH
    return Path(path)


def init(
    vault_path: str | None = None,
    project_id: str | None = None,
    keys_path: str | None = None,
) -> None:
    vault_path_obj = _resolve_vault_path(vault_path)

    resolved_keys_path = keys_path or os.environ.get("VIBELOCK_KEYS_PATH")

    provider = get_master_key_provider(
        project_id or "default", keys_path=resolved_keys_path
    )

    if provider.exists() and vault_path_obj.exists():
        raise FileExistsError(f"Vault already exists at {vault_path_obj}")

    master_key = os.urandom(32)

    provider.write(master_key)

    from .vault import create

    create(vault_path_obj, project_id=project_id, keys_path=resolved_keys_path)


def set(key: str, value: str, vault_path: str | None = None) -> None:
    vp = _resolve_vault_path(vault_path)

    project_id = get_vault_project_id(vp) or "default"

    vault_kp = get_vault_keys_path(vp) if vp.exists() else None
    resolved_keys_path = os.environ.get("VIBELOCK_KEYS_PATH") or vault_kp

    provider = get_master_key_provider(project_id, keys_path=resolved_keys_path)
    master_key = provider.read()

    salt = os.urandom(16)

    derived_key = derive_key(master_key, salt)

    iv_hex, tag_hex, ciphertext_hex = encrypt(derived_key, value)

    secret = EncryptedSecret(
        iv=iv_hex, tag=tag_hex, ciphertext=ciphertext_hex, salt=salt.hex()
    )

    add_secret(vp, key, secret)


def get(key: str, vault_path: str | None = None) -> str:
    vp = _resolve_vault_path(vault_path)

    project_id = get_vault_project_id(vp) or "default"

    vault_kp = get_vault_keys_path(vp) if vp.exists() else None
    resolved_keys_path = os.environ.get("VIBELOCK_KEYS_PATH") or vault_kp

    provider = get_master_key_provider(project_id, keys_path=resolved_keys_path)

    secret = get_secret(vp, key)

    master_key = provider.read()

    derived_key = derive_key(master_key, bytes.fromhex(secret.salt))

    try:
        return decrypt(derived_key, secret.iv, secret.tag, secret.ciphertext)
    except Exception as e:
        raise ValueError(f"Failed to decrypt secret '{key}': {e}") from e


def list_secrets(vault_path: str | None = None) -> list[str]:
    vp = _resolve_vault_path(vault_path)

    if not exists(vp):
        return []

    from .vault import list_secrets as _list_secrets

    return _list_secrets(vp)


def remove(key: str, vault_path: str | None = None) -> None:
    vp = _resolve_vault_path(vault_path)

    remove_secret(vp, key)


def get_env(
    key: str | None = None, vault_path: str | None = None
) -> Union[str, Dict[str, str], None]:
    vp = _resolve_vault_path(vault_path)

    if not exists(vp):
        return None

    env = get_vault_env(vp)
    if not env:
        return None if key else {}

    if key is not None:
        return env.get(key)
    return env
