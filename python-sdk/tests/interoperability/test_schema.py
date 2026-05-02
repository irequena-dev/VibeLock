import json
import pytest
from vibelock.vault import create, add_secret, EncryptedSecret
from vibelock.crypto import encrypt, derive_key

KEY = b"0123456789abcdef0123456789abcdef"
SALT = b"0123456789abcdef"


class TestSchema:
    @pytest.fixture
    def vault_path(self, tmp_path):
        vp = tmp_path / "schema.vibe"
        vp.parent.mkdir(parents=True, exist_ok=True)
        return vp

    def test_root_is_object(self, vault_path):
        create(vault_path)
        with open(vault_path) as f:
            assert isinstance(json.load(f), dict)

    def test_version_is_one(self, vault_path):
        create(vault_path)
        with open(vault_path) as f:
            assert json.load(f)["version"] == 1

    def test_secrets_is_dict(self, vault_path):
        create(vault_path)
        with open(vault_path) as f:
            assert isinstance(json.load(f)["secrets"], dict)

    def test_secret_has_required_fields(self, vault_path):
        create(vault_path)
        derived = derive_key(KEY, SALT)
        iv, tag, ct = encrypt(derived, "test")
        add_secret(
            vault_path,
            "K",
            EncryptedSecret(iv=iv, tag=tag, ciphertext=ct, salt=SALT.hex()),
        )
        with open(vault_path) as f:
            data = json.load(f)
        for sec in data["secrets"].values():
            assert set(sec.keys()) == {"iv", "tag", "ciphertext", "salt"}

    def test_no_extra_root_fields(self, vault_path):
        create(vault_path)
        with open(vault_path) as f:
            assert set(json.load(f).keys()) == {"version", "secrets"}

    def test_all_values_are_strings(self, vault_path):
        create(vault_path)
        derived = derive_key(KEY, SALT)
        iv, tag, ct = encrypt(derived, "test")
        add_secret(
            vault_path,
            "K",
            EncryptedSecret(iv=iv, tag=tag, ciphertext=ct, salt=SALT.hex()),
        )
        with open(vault_path) as f:
            data = json.load(f)
        for sec in data["secrets"].values():
            for v in sec.values():
                assert isinstance(v, str)
