import pytest
from app.core.auth import create_access_token


@pytest.fixture
def auth_token():
    return create_access_token({
        "sub": "usr_dpo_001",
        "username": "aditi.deshmukh",
        "email": "dpo@bharatprivacy.in",
        "fullName": "Aditi Deshmukh",
        "role": "dpo"
    })


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}
