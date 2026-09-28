import sqlite3
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.database import create_database, get_db_connection


app = FastAPI()


# The React/Vite development server talks to FastAPI from one of these
# two local origins while WorkBooks is running in development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


###################
### Data models ###
###################

class Customer(BaseModel):
    id: str
    name: str
    phone: str
    email: str | None = None
    address: str


class Job(BaseModel):
    id: str
    customerId: str
    description: str
    scheduledDate: str
    scheduledTime: str | None = None
    pricingType: Literal["hourly", "fixed"]

    # Only one of these normally has a value, depending on pricingType.
    hourlyRate: float | None = None
    fixedPrice: float | None = None

    # ISO timestamps saved when Dad starts and finishes actual work.
    startedAt: str | None = None
    completedAt: str | None = None

    status: Literal["upcoming", "active", "completed"]


class Invoice(BaseModel):
    id: str
    invoiceNumber: str
    customerId: str
    jobId: str
    createdAt: str
    dueDate: str
    amount: float
    status: Literal["draft", "sent", "paid"]


class InvoiceStatusUpdate(BaseModel):
    status: Literal["draft", "sent", "paid"]


########################
### Helper functions ###
########################

def _serialize_job(row: sqlite3.Row) -> dict:
    """
    Convert a jobs row to JSON-friendly data.

    Optional Job properties are omitted when SQLite stores NULL. This
    matches the frontend's TypeScript type, where those properties are
    optional rather than explicitly null.
    """
    job = dict(row)

    optional_fields = (
        "scheduledTime",
        "hourlyRate",
        "fixedPrice",
        "startedAt",
        "completedAt",
    )

    for field in optional_fields:
        if job.get(field) is None:
            job.pop(field, None)

    return job


def _customer_exists(connection, customer_id: str) -> bool:
    row = connection.execute(
        "SELECT id FROM customers WHERE id = ?",
        (customer_id,),
    ).fetchone()

    return row is not None


def _job_exists(connection, job_id: str) -> bool:
    row = connection.execute(
        "SELECT id FROM jobs WHERE id = ?",
        (job_id,),
    ).fetchone()

    return row is not None


######################
### Startup events ###
######################

@app.on_event("startup")
def startup_event():
    # create_database() also performs the small migrations needed when
    # opening an older WorkBooks database.
    create_database()


#####################
### POST requests ###
#####################

@app.post("/customers")
def create_customer(customer: Customer):
    connection = get_db_connection()

    try:
        connection.execute(
            """
            INSERT INTO customers (
                id,
                name,
                phone,
                email,
                address
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                customer.id,
                customer.name,
                customer.phone,
                customer.email,
                customer.address,
            ),
        )

        connection.commit()

    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=409,
            detail="Could not create customer. That customer ID already exists.",
        ) from error

    finally:
        connection.close()

    return {"message": "Customer created successfully."}


@app.post("/jobs")
def create_job(job: Job):
    connection = get_db_connection()

    try:
        if not _customer_exists(connection, job.customerId):
            raise HTTPException(
                status_code=404,
                detail="Customer not found.",
            )

        connection.execute(
            """
            INSERT INTO jobs (
                id,
                customerId,
                description,
                scheduledDate,
                scheduledTime,
                pricingType,
                hourlyRate,
                fixedPrice,
                startedAt,
                completedAt,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job.id,
                job.customerId,
                job.description,
                job.scheduledDate,
                job.scheduledTime,
                job.pricingType,
                job.hourlyRate,
                job.fixedPrice,
                job.startedAt,
                job.completedAt,
                job.status,
            ),
        )

        connection.commit()

    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=409,
            detail="Could not create job. That job ID already exists.",
        ) from error

    finally:
        connection.close()

    return {"message": "Job created successfully."}


@app.post("/invoices")
def create_invoice(invoice: Invoice):
    connection = get_db_connection()

    try:
        if not _customer_exists(connection, invoice.customerId):
            raise HTTPException(
                status_code=404,
                detail="Customer not found.",
            )

        job_row = connection.execute(
            """
            SELECT customerId
            FROM jobs
            WHERE id = ?
            """,
            (invoice.jobId,),
        ).fetchone()

        if job_row is None:
            raise HTTPException(
                status_code=404,
                detail="Job not found.",
            )

        # Prevent an invoice from accidentally being attached to a job
        # belonging to a different customer.
        if job_row["customerId"] != invoice.customerId:
            raise HTTPException(
                status_code=400,
                detail="Invoice customer does not match the job customer.",
            )

        connection.execute(
            """
            INSERT INTO invoices (
                id,
                invoiceNumber,
                customerId,
                jobId,
                createdAt,
                dueDate,
                amount,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                invoice.id,
                invoice.invoiceNumber,
                invoice.customerId,
                invoice.jobId,
                invoice.createdAt,
                invoice.dueDate,
                invoice.amount,
                invoice.status,
            ),
        )

        connection.commit()

    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=409,
            detail=(
                "Could not create invoice. The invoice number may already "
                "exist, or this job may already have an invoice."
            ),
        ) from error

    finally:
        connection.close()

    return {"message": "Invoice created successfully."}


####################
### PUT requests ###
####################

@app.put("/customers/{customer_id}")
def update_customer(customer_id: str, customer: Customer):
    """
    Update the editable information for one customer.

    The customer ID is intentionally immutable. Jobs and invoices store
    that ID as their foreign-key link, so keeping it stable lets Dad edit
    names, phone numbers, email addresses, and addresses safely.
    """
    if customer.id != customer_id:
        raise HTTPException(
            status_code=400,
            detail="Customer ID in the URL does not match the customer body.",
        )

    connection = get_db_connection()

    try:
        cursor = connection.execute(
            """
            UPDATE customers
            SET
                name = ?,
                phone = ?,
                email = ?,
                address = ?
            WHERE id = ?
            """,
            (
                customer.name,
                customer.phone,
                customer.email,
                customer.address,
                customer_id,
            ),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Customer not found.",
            )

        connection.commit()

    finally:
        connection.close()

    return customer.model_dump(exclude_none=True)


@app.put("/jobs/{job_id}")
def update_job(job_id: str, job: Job):
    """
    Replace the saved data for one job.

    The frontend already builds a complete updated Job object when Dad
    presses Start Job or Finish Job, so a full PUT keeps this endpoint
    simple and predictable.
    """
    if job.id != job_id:
        raise HTTPException(
            status_code=400,
            detail="Job ID in the URL does not match the job body.",
        )

    connection = get_db_connection()

    try:
        if not _customer_exists(connection, job.customerId):
            raise HTTPException(
                status_code=404,
                detail="Customer not found.",
            )

        cursor = connection.execute(
            """
            UPDATE jobs
            SET
                customerId = ?,
                description = ?,
                scheduledDate = ?,
                scheduledTime = ?,
                pricingType = ?,
                hourlyRate = ?,
                fixedPrice = ?,
                startedAt = ?,
                completedAt = ?,
                status = ?
            WHERE id = ?
            """,
            (
                job.customerId,
                job.description,
                job.scheduledDate,
                job.scheduledTime,
                job.pricingType,
                job.hourlyRate,
                job.fixedPrice,
                job.startedAt,
                job.completedAt,
                job.status,
                job_id,
            ),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Job not found.",
            )

        connection.commit()

    finally:
        connection.close()

    return job.model_dump(exclude_none=True)


@app.put("/invoices/{invoice_id}")
def update_invoice(invoice_id: str, invoice: Invoice):
    """
    Update the editable fields of one invoice.

    The invoice keeps the same ID, invoice number, customer, and job. Dad
    can correct the amount, due date, or status without breaking the links
    between the invoice and the rest of the business records.
    """
    if invoice.id != invoice_id:
        raise HTTPException(
            status_code=400,
            detail="Invoice ID in the URL does not match the invoice body.",
        )

    connection = get_db_connection()

    try:
        existing = connection.execute(
            """
            SELECT *
            FROM invoices
            WHERE id = ?
            """,
            (invoice_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Invoice not found.",
            )

        # These identity/link fields are not editable from the Finance UI.
        # Reject a changed value instead of silently moving an invoice to a
        # different job or customer.
        immutable_fields = (
            "invoiceNumber",
            "customerId",
            "jobId",
            "createdAt",
        )

        for field in immutable_fields:
            if existing[field] != getattr(invoice, field):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invoice field '{field}' cannot be changed.",
                )

        connection.execute(
            """
            UPDATE invoices
            SET
                dueDate = ?,
                amount = ?,
                status = ?
            WHERE id = ?
            """,
            (
                invoice.dueDate,
                invoice.amount,
                invoice.status,
                invoice_id,
            ),
        )

        connection.commit()

        row = connection.execute(
            "SELECT * FROM invoices WHERE id = ?",
            (invoice_id,),
        ).fetchone()

    finally:
        connection.close()

    return dict(row)


######################
### PATCH requests ###
######################

@app.patch("/invoices/{invoice_id}/status")
def update_invoice_status(
    invoice_id: str,
    update: InvoiceStatusUpdate,
):
    connection = get_db_connection()

    try:
        cursor = connection.execute(
            """
            UPDATE invoices
            SET status = ?
            WHERE id = ?
            """,
            (
                update.status,
                invoice_id,
            ),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Invoice not found.",
            )

        connection.commit()

        row = connection.execute(
            "SELECT * FROM invoices WHERE id = ?",
            (invoice_id,),
        ).fetchone()

    finally:
        connection.close()

    return dict(row)


####################
### GET requests ###
####################

@app.get("/")
def root():
    return {"message": "WorkBooks backend is running!"}


@app.get("/customers")
def get_customers():
    connection = get_db_connection()

    rows = connection.execute(
        "SELECT * FROM customers"
    ).fetchall()

    connection.close()

    return [dict(row) for row in rows]


@app.get("/customers/{customer_id}")
def get_customer(customer_id: str):
    connection = get_db_connection()

    row = connection.execute(
        "SELECT * FROM customers WHERE id = ?",
        (customer_id,),
    ).fetchone()

    connection.close()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Customer not found.",
        )

    return dict(row)


@app.get("/jobs")
def get_jobs():
    connection = get_db_connection()

    rows = connection.execute(
        "SELECT * FROM jobs"
    ).fetchall()

    connection.close()

    return [_serialize_job(row) for row in rows]


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    connection = get_db_connection()

    row = connection.execute(
        "SELECT * FROM jobs WHERE id = ?",
        (job_id,),
    ).fetchone()

    connection.close()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    return _serialize_job(row)


@app.get("/customers/{customer_id}/jobs")
def get_customer_jobs(customer_id: str):
    connection = get_db_connection()

    rows = connection.execute(
        """
        SELECT *
        FROM jobs
        WHERE customerId = ?
        """,
        (customer_id,),
    ).fetchall()

    connection.close()

    return [_serialize_job(row) for row in rows]


@app.get("/invoices")
def get_invoices():
    connection = get_db_connection()

    rows = connection.execute(
        """
        SELECT *
        FROM invoices
        ORDER BY createdAt ASC
        """
    ).fetchall()

    connection.close()

    return [dict(row) for row in rows]


@app.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str):
    connection = get_db_connection()

    row = connection.execute(
        "SELECT * FROM invoices WHERE id = ?",
        (invoice_id,),
    ).fetchone()

    connection.close()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Invoice not found.",
        )

    return dict(row)
