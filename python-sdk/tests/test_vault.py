import pytest
import json
from vibelock.vault import (
    EncryptedSecret,
    create,
    load,
    add_secret,
    get_secret,
    remove_secret,
    list_secrets,
    exists,
    get_vault_project_id,
    VaultVersionError,
    VaultSchemaError,
    SecretNotFoundError,
)

VALID_IV = "0123456789abcdef01234567"
VALID_TAG = "0123456789abcdef0123456789abcdef"
VALID_CT = "0123456789abcdef0123456789abcdef"
VALID_SALT = "fedcba9876543210fedcba9876543210"


def _secret(iv=VALID_IV, tag=VALID_TAG, ct=VALID_CT, salt=VALID_SALT):
    return EncryptedSecret(iv=iv, tag=tag, ciphertext=ct, salt=salt)


class TestVault:
    @pytest.fixture
    def vault_path(self, tmp_path):
        vp = tmp_path / "vibe_test" / "secrets.vibe"
        vp.parent.mkdir(parents=True, exist_ok=True)
        return vp

    def test_create_new_vault(self, vault_path):
        create(vault_path)
        assert vault_path.exists()
        vd = load(vault_path)
        assert vd.version == 1
        assert vd.secrets == {}

    def test_create_existing_vault(self, vault_path):
        create(vault_path)
        with pytest.raises(FileExistsError):
            create(vault_path)

    def test_load_valid_vault(self, vault_path):
        test_data = {
            "version": 1,
            "secrets": {
                "API_KEY": {
                    "iv": VALID_IV,
                    "tag": VALID_TAG,
                    "ciphertext": VALID_CT,
                    "salt": VALID_SALT,
                },
                "DB_PASSWORD": {
                    "iv": "abcdef0123456789abcdef01",
                    "tag": "abcdef0123456789abcdef0123456789",
                    "ciphertext": "fedcba9876543210fedcba9876543210",
                    "salt": "aabbccdd11223344aabbccdd11223344",
                },
            },
        }
        with open(vault_path, "w") as f:
            json.dump(test_data, f)
        vd = load(vault_path)
        assert vd.version == 1
        assert len(vd.secrets) == 2
        assert vd.secrets["API_KEY"].iv == VALID_IV

    def test_load_vault_with_missing_fields(self, vault_path):
        with open(vault_path, "w") as f:
            json.dump({"version": 1}, f)
        with pytest.raises(VaultSchemaError, match="Vault must contain"):
            load(vault_path)

    def test_load_vault_wrong_version(self, vault_path):
        with open(vault_path, "w") as f:
            json.dump({"version": 2, "secrets": {}}, f)
        with pytest.raises(VaultVersionError, match="Unsupported vault version"):
            load(vault_path)

    def test_load_invalid_json(self, vault_path):
        with open(vault_path, "w") as f:
            f.write("invalid json {")
        with pytest.raises(VaultSchemaError, match="Invalid JSON"):
            load(vault_path)

    def test_add_secret(self, vault_path):
        create(vault_path)
        add_secret(vault_path, "API_KEY", _secret())
        secrets = list_secrets(vault_path)
        assert "API_KEY" in secrets
        retrieved = get_secret(vault_path, "API_KEY")
        assert retrieved == _secret()

    def test_get_secret_not_found(self, vault_path):
        create(vault_path)
        with pytest.raises(SecretNotFoundError):
            get_secret(vault_path, "nonexistent")

    def test_remove_secret(self, vault_path):
        create(vault_path)
        add_secret(vault_path, "API_KEY", _secret())
        remove_secret(vault_path, "API_KEY")
        assert "API_KEY" not in list_secrets(vault_path)
        with pytest.raises(SecretNotFoundError):
            get_secret(vault_path, "API_KEY")

    def test_remove_secret_not_found(self, vault_path):
        create(vault_path)
        remove_secret(vault_path, "nonexistent")

    def test_list_secrets(self, vault_path):
        create(vault_path)
        assert list_secrets(vault_path) == []
        add_secret(vault_path, "API_KEY", _secret())
        add_secret(vault_path, "DB_PASSWORD", _secret())
        assert set(list_secrets(vault_path)) == {"API_KEY", "DB_PASSWORD"}

    def test_exists(self, vault_path):
        assert not exists(vault_path)
        create(vault_path)
        assert exists(vault_path)

    def test_add_secret_overwrite(self, vault_path):
        create(vault_path)
        sec1 = _secret(iv="abcdef0123456789abcdef01")
        sec2 = _secret(iv="fedcba9876543210fedcba98")
        add_secret(vault_path, "API_KEY", sec1)
        add_secret(vault_path, "API_KEY", sec2)
        assert get_secret(vault_path, "API_KEY") == sec2

    def test_vault_field_validation(self, tmp_path):
        vault_path = tmp_path / "field_test.vibe"
        vault_path.parent.mkdir(parents=True, exist_ok=True)
        create(vault_path)

        invalid_cases = [
            {
                "iv": "0123456789abcdef0123456789abcdef00",
                "tag": VALID_TAG,
                "ciphertext": VALID_CT,
                "salt": VALID_SALT,
            },
            {
                "iv": VALID_IV,
                "tag": "0123456789abcdef0123456789abcdef00",
                "ciphertext": VALID_CT,
                "salt": VALID_SALT,
            },
            {
                "iv": VALID_IV,
                "tag": VALID_TAG,
                "ciphertext": VALID_CT,
                "salt": "0123456789abcdef0123456789abcdef00",
            },
            {"iv": VALID_IV, "tag": VALID_TAG, "ciphertext": VALID_CT},
            {
                "iv": "0123456789abcdef0123456g",
                "tag": VALID_TAG,
                "ciphertext": VALID_CT,
                "salt": VALID_SALT,
            },
        ]

        for invalid_data in invalid_cases:
            data = {"version": 1, "secrets": {"BAD": invalid_data}}
            with open(vault_path, "w") as f:
                json.dump(data, f)
            with pytest.raises((VaultSchemaError, ValueError)):
                load(vault_path)

    def test_get_vault_project_id(self, tmp_path):
        vault_path = tmp_path / "project.vibe"
        data = {"version": 1, "secrets": {}, "projectId": "my-project"}
        with open(vault_path, "w") as f:
            json.dump(data, f)
        assert get_vault_project_id(vault_path) == "my-project"

    def test_get_vault_project_id_missing(self, tmp_path):
        vault_path = tmp_path / "no-project.vibe"
        data = {"version": 1, "secrets": {}}
        with open(vault_path, "w") as f:
            json.dump(data, f)
        assert get_vault_project_id(vault_path) is None
