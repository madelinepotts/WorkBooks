import sqlite3

from backend.app_paths import DATABASE_PATH


def get_db_connection():
    """
    Open one SQLite connection for a request.

    Foreign-key checking is enabled on every connection so jobs must
    belong to real customers, work sessions/materials/receipts must belong
    to real jobs, and invoices must belong to real jobs/customers.
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
    deleting existing data.
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

    startedAt is kept as a legacy migration column. New timing data lives
    in work_sessions.
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

    After migration, clear jobs.startedAt so a legacy work session cannot
    be recreated later if its new work_sessions record is edited/deleted.
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

    connection.execute(
        """
        UPDATE jobs
        SET startedAt = NULL
        WHERE startedAt IS NOT NULL
        """
    )


def create_database():
    """
    Create the WorkBooks database and apply small migrations.

    Safe to run every time the backend starts. Existing customers, jobs,
    invoices, business information, work sessions, materials, and receipts
    are preserved.
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

        _add_job_columns(connection)

        # ---------------------------------------------------------
        # Work sessions
        # ---------------------------------------------------------
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
        # Receipts
        # ---------------------------------------------------------
        # Receipts are created before materials because a material may
        # optionally reference one.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS receipts (
                id TEXT PRIMARY KEY,
                jobId TEXT NOT NULL,
                fileName TEXT NOT NULL,
                storedFileName TEXT NOT NULL,
                vendor TEXT,
                purchaseDate TEXT,
                notes TEXT,

                FOREIGN KEY (jobId)
                    REFERENCES jobs(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ---------------------------------------------------------
        # Materials
        # ---------------------------------------------------------
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS materials (
                id TEXT PRIMARY KEY,
                jobId TEXT NOT NULL,
                description TEXT NOT NULL,
                quantity REAL NOT NULL,
                unitCost REAL NOT NULL,
                receiptId TEXT,

                FOREIGN KEY (jobId)
                    REFERENCES jobs(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (receiptId)
                    REFERENCES receipts(id)
                    ON DELETE SET NULL
            )
            """
        )

        # ---------------------------------------------------------
        # Mileage
        # ---------------------------------------------------------
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS mileage (
                id TEXT PRIMARY KEY,
                jobId TEXT NOT NULL,
                tripDate TEXT NOT NULL,
                miles REAL NOT NULL,
                notes TEXT,

                FOREIGN KEY (jobId)
                    REFERENCES jobs(id)
                    ON DELETE CASCADE
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

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_receipts_jobId
            ON receipts(jobId)
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_materials_jobId
            ON materials(jobId)
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_materials_receiptId
            ON materials(receiptId)
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_mileage_jobId
            ON mileage(jobId)
            """
        )

        connection.commit()

    finally:
        connection.close()
