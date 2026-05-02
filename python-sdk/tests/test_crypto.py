import pytest
from vibelock.crypto import derive_key, encrypt, decrypt

KEY = b"0123456789abcdef0123456789abcdef"
SALT = b"0123456789abcdef"
SALT2 = b"fedcba9876543210"


class TestCrypto:
    def test_derive_key_valid_input(self):
        derived = derive_key(KEY, SALT)
        assert len(derived) == 32
        assert derived == derive_key(KEY, SALT)
        assert derived != derive_key(KEY, SALT2)

    def test_derive_key_invalid_input(self):
        with pytest.raises(ValueError, match="Master key must be 32 bytes"):
            derive_key(b"short", SALT)
        with pytest.raises(ValueError, match="Salt must be 16 bytes"):
            derive_key(KEY, b"short")
        with pytest.raises(ValueError, match="Master key must be 32 bytes"):
            derive_key(b"", SALT)

    def test_encrypt_decrypt_roundtrip(self):
        test_cases = [
            ("simple", "hello world"),
            ("unicode", "\U0001f510 \u7d42\u6975\u79d8\u5bc6 \U0001f5dd\ufe0f"),
            ("numbers", "1234567890"),
            ("special", "!@#$%^&*()_+-=[]{}|;':\",./<>?"),
            ("newline", "line1\nline2\r\nline3"),
            ("empty", ""),
            ("large", "x" * 10000),
        ]
        for name, plaintext in test_cases:
            iv, tag, ciphertext = encrypt(KEY, plaintext)
            assert len(iv) == 24
            assert len(tag) == 32
            assert len(ciphertext) >= 0
            assert decrypt(KEY, iv, tag, ciphertext) == plaintext

    def test_tamper_detection(self):
        iv, tag, ciphertext = encrypt(KEY, "test data")
        with pytest.raises(Exception):
            decrypt(KEY, "0123456789abcdef01234567", tag, ciphertext)
        with pytest.raises(Exception):
            decrypt(KEY, iv, "0123456789abcdef0123456789abcdef", ciphertext)
        with pytest.raises(Exception):
            decrypt(KEY, iv, tag, "0123456789abcdef0123456789abcdef")

    def test_field_length_validation(self):
        iv, tag, ciphertext = encrypt(KEY, "test data")
        decrypt(KEY, iv, tag, ciphertext)
        with pytest.raises(ValueError, match="IV must"):
            decrypt(KEY, iv[:20], tag, ciphertext)
        with pytest.raises(ValueError, match="IV must"):
            decrypt(KEY, iv + "00", tag, ciphertext)
        with pytest.raises(ValueError, match="Tag must"):
            decrypt(KEY, iv, tag[:28], ciphertext)
        with pytest.raises(ValueError, match="Tag must"):
            decrypt(KEY, iv, tag + "00", ciphertext)

    def test_hex_encoding_consistency(self):
        iv1, tag1, ct1 = encrypt(KEY, "test data")
        iv2, tag2, ct2 = encrypt(KEY, "test data")
        assert iv1.islower() and not iv1.startswith("0x")
        assert tag1.islower() and not tag1.startswith("0x")
        assert ct1.islower() and not ct1.startswith("0x")
        assert iv1 != iv2
        decrypt(KEY, iv1, tag1, ct1)
        decrypt(KEY, iv2, tag2, ct2)

    def test_invalid_hex_characters(self):
        iv, tag, ciphertext = encrypt(KEY, "test data")
        with pytest.raises(ValueError, match="Invalid hex encoding"):
            decrypt(KEY, "zzzzzzzzzzzzzzzzzzzzzzzz", tag, ciphertext)
        with pytest.raises(ValueError, match="Invalid hex encoding"):
            decrypt(KEY, iv, "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", ciphertext)
        with pytest.raises(ValueError, match="Invalid hex encoding"):
            decrypt(KEY, iv, tag, "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")

    def test_sync_encrypt_decrypt(self):
        iv, tag, ciphertext = encrypt(KEY, "sync test")
        assert decrypt(KEY, iv, tag, ciphertext) == "sync test"
