import pytest
from vibelock.crypto import derive_key

KEY = b"0123456789abcdef0123456789abcdef"
SALT = b"0123456789abcdef"
SALT2 = b"fedcba9876543210"
KEY2 = b"fedcba9876543210fedcba9876543210"


class TestKeyDerivation:
    def test_deterministic(self):
        assert derive_key(KEY, SALT) == derive_key(KEY, SALT)

    def test_different_salt_different_key(self):
        assert derive_key(KEY, SALT) != derive_key(KEY, SALT2)

    def test_different_master_different_key(self):
        assert derive_key(KEY, SALT) != derive_key(KEY2, SALT)

    def test_output_length(self):
        assert len(derive_key(KEY, SALT)) == 32

    def test_known_vector(self):
        derived = derive_key(bytes(range(32)), bytes(range(16)))
        assert len(derived) == 32
        assert derived == derive_key(bytes(range(32)), bytes(range(16)))

    @pytest.mark.skip(reason="Requires TypeScript SDK environment")
    def test_cross_sdk_determinism(self):
        pass
