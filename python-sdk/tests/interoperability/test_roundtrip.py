import pytest
from vibelock import init, get, remove
from vibelock import set as vl_set, list as vl_list


class TestRoundtrip:
    def test_simple_string(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        vl_set("KEY", "hello world", vault_path=vp)
        assert get("KEY", vault_path=vp) == "hello world"

    def test_unicode_data(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        vl_set(
            "UNI", "\U0001f510 \u7d42\u6975\u79d8\u5bc6 \U0001f5dd\ufe0f", vault_path=vp
        )
        assert (
            get("UNI", vault_path=vp)
            == "\U0001f510 \u7d42\u6975\u79d8\u5bc6 \U0001f5dd\ufe0f"
        )

    def test_special_characters(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        val = "!@#$%^&*()_+-=[]{}|;':\",./<>?"
        vl_set("SPEC", val, vault_path=vp)
        assert get("SPEC", vault_path=vp) == val

    def test_newlines(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        vl_set("NL", "line1\nline2\r\nline3", vault_path=vp)
        assert get("NL", vault_path=vp) == "line1\nline2\r\nline3"

    def test_long_string(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        vl_set("LONG", "x" * 10000, vault_path=vp)
        assert get("LONG", vault_path=vp) == "x" * 10000

    def test_empty_string(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        vl_set("EMPTY", "", vault_path=vp)
        assert get("EMPTY", vault_path=vp) == ""

    def test_multiple_secrets(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        for k, v in {"A": "val-a", "B": "val-b", "C": "val-c"}.items():
            vl_set(k, v, vault_path=vp)
        for k, v in {"A": "val-a", "B": "val-b", "C": "val-c"}.items():
            assert get(k, vault_path=vp) == v
        assert set(vl_list(vault_path=vp)) == {"A", "B", "C"}

    def test_overwrite_secret(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        vl_set("K", "first", vault_path=vp)
        vl_set("K", "second", vault_path=vp)
        assert get("K", vault_path=vp) == "second"

    def test_remove_and_verify(self, tmp_path):
        vp = str(tmp_path / "rt.vibe")
        init(vault_path=vp)
        vl_set("K", "val", vault_path=vp)
        remove("K", vault_path=vp)
        with pytest.raises(Exception):
            get("K", vault_path=vp)

    @pytest.mark.skip(reason="Requires TypeScript SDK environment")
    def test_python_writes_typescript_reads(self):
        pass

    @pytest.mark.skip(reason="Requires TypeScript SDK environment")
    def test_typescript_writes_python_reads(self):
        pass
