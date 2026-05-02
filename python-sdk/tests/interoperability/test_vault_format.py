import json
import pytest
from vibelock.vault import create, add_secret, EncryptedSecret
from vibelock.crypto import encrypt, derive_key

KEY = b"0123456789abcdef0123456789abcdef"
SALT = b"0123456789abcdef"


class TestVaultFormat:
    def test_vault_json_structure(self, tmp_path):
        vp = tmp_path / "test.vibe"
        create(vp)
        with open(vp) as f:
            data = json.load(f)
        assert data["version"] == 1
        assert isinstance(data["secrets"], dict)

    def test_secret_field_lengths(self, tmp_path):
        vp = tmp_path / "test.vibe"
        create(vp)
        derived = derive_key(KEY, SALT)
        iv, tag, ct = encrypt(derived, "test-value")
        add_secret(
            vp,
            "API_KEY",
            EncryptedSecret(iv=iv, tag=tag, ciphertext=ct, salt=SALT.hex()),
        )
        with open(vp) as f:
            s = json.load(f)["secrets"]["API_KEY"]
        assert len(s["iv"]) == 24
        assert len(s["tag"]) == 32
        assert len(s["salt"]) == 32
        assert len(s["ciphertext"]) > 0

    def test_hex_encoding_lowercase(self, tmp_path):
        vp = tmp_path / "test.vibe"
        create(vp)
        derived = derive_key(KEY, SALT)
        iv, tag, ct = encrypt(derived, "test")
        add_secret(
            vp, "K", EncryptedSecret(iv=iv, tag=tag, ciphertext=ct, salt=SALT.hex())
        )
        with open(vp) as f:
            s = json.load(f)["secrets"]["K"]
        for field in ("iv", "tag", "salt", "ciphertext"):
            assert s[field] == s[field].lower()
            assert not s[field].startswith("0x")

    def test_secret_fields_exactly_four(self, tmp_path):
        vp = tmp_path / "test.vibe"
        create(vp)
        derived = derive_key(KEY, SALT)
        iv, tag, ct = encrypt(derived, "v")
        add_secret(
            vp, "X", EncryptedSecret(iv=iv, tag=tag, ciphertext=ct, salt=SALT.hex())
        )
        with open(vp) as f:
            assert set(json.load(f)["secrets"]["X"].keys()) == {
                "iv",
                "tag",
                "ciphertext",
                "salt",
            }

    @pytest.mark.skip(reason="Requires TypeScript SDK environment")
    def test_python_vault_readable_by_typescript(self):
        pass
