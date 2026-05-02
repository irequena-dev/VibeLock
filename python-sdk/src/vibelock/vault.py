import json
import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, Any, Optional

from .crypto import IV_LENGTH, TAG_LENGTH, SALT_LENGTH


@dataclass
class EncryptedSecret:
    iv: str
    tag: str
    ciphertext: str
    salt: str


@dataclass
class VaultData:
    version: int = 1
    secrets: Dict[str, EncryptedSecret] = field(default_factory=dict)
    env: Dict[str, str] = field(default_factory=dict)
    project_id: Optional[str] = None
    keys_path: Optional[str] = None


class VaultVersionError(Exception):
    pass


class VaultSchemaError(Exception):
    pass


class SecretNotFoundError(Exception):
    pass


def create(
    vault_path: Path,
    project_id: Optional[str] = None,
    keys_path: Optional[str] = None,
) -> None:
    if vault_path.exists():
        raise FileExistsError(f"Vault file already exists: {vault_path}")

    vault_path.parent.mkdir(parents=True, exist_ok=True)

    vault_data = VaultData(project_id=project_id, keys_path=keys_path)

    _save_with_permissions(vault_path, vault_data)


def load(vault_path: Path) -> VaultData:
    if not vault_path.exists():
        raise FileNotFoundError(f"Vault file not found: {vault_path}")

    try:
        with open(vault_path, "r") as f:
            json_data = json.load(f)
    except json.JSONDecodeError as e:
        raise VaultSchemaError(f"Invalid JSON in vault file: {e}")

    if not isinstance(json_data, dict):
        raise VaultSchemaError("Vault root must be an object")

    if "version" not in json_data or "secrets" not in json_data:
        raise VaultSchemaError("Vault must contain 'version' and 'secrets' fields")

    if json_data["version"] != 1:
        raise VaultVersionError(f"Unsupported vault version: {json_data['version']}")

    if not isinstance(json_data["secrets"], dict):
        raise VaultSchemaError("'secrets' must be an object")

    secrets = {}
    for key, secret_data in json_data["secrets"].items():
        if not isinstance(secret_data, dict):
            raise VaultSchemaError(f"Secret '{key}' must be an object")

        secret = _parse_encrypted_secret(key, secret_data)
        secrets[key] = secret

    env = {}
    if "env" in json_data:
        if not isinstance(json_data["env"], dict):
            raise VaultSchemaError("'env' must be an object")
        for k, v in json_data["env"].items():
            if not isinstance(v, str):
                raise VaultSchemaError(f"env variable '{k}' must be a string")
            env[k] = v

    project_id = json_data.get("projectId")
    keys_path_val = json_data.get("keysPath")

    if project_id is not None and not isinstance(project_id, str):
        raise VaultSchemaError("'projectId' must be a string")
    if keys_path_val is not None and not isinstance(keys_path_val, str):
        raise VaultSchemaError("'keysPath' must be a string")

    return VaultData(
        secrets=secrets, env=env, project_id=project_id, keys_path=keys_path_val
    )


def save(vault_path: Path, data: VaultData) -> None:
    vault_path.parent.mkdir(parents=True, exist_ok=True)

    _save_with_permissions(vault_path, data)


def add_secret(vault_path: Path, name: str, secret: EncryptedSecret) -> None:
    try:
        vault_data = load(vault_path)
    except (FileNotFoundError, VaultSchemaError, VaultVersionError):
        vault_data = VaultData()

    vault_data.secrets[name] = secret

    save(vault_path, vault_data)


def get_secret(vault_path: Path, name: str) -> EncryptedSecret:
    vault_data = load(vault_path)

    if name not in vault_data.secrets:
        raise SecretNotFoundError(f"Secret '{name}' not found in vault")

    return vault_data.secrets[name]


def remove_secret(vault_path: Path, name: str) -> None:
    try:
        vault_data = load(vault_path)
    except FileNotFoundError:
        return

    if name not in vault_data.secrets:
        return

    del vault_data.secrets[name]
    save(vault_path, vault_data)


def list_secrets(vault_path: Path) -> list[str]:
    try:
        vault_data = load(vault_path)
        return list(vault_data.secrets.keys())
    except FileNotFoundError:
        return []


def exists(vault_path: Path) -> bool:
    return vault_path.exists()


def _save_with_permissions(vault_path: Path, data: VaultData) -> None:
    temp_path = vault_path.with_suffix(".vibe.tmp")

    try:
        with open(temp_path, "w") as f:
            json.dump(_vault_data_to_dict(data), f, indent=2)

        os.chmod(temp_path, 0o600)

        os.replace(temp_path, vault_path)

    except Exception as e:
        if temp_path.exists():
            temp_path.unlink()
        raise e


def _vault_data_to_dict(data: VaultData) -> Dict[str, Any]:
    secrets_dict = {}
    for name, secret in data.secrets.items():
        secrets_dict[name] = {
            "iv": secret.iv,
            "tag": secret.tag,
            "ciphertext": secret.ciphertext,
            "salt": secret.salt,
        }
    result: Dict[str, Any] = {"version": data.version, "secrets": secrets_dict}
    if data.env:
        result["env"] = data.env
    if data.project_id is not None:
        result["projectId"] = data.project_id
    if data.keys_path is not None:
        result["keysPath"] = data.keys_path
    return result


def get_vault_keys_path(vault_path: Path) -> Optional[str]:
    try:
        vault = load(vault_path)
        return vault.keys_path
    except Exception:
        return None


def get_vault_project_id(vault_path: Path) -> Optional[str]:
    try:
        vault = load(vault_path)
        return vault.project_id
    except Exception:
        return None


def get_vault_env(vault_path: Path) -> Optional[Dict[str, str]]:
    try:
        vault = load(vault_path)
        return vault.env
    except Exception:
        return None


def _parse_encrypted_secret(name: str, secret_data: Dict[str, Any]) -> EncryptedSecret:
    required_fields = {"iv", "tag", "ciphertext", "salt"}
    if set(secret_data.keys()) != required_fields:
        raise VaultSchemaError(
            f"Secret '{name}' must contain exactly these fields: {required_fields}"
        )

    try:
        iv = _validate_hex_field(name, "iv", secret_data["iv"], IV_LENGTH)
        tag = _validate_hex_field(name, "tag", secret_data["tag"], TAG_LENGTH)
        ciphertext = _validate_hex_field(name, "ciphertext", secret_data["ciphertext"])
        salt = _validate_hex_field(name, "salt", secret_data["salt"], SALT_LENGTH)
    except ValueError as e:
        raise VaultSchemaError(f"Secret '{name}' field validation failed: {e}")

    return EncryptedSecret(iv=iv, tag=tag, ciphertext=ciphertext, salt=salt)


def _validate_hex_field(
    name: str,
    field_name: str,
    hex_value: str,
    expected_length: int = 0,
    min_length: int | None = None,
) -> str:
    if not isinstance(hex_value, str):
        raise ValueError(f"{field_name} must be a string")
    if hex_value and hex_value != hex_value.lower():
        raise ValueError(f"{field_name} must be lowercase hex")
    if hex_value and hex_value.startswith("0x"):
        raise ValueError(f"{field_name} must not have '0x' prefix")
    if hex_value:
        try:
            bytes.fromhex(hex_value)
        except ValueError:
            raise ValueError(f"{field_name} contains invalid hex characters")
    if min_length is not None and len(hex_value) < min_length * 2:
        raise ValueError(
            f"{field_name} must be at least {min_length * 2} hex chars ({min_length} bytes)"
        )
    if expected_length and len(hex_value) != expected_length * 2:
        raise ValueError(
            f"{field_name} must be {expected_length * 2} hex chars ({expected_length} bytes)"
        )
    return hex_value
