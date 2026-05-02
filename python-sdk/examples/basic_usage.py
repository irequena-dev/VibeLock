import vibelock
import tempfile
import os

os.chdir(tempfile.mkdtemp())

print("=== VibeLock Python SDK - Basic Usage ===\n")

print("1. Initializing vault...")
try:
    vibelock.init()
    print("Vault initialized successfully")
except Exception as e:
    print(f"Vault already exists: {e}")

print("\n2. Storing secrets...")
secrets_to_store = {
    "API_KEY": "sk-abc123def456ghi789",
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/mydb",
    "DEBUG_MODE": "false",
    "API_SECRET": "super-secret-key-that-should-not-be-logged",
}

for key, value in secrets_to_store.items():
    try:
        vibelock.set(key, value)
        print(f"Stored {key}")
    except Exception as e:
        print(f"Failed to store {key}: {e}")

print("\n3. Listing all secrets...")
try:
    all_secrets = vibelock.list_secrets()
    print(f"Available secrets: {all_secrets}")
except Exception as e:
    print(f"Failed to list secrets: {e}")

print("\n4. Retrieving secrets...")
for key in secrets_to_store.keys():
    try:
        value = vibelock.get(key)
        print(f"{key}: {value}")
    except Exception as e:
        print(f"Failed to get {key}: {e}")

print("\n5. Removing a secret...")
try:
    vibelock.remove("DEBUG_MODE")
    print("Removed DEBUG_MODE")
except Exception as e:
    print(f"Failed to remove DEBUG_MODE: {e}")

try:
    remaining_secrets = vibelock.list_secrets()
    print(f"Remaining secrets: {remaining_secrets}")

    vibelock.get("DEBUG_MODE")
    print("DEBUG_MODE should have been removed!")
except Exception as e:
    print(f"DEBUG_MODE properly removed: {e}")

print("\n=== Basic Usage Complete ===")
