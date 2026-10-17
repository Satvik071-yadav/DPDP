from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import UserModel
from app.core.auth import verify_password, create_access_token, get_current_user
from app.schemas.contracts import UserLoginRequest, AuthTokenResponse, UserProfileSchema

router = APIRouter(prefix="/auth", tags=["Authentication"])


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
