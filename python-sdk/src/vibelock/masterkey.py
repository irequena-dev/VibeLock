import os
from pathlib import Path
from abc import ABC, abstractmethod
from typing import Optional


class MasterKeyNotFoundError(Exception):
    pass


class MasterKeyWriteError(Exception):
    pass


class MasterKeyReadError(Exception):
    pass


class MasterKeyProvider(ABC):
    @abstractmethod
    def exists(self) -> bool: ...

    @abstractmethod
    def read(self) -> bytes: ...

    @abstractmethod
    def write(self, key: bytes) -> None: ...

    @abstractmethod
    def delete(self) -> None: ...


class FileMasterKeyProvider(MasterKeyProvider):
    def __init__(self, project_id: str = "default", base_path: Optional[Path] = None):
        self.project_id = project_id
        self.base_path = base_path or Path.home() / ".vibelock" / "keys"
        self.key_path = self.base_path / project_id / "master.key"

    def exists(self) -> bool:
        return self.key_path.exists()

    def read(self) -> bytes:
        if not self.exists():
            raise MasterKeyNotFoundError(f"Master key not found: {self.key_path}")

        try:
            return self.key_path.read_bytes()
        except Exception as e:
            raise MasterKeyReadError(f"Failed to read master key: {e}") from e

    def write(self, key: bytes) -> None:
        if len(key) != 32:
            raise ValueError("Master key must be 32 bytes")

        self.base_path.mkdir(parents=True, exist_ok=True)
        self.key_path.parent.mkdir(parents=True, exist_ok=True)

        os.chmod(self.base_path, 0o700)
        os.chmod(self.key_path.parent, 0o700)

        temp_path = self.key_path.with_suffix(".tmp")

        try:
            temp_path.write_bytes(key)

            os.chmod(temp_path, 0o600)

            os.replace(temp_path, self.key_path)

        except Exception as e:
            if temp_path.exists():
                temp_path.unlink()
            raise MasterKeyWriteError(f"Failed to write master key: {e}") from e

    def delete(self) -> None:
        if self.exists():
            try:
                self.key_path.unlink()
            except Exception as e:
                raise MasterKeyWriteError(f"Failed to delete master key: {e}") from e


def get_master_key_provider(
    project_id: str = "default",
    keys_path: str | None = None,
) -> MasterKeyProvider:
    base_path = None
    if keys_path:
        base_path = Path(keys_path)

    return FileMasterKeyProvider(project_id, base_path)
