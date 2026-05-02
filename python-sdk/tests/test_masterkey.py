import pytest
import tempfile
import os
from pathlib import Path
from vibelock.masterkey import (
    FileMasterKeyProvider,
    get_master_key_provider,
    MasterKeyNotFoundError,
)

KEY = b"0123456789abcdef0123456789abcdef"


class TestFileMasterKeyProvider:
    @pytest.fixture
    def temp_dir(self):
        return Path(tempfile.mkdtemp())

    @pytest.fixture
    def provider(self, temp_dir):
        return FileMasterKeyProvider("test-project", temp_dir)

    def test_exists_false(self, provider):
        assert not provider.exists()

    def test_exists_true(self, provider):
        provider.write(KEY)
        assert provider.exists()

    def test_read_not_found(self, provider):
        with pytest.raises(MasterKeyNotFoundError):
            provider.read()

    def test_read_success(self, provider):
        provider.write(KEY)
        assert provider.read() == KEY

    def test_write_success(self, provider):
        provider.write(KEY)
        assert provider.exists()
        assert provider.read() == KEY
        stat = os.stat(provider.key_path)
        assert stat.st_mode & 0o600

    def test_write_wrong_length(self, provider):
        with pytest.raises(ValueError, match="Master key must be 32 bytes"):
            provider.write(b"short-key")

    def test_delete_success(self, provider):
        provider.write(KEY)
        assert provider.exists()
        provider.delete()
        assert not provider.exists()
        with pytest.raises(MasterKeyNotFoundError):
            provider.read()

    def test_delete_not_found(self, provider):
        provider.delete()


class TestProviderSelection:
    def test_default_returns_file_provider(self):
        provider = get_master_key_provider("test")
        assert isinstance(provider, FileMasterKeyProvider)

    def test_keys_path_option(self):
        temp_dir = Path(tempfile.mkdtemp())
        provider = get_master_key_provider("test", keys_path=str(temp_dir))
        assert isinstance(provider, FileMasterKeyProvider)
        assert provider.base_path == temp_dir

    def test_default_base_path(self):
        provider = get_master_key_provider("test")
        assert isinstance(provider, FileMasterKeyProvider)
        assert provider.base_path == Path.home() / ".vibelock" / "keys"


class TestProviderIsolation:
    @pytest.fixture
    def temp_dir(self):
        return Path(tempfile.mkdtemp())

    def test_multi_project_isolation(self, temp_dir):
        p1 = FileMasterKeyProvider("project1", temp_dir)
        p2 = FileMasterKeyProvider("project2", temp_dir)
        k1 = b"0123456789abcdef0123456789abcdef"
        k2 = b"fedcba9876543210fedcba9876543210"
        p1.write(k1)
        p2.write(k2)
        assert p1.read() == k1
        assert p2.read() == k2
        assert p1.key_path != p2.key_path
