import os
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from typing import Tuple

PBKDF2_ITERATIONS = 600_000
KEY_LENGTH = 32
IV_LENGTH = 12
SALT_LENGTH = 16
TAG_LENGTH = 16


def derive_key(master_key: bytes, salt: bytes) -> bytes:
    """Derive encryption key from master key using PBKDF2-SHA512

    Args:
        master_key: 32-byte raw master key
        salt: 16-byte random salt per secret

    Returns:
        32-byte derived key for AES encryption
    """
    if len(master_key) != KEY_LENGTH:
        raise ValueError(
            f"Master key must be {KEY_LENGTH} bytes, got {len(master_key)}"
        )
    if len(salt) != SALT_LENGTH:
        raise ValueError(f"Salt must be {SALT_LENGTH} bytes, got {len(salt)}")

    return hashlib.pbkdf2_hmac(
        "sha512", master_key, salt, PBKDF2_ITERATIONS, KEY_LENGTH
    )


def encrypt(derived_key: bytes, plaintext: str) -> Tuple[str, str, str]:
    """Encrypt plaintext using AES-256-GCM

    Args:
        derived_key: 32-byte encryption key
        plaintext: UTF-8 string to encrypt

    Returns:
        Tuple of (iv_hex, tag_hex, ciphertext_hex) - all lowercase hex strings

    Raises:
        ValueError: If derived_key is not 32 bytes
    """
    if len(derived_key) != KEY_LENGTH:
        raise ValueError(
            f"Derived key must be {KEY_LENGTH} bytes, got {len(derived_key)}"
        )

    # Generate random 12-byte IV
    iv = os.urandom(IV_LENGTH)

    # Create AES-GCM cipher
    aesgcm = AESGCM(derived_key)

    # Encrypt the plaintext
    ciphertext = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)

    # Extract authentication tag (last 16 bytes)
    tag = ciphertext[-TAG_LENGTH:]
    ciphertext_data = ciphertext[:-TAG_LENGTH]

    # Return hex-encoded strings
    return (iv.hex(), tag.hex(), ciphertext_data.hex())


def decrypt(derived_key: bytes, iv_hex: str, tag_hex: str, ciphertext_hex: str) -> str:
    """Decrypt ciphertext using AES-256-GCM

    Args:
        derived_key: 32-byte decryption key
        iv_hex: 24-char hex string (12 bytes)
        tag_hex: 32-char hex string (16 bytes)
        ciphertext_hex: hex-encoded ciphertext

    Returns:
        Decrypted UTF-8 string

    Raises:
        InvalidTag: If authentication fails (tampering detected)
        ValueError: If hex strings have invalid lengths or characters
    """
    if len(derived_key) != KEY_LENGTH:
        raise ValueError(
            f"Derived key must be {KEY_LENGTH} bytes, got {len(derived_key)}"
        )

    try:
        # Decode hex strings to bytes
        iv = bytes.fromhex(iv_hex)
        tag = bytes.fromhex(tag_hex)
        ciphertext = bytes.fromhex(ciphertext_hex)
    except ValueError as e:
        raise ValueError(f"Invalid hex encoding: {e}")

    # Validate field lengths
    if len(iv) != IV_LENGTH:
        raise ValueError(f"IV must be {IV_LENGTH} bytes (24 hex chars), got {len(iv)}")
    if len(tag) != TAG_LENGTH:
        raise ValueError(
            f"Tag must be {TAG_LENGTH} bytes (32 hex chars), got {len(tag)}"
        )

    # Create AES-GCM cipher with authentication tag
    aesgcm = AESGCM(derived_key)

    try:
        # Decrypt and return UTF-8 string
        plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)
        return plaintext.decode("utf-8")
    except Exception as e:
        # This typically indicates authentication failure (tampering)
        from cryptography.exceptions import InvalidTag

        raise InvalidTag(f"Authentication failed: {e}") from e
