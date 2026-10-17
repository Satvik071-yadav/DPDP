from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from app.core.config import settings

# Engine configuration (supports SQLite with aiosqlite and PostgreSQL with asyncpg)
connect_args = {}
engine_kwargs = {
    "echo": settings.DEBUG,
    "future": True,
}

if settings.is_sqlite:
    connect_args = {"check_same_thread": False}
    engine_kwargs["connect_args"] = connect_args
else:
    # Production PostgreSQL connection resilience (optimized for free tier external databases like Neon)
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 5
    engine_kwargs["pool_recycle"] = 300

    ssl_ctx = settings.get_database_ssl_context()
    if ssl_ctx is not None:
        engine_kwargs["connect_args"] = {"ssl": ssl_ctx}

engine = create_async_engine(
    settings.async_database_url,
    **engine_kwargs
)

if settings.is_sqlite:
    from sqlalchemy import event
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
