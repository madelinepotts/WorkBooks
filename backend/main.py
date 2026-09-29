import math
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Literal
from xml.sax.saxutils import escape

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

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
from backend.app_paths import INVOICE_PDF_DIR


app = FastAPI()


# The React/Vite development server talks to FastAPI from one of these
# two local origins while WorkBooks is running in development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://tauri.localhost",
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


class WorkSession(BaseModel):
    id: str
    jobId: str
    startedAt: str
    endedAt: str | None = None


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

    # A job can be completed independently of any individual work session.
    completedAt: str | None = None

    # Every Start Work -> Pause Work period is stored separately.
    workSessions: list[WorkSession] = Field(default_factory=list)

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

_EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _clean_text(value: str) -> str:
    """Trim surrounding whitespace and collapse repeated whitespace."""
    return re.sub(r"\s+", " ", value.strip())


def _clean_multiline_text(value: str) -> str:
    """Clean each line while preserving intentional line breaks."""
    cleaned_lines = []

    for line in value.splitlines():
        cleaned = re.sub(r"[ \t]+", " ", line.strip())
        if cleaned:
            cleaned_lines.append(cleaned)

    return "\n".join(cleaned_lines)


def _require_id(value: str, label: str) -> str:
    """Require a non-empty identifier without changing its meaning."""
    cleaned = value.strip()

    if not cleaned:
        raise HTTPException(
            status_code=400,
            detail=f"{label} is required.",
        )

    return cleaned


def _normalize_phone(value: str, label: str = "Phone") -> str:
    """
    Accept common US phone-number input and save one consistent format.

    Examples accepted:
        8015551234
        801-555-1234
        (801) 555-1234
        1-801-555-1234
    """
    digits = re.sub(r"\D", "", value)

    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]

    if len(digits) != 10:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must contain a 10-digit US phone number.",
        )

    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def _normalize_email(value: str | None, label: str = "Email") -> str | None:
    """Trim/lowercase an optional email and reject malformed values."""
    if value is None:
        return None

    cleaned = value.strip().lower()

    if not cleaned:
        return None

    if not _EMAIL_PATTERN.fullmatch(cleaned):
        raise HTTPException(
            status_code=400,
            detail=f"{label} is not a valid email address.",
        )

    return cleaned


def _validate_date(value: str, label: str) -> str:
    """Require an actual calendar date in YYYY-MM-DD format."""
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be a valid date in YYYY-MM-DD format.",
        ) from error

    return value


def _normalize_time(value: str | None, label: str) -> str | None:
    """Validate an optional 24-hour HTML time value and normalize to HH:MM."""
    if value is None:
        return None

    cleaned = value.strip()

    if not cleaned:
        return None

    for time_format in ("%H:%M", "%H:%M:%S"):
        try:
            parsed = datetime.strptime(cleaned, time_format)
            return parsed.strftime("%H:%M")
        except ValueError:
            pass

    raise HTTPException(
        status_code=400,
        detail=f"{label} must be a valid time.",
    )


def _parse_timestamp(value: str, label: str) -> datetime:
    """Validate an ISO timestamp used for work-session timing."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be a valid ISO date/time.",
        ) from error


def _positive_money(value: float | None, label: str) -> float:
    """Require a finite amount greater than zero and normalize to cents."""
    if value is None or not math.isfinite(value) or value <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be greater than $0.00.",
        )

    return round(value, 2)


def _normalize_customer(customer: Customer) -> Customer:
    """Clean and validate one customer before any database write."""
    customer_id = _require_id(customer.id, "Customer ID")
    name = _clean_text(customer.name)
    address = _clean_multiline_text(customer.address)

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Customer name is required.",
        )

    if not address:
        raise HTTPException(
            status_code=400,
            detail="Customer address is required.",
        )

    return customer.model_copy(
        update={
            "id": customer_id,
            "name": name,
            "phone": _normalize_phone(customer.phone),
            "email": _normalize_email(customer.email),
            "address": address,
        }
    )


def _normalize_business_info(business_info: BusinessInfo) -> BusinessInfo:
    """Clean and validate the information printed on invoices."""
    business_name = _clean_text(business_info.businessName)
    address = _clean_multiline_text(business_info.address)

    if not business_name:
        raise HTTPException(
            status_code=400,
            detail="Business name is required.",
        )

    if not address:
        raise HTTPException(
            status_code=400,
            detail="Business address is required.",
        )

    return business_info.model_copy(
        update={
            "businessName": business_name,
            "ownerName": _clean_text(business_info.ownerName),
            "phone": _normalize_phone(business_info.phone, "Business phone"),
            "email": _normalize_email(business_info.email, "Business email") or "",
            "address": address,
            "paymentInstructions": _clean_multiline_text(
                business_info.paymentInstructions
            ),
        }
    )


def _normalize_work_sessions(job: Job) -> list[WorkSession]:
    """Validate all work sessions supplied with a job update."""
    normalized_sessions: list[WorkSession] = []
    session_ids: set[str] = set()
    open_session_count = 0

    for session in job.workSessions:
        session_id = _require_id(session.id, "Work-session ID")
        session_job_id = _require_id(session.jobId, "Work-session job ID")

        if session_job_id != job.id:
            raise HTTPException(
                status_code=400,
                detail="Work session jobId does not match the job being updated.",
            )

        if session_id in session_ids:
            raise HTTPException(
                status_code=400,
                detail="A job cannot contain duplicate work-session IDs.",
            )

        session_ids.add(session_id)

        started_at = session.startedAt.strip()
        started = _parse_timestamp(started_at, "Work-session start time")

        ended_at = None

        if session.endedAt is not None and session.endedAt.strip():
            ended_at = session.endedAt.strip()
            ended = _parse_timestamp(ended_at, "Work-session end time")

            # ISO strings generated by WorkBooks are timezone-aware. If an old
            # record is naive, compare wall-clock values rather than crashing.
            if started.tzinfo is None:
                started_compare = started.replace(tzinfo=None)
            else:
                started_compare = started

            if ended.tzinfo is None:
                ended_compare = ended.replace(tzinfo=None)
            else:
                ended_compare = ended

            try:
                backwards = ended_compare < started_compare
            except TypeError:
                backwards = ended.replace(tzinfo=None) < started.replace(tzinfo=None)

            if backwards:
                raise HTTPException(
                    status_code=400,
                    detail="A work session cannot end before it starts.",
                )
        else:
            open_session_count += 1

        normalized_sessions.append(
            session.model_copy(
                update={
                    "id": session_id,
                    "jobId": session_job_id,
                    "startedAt": started_at,
                    "endedAt": ended_at,
                }
            )
        )

    if open_session_count > 1:
        raise HTTPException(
            status_code=400,
            detail="A job cannot have more than one open work session.",
        )

    return normalized_sessions


def _normalize_job(job: Job) -> Job:
    """Clean and validate a job before it reaches SQLite."""
    job_id = _require_id(job.id, "Job ID")
    customer_id = _require_id(job.customerId, "Customer ID")
    description = _clean_multiline_text(job.description)

    if not description:
        raise HTTPException(
            status_code=400,
            detail="Job description is required.",
        )

    scheduled_date = _validate_date(job.scheduledDate, "Scheduled date")
    scheduled_time = _normalize_time(job.scheduledTime, "Scheduled time")

    if job.pricingType == "hourly":
        hourly_rate = _positive_money(job.hourlyRate, "Hourly rate")
        fixed_price = None
    else:
        fixed_price = _positive_money(job.fixedPrice, "Fixed price")
        hourly_rate = None

    completed_at = None

    if job.completedAt is not None and job.completedAt.strip():
        completed_at = job.completedAt.strip()
        _parse_timestamp(completed_at, "Completed time")

    normalized_job = job.model_copy(
        update={
            "id": job_id,
            "customerId": customer_id,
            "description": description,
            "scheduledDate": scheduled_date,
            "scheduledTime": scheduled_time,
            "hourlyRate": hourly_rate,
            "fixedPrice": fixed_price,
            "completedAt": completed_at,
        }
    )

    work_sessions = _normalize_work_sessions(normalized_job)

    if normalized_job.status == "upcoming":
        if work_sessions:
            raise HTTPException(
                status_code=400,
                detail="An upcoming job cannot already contain work sessions.",
            )

        if completed_at is not None:
            raise HTTPException(
                status_code=400,
                detail="An upcoming job cannot have a completion time.",
            )

    elif normalized_job.status == "active":
        if completed_at is not None:
            raise HTTPException(
                status_code=400,
                detail="An active job cannot have a completion time.",
            )

    elif normalized_job.status == "completed":
        if completed_at is None:
            raise HTTPException(
                status_code=400,
                detail="A completed job must have a completion time.",
            )

        if any(session.endedAt is None for session in work_sessions):
            raise HTTPException(
                status_code=400,
                detail="Finish or pause the open work session before completing the job.",
            )

    return normalized_job.model_copy(
        update={
            "workSessions": work_sessions,
        }
    )


def _normalize_invoice(invoice: Invoice) -> Invoice:
    """Validate invoice dates, identifiers, number, and amount."""
    invoice_id = _require_id(invoice.id, "Invoice ID")
    customer_id = _require_id(invoice.customerId, "Customer ID")
    job_id = _require_id(invoice.jobId, "Job ID")
    invoice_number = _clean_text(invoice.invoiceNumber)

    if not invoice_number:
        raise HTTPException(
            status_code=400,
            detail="Invoice number is required.",
        )

    created_at = _validate_date(invoice.createdAt, "Invoice date")
    due_date = _validate_date(invoice.dueDate, "Due date")

    if due_date < created_at:
        raise HTTPException(
            status_code=400,
            detail="Due date cannot be before the invoice date.",
        )

    amount = _positive_money(invoice.amount, "Invoice amount")

    return invoice.model_copy(
        update={
            "id": invoice_id,
            "invoiceNumber": invoice_number,
            "customerId": customer_id,
            "jobId": job_id,
            "createdAt": created_at,
            "dueDate": due_date,
            "amount": amount,
        }
    )

def _serialize_work_session(row: sqlite3.Row) -> dict:
    """Convert one work_sessions row into the frontend WorkSession shape."""
    session = dict(row)

    if session.get("endedAt") is None:
        session.pop("endedAt", None)

    return session


def _get_work_sessions(
    connection,
    job_id: str,
) -> list[dict]:
    """Return every work session for a job in chronological order."""
    rows = connection.execute(
        """
        SELECT *
        FROM work_sessions
        WHERE jobId = ?
        ORDER BY startedAt ASC
        """,
        (job_id,),
    ).fetchall()

    return [
        _serialize_work_session(row)
        for row in rows
    ]


def _replace_work_sessions(
    connection,
    job: Job,
):
    """
    Replace the saved work sessions for one job with the sessions supplied
    by the frontend.

    The frontend sends the complete Job object on each update, so replacing
    this small child collection keeps Start / Pause / Resume persistence
    simple and predictable. This runs in the same SQLite transaction as the
    job update.
    """
    for session in job.workSessions:
        if session.jobId != job.id:
            raise HTTPException(
                status_code=400,
                detail="Work session jobId does not match the job being updated.",
            )

    connection.execute(
        "DELETE FROM work_sessions WHERE jobId = ?",
        (job.id,),
    )

    for session in job.workSessions:
        connection.execute(
            """
            INSERT INTO work_sessions (
                id,
                jobId,
                startedAt,
                endedAt
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                session.id,
                session.jobId,
                session.startedAt,
                session.endedAt,
            ),
        )


def _serialize_job(
    connection,
    row: sqlite3.Row,
) -> dict:
    """
    Convert a jobs row into the frontend Job shape and attach its work
    sessions.

    startedAt is intentionally no longer returned. The column remains in
    SQLite temporarily only so older one-timer jobs can be migrated safely.
    """
    job = dict(row)

    # Legacy field: keep it in SQLite for migration, but do not expose it to
    # the new frontend Job model.
    job.pop("startedAt", None)

    optional_fields = (
        "scheduledTime",
        "hourlyRate",
        "fixedPrice",
        "completedAt",
    )

    for field in optional_fields:
        if job.get(field) is None:
            job.pop(field, None)

    job["workSessions"] = _get_work_sessions(
        connection,
        job["id"],
    )

    return job


def _worked_hours_from_sessions(
    rows: list[sqlite3.Row],
) -> float:
    """Add together the duration of every completed work session."""
    total_seconds = 0.0

    for row in rows:
        if not row["endedAt"]:
            continue

        try:
            started = datetime.fromisoformat(
                row["startedAt"].replace("Z", "+00:00")
            )
            ended = datetime.fromisoformat(
                row["endedAt"].replace("Z", "+00:00")
            )
        except ValueError:
            continue

        total_seconds += max(
            0.0,
            (ended - started).total_seconds(),
        )

    return total_seconds / 3600

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


def _labor_description(
    job: sqlite3.Row,
    work_sessions: list[sqlite3.Row],
) -> str:
    """Build the one labor line used by the current invoice model."""
    if job["pricingType"] == "fixed":
        return "Labor - Fixed price"

    rate = job["hourlyRate"]

    if rate is None:
        return "Labor - Hourly"

    hours = _worked_hours_from_sessions(work_sessions)

    if hours > 0:
        return f"Labor - {hours:.2f} hours @ ${rate:,.2f}/hr"

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

        work_sessions = connection.execute(
            """
            SELECT *
            FROM work_sessions
            WHERE jobId = ?
            ORDER BY startedAt ASC
            """,
            (invoice["jobId"],),
        ).fetchall()

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
                Paragraph(_pdf_text(_labor_description(job, work_sessions)), normal),
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
    customer = _normalize_customer(customer)
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
    job = _normalize_job(job)
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
                completedAt,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                job.completedAt,
                job.status,
            ),
        )

        _replace_work_sessions(
            connection,
            job,
        )

        connection.commit()

        row = connection.execute(
            "SELECT * FROM jobs WHERE id = ?",
            (job.id,),
        ).fetchone()

        return _serialize_job(
            connection,
            row,
        )

    except sqlite3.IntegrityError as error:
        connection.rollback()
        raise HTTPException(
            status_code=409,
            detail="Could not create job. That job or work-session ID already exists.",
        ) from error

    finally:
        connection.close()


@app.post("/invoices")
def create_invoice(invoice: Invoice):
    invoice = _normalize_invoice(invoice)
    connection = get_db_connection()

    try:
        if not _customer_exists(connection, invoice.customerId):
            raise HTTPException(
                status_code=404,
                detail="Customer not found.",
            )

        job_row = connection.execute(
            """
            SELECT customerId, status
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

        if job_row["status"] != "completed":
            raise HTTPException(
                status_code=400,
                detail="Only completed jobs can be invoiced.",
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
    business_info = _normalize_business_info(business_info)
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

    customer = _normalize_customer(customer)
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
    Replace the saved data for one job, including all of its work sessions.

    Start Work, Pause Work, Resume Work, Finish Job, and normal job edits all
    arrive through this same endpoint. The job row and its work_sessions are
    saved in one SQLite transaction so they cannot get out of sync.
    """
    if job.id != job_id:
        raise HTTPException(
            status_code=400,
            detail="Job ID in the URL does not match the job body.",
        )

    job = _normalize_job(job)
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

        _replace_work_sessions(
            connection,
            job,
        )

        connection.commit()

        row = connection.execute(
            "SELECT * FROM jobs WHERE id = ?",
            (job_id,),
        ).fetchone()

        return _serialize_job(
            connection,
            row,
        )

    except sqlite3.IntegrityError as error:
        connection.rollback()
        raise HTTPException(
            status_code=409,
            detail="Could not update job. A work-session ID may already be in use.",
        ) from error

    finally:
        connection.close()


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

    invoice = _normalize_invoice(invoice)
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

    try:
        rows = connection.execute(
            "SELECT * FROM jobs"
        ).fetchall()

        return [
            _serialize_job(connection, row)
            for row in rows
        ]

    finally:
        connection.close()


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    connection = get_db_connection()

    try:
        row = connection.execute(
            "SELECT * FROM jobs WHERE id = ?",
            (job_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Job not found.",
            )

        return _serialize_job(
            connection,
            row,
        )

    finally:
        connection.close()


@app.get("/customers/{customer_id}/jobs")
def get_customer_jobs(customer_id: str):
    connection = get_db_connection()

    try:
        rows = connection.execute(
            """
            SELECT *
            FROM jobs
            WHERE customerId = ?
            """,
            (customer_id,),
        ).fetchall()

        return [
            _serialize_job(connection, row)
            for row in rows
        ]

    finally:
        connection.close()


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
