import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal
from xml.sax.saxutils import escape

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from backend.database import create_database, get_db_connection


# Generated invoice PDFs are saved beside the backend code. SQLite remains
# the source of truth; downloading an invoice regenerates this copy using the
# current saved invoice/customer/business information.
INVOICE_PDF_DIR = Path(__file__).parent / "invoices"


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


class BusinessInfo(BaseModel):
    businessName: str = ""
    ownerName: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    paymentInstructions: str = ""


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


def _friendly_date(value: str) -> str:
    """Convert saved ISO/date strings into a simple invoice date."""
    if not value:
        return ""

    try:
        if "T" in value:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        else:
            parsed = datetime.strptime(value, "%Y-%m-%d")

        return parsed.strftime("%B %d, %Y").replace(" 0", " ")
    except ValueError:
        return value


def _pdf_text(value: str | None) -> str:
    """Escape saved user text before placing it in a ReportLab Paragraph."""
    return escape(value or "").replace("\n", "<br/>")


def _labor_description(job: sqlite3.Row) -> str:
    """Build the one labor line used by the current invoice model."""
    if job["pricingType"] == "fixed":
        return "Labor - Fixed price"

    rate = job["hourlyRate"]

    if rate is None:
        return "Labor - Hourly"

    if job["startedAt"] and job["completedAt"]:
        try:
            started = datetime.fromisoformat(job["startedAt"].replace("Z", "+00:00"))
            completed = datetime.fromisoformat(job["completedAt"].replace("Z", "+00:00"))
            hours = max(0.0, (completed - started).total_seconds() / 3600)
            return f"Labor - {hours:.2f} hours @ ${rate:,.2f}/hr"
        except ValueError:
            pass

    return f"Labor @ ${rate:,.2f}/hr"


def _generate_invoice_pdf(invoice_id: str) -> tuple[Path, str]:
    """
    Regenerate one invoice PDF from the current SQLite records.

    The database remains authoritative. The PDF is a convenient printable /
    downloadable copy, so edits to an invoice or business information are
    picked up the next time Dad downloads it.
    """
    connection = get_db_connection()

    try:
        invoice = connection.execute(
            "SELECT * FROM invoices WHERE id = ?",
            (invoice_id,),
        ).fetchone()

        if invoice is None:
            raise HTTPException(
                status_code=404,
                detail="Invoice not found.",
            )

        customer = connection.execute(
            "SELECT * FROM customers WHERE id = ?",
            (invoice["customerId"],),
        ).fetchone()

        job = connection.execute(
            "SELECT * FROM jobs WHERE id = ?",
            (invoice["jobId"],),
        ).fetchone()

        business = connection.execute(
            "SELECT * FROM business_info WHERE id = 1"
        ).fetchone()

    finally:
        connection.close()

    if customer is None or job is None:
        raise HTTPException(
            status_code=500,
            detail="Invoice is missing its customer or job record.",
        )

    INVOICE_PDF_DIR.mkdir(parents=True, exist_ok=True)

    safe_number = re.sub(r"[^A-Za-z0-9_.-]+", "_", invoice["invoiceNumber"])
    filename = f"{safe_number}.pdf"
    pdf_path = INVOICE_PDF_DIR / filename

    styles = getSampleStyleSheet()
    normal = ParagraphStyle(
        "InvoiceNormal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#344054"),
    )
    small = ParagraphStyle(
        "InvoiceSmall",
        parent=normal,
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#667085"),
    )
    heading = ParagraphStyle(
        "InvoiceHeading",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=25,
        textColor=colors.HexColor("#183153"),
        spaceAfter=4,
    )
    section_label = ParagraphStyle(
        "InvoiceSectionLabel",
        parent=small,
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#667085"),
    )
    right = ParagraphStyle(
        "InvoiceRight",
        parent=normal,
        alignment=TA_RIGHT,
    )
    right_small = ParagraphStyle(
        "InvoiceRightSmall",
        parent=small,
        alignment=TA_RIGHT,
    )

    business_name = (business["businessName"] if business else "") or (
        business["ownerName"] if business else ""
    ) or "WorkBooks Invoice"

    business_lines = []
    if business:
        if business["ownerName"] and business["ownerName"] != business_name:
            business_lines.append(_pdf_text(business["ownerName"]))
        if business["address"]:
            business_lines.append(_pdf_text(business["address"]))
        if business["phone"]:
            business_lines.append(_pdf_text(business["phone"]))
        if business["email"]:
            business_lines.append(_pdf_text(business["email"]))

    customer_lines = [f"<b>{_pdf_text(customer['name'])}</b>"]
    if customer["address"]:
        customer_lines.append(_pdf_text(customer["address"]))
    if customer["phone"]:
        customer_lines.append(_pdf_text(customer["phone"]))
    if customer["email"]:
        customer_lines.append(_pdf_text(customer["email"]))

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        title=invoice["invoiceNumber"],
        author=business_name,
    )

    story = []

    header = Table(
        [
            [
                [
                    Paragraph(_pdf_text(business_name), heading),
                    Paragraph("<br/>".join(business_lines), small)
                    if business_lines else Spacer(1, 1),
                ],
                [
                    Paragraph("INVOICE", ParagraphStyle(
                        "InvoiceWord",
                        parent=heading,
                        alignment=TA_RIGHT,
                    )),
                    Paragraph(f"<b>{_pdf_text(invoice['invoiceNumber'])}</b>", right),
                    Paragraph(f"Date: {_friendly_date(invoice['createdAt'])}", right_small),
                    Paragraph(f"Due: {_friendly_date(invoice['dueDate'])}", right_small),
                ],
            ]
        ],
        colWidths=[4.45 * inch, 2.1 * inch],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 0.28 * inch))

    story.append(Table(
        [[
            [
                Paragraph("BILL TO", section_label),
                Spacer(1, 5),
                Paragraph("<br/>".join(customer_lines), normal),
            ],
            [
                Paragraph("JOB", section_label),
                Spacer(1, 5),
                Paragraph(f"<b>{_pdf_text(job['description'])}</b>", normal),
                Paragraph(_friendly_date(job["scheduledDate"]), small),
            ],
        ]],
        colWidths=[3.65 * inch, 2.9 * inch],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F7F8FA")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#E2E5E9")),
            ("INNERGRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#E2E5E9")),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 11),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
        ]),
    ))
    story.append(Spacer(1, 0.3 * inch))

    line_items = Table(
        [
            [
                Paragraph("DESCRIPTION", section_label),
                Paragraph("AMOUNT", ParagraphStyle(
                    "InvoiceAmountLabel",
                    parent=section_label,
                    alignment=TA_RIGHT,
                )),
            ],
            [
                Paragraph(_pdf_text(_labor_description(job)), normal),
                Paragraph(f"${invoice['amount']:,.2f}", right),
            ],
        ],
        colWidths=[5.35 * inch, 1.2 * inch],
    )
    line_items.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#183153")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("LINEBELOW", (0, 1), (-1, 1), 0.7, colors.HexColor("#E2E5E9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story.append(line_items)
    story.append(Spacer(1, 0.22 * inch))

    totals = Table(
        [
            [Paragraph("TOTAL", section_label), Paragraph(f"<b>${invoice['amount']:,.2f}</b>", right)],
            [Paragraph("STATUS", section_label), Paragraph(_pdf_text(invoice["status"].title()), right)],
        ],
        colWidths=[1.15 * inch, 1.55 * inch],
        hAlign="RIGHT",
    )
    totals.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1, colors.HexColor("#183153")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(totals)

    if business and business["paymentInstructions"]:
        story.append(Spacer(1, 0.32 * inch))
        story.append(Paragraph("PAYMENT", section_label))
        story.append(Spacer(1, 5))
        story.append(Paragraph(_pdf_text(business["paymentInstructions"]), normal))

    story.append(Spacer(1, 0.38 * inch))
    story.append(Paragraph("Thank you for your business!", ParagraphStyle(
        "InvoiceThanks",
        parent=normal,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#183153"),
    )))

    doc.build(story)

    return pdf_path, filename


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

@app.put("/business-info")
def update_business_info(business_info: BusinessInfo):
    """Save the business information printed on generated invoices."""
    connection = get_db_connection()

    try:
        connection.execute(
            """
            UPDATE business_info
            SET
                businessName = ?,
                ownerName = ?,
                phone = ?,
                email = ?,
                address = ?,
                paymentInstructions = ?
            WHERE id = 1
            """,
            (
                business_info.businessName,
                business_info.ownerName,
                business_info.phone,
                business_info.email,
                business_info.address,
                business_info.paymentInstructions,
            ),
        )

        connection.commit()

    finally:
        connection.close()

    return business_info.model_dump()


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


@app.get("/business-info")
def get_business_info():
    connection = get_db_connection()

    row = connection.execute(
        "SELECT * FROM business_info WHERE id = 1"
    ).fetchone()

    connection.close()

    if row is None:
        # create_database() normally guarantees the row exists. This fallback
        # keeps the API predictable even if someone manually edited SQLite.
        return BusinessInfo().model_dump()

    business_info = dict(row)
    business_info.pop("id", None)
    return business_info


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


@app.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: str):
    """
    Generate a fresh PDF copy and return it as a normal file download.

    This endpoint works for the desktop app and for a future phone/PWA
    frontend because it is just an ordinary HTTP PDF response.
    """
    pdf_path, filename = _generate_invoice_pdf(invoice_id)

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=filename,
    )


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
