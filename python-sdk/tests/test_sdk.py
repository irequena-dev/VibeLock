import pytest
import json
from pathlib import Path
from vibelock import init, get, remove, get_env
from vibelock import set as vl_set, list as vl_list
from vibelock.sdk import _resolve_vault_path


class TestSDKIntegration:
    def test_init_creates_vault_and_master_key(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        assert Path(vp).exists()
        with open(vp) as f:
            assert json.load(f)["version"] == 1

    def test_init_already_exists(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        with pytest.raises(FileExistsError):
            init(vault_path=vp)

    def test_set_get_secret(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        vl_set("API_KEY", "sk-abc123def456", vault_path=vp)
        assert get("API_KEY", vault_path=vp) == "sk-abc123def456"

    def test_set_get_unicode_secret(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        for key, val in [
            ("emoji", "\U0001f510 \u7d42\u6975\u79d8\u5bc6 \U0001f5dd\ufe0f"),
            ("chinese", "\u4f60\u597d\u4e16\u754c"),
            (
                "arabic",
                "\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645",
            ),
            ("russian", "\u041f\u0440\u0438\u0432\u0435\u0442 \u043c\u0438\u0440"),
            ("special", "Line1\nLine2\r\nLine3"),
        ]:
            vl_set(key, val, vault_path=vp)
            assert get(key, vault_path=vp) == val

    def test_set_get_large_secret(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        large = "x" * (1024 * 1024)
        vl_set("LARGE", large, vault_path=vp)
        assert get("LARGE", vault_path=vp) == large

    def test_list_secrets(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        assert vl_list(vault_path=vp) == []
        vl_set("API_KEY", "sk-abc123", vault_path=vp)
        vl_set("DB_PASSWORD", "secret-pass", vault_path=vp)
        assert set(vl_list(vault_path=vp)) == {"API_KEY", "DB_PASSWORD"}

    def test_remove_secret(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        vl_set("API_KEY", "sk-abc123", vault_path=vp)
        vl_set("DB_PASSWORD", "secret-pass", vault_path=vp)
        remove("API_KEY", vault_path=vp)
        assert vl_list(vault_path=vp) == ["DB_PASSWORD"]
        with pytest.raises(Exception):
            get("API_KEY", vault_path=vp)
        assert get("DB_PASSWORD", vault_path=vp) == "secret-pass"

    def test_remove_nonexistent_secret(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        remove("nonexistent", vault_path=vp)

    def test_multi_project_isolation(self, tmp_path):
        vp1 = str(tmp_path / "p1.vibe")
        vp2 = str(tmp_path / "p2.vibe")
        init(vault_path=vp1, project_id="p1")
        init(vault_path=vp2, project_id="p2")
        vl_set("API_KEY", "project1-key", vault_path=vp1)
        vl_set("API_KEY", "project2-key", vault_path=vp2)
        assert get("API_KEY", vault_path=vp1) == "project1-key"
        assert get("API_KEY", vault_path=vp2) == "project2-key"

    def test_custom_vault_path(self, tmp_path):
        custom = str(tmp_path / "custom.secrets")
        init(vault_path=custom)
        assert Path(custom).exists()
        vl_set("TEST_KEY", "test-value", vault_path=custom)
        assert get("TEST_KEY", vault_path=custom) == "test-value"

    def test_keys_path_option(self, tmp_path):
        keys_dir = str(tmp_path / "custom-keys")
        vp = str(tmp_path / "kp.vibe")
        init(vault_path=vp, keys_path=keys_dir)
        vl_set("API_KEY", "keys-path-test", vault_path=vp)
        assert get("API_KEY", vault_path=vp) == "keys-path-test"

    def test_get_env(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)

        assert get_env(None, vault_path=vp) == {}
        assert get_env("NON_EXISTENT", vault_path=vp) is None

        vault_path = Path(vp)
        with open(vault_path, "r") as f:
            data = json.load(f)
        data["env"] = {"DB_URL": "postgres://localhost", "PORT": "8080"}
        with open(vault_path, "w") as f:
            json.dump(data, f)

        assert get_env("DB_URL", vault_path=vp) == "postgres://localhost"
        assert get_env("PORT", vault_path=vp) == "8080"
        assert get_env("MISSING", vault_path=vp) is None

        all_env = get_env(None, vault_path=vp)
        assert all_env == {"DB_URL": "postgres://localhost", "PORT": "8080"}


class TestSDKErrorHandling:
    def test_get_nonexistent_secret(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        with pytest.raises(Exception):
            get("nonexistent", vault_path=vp)

    def test_set_after_init(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        vl_set("API_KEY", "sk-abc123", vault_path=vp)
        assert get("API_KEY", vault_path=vp) == "sk-abc123"

    def test_operations_on_nonexistent_vault(self, tmp_path):
        vp = str(tmp_path / "nonexist.vibe")
        assert vl_list(vault_path=vp) == []
        with pytest.raises(Exception):
            get("API_KEY", vault_path=vp)
        remove("API_KEY", vault_path=vp)

    def test_corrupted_vault(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        vl_set("API_KEY", "original-value", vault_path=vp)
        with open(vp, "w") as f:
            f.write('{"version": 1, "secrets": {"API_KEY": "invalid-field"}}')
        with pytest.raises(Exception):
            get("API_KEY", vault_path=vp)
        vl_set("NEW_KEY", "new-value", vault_path=vp)
        assert get("NEW_KEY", vault_path=vp) == "new-value"


class TestSDKEdgeCases:
    def test_empty_string_values(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        vl_set("EMPTY", "", vault_path=vp)
        assert get("EMPTY", vault_path=vp) == ""

    def test_special_characters_in_key_names(self, tmp_path):
        vp = str(tmp_path / "test.vibe")
        init(vault_path=vp)
        for key in [
            "UPPERCASE_KEY",
            "lowercase_key",
            "Mixed_Case_Key",
            "key-with-dashes",
            "key.with.dots",
        ]:
            vl_set(key, f"val-{key}", vault_path=vp)
            assert get(key, vault_path=vp) == f"val-{key}"

    def test_memory_efficiency_large_values(self, tmp_path):
        large = "x" * (10 * 1024 * 1024)
        vp = str(tmp_path / "large.vibe")
        init(vault_path=vp)
        vl_set("LARGE", large, vault_path=vp)
        assert get("LARGE", vault_path=vp) == large

    def test_vibevault_path_env_var(self, tmp_path, monkeypatch):
        vault_file = tmp_path / "env-vault.vibe"
        monkeypatch.setenv("VIBELOCK_VAULT_PATH", str(vault_file))
        assert _resolve_vault_path() == vault_file

    def test_options_vault_path_takes_priority_over_env(self, tmp_path, monkeypatch):
        monkeypatch.setenv("VIBELOCK_VAULT_PATH", "/tmp/should-not-use.vibe")
        assert (
            _resolve_vault_path(str(tmp_path / "priority.vibe"))
            == tmp_path / "priority.vibe"
        )

    def test_default_vault_path_when_no_env_no_option(self, monkeypatch):
        monkeypatch.delenv("VIBELOCK_VAULT_PATH", raising=False)
        assert _resolve_vault_path() == Path("./secrets.vibe")
