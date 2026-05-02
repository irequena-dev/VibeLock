import json
import subprocess
from pathlib import Path
from vibelock import (
    init as py_init,
    get as py_get,
    set as py_set,
    list_secrets as py_list,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DIST_DIR = PROJECT_ROOT / "dist"


def _run_node(script: str, cwd: str) -> str:
    wrapped = f"(async () => {{ {script} }})();"
    result = subprocess.run(
        ["node", "-e", wrapped],
        capture_output=True,
        text=True,
        cwd=cwd,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Node failed: {result.stderr}")
    return result.stdout.strip()


def _node_import() -> str:
    return f"const vl = await import('file://{DIST_DIR}/index.js')"


class TestCrossSDKTypescriptToPython:
    def test_ts_writes_python_reads(self, tmp_path):
        vp = str(tmp_path / "cross.vibe")
        keys_dir = str(tmp_path / "keys")
        _run_node(
            f"""
            {_node_import()};
            await vl.init({{ vaultPath: '{vp}', keysPath: '{keys_dir}' }});
            await vl.set('CROSS_KEY', 'hello-from-ts', {{ vaultPath: '{vp}' }});
            """,
            str(tmp_path),
        )
        result = py_get("CROSS_KEY", vault_path=vp)
        assert result == "hello-from-ts"

    def test_ts_writes_multiple_python_reads_all(self, tmp_path):
        vp = str(tmp_path / "cross.vibe")
        keys_dir = str(tmp_path / "keys")
        _run_node(
            f"""
            {_node_import()};
            await vl.init({{ vaultPath: '{vp}', keysPath: '{keys_dir}' }});
            await vl.set('KEY_A', 'value-a', {{ vaultPath: '{vp}' }});
            await vl.set('KEY_B', 'value-b', {{ vaultPath: '{vp}' }});
            await vl.set('KEY_C', 'value-c', {{ vaultPath: '{vp}' }});
            """,
            str(tmp_path),
        )
        assert py_get("KEY_A", vault_path=vp) == "value-a"
        assert py_get("KEY_B", vault_path=vp) == "value-b"
        assert py_get("KEY_C", vault_path=vp) == "value-c"
        names = py_list(vault_path=vp)
        assert set(names) == {"KEY_A", "KEY_B", "KEY_C"}


class TestCrossSDKPythonToTypescript:
    def test_python_writes_ts_reads(self, tmp_path):
        vp = str(tmp_path / "cross.vibe")
        keys_dir = str(tmp_path / "keys")
        py_init(vault_path=vp, keys_path=keys_dir)
        py_set("PY_KEY", "hello-from-python", vault_path=vp)
        result = _run_node(
            f"""
            {_node_import()};
            const val = await vl.get('PY_KEY', {{ vaultPath: '{vp}' }});
            console.log(val);
            """,
            str(tmp_path),
        )
        assert result == "hello-from-python"

    def test_python_writes_multiple_ts_lists_all(self, tmp_path):
        vp = str(tmp_path / "cross.vibe")
        keys_dir = str(tmp_path / "keys")
        py_init(vault_path=vp, keys_path=keys_dir)
        py_set("PKEY_1", "pval-1", vault_path=vp)
        py_set("PKEY_2", "pval-2", vault_path=vp)
        result = _run_node(
            f"""
            {_node_import()};
            const keys = await vl.list({{ vaultPath: '{vp}' }});
            console.log(JSON.stringify(keys.sort()));
            """,
            str(tmp_path),
        )
        assert json.loads(result) == ["PKEY_1", "PKEY_2"]


class TestVaultFormatCompat:
    def test_same_vault_schema(self, tmp_path):
        vp = tmp_path / "schema.vibe"
        py_init(vault_path=str(vp), project_id="compat-test")
        py_set("KEY1", "val1", vault_path=str(vp))
        with open(vp) as f:
            data = json.load(f)
        assert data["version"] == 1
        assert "secrets" in data
        assert "KEY1" in data["secrets"]
        secret = data["secrets"]["KEY1"]
        assert set(secret.keys()) == {"iv", "tag", "ciphertext", "salt"}
        assert data["projectId"] == "compat-test"

    def test_ts_init_vault_schema(self, tmp_path):
        vp = str(tmp_path / "ts_schema.vibe")
        keys_dir = str(tmp_path / "keys")
        _run_node(
            f"""
            {_node_import()};
            await vl.init({{ vaultPath: '{vp}', projectId: 'ts-compat', keysPath: '{keys_dir}' }});
            await vl.set('TSK', 'tsv', {{ vaultPath: '{vp}' }});
            """,
            str(tmp_path),
        )
        with open(vp) as f:
            data = json.load(f)
        assert data["version"] == 1
        assert "secrets" in data
        assert "TSK" in data["secrets"]
        secret = data["secrets"]["TSK"]
        assert set(secret.keys()) == {"iv", "tag", "ciphertext", "salt"}


class TestKeyDerivationCompat:
    def test_same_master_key_same_derived_key(self, tmp_path):
        master_key = bytes(range(32))
        salt = bytes(range(16))

        from vibelock.crypto import derive_key

        py_derived = derive_key(master_key, salt)

        result = _run_node(
            f"""
            const {{ deriveKey }} = await import('file://{DIST_DIR}/core/crypto.js');
            const buf = deriveKey(Buffer.from('{master_key.hex()}', 'hex'), Buffer.from('{salt.hex()}', 'hex'));
            console.log(buf.toString('hex'));
            """,
            str(tmp_path),
        )

        assert py_derived.hex() == result

    def test_cross_sdk_roundtrip_derivation(self, tmp_path):
        master_key = bytes(range(32))
        salt = bytes(range(16))

        from vibelock.crypto import derive_key, encrypt

        derived = derive_key(master_key, salt)
        iv_hex, tag_hex, ct_hex = encrypt(derived, "cross-sdk-message")

        result = _run_node(
            f"""
            const {{ decrypt, deriveKey }} = await import('file://{DIST_DIR}/core/crypto.js');
            const derived = deriveKey(Buffer.from('{master_key.hex()}', 'hex'), Buffer.from('{salt.hex()}', 'hex'));
            const plaintext = decrypt(derived, '{iv_hex}', '{tag_hex}', '{ct_hex}');
            console.log(plaintext);
            """,
            str(tmp_path),
        )
        assert result == "cross-sdk-message"
