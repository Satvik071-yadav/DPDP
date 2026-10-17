import uuid
import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import UserModel
from app.core.auth import verify_password, hash_password, create_access_token, get_current_user
from app.schemas.contracts import UserLoginRequest, UserRegisterRequest, AuthTokenResponse, UserProfileSchema

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account with secure PBKDF2 password hashing."""
    username = payload.username.strip().lower()
    email = payload.email.strip().lower()
    full_name = payload.fullName.strip()

    if len(username) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username must be at least 3 characters long."
        )

    if not re.match(r"^[a-zA-Z0-9_.-]+$", username):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username can only contain alphanumeric characters, dots, underscores, or hyphens."
        )

    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please provide a valid email address."
        )

    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters long."
        )

    # Check for existing user with same username or email
    res = await db.execute(
        select(UserModel).where(
            or_(UserModel.username == username, UserModel.email == email)
        )
    )
    existing_user = res.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email is already registered."
        )

    # Self-service registration is strictly limited to standard tenant 'auditor' role.
    # DPO and Admin roles cannot be self-assigned via registration payload.
    assigned_role = "auditor"
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    pwd_hash = hash_password(payload.password)

    new_user = UserModel(
        id=user_id,
        username=username,
        email=email,
        full_name=full_name or username,
        role=assigned_role,
        password_hash=pwd_hash,
        is_active=True
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token_data = {
        "sub": new_user.id,
        "username": new_user.username,
        "email": new_user.email,
        "fullName": new_user.full_name,
        "role": new_user.role
    }
    access_token = create_access_token(token_data, expires_in_minutes=1440)

    user_profile = UserProfileSchema(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        fullName=new_user.full_name,
        role=new_user.role,
        isActive=new_user.is_active
    )

    return AuthTokenResponse(
        accessToken=access_token,
        tokenType="Bearer",
        user=user_profile
    )


@router.post("/login", response_model=AuthTokenResponse)
async def login(payload: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user credentials and issue signed JWT access token."""
    login_id = payload.username.strip().lower()
    res = await db.execute(
        select(UserModel).where(
            or_(UserModel.username == login_id, UserModel.email == login_id)
        )
    )
    user = res.scalars().first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Contact the platform administrator."
        )

    token_data = {
        "sub": user.id,
        "username": user.username,
        "email": user.email,
        "fullName": user.full_name,
        "role": user.role
    }
    access_token = create_access_token(token_data, expires_in_minutes=1440)

    user_profile = UserProfileSchema(
        id=user.id,
        username=user.username,
        email=user.email,
        fullName=user.full_name,
        role=user.role,
        isActive=user.is_active
    )

    return AuthTokenResponse(
        accessToken=access_token,
        tokenType="Bearer",
        user=user_profile
    )


@router.get("/me", response_model=UserProfileSchema)
async def get_me(claims: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Retrieve profile of authenticated user."""
    user_id = claims.get("sub")
    res = await db.execute(select(UserModel).where(UserModel.id == user_id))
    user = res.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User record not found."
        )

    return UserProfileSchema(
        id=user.id,
        username=user.username,
        email=user.email,
        fullName=user.full_name,
        role=user.role,
        isActive=user.is_active
    )
