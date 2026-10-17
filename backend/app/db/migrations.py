import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger("dpdp_guard.db.migrations")

CURRENT_SCHEMA_VERSION = 3


async def run_migrations(engine: AsyncEngine) -> int:
    """
    Executes incremental database migrations with transactional safety.
    Guarantees existing scan history, findings, and verification audit records
    are preserved without data loss when schemas evolve.
    """
    async with engine.begin() as conn:
        dialect_name = conn.dialect.name

        # 1. Ensure schema_version table exists
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                description TEXT NOT NULL
            )
        """))

        # 2. Check current version
        res = await conn.execute(text("SELECT MAX(version) FROM schema_version"))
        row = res.fetchone()
        current_v = row[0] if (row and row[0] is not None) else 0

        logger.info(f"Database schema version check ({dialect_name}): current={current_v}, target={CURRENT_SCHEMA_VERSION}")

        # Migration v1: Baseline initialization
        if current_v < 1:
            logger.info("Applying Migration v1: Baseline tables...")
            await conn.execute(text("""
                INSERT INTO schema_version (version, description)
                VALUES (1, 'Baseline DPDP-Guard schema with foreign keys and cascade rules')
            """))
            current_v = 1

        # Migration v2: Add scan progress tracking columns to scan_jobs
        if current_v < 2:
            logger.info("Applying Migration v2: Scan progress tracking and index enhancements...")
            
            # Check existing columns in dialect-safe manner
            if dialect_name == "sqlite":
                columns_res = await conn.execute(text("PRAGMA table_info(scan_jobs)"))
                existing_cols = {col[1].lower() for col in columns_res.fetchall()}
            else:
                columns_res = await conn.execute(text(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'scan_jobs'"
                ))
                existing_cols = {row[0].lower() for row in columns_res.fetchall()}

            if "progress_stage" not in existing_cols:
                await conn.execute(text("ALTER TABLE scan_jobs ADD COLUMN progress_stage VARCHAR DEFAULT 'completed'"))
            if "progress_percent" not in existing_cols:
                await conn.execute(text("ALTER TABLE scan_jobs ADD COLUMN progress_percent INTEGER DEFAULT 100"))
            if "log_message" not in existing_cols:
                await conn.execute(text("ALTER TABLE scan_jobs ADD COLUMN log_message TEXT"))

            # Create performance & audit indexes
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scan_jobs_status ON scan_jobs (status)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scan_jobs_initiated_at ON scan_jobs (initiated_at)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_findings_scan_id ON findings (scan_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_findings_severity ON findings (severity)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_findings_status ON findings (status)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_records_finding_id ON audit_records (finding_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_records_timestamp ON audit_records (timestamp)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_copilot_interactions_finding_id ON copilot_interactions (finding_id)"))

            await conn.execute(text("""
                INSERT INTO schema_version (version, description)
                VALUES (2, 'Add scan progress tracking columns and indexes')
            """))
            current_v = 2

        # Migration v3: Add platform_settings and users tables
        if current_v < 3:
            logger.info("Applying Migration v3: platform_settings and users tables...")
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS platform_settings (
                    id VARCHAR PRIMARY KEY,
                    organization_name VARCHAR NOT NULL DEFAULT 'Bharat Privacy Labs Ltd.',
                    dpo_name VARCHAR NOT NULL DEFAULT 'Aditi Deshmukh, CISSP',
                    dpo_email VARCHAR NOT NULL DEFAULT 'dpo@bharatprivacy.in',
                    jurisdiction VARCHAR NOT NULL DEFAULT 'Republic of India (DPDP Act 2023)',
                    demo_mode BOOLEAN DEFAULT TRUE,
                    api_url VARCHAR NOT NULL DEFAULT 'http://127.0.0.1:8000',
                    scan_rate_limit VARCHAR DEFAULT 'standard',
                    ruleset_version VARCHAR DEFAULT 'DPDP-2023.4-IN (Updated Q4 2026)',
                    notifications JSON,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))

            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR PRIMARY KEY,
                    username VARCHAR UNIQUE NOT NULL,
                    email VARCHAR UNIQUE NOT NULL,
                    full_name VARCHAR NOT NULL,
                    role VARCHAR NOT NULL DEFAULT 'dpo',
                    password_hash VARCHAR NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE
                )
            """))

            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_username ON users (username)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)"))

            await conn.execute(text("""
                INSERT INTO schema_version (version, description)
                VALUES (3, 'Add platform_settings and users tables with indexes')
            """))
            current_v = 3

        logger.info(f"Database schema migrations successfully verified at version {current_v}.")
        return current_v

