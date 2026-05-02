import vibelock
import tempfile
from pathlib import Path

temp_dir = Path(tempfile.mkdtemp())
print(f"Using temporary directory: {temp_dir}")

projects = {
    "production": {
        "secrets": {
            "DATABASE_URL": "postgresql://prod-user:prod-pass@prod-db:5432/prod_db",
            "API_KEY": "prod-api-key-123456",
        },
    },
    "staging": {
        "secrets": {
            "DATABASE_URL": "postgresql://stage-user:stage-pass@stage-db:5432/stage_db",
            "API_KEY": "stage-api-key-789012",
        },
    },
}

print("1. Setting up projects...")
for project_name, config in projects.items():
    vault_path = str(temp_dir / f"{project_name}_secrets.vibe")

    try:
        vibelock.init(vault_path=vault_path, project_id=project_name)
        print(f"Initialized {project_name} project")

        for secret_name, secret_value in config["secrets"].items():
            vibelock.set(secret_name, secret_value, vault_path=vault_path)
            print(f"  Stored {secret_name} for {project_name}")

    except Exception as e:
        print(f"Failed to setup {project_name}: {e}")

print("\n2. Demonstrating project isolation...")
for project_name in projects.keys():
    vault_path = str(temp_dir / f"{project_name}_secrets.vibe")

    try:
        api_key = vibelock.get("API_KEY", vault_path=vault_path)
        db_url = vibelock.get("DATABASE_URL", vault_path=vault_path)

        print(f"\n{project_name.upper()}:")
        print(f"   API Key: {api_key}")
        print(f"   Database URL: {db_url}")

        secrets = vibelock.list_secrets(vault_path=vault_path)
        print(f"   All secrets: {secrets}")

    except Exception as e:
        print(f"Failed to read {project_name}: {e}")

api_keys = {}
for project_name in projects.keys():
    vault_path = str(temp_dir / f"{project_name}_secrets.vibe")
    api_key = vibelock.get("API_KEY", vault_path=vault_path)
    api_keys[project_name] = api_key

print("\nAPI Keys Comparison:")
for project, key in api_keys.items():
    print(f"   {project}: {key}")

if len(set(api_keys.values())) == len(api_keys):
    print("All projects have unique API keys (isolation working)")
else:
    print("Project isolation failed!")

print("\n3. Custom keys path example...")
custom_keys_path = str(temp_dir / "custom-keys")
custom_vault_path = str(temp_dir / "custom_keys_secrets.vibe")

try:
    vibelock.init(vault_path=custom_vault_path, keys_path=custom_keys_path)
    vibelock.set("CUSTOM_SECRET", "custom-path-value", vault_path=custom_vault_path)

    custom_secret = vibelock.get("CUSTOM_SECRET", vault_path=custom_vault_path)
    print(f"Custom keys path project secret: {custom_secret}")

except Exception as e:
    print(f"Failed custom keys path demo: {e}")

print("\n=== Multi-Project Usage Complete ===")
