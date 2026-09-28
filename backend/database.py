import sqlite3
from pathlib import Path


DATABASE_PATH = Path(__file__).parent / "workbooks.db"


def get_db_connection():
    """
    Open one SQLite connection for a request.

    Foreign-key checking is enabled on every connection so jobs must
    belong to real customers and invoices must belong to real jobs.
    """
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _get_columns(connection, table_name: str) -> set[str]:
    """
    Return the column names already present in a table.

    WorkBooks is still early in development, so this small migration
    helper lets an existing workbooks.db gain new columns without
    deleting Dad's customers or jobs.
    """
    rows = connection.execute(
        f"PRAGMA table_info({table_name})"
    ).fetchall()

    return {row["name"] for row in rows}


def _add_job_columns(connection):
    """
    Upgrade an older jobs table to the current frontend Job type.

    SQLite supports adding nullable columns safely with ALTER TABLE,
    which is exactly what we need for the optional pricing and work-time
    fields. Existing jobs remain valid and simply have NULL values for
    fields that did not exist when they were created.
    """
    job_columns = _get_columns(connection, "jobs")

    migrations = {
        "hourlyRate": "REAL",
        "fixedPrice": "REAL",
        "startedAt": "TEXT",
        "completedAt": "TEXT",
    }

    for column_name, column_type in migrations.items():
        if column_name not in job_columns:
            connection.execute(
                f"ALTER TABLE jobs ADD COLUMN {column_name} {column_type}"
            )


def create_database():
    """
    Create the WorkBooks database and apply the small migrations needed
    by the current frontend.

    This function is intentionally safe to run every time the backend
    starts. CREATE TABLE IF NOT EXISTS and the column checks prevent it
    from replacing existing data.
    """
    connection = get_db_connection()

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

    # If this is an older database, add the new Job fields without
    # deleting any customers or jobs already saved in it.
    _add_job_columns(connection)

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

    # These indexes make the common "show me this customer's jobs" and
    # invoice lookups inexpensive as the database grows.
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_jobs_customerId
        ON jobs(customerId)
        """
    )

    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invoices_customerId
        ON invoices(customerId)
        """
    )

    connection.commit()
    connection.close()
