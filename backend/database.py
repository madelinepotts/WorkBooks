import sqlite3
from backend.app_paths import DATABASE_PATH


def get_db_connection():
    """
    Open one SQLite connection for a request.

    Foreign-key checking is enabled on every connection so jobs must
    belong to real customers, work sessions must belong to real jobs,
    and invoices must belong to real jobs/customers.
    """
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _get_columns(
    connection,
    table_name: str,
) -> set[str]:
    """
    Return the column names already present in a table.

    WorkBooks is still early in development, so this small migration
    helper lets an existing workbooks.db gain new columns without
    deleting Dad's existing data.
    """
    rows = connection.execute(
        f"PRAGMA table_info({table_name})"
    ).fetchall()

    return {
        row["name"]
        for row in rows
    }


def _add_job_columns(connection):
    """
    Upgrade an older jobs table to the current Job model.

    We are keeping startedAt temporarily even though new work timing uses
    work_sessions. It lets us migrate jobs that were started before the
    multi-session timer was introduced without losing their recorded time.
    """
    job_columns = _get_columns(
        connection,
        "jobs",
    )

    migrations = {
        "hourlyRate": "REAL",
        "fixedPrice": "REAL",
        "startedAt": "TEXT",
        "completedAt": "TEXT",
    }

    for column_name, column_type in migrations.items():
        if column_name not in job_columns:
            connection.execute(
                f"""
                ALTER TABLE jobs
                ADD COLUMN {column_name} {column_type}
                """
            )


def _migrate_old_work_times(connection):
    """
    Convert the original single-timer job format into one work session.

    Older jobs stored work timing directly on jobs.startedAt and
    jobs.completedAt. New jobs can contain many Start Work -> Pause Work
    sessions in work_sessions.

    The deterministic legacy ID makes this safe to run every time the
    backend starts. INSERT OR IGNORE prevents duplicate migration rows.
    """
    connection.execute(
        """
        INSERT OR IGNORE INTO work_sessions (
            id,
            jobId,
            startedAt,
            endedAt
        )

        SELECT
            'legacy-' || id,
            id,
            startedAt,
            completedAt

        FROM jobs

        WHERE startedAt IS NOT NULL
        """
    )


def create_database():
    """
    Create the WorkBooks database and apply small migrations.

    This function is safe to run every time the backend starts. Existing
    customers, jobs, invoices, business information, and work sessions are
    preserved.
    """
    connection = get_db_connection()

    try:
        # ---------------------------------------------------------
        # Customers
        # ---------------------------------------------------------
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT,
                address TEXT NOT NULL
            )
            """
        )

        # ---------------------------------------------------------
        # Jobs
        # ---------------------------------------------------------
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                customerId TEXT NOT NULL,
                description TEXT NOT NULL,
                scheduledDate TEXT NOT NULL,
                scheduledTime TEXT,
                pricingType TEXT NOT NULL,
                hourlyRate REAL,
                fixedPrice REAL,
                startedAt TEXT,
                completedAt TEXT,
                status TEXT NOT NULL,

                FOREIGN KEY (customerId)
                    REFERENCES customers(id)
            )
            """
        )

        # Add fields missing from older WorkBooks databases.
        _add_job_columns(connection)

        # ---------------------------------------------------------
        # Work sessions
        # ---------------------------------------------------------
        # One job can contain any number of work sessions. endedAt is
        # NULL while Dad is actively working.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS work_sessions (
                id TEXT PRIMARY KEY,
                jobId TEXT NOT NULL,
                startedAt TEXT NOT NULL,
                endedAt TEXT,

                FOREIGN KEY (jobId)
                    REFERENCES jobs(id)
                    ON DELETE CASCADE
            )
            """
        )

        # Preserve time recorded with the original one-timer design.
        _migrate_old_work_times(connection)

        # ---------------------------------------------------------
        # Business information
        # ---------------------------------------------------------
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS business_info (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                businessName TEXT NOT NULL DEFAULT '',
                ownerName TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                paymentInstructions TEXT NOT NULL DEFAULT ''
            )
            """
        )

        # WorkBooks only needs one business-information record.
        connection.execute(
            """
            INSERT OR IGNORE INTO business_info (id)
            VALUES (1)
            """
        )

        # ---------------------------------------------------------
        # Invoices
        # ---------------------------------------------------------
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                invoiceNumber TEXT NOT NULL UNIQUE,
                customerId TEXT NOT NULL,
                jobId TEXT NOT NULL UNIQUE,
                createdAt TEXT NOT NULL,
                dueDate TEXT NOT NULL,
                amount REAL NOT NULL,
                status TEXT NOT NULL,

                FOREIGN KEY (customerId)
                    REFERENCES customers(id),

                FOREIGN KEY (jobId)
                    REFERENCES jobs(id)
            )
            """
        )

        # ---------------------------------------------------------
        # Indexes
        # ---------------------------------------------------------
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_jobs_customerId
            ON jobs(customerId)
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_work_sessions_jobId
            ON work_sessions(jobId)
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_invoices_customerId
            ON invoices(customerId)
            """
        )

        connection.commit()

    finally:
        connection.close()
