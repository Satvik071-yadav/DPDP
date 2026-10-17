import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger("dpdp_guard.db.migrations")

CURRENT_SCHEMA_VERSION = 6


async def run_migrations(engine: AsyncEngine) -> int:
    """
    Executes incremental database migrations with transactional safety.
    Guarantees existing scan history, findings, and verification audit records
    are preserved without data loss when schemas evolve.
    """
    async with engine.begin() as conn:
        dialect_name = conn.dialect.name

        async def get_existing_columns(table: str) -> set:
            if dialect_name == "sqlite":
                cols_res = await conn.execute(text(f"PRAGMA table_info({table})"))
                return {col[1].lower() for col in cols_res.fetchall()}
            else:
                cols_res = await conn.execute(text(
                    f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}'"
                ))
                return {row[0].lower() for row in cols_res.fetchall()}

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
            existing_cols = await get_existing_columns("scan_jobs")

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

        # Migration v4: Multi-tenant ownership (user_id on scan_jobs, audit_records, copilot, platform_settings)
        if current_v < 4:
            logger.info("Applying Migration v4: Multi-tenant user_id isolation and indexes...")

            scan_cols = await get_existing_columns("scan_jobs")
            if "user_id" not in scan_cols:
                await conn.execute(text("ALTER TABLE scan_jobs ADD COLUMN user_id VARCHAR"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scan_jobs_user_id ON scan_jobs (user_id)"))

            audit_cols = await get_existing_columns("audit_records")
            if "user_id" not in audit_cols:
                await conn.execute(text("ALTER TABLE audit_records ADD COLUMN user_id VARCHAR"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_records_user_id ON audit_records (user_id)"))

            copilot_cols = await get_existing_columns("copilot_interactions")
            if "user_id" not in copilot_cols:
                await conn.execute(text("ALTER TABLE copilot_interactions ADD COLUMN user_id VARCHAR"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_copilot_interactions_user_id ON copilot_interactions (user_id)"))

            settings_cols = await get_existing_columns("platform_settings")
            if "user_id" not in settings_cols:
                await conn.execute(text("ALTER TABLE platform_settings ADD COLUMN user_id VARCHAR"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_platform_settings_user_id ON platform_settings (user_id)"))

            # Ensure default DPO user exists in users table before backfilling dependent foreign keys
            user_check = await conn.execute(
                text("SELECT id FROM users WHERE id = 'usr_dpo_001' OR username = 'aditi.deshmukh' LIMIT 1")
            )
            dpo_row = user_check.fetchone()
            if not dpo_row:
                import os
                import secrets
                from app.core.config import settings
                from app.core.auth import hash_password
                dpo_pass = os.getenv("DPO_INITIAL_PASSWORD")
                if settings.APP_ENV == "production":
                    if dpo_pass:
                        pwd_hash = hash_password(dpo_pass)
                        is_active = True
                    else:
                        # In production without explicit DPO_INITIAL_PASSWORD, generate unguessable hash
                        # and deactivate the account so predictable credentials cannot be used.
                        pwd_hash = hash_password(secrets.token_urlsafe(32))
                        is_active = False
                else:
                    pwd_hash = hash_password("dpdp_guard_demo_2026")
                    is_active = True

                await conn.execute(
                    text("""
                        INSERT INTO users (id, username, email, full_name, role, password_hash, is_active)
                        VALUES ('usr_dpo_001', 'aditi.deshmukh', 'dpo@bharatprivacy.in', 'Aditi Deshmukh', 'dpo', :pwd_hash, :is_active)
                    """),
                    {"pwd_hash": pwd_hash, "is_active": is_active}
                )
                target_user_id = 'usr_dpo_001'
            else:
                target_user_id = dpo_row[0]

            # Backfill any existing unowned baseline records to the DPO account
            await conn.execute(
                text("UPDATE scan_jobs SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": target_user_id}
            )
            await conn.execute(
                text("UPDATE audit_records SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": target_user_id}
            )
            await conn.execute(
                text("UPDATE platform_settings SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": target_user_id}
            )

            await conn.execute(text("""
                INSERT INTO schema_version (version, description)
                VALUES (4, 'Add user_id column across resources for strict multi-tenant isolation')
            """))
            current_v = 4

        # Migration v5: Organization accounts, websites, domain ownership verification, subscriptions, quotas
        if current_v < 5:
            logger.info("Applying Migration v5: Organization-level tenancy, websites, domain verification, subscriptions...")

            # 1. Organizations table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS organizations (
                    id VARCHAR PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    slug VARCHAR UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_organizations_slug ON organizations (slug)"))

            # 2. Organization members table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS organization_members (
                    id VARCHAR PRIMARY KEY,
                    organization_id VARCHAR NOT NULL,
                    user_id VARCHAR NOT NULL,
                    role VARCHAR NOT NULL DEFAULT 'auditor',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_org_members_org_id ON organization_members (organization_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_org_members_user_id ON organization_members (user_id)"))
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_org_members_org_user ON organization_members (organization_id, user_id)"))

            # 3. Websites table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS websites (
                    id VARCHAR PRIMARY KEY,
                    organization_id VARCHAR NOT NULL,
                    hostname VARCHAR NOT NULL,
                    verification_status VARCHAR NOT NULL DEFAULT 'pending',
                    verification_method VARCHAR NOT NULL DEFAULT 'dns_txt',
                    verification_token_hash VARCHAR NOT NULL,
                    verification_token_expiry TIMESTAMP NOT NULL,
                    verification_attempts INTEGER DEFAULT 0,
                    last_verification_attempt TIMESTAMP,
                    verified_at TIMESTAMP,
                    last_scanned_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_websites_org_id ON websites (organization_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_websites_hostname ON websites (hostname)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_websites_status ON websites (verification_status)"))
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_websites_org_hostname ON websites (organization_id, hostname)"))

            # 4. Subscriptions table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id VARCHAR PRIMARY KEY,
                    organization_id VARCHAR UNIQUE NOT NULL,
                    plan_id VARCHAR NOT NULL DEFAULT 'starter',
                    status VARCHAR NOT NULL DEFAULT 'active',
                    billing_period_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    billing_period_end TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subscriptions_org_id ON subscriptions (organization_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subscriptions_status ON subscriptions (status)"))

            # 5. Scan Usage table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS scan_usage (
                    id VARCHAR PRIMARY KEY,
                    organization_id VARCHAR NOT NULL,
                    billing_period_start TIMESTAMP NOT NULL,
                    billing_period_end TIMESTAMP NOT NULL,
                    scans_used INTEGER DEFAULT 0 NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scan_usage_org_id ON scan_usage (organization_id)"))
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_scan_usage_org_period ON scan_usage (organization_id, billing_period_start)"))

            # 6. Add organization_id and website_id to scan_jobs
            scan_cols = await get_existing_columns("scan_jobs")
            if "organization_id" not in scan_cols:
                await conn.execute(text("ALTER TABLE scan_jobs ADD COLUMN organization_id VARCHAR"))
            if "website_id" not in scan_cols:
                await conn.execute(text("ALTER TABLE scan_jobs ADD COLUMN website_id VARCHAR"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scan_jobs_org_id ON scan_jobs (organization_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scan_jobs_website_id ON scan_jobs (website_id)"))

            # 7. Safe backward-compatible seed & backfill for default organization
            org_check = await conn.execute(text("SELECT id FROM organizations WHERE id = 'org_default' LIMIT 1"))
            if not org_check.fetchone():
                await conn.execute(text("""
                    INSERT INTO organizations (id, name, slug)
                    VALUES ('org_default', 'Bharat Privacy Enterprise', 'bharat-privacy-enterprise')
                """))

                # Link all existing users to default organization if they have no memberships
                users_res = await conn.execute(text("SELECT id, role FROM users"))
                for u_row in users_res.fetchall():
                    u_id, u_role = u_row[0], u_row[1]
                    mem_role = "owner" if u_role in ("dpo", "admin") else "auditor"
                    mem_id = f"mem_default_{u_id}"
                    await conn.execute(text("""
                        INSERT INTO organization_members (id, organization_id, user_id, role)
                        VALUES (:id, 'org_default', :uid, :role)
                    """), {"id": mem_id, "uid": u_id, "role": mem_role})

                # Create default growth subscription for existing organization
                import datetime
                now_dt = datetime.datetime.now(datetime.timezone.utc)
                next_year = now_dt + datetime.timedelta(days=365)
                await conn.execute(text("""
                    INSERT INTO subscriptions (id, organization_id, plan_id, status, billing_period_start, billing_period_end)
                    VALUES ('sub_default', 'org_default', 'growth', 'active', :start, :end)
                """), {"start": now_dt, "end": next_year})

                # Create baseline scan usage
                await conn.execute(text("""
                    INSERT INTO scan_usage (id, organization_id, billing_period_start, billing_period_end, scans_used)
                    VALUES ('usg_default', 'org_default', :start, :end, 0)
                """), {"start": now_dt, "end": next_year})

            # Backfill existing scan_jobs to default organization
            await conn.execute(text("UPDATE scan_jobs SET organization_id = 'org_default' WHERE organization_id IS NULL"))

            await conn.execute(text("""
                INSERT INTO schema_version (version, description)
                VALUES (5, 'Add organization-level tenancy, websites, domain verification, subscriptions, and scan quotas')
            """))
            current_v = 5

        # Migration v6: Add quota_reserved column to scan_jobs
        if current_v < 6:
            logger.info("Applying Migration v6: Add quota_reserved flag to scan_jobs...")
            scan_cols = await get_existing_columns("scan_jobs")
            if "quota_reserved" not in scan_cols:
                await conn.execute(text("ALTER TABLE scan_jobs ADD COLUMN quota_reserved BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("""
                INSERT INTO schema_version (version, description)
                VALUES (6, 'Add quota_reserved column to scan_jobs for atomic quota lifecycle')
            """))
            current_v = 6

        logger.info(f"Database schema migrations successfully verified at version {current_v}.")
        return current_v

