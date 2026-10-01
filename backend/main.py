import math
import re
import sqlite3

from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4
from xml.sax.saxutils import escape

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from fastapi.middleware.cors import (
    CORSMiddleware,
)

from fastapi.responses import (
    FileResponse,
)

from pydantic import (
    BaseModel,
    Field,
)

from reportlab.lib import colors

from reportlab.lib.enums import (
    TA_RIGHT,
)

from reportlab.lib.pagesizes import (
    letter,
)

from reportlab.lib.styles import (
    ParagraphStyle,
    getSampleStyleSheet,
)

from reportlab.lib.units import (
    inch,
)

from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from backend.app_paths import (
    INVOICE_PDF_DIR,
    RECEIPT_DIR,
)

from backend.database import (
    create_database,
    get_db_connection,
)


app = FastAPI()


app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://tauri.localhost",
    ],

    allow_credentials=True,

    allow_methods=[
        "*",
    ],

    allow_headers=[
        "*",
    ],
)


# ---------------------------------------------------------
# Data models
# ---------------------------------------------------------

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

    hourlyRate: float | None = None
    fixedPrice: float | None = None

    completedAt: str | None = None

    workSessions: list[WorkSession] = Field(
        default_factory=list
    )

    status: Literal[
        "upcoming",
        "active",
        "completed",
    ]


class Material(BaseModel):
    id: str
    jobId: str
    description: str
    quantity: float
    unitCost: float
    receiptId: str | None = None


class Receipt(BaseModel):
    id: str
    jobId: str
    fileName: str
    storedFileName: str
    vendor: str | None = None
    purchaseDate: str | None = None
    notes: str | None = None


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
    status: Literal[
        "draft",
        "sent",
        "paid",
    ]


class InvoiceStatusUpdate(BaseModel):
    status: Literal[
        "draft",
        "sent",
        "paid",
    ]


# ---------------------------------------------------------
# Validation / serialization
# ---------------------------------------------------------

_EMAIL_PATTERN = re.compile(
    r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
)


_RECEIPT_EXTENSIONS = {

    ".jpg":
        "image/jpeg",

    ".jpeg":
        "image/jpeg",

    ".png":
        "image/png",

    ".pdf":
        "application/pdf",
}


# Keep individual receipt files reasonably small.
_MAX_RECEIPT_BYTES = (
    20 *
    1024 *
    1024
)


def _clean_text(
    value: str,
) -> str:
    """
    Trim surrounding whitespace and collapse repeated
    whitespace.
    """
    return re.sub(
        r"\s+",
        " ",
        value.strip(),
    )


def _clean_multiline_text(
    value: str,
) -> str:
    """
    Clean each line while preserving intentional line
    breaks.
    """
    lines = []


    for line in value.splitlines():

        cleaned = re.sub(
            r"[ \t]+",
            " ",
            line.strip(),
        )


        if cleaned:
            lines.append(
                cleaned
            )


    return "\n".join(
        lines
    )


def _require_id(
    value: str,
    label: str,
) -> str:

    cleaned = value.strip()


    if not cleaned:

        raise HTTPException(
            status_code=400,

            detail=(
                f"{label} is required."
            ),
        )


    return cleaned


def _normalize_phone(
    value: str,
    label: str = "Phone",
) -> str:

    digits = re.sub(
        r"\D",
        "",
        value,
    )


    if (
        len(digits) == 11 and
        digits.startswith("1")
    ):
        digits = digits[1:]


    if len(digits) != 10:

        raise HTTPException(
            status_code=400,

            detail=(
                f"{label} must contain "
                "a 10-digit US phone number."
            ),
        )


    return (
        f"({digits[:3]}) "
        f"{digits[3:6]}-"
        f"{digits[6:]}"
    )


def _normalize_email(
    value: str | None,
    label: str = "Email",
) -> str | None:

    if value is None:
        return None


    cleaned = (
        value
        .strip()
        .lower()
    )


    if not cleaned:
        return None


    if not _EMAIL_PATTERN.fullmatch(
        cleaned
    ):

        raise HTTPException(
            status_code=400,

            detail=(
                f"{label} is not a "
                "valid email address."
            ),
        )


    return cleaned


def _validate_date(
    value: str,
    label: str,
) -> str:

    try:

        datetime.strptime(
            value,
            "%Y-%m-%d",
        )

    except ValueError as error:

        raise HTTPException(
            status_code=400,

            detail=(
                f"{label} must be a valid "
                "date in YYYY-MM-DD format."
            ),
        ) from error


    return value


def _normalize_optional_date(
    value: str | None,
    label: str,
) -> str | None:

    if value is None:
        return None


    cleaned = value.strip()


    if not cleaned:
        return None


    return _validate_date(
        cleaned,
        label,
    )


def _normalize_time(
    value: str | None,
    label: str,
) -> str | None:

    if value is None:
        return None


    cleaned = value.strip()


    if not cleaned:
        return None


    for time_format in (
        "%H:%M",
        "%H:%M:%S",
    ):

        try:

            parsed = datetime.strptime(
                cleaned,
                time_format,
            )

            return parsed.strftime(
                "%H:%M"
            )

        except ValueError:
            pass


    raise HTTPException(
        status_code=400,

        detail=(
            f"{label} must be "
            "a valid time."
        ),
    )


def _parse_timestamp(
    value: str,
    label: str,
) -> datetime:

    try:

        return datetime.fromisoformat(
            value.replace(
                "Z",
                "+00:00",
            )
        )

    except ValueError as error:

        raise HTTPException(
            status_code=400,

            detail=(
                f"{label} must be a valid "
                "ISO date/time."
            ),
        ) from error


def _positive_money(
    value: float | None,
    label: str,
) -> float:

    if (
        value is None or
        not math.isfinite(value) or
        value <= 0
    ):

        raise HTTPException(
            status_code=400,

            detail=(
                f"{label} must be greater "
                "than $0.00."
            ),
        )


    return round(
        value,
        2,
    )


def _positive_number(
    value: float,
    label: str,
) -> float:

    if (
        not math.isfinite(value) or
        value <= 0
    ):

        raise HTTPException(
            status_code=400,

            detail=(
                f"{label} must be "
                "greater than zero."
            ),
        )


    return value


def _normalize_customer(
    customer: Customer,
) -> Customer:

    name = _clean_text(
        customer.name
    )


    address = _clean_multiline_text(
        customer.address
    )


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

            "id":
                _require_id(
                    customer.id,
                    "Customer ID",
                ),

            "name":
                name,

            "phone":
                _normalize_phone(
                    customer.phone
                ),

            "email":
                _normalize_email(
                    customer.email
                ),

            "address":
                address,
        }
    )


def _normalize_business_info(
    info: BusinessInfo,
) -> BusinessInfo:

    business_name = _clean_text(
        info.businessName
    )


    address = _clean_multiline_text(
        info.address
    )


    if not business_name:

        raise HTTPException(
            status_code=400,

            detail=(
                "Business name is required."
            ),
        )


    if not address:

        raise HTTPException(
            status_code=400,

            detail=(
                "Business address is required."
            ),
        )


    return info.model_copy(
        update={

            "businessName":
                business_name,

            "ownerName":
                _clean_text(
                    info.ownerName
                ),

            "phone":
                _normalize_phone(
                    info.phone,
                    "Business phone",
                ),

            "email":
                _normalize_email(
                    info.email,
                    "Business email",
                ) or "",

            "address":
                address,

            "paymentInstructions":
                _clean_multiline_text(
                    info.paymentInstructions
                ),
        }
    )


def _normalize_work_sessions(
    job: Job,
) -> list[WorkSession]:

    normalized = []

    session_ids: set[str] = set()

    open_count = 0


    for session in job.workSessions:

        session_id = _require_id(
            session.id,
            "Work-session ID",
        )


        session_job_id = _require_id(
            session.jobId,
            "Work-session job ID",
        )


        if session_job_id != job.id:

            raise HTTPException(
                status_code=400,

                detail=(
                    "Work session jobId does "
                    "not match the job being "
                    "updated."
                ),
            )


        if session_id in session_ids:

            raise HTTPException(
                status_code=400,

                detail=(
                    "A job cannot contain "
                    "duplicate work-session IDs."
                ),
            )


        session_ids.add(
            session_id
        )


        started_at = (
            session
            .startedAt
            .strip()
        )


        started = _parse_timestamp(
            started_at,
            "Work-session start time",
        )


        ended_at = None


        if (
            session.endedAt is not None and
            session.endedAt.strip()
        ):

            ended_at = (
                session
                .endedAt
                .strip()
            )


            ended = _parse_timestamp(
                ended_at,
                "Work-session end time",
            )


            try:

                backwards = (
                    ended <
                    started
                )

            except TypeError:

                backwards = (
                    ended.replace(
                        tzinfo=None
                    )
                    <
                    started.replace(
                        tzinfo=None
                    )
                )


            if backwards:

                raise HTTPException(
                    status_code=400,

                    detail=(
                        "A work session cannot "
                        "end before it starts."
                    ),
                )

        else:

            open_count += 1


        normalized.append(
            session.model_copy(
                update={

                    "id":
                        session_id,

                    "jobId":
                        session_job_id,

                    "startedAt":
                        started_at,

                    "endedAt":
                        ended_at,
                }
            )
        )


    if open_count > 1:

        raise HTTPException(
            status_code=400,

            detail=(
                "A job cannot have more than "
                "one open work session."
            ),
        )


    return normalized


def _normalize_job(
    job: Job,
) -> Job:

    job_id = _require_id(
        job.id,
        "Job ID",
    )


    customer_id = _require_id(
        job.customerId,
        "Customer ID",
    )


    description = _clean_multiline_text(
        job.description
    )


    if not description:

        raise HTTPException(
            status_code=400,

            detail=(
                "Job description is required."
            ),
        )


    scheduled_date = _validate_date(
        job.scheduledDate,
        "Scheduled date",
    )


    scheduled_time = _normalize_time(
        job.scheduledTime,
        "Scheduled time",
    )


    if job.pricingType == "hourly":

        hourly_rate = _positive_money(
            job.hourlyRate,
            "Hourly rate",
        )

        fixed_price = None

    else:

        fixed_price = _positive_money(
            job.fixedPrice,
            "Fixed price",
        )

        hourly_rate = None


    completed_at = None


    if (
        job.completedAt is not None and
        job.completedAt.strip()
    ):

        completed_at = (
            job
            .completedAt
            .strip()
        )


        _parse_timestamp(
            completed_at,
            "Completed time",
        )


    normalized_job = job.model_copy(
        update={

            "id":
                job_id,

            "customerId":
                customer_id,

            "description":
                description,

            "scheduledDate":
                scheduled_date,

            "scheduledTime":
                scheduled_time,

            "hourlyRate":
                hourly_rate,

            "fixedPrice":
                fixed_price,

            "completedAt":
                completed_at,
        }
    )


    sessions = _normalize_work_sessions(
        normalized_job
    )


    if normalized_job.status == "upcoming":

        if sessions:

            raise HTTPException(
                status_code=400,

                detail=(
                    "An upcoming job cannot "
                    "already contain work sessions."
                ),
            )


        if completed_at is not None:

            raise HTTPException(
                status_code=400,

                detail=(
                    "An upcoming job cannot have "
                    "a completion time."
                ),
            )


    elif normalized_job.status == "active":

        if completed_at is not None:

            raise HTTPException(
                status_code=400,

                detail=(
                    "An active job cannot have "
                    "a completion time."
                ),
            )


    elif normalized_job.status == "completed":

        if completed_at is None:

            raise HTTPException(
                status_code=400,

                detail=(
                    "A completed job must have "
                    "a completion time."
                ),
            )


        if any(
            session.endedAt is None
            for session in sessions
        ):

            raise HTTPException(
                status_code=400,

                detail=(
                    "Finish or pause the open "
                    "work session before completing "
                    "the job."
                ),
            )


    return normalized_job.model_copy(
        update={
            "workSessions":
                sessions,
        }
    )


def _normalize_material(
    material: Material,
) -> Material:

    description = _clean_text(
        material.description
    )


    if not description:

        raise HTTPException(
            status_code=400,

            detail=(
                "Material description is required."
            ),
        )


    receipt_id = None


    if (
        material.receiptId is not None and
        material.receiptId.strip()
    ):

        receipt_id = _require_id(
            material.receiptId,
            "Receipt ID",
        )


    return material.model_copy(
        update={

            "id":
                _require_id(
                    material.id,
                    "Material ID",
                ),

            "jobId":
                _require_id(
                    material.jobId,
                    "Job ID",
                ),

            "description":
                description,

            "quantity":
                _positive_number(
                    material.quantity,
                    "Material quantity",
                ),

            "unitCost":
                _positive_money(
                    material.unitCost,
                    "Material unit cost",
                ),

            "receiptId":
                receipt_id,
        }
    )


def _normalize_invoice(
    invoice: Invoice,
) -> Invoice:

    invoice_number = _clean_text(
        invoice.invoiceNumber
    )


    if not invoice_number:

        raise HTTPException(
            status_code=400,

            detail=(
                "Invoice number is required."
            ),
        )


    created_at = _validate_date(
        invoice.createdAt,
        "Invoice date",
    )


    due_date = _validate_date(
        invoice.dueDate,
        "Due date",
    )


    if due_date < created_at:

        raise HTTPException(
            status_code=400,

            detail=(
                "Due date cannot be before "
                "the invoice date."
            ),
        )


    return invoice.model_copy(
        update={

            "id":
                _require_id(
                    invoice.id,
                    "Invoice ID",
                ),

            "invoiceNumber":
                invoice_number,

            "customerId":
                _require_id(
                    invoice.customerId,
                    "Customer ID",
                ),

            "jobId":
                _require_id(
                    invoice.jobId,
                    "Job ID",
                ),

            "createdAt":
                created_at,

            "dueDate":
                due_date,

            "amount":
                _positive_money(
                    invoice.amount,
                    "Invoice amount",
                ),
        }
    )


def _serialize_work_session(
    row: sqlite3.Row,
) -> dict:

    item = dict(
        row
    )


    if item.get(
        "endedAt"
    ) is None:

        item.pop(
            "endedAt",
            None,
        )


    return item


def _get_work_sessions(
    connection,
    job_id: str,
) -> list[dict]:

    rows = connection.execute(
        """
        SELECT *
        FROM work_sessions
        WHERE jobId = ?
        ORDER BY startedAt ASC
        """,

        (
            job_id,
        ),
    ).fetchall()


    return [
        _serialize_work_session(
            row
        )
        for row in rows
    ]


def _replace_work_sessions(
    connection,
    job: Job,
):

    connection.execute(
        """
        DELETE FROM work_sessions
        WHERE jobId = ?
        """,

        (
            job.id,
        ),
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

    job = dict(
        row
    )


    # Legacy database field.
    job.pop(
        "startedAt",
        None,
    )


    for field in (
        "scheduledTime",
        "hourlyRate",
        "fixedPrice",
        "completedAt",
    ):

        if job.get(field) is None:

            job.pop(
                field,
                None,
            )


    job[
        "workSessions"
    ] = _get_work_sessions(
        connection,
        job["id"],
    )


    return job


def _serialize_material(
    row: sqlite3.Row,
) -> dict:

    material = dict(
        row
    )


    if material.get(
        "receiptId"
    ) is None:

        material.pop(
            "receiptId",
            None,
        )


    return material


def _serialize_receipt(
    row: sqlite3.Row,
) -> dict:

    receipt = dict(
        row
    )


    for field in (
        "vendor",
        "purchaseDate",
        "notes",
    ):

        if receipt.get(field) is None:

            receipt.pop(
                field,
                None,
            )


    return receipt


def _customer_exists(
    connection,
    customer_id: str,
) -> bool:

    row = connection.execute(
        """
        SELECT id
        FROM customers
        WHERE id = ?
        """,

        (
            customer_id,
        ),
    ).fetchone()


    return row is not None


def _job_exists(
    connection,
    job_id: str,
) -> bool:

    row = connection.execute(
        """
        SELECT id
        FROM jobs
        WHERE id = ?
        """,

        (
            job_id,
        ),
    ).fetchone()


    return row is not None


def _receipt_belongs_to_job(
    connection,
    receipt_id: str,
    job_id: str,
) -> bool:

    row = connection.execute(
        """
        SELECT id
        FROM receipts
        WHERE id = ?
          AND jobId = ?
        """,

        (
            receipt_id,
            job_id,
        ),
    ).fetchone()


    return row is not None


def _receipt_extension(
    file_name: str,
) -> str:

    extension = (
        Path(file_name)
        .suffix
        .lower()
    )


    if extension not in (
        _RECEIPT_EXTENSIONS
    ):

        raise HTTPException(
            status_code=400,

            detail=(
                "Receipt must be a JPG, "
                "JPEG, PNG, or PDF file."
            ),
        )


    return extension


def _receipt_path(
    stored_file_name: str,
) -> Path:

    receipt_root = (
        RECEIPT_DIR
        .resolve()
    )


    path = (
        RECEIPT_DIR /
        stored_file_name
    ).resolve()


    if path.parent != receipt_root:

        raise HTTPException(
            status_code=500,

            detail=(
                "Receipt storage path is invalid."
            ),
        )


    return path


def _worked_hours_from_sessions(
    rows: list[sqlite3.Row],
) -> float:

    total_seconds = 0.0


    for row in rows:

        if not row["endedAt"]:
            continue


        try:

            started = (
                datetime.fromisoformat(
                    row[
                        "startedAt"
                    ].replace(
                        "Z",
                        "+00:00",
                    )
                )
            )


            ended = (
                datetime.fromisoformat(
                    row[
                        "endedAt"
                    ].replace(
                        "Z",
                        "+00:00",
                    )
                )
            )

        except ValueError:
            continue


        total_seconds += max(
            0.0,

            (
                ended -
                started
            ).total_seconds(),
        )


    return (
        total_seconds /
        3600
    )


def _friendly_date(
    value: str,
) -> str:

    try:

        if "T" in value:

            parsed = datetime.fromisoformat(
                value.replace(
                    "Z",
                    "+00:00",
                )
            )

        else:

            parsed = datetime.strptime(
                value,
                "%Y-%m-%d",
            )


        return (
            parsed
            .strftime(
                "%B %d, %Y"
            )
            .replace(
                " 0",
                " ",
            )
        )

    except ValueError:

        return value


def _pdf_text(
    value: str | None,
) -> str:

    return (
        escape(
            value or ""
        )
        .replace(
            "\n",
            "<br/>",
        )
    )


def _labor_description(
    job: sqlite3.Row,
    sessions: list[sqlite3.Row],
) -> str:

    if (
        job[
            "pricingType"
        ] == "fixed"
    ):
        return "Labor - Fixed price"


    rate = job[
        "hourlyRate"
    ]


    if rate is None:
        return "Labor - Hourly"


    hours = (
        _worked_hours_from_sessions(
            sessions
        )
    )


    if hours > 0:

        return (
            f"Labor - "
            f"{hours:.2f} hours "
            f"@ ${rate:,.2f}/hr"
        )


    return (
        f"Labor @ "
        f"${rate:,.2f}/hr"
    )


def _labor_amount(
    job: sqlite3.Row,
    sessions: list[sqlite3.Row],
) -> float:
    """
    Calculate the labor portion of an invoice.

    Fixed-price jobs use their agreed fixed price.
    Hourly jobs use all completed work sessions.
    """

    if (
        job[
            "pricingType"
        ] == "fixed"
    ):

        return round(
            float(
                job[
                    "fixedPrice"
                ] or 0
            ),
            2,
        )


    rate = float(
        job[
            "hourlyRate"
        ] or 0
    )


    hours = (
        _worked_hours_from_sessions(
            sessions
        )
    )


    return round(
        hours * rate,
        2,
    )


# ---------------------------------------------------------
# Invoice PDF
# ---------------------------------------------------------

def _generate_invoice_pdf(
    invoice_id: str,
) -> tuple[Path, str]:

    connection = get_db_connection()


    try:

        invoice = connection.execute(
            """
            SELECT *
            FROM invoices
            WHERE id = ?
            """,

            (
                invoice_id,
            ),
        ).fetchone()


        if invoice is None:

            raise HTTPException(
                status_code=404,
                detail="Invoice not found.",
            )


        customer = connection.execute(
            """
            SELECT *
            FROM customers
            WHERE id = ?
            """,

            (
                invoice[
                    "customerId"
                ],
            ),
        ).fetchone()


        job = connection.execute(
            """
            SELECT *
            FROM jobs
            WHERE id = ?
            """,

            (
                invoice[
                    "jobId"
                ],
            ),
        ).fetchone()


        business = connection.execute(
            """
            SELECT *
            FROM business_info
            WHERE id = 1
            """
        ).fetchone()


        sessions = connection.execute(
            """
            SELECT *
            FROM work_sessions
            WHERE jobId = ?
            ORDER BY startedAt ASC
            """,

            (
                invoice[
                    "jobId"
                ],
            ),
        ).fetchall()


        materials = connection.execute(
            """
            SELECT *
            FROM materials
            WHERE jobId = ?
            ORDER BY description COLLATE NOCASE ASC
            """,

            (
                invoice[
                    "jobId"
                ],
            ),
        ).fetchall()

    finally:

        connection.close()


    if (
        customer is None or
        job is None
    ):

        raise HTTPException(
            status_code=500,

            detail=(
                "Invoice is missing its "
                "customer or job record."
            ),
        )


    # -----------------------------------------------------
    # Invoice amount breakdown
    # -----------------------------------------------------

    labor_amount = _labor_amount(
        job,
        sessions,
    )


    material_total = sum(
        float(
            material[
                "quantity"
            ]
        )
        *
        float(
            material[
                "unitCost"
            ]
        )

        for material in materials
    )


    material_total = round(
        material_total,
        2,
    )


    calculated_total = round(
        labor_amount +
        material_total,
        2,
    )


    # The saved invoice amount remains authoritative.
    #
    # This keeps old or manually edited invoices internally
    # consistent even if the current job data later changes.
    adjustment_amount = round(
        float(
            invoice[
                "amount"
            ]
        )
        -
        calculated_total,
        2,
    )


    INVOICE_PDF_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )


    safe_number = re.sub(
        r"[^A-Za-z0-9_.-]+",
        "_",
        invoice[
            "invoiceNumber"
        ],
    )


    filename = (
        f"{safe_number}.pdf"
    )


    pdf_path = (
        INVOICE_PDF_DIR /
        filename
    )


    styles = (
        getSampleStyleSheet()
    )


    normal = ParagraphStyle(
        "InvoiceNormal",

        parent=
            styles["Normal"],

        fontName=
            "Helvetica",

        fontSize=
            9.5,

        leading=
            13,

        textColor=
            colors.HexColor(
                "#344054"
            ),
    )


    small = ParagraphStyle(
        "InvoiceSmall",

        parent=
            normal,

        fontSize=
            8.5,

        leading=
            11,

        textColor=
            colors.HexColor(
                "#667085"
            ),
    )


    heading = ParagraphStyle(
        "InvoiceHeading",

        parent=
            styles[
                "Heading1"
            ],

        fontName=
            "Helvetica-Bold",

        fontSize=
            22,

        leading=
            25,

        textColor=
            colors.HexColor(
                "#183153"
            ),

        spaceAfter=
            4,
    )


    section_label = ParagraphStyle(
        "InvoiceSectionLabel",

        parent=
            small,

        fontName=
            "Helvetica-Bold",

        fontSize=
            8,

        leading=
            10,

        textColor=
            colors.HexColor(
                "#667085"
            ),
    )


    right = ParagraphStyle(
        "InvoiceRight",

        parent=
            normal,

        alignment=
            TA_RIGHT,
    )


    right_small = ParagraphStyle(
        "InvoiceRightSmall",

        parent=
            small,

        alignment=
            TA_RIGHT,
    )


    business_name = (

        (
            business[
                "businessName"
            ]
            if business
            else ""
        )

        or

        (
            business[
                "ownerName"
            ]
            if business
            else ""
        )

        or

        "WorkBooks Invoice"
    )


    business_lines = []


    if business:

        if (
            business[
                "ownerName"
            ] and

            business[
                "ownerName"
            ] != business_name
        ):

            business_lines.append(
                _pdf_text(
                    business[
                        "ownerName"
                    ]
                )
            )


        for field in (
            "address",
            "phone",
            "email",
        ):

            if business[
                field
            ]:

                business_lines.append(
                    _pdf_text(
                        business[
                            field
                        ]
                    )
                )


    customer_lines = [

        (
            "<b>" +
            _pdf_text(
                customer[
                    "name"
                ]
            ) +
            "</b>"
        )
    ]


    for field in (
        "address",
        "phone",
        "email",
    ):

        if customer[
            field
        ]:

            customer_lines.append(
                _pdf_text(
                    customer[
                        field
                    ]
                )
            )


    doc = SimpleDocTemplate(
        str(
            pdf_path
        ),

        pagesize=
            letter,

        rightMargin=
            0.65 *
            inch,

        leftMargin=
            0.65 *
            inch,

        topMargin=
            0.6 *
            inch,

        bottomMargin=
            0.6 *
            inch,

        title=
            invoice[
                "invoiceNumber"
            ],

        author=
            business_name,
    )


    story = []


    header = Table(

        [
            [
                [
                    Paragraph(
                        _pdf_text(
                            business_name
                        ),
                        heading,
                    ),

                    (
                        Paragraph(
                            "<br/>".join(
                                business_lines
                            ),
                            small,
                        )
                        if business_lines
                        else Spacer(
                            1,
                            1,
                        )
                    ),
                ],

                [
                    Paragraph(
                        "INVOICE",

                        ParagraphStyle(
                            "InvoiceWord",

                            parent=
                                heading,

                            alignment=
                                TA_RIGHT,
                        ),
                    ),

                    Paragraph(
                        (
                            "<b>" +
                            _pdf_text(
                                invoice[
                                    "invoiceNumber"
                                ]
                            ) +
                            "</b>"
                        ),

                        right,
                    ),

                    Paragraph(
                        (
                            "Date: " +
                            _friendly_date(
                                invoice[
                                    "createdAt"
                                ]
                            )
                        ),

                        right_small,
                    ),

                    Paragraph(
                        (
                            "Due: " +
                            _friendly_date(
                                invoice[
                                    "dueDate"
                                ]
                            )
                        ),

                        right_small,
                    ),
                ],
            ]
        ],

        colWidths=[
            4.45 * inch,
            2.1 * inch,
        ],
    )


    header.setStyle(
        TableStyle(
            [
                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "TOP",
                ),

                (
                    "LEFTPADDING",
                    (0, 0),
                    (-1, -1),
                    0,
                ),

                (
                    "RIGHTPADDING",
                    (0, 0),
                    (-1, -1),
                    0,
                ),

                (
                    "TOPPADDING",
                    (0, 0),
                    (-1, -1),
                    0,
                ),

                (
                    "BOTTOMPADDING",
                    (0, 0),
                    (-1, -1),
                    0,
                ),
            ]
        )
    )


    story.append(
        header
    )


    story.append(
        Spacer(
            1,
            0.28 * inch,
        )
    )


    story.append(
        Table(

            [
                [
                    [
                        Paragraph(
                            "BILL TO",
                            section_label,
                        ),

                        Spacer(
                            1,
                            5,
                        ),

                        Paragraph(
                            "<br/>".join(
                                customer_lines
                            ),
                            normal,
                        ),
                    ],

                    [
                        Paragraph(
                            "JOB",
                            section_label,
                        ),

                        Spacer(
                            1,
                            5,
                        ),

                        Paragraph(
                            (
                                "<b>" +
                                _pdf_text(
                                    job[
                                        "description"
                                    ]
                                ) +
                                "</b>"
                            ),

                            normal,
                        ),

                        Paragraph(
                            _friendly_date(
                                job[
                                    "scheduledDate"
                                ]
                            ),

                            small,
                        ),
                    ],
                ]
            ],

            colWidths=[
                3.65 * inch,
                2.9 * inch,
            ],

            style=TableStyle(
                [
                    (
                        "VALIGN",
                        (0, 0),
                        (-1, -1),
                        "TOP",
                    ),

                    (
                        "BACKGROUND",
                        (0, 0),
                        (-1, -1),
                        colors.HexColor(
                            "#F7F8FA"
                        ),
                    ),

                    (
                        "BOX",
                        (0, 0),
                        (-1, -1),
                        0.6,
                        colors.HexColor(
                            "#E2E5E9"
                        ),
                    ),

                    (
                        "INNERGRID",
                        (0, 0),
                        (-1, -1),
                        0.6,
                        colors.HexColor(
                            "#E2E5E9"
                        ),
                    ),

                    (
                        "LEFTPADDING",
                        (0, 0),
                        (-1, -1),
                        12,
                    ),

                    (
                        "RIGHTPADDING",
                        (0, 0),
                        (-1, -1),
                        12,
                    ),

                    (
                        "TOPPADDING",
                        (0, 0),
                        (-1, -1),
                        11,
                    ),

                    (
                        "BOTTOMPADDING",
                        (0, 0),
                        (-1, -1),
                        11,
                    ),
                ]
            ),
        )
    )


    story.append(
        Spacer(
            1,
            0.3 * inch,
        )
    )


    # -----------------------------------------------------
    # Invoice line items
    # -----------------------------------------------------

    line_item_data = [
        [
            Paragraph(
                "DESCRIPTION",
                section_label,
            ),

            Paragraph(
                "AMOUNT",

                ParagraphStyle(
                    "InvoiceAmountLabel",

                    parent=
                        section_label,

                    alignment=
                        TA_RIGHT,
                ),
            ),
        ],
    ]


    line_item_data.append(
        [
            Paragraph(
                _pdf_text(
                    _labor_description(
                        job,
                        sessions,
                    )
                ),

                normal,
            ),

            Paragraph(
                f"${labor_amount:,.2f}",
                right,
            ),
        ]
    )


    for material in materials:

        quantity = float(
            material[
                "quantity"
            ]
        )

        unit_cost = float(
            material[
                "unitCost"
            ]
        )

        material_amount = round(
            quantity *
            unit_cost,
            2,
        )


        description = (
            f"Material - "
            f"{material['description']} "
            f"({quantity:g} × "
            f"${unit_cost:,.2f})"
        )


        line_item_data.append(
            [
                Paragraph(
                    _pdf_text(
                        description
                    ),

                    normal,
                ),

                Paragraph(
                    f"${material_amount:,.2f}",
                    right,
                ),
            ]
        )


    # This normally appears only for an older or manually
    # edited invoice whose saved total differs from the
    # current labor/material records.
    if abs(
        adjustment_amount
    ) >= 0.01:

        line_item_data.append(
            [
                Paragraph(
                    "Invoice adjustment",
                    normal,
                ),

                Paragraph(
                    f"${adjustment_amount:,.2f}",
                    right,
                ),
            ]
        )


    line_items = Table(
        line_item_data,

        colWidths=[
            5.35 * inch,
            1.2 * inch,
        ],
    )


    line_items.setStyle(
        TableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.HexColor(
                        "#183153"
                    ),
                ),

                (
                    "TEXTCOLOR",
                    (0, 0),
                    (-1, 0),
                    colors.white,
                ),

                (
                    "LINEBELOW",
                    (0, 1),
                    (-1, -1),
                    0.7,
                    colors.HexColor(
                        "#E2E5E9"
                    ),
                ),

                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "TOP",
                ),

                (
                    "LEFTPADDING",
                    (0, 0),
                    (-1, -1),
                    10,
                ),

                (
                    "RIGHTPADDING",
                    (0, 0),
                    (-1, -1),
                    10,
                ),

                (
                    "TOPPADDING",
                    (0, 0),
                    (-1, -1),
                    9,
                ),

                (
                    "BOTTOMPADDING",
                    (0, 0),
                    (-1, -1),
                    9,
                ),
            ]
        )
    )


    story.append(
        line_items
    )


    story.append(
        Spacer(
            1,
            0.22 * inch,
        )
    )


    totals = Table(

        [
            [
                Paragraph(
                    "LABOR",
                    section_label,
                ),

                Paragraph(
                    f"${labor_amount:,.2f}",
                    right,
                ),
            ],

            [
                Paragraph(
                    "MATERIALS",
                    section_label,
                ),

                Paragraph(
                    f"${material_total:,.2f}",
                    right,
                ),
            ],

            [
                Paragraph(
                    "TOTAL",
                    section_label,
                ),

                Paragraph(
                    (
                        f"<b>"
                        f"${invoice['amount']:,.2f}"
                        f"</b>"
                    ),

                    right,
                ),
            ],

            [
                Paragraph(
                    "STATUS",
                    section_label,
                ),

                Paragraph(
                    _pdf_text(
                        invoice[
                            "status"
                        ].title()
                    ),

                    right,
                ),
            ],
        ],

        colWidths=[
            1.15 * inch,
            1.55 * inch,
        ],

        hAlign=
            "RIGHT",
    )


    totals.setStyle(
        TableStyle(
            [
                (
                    "LINEABOVE",
                    (0, 0),
                    (-1, 0),
                    1,
                    colors.HexColor(
                        "#183153"
                    ),
                ),

                (
                    "LEFTPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),

                (
                    "RIGHTPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),

                (
                    "TOPPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),

                (
                    "BOTTOMPADDING",
                    (0, 0),
                    (-1, -1),
                    6,
                ),
            ]
        )
    )


    story.append(
        totals
    )


    if (
        business and
        business[
            "paymentInstructions"
        ]
    ):

        story.append(
            Spacer(
                1,
                0.32 * inch,
            )
        )

        story.append(
            Paragraph(
                "PAYMENT",
                section_label,
            )
        )

        story.append(
            Spacer(
                1,
                5,
            )
        )

        story.append(
            Paragraph(
                _pdf_text(
                    business[
                        "paymentInstructions"
                    ]
                ),

                normal,
            )
        )


    story.append(
        Spacer(
            1,
            0.38 * inch,
        )
    )


    story.append(
        Paragraph(
            "Thank you for your business!",

            ParagraphStyle(
                "InvoiceThanks",

                parent=
                    normal,

                fontName=
                    "Helvetica-Bold",

                textColor=
                    colors.HexColor(
                        "#183153"
                    ),
            ),
        )
    )


    doc.build(
        story
    )


    return (
        pdf_path,
        filename,
    )


# ---------------------------------------------------------
# Startup
# ---------------------------------------------------------

@app.on_event(
    "startup"
)
def startup_event():

    create_database()


# ---------------------------------------------------------
# POST requests
# ---------------------------------------------------------

@app.post(
    "/customers"
)
def create_customer(
    customer: Customer,
):

    customer = _normalize_customer(
        customer
    )


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

        connection.rollback()


        raise HTTPException(
            status_code=409,

            detail=(
                "Could not create customer. "
                "That customer ID already exists."
            ),
        ) from error

    finally:

        connection.close()


    return {
        "message":
            "Customer created successfully.",
    }


@app.post(
    "/jobs"
)
def create_job(
    job: Job,
):

    job = _normalize_job(
        job
    )


    connection = get_db_connection()


    try:

        if not _customer_exists(
            connection,
            job.customerId,
        ):

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
            """
            SELECT *
            FROM jobs
            WHERE id = ?
            """,

            (
                job.id,
            ),
        ).fetchone()


        return _serialize_job(
            connection,
            row,
        )

    except sqlite3.IntegrityError as error:

        connection.rollback()


        raise HTTPException(
            status_code=409,

            detail=(
                "Could not create job. "
                "That job or work-session ID "
                "already exists."
            ),
        ) from error

    finally:

        connection.close()


@app.post(
    "/materials"
)
def create_material(
    material: Material,
):

    material = _normalize_material(
        material
    )


    connection = get_db_connection()


    try:

        if not _job_exists(
            connection,
            material.jobId,
        ):

            raise HTTPException(
                status_code=404,
                detail="Job not found.",
            )


        if (
            material.receiptId and

            not _receipt_belongs_to_job(
                connection,
                material.receiptId,
                material.jobId,
            )
        ):

            raise HTTPException(
                status_code=400,

                detail=(
                    "Receipt does not exist "
                    "or does not belong to this job."
                ),
            )


        connection.execute(
            """
            INSERT INTO materials (
                id,
                jobId,
                description,
                quantity,
                unitCost,
                receiptId
            )

            VALUES (?, ?, ?, ?, ?, ?)
            """,

            (
                material.id,
                material.jobId,
                material.description,
                material.quantity,
                material.unitCost,
                material.receiptId,
            ),
        )


        connection.commit()


        row = connection.execute(
            """
            SELECT *
            FROM materials
            WHERE id = ?
            """,

            (
                material.id,
            ),
        ).fetchone()


        return _serialize_material(
            row
        )

    except sqlite3.IntegrityError as error:

        connection.rollback()


        raise HTTPException(
            status_code=409,

            detail=(
                "Could not create material. "
                "That material ID may already exist."
            ),
        ) from error

    finally:

        connection.close()


@app.post(
    "/jobs/{job_id}/receipts"
)
async def create_receipt(
    job_id: str,

    file:
        UploadFile = File(...),

    vendor:
        str = Form(""),

    purchaseDate:
        str = Form(""),

    notes:
        str = Form(""),
):

    job_id = _require_id(
        job_id,
        "Job ID",
    )


    original_name = Path(
        file.filename or ""
    ).name


    if not original_name:

        raise HTTPException(
            status_code=400,

            detail=(
                "Receipt file name is required."
            ),
        )


    extension = _receipt_extension(
        original_name
    )


    receipt_id = str(
        uuid4()
    )


    stored_name = (
        f"{receipt_id}{extension}"
    )


    stored_path = _receipt_path(
        stored_name
    )


    clean_vendor = (

        _clean_text(
            vendor
        )

        if vendor.strip()

        else None
    )


    clean_date = _normalize_optional_date(
        purchaseDate,
        "Receipt purchase date",
    )


    clean_notes = (

        _clean_multiline_text(
            notes
        )

        if notes.strip()

        else None
    )


    connection = get_db_connection()


    try:

        if not _job_exists(
            connection,
            job_id,
        ):

            raise HTTPException(
                status_code=404,
                detail="Job not found.",
            )


        RECEIPT_DIR.mkdir(
            parents=True,
            exist_ok=True,
        )


        bytes_written = 0


        try:

            with stored_path.open(
                "xb"
            ) as output:

                while True:

                    chunk = await file.read(
                        1024 *
                        1024
                    )


                    if not chunk:
                        break


                    bytes_written += len(
                        chunk
                    )


                    if (
                        bytes_written >
                        _MAX_RECEIPT_BYTES
                    ):

                        raise HTTPException(
                            status_code=413,

                            detail=(
                                "Receipt file is too large. "
                                "Maximum size is 20 MB."
                            ),
                        )


                    output.write(
                        chunk
                    )

        except HTTPException:

            stored_path.unlink(
                missing_ok=True
            )

            raise

        except OSError as error:

            stored_path.unlink(
                missing_ok=True
            )


            raise HTTPException(
                status_code=500,

                detail=(
                    "Could not save the receipt file."
                ),
            ) from error

        finally:

            await file.close()


        if bytes_written == 0:

            stored_path.unlink(
                missing_ok=True
            )


            raise HTTPException(
                status_code=400,

                detail=(
                    "Receipt file is empty."
                ),
            )


        try:

            connection.execute(
                """
                INSERT INTO receipts (
                    id,
                    jobId,
                    fileName,
                    storedFileName,
                    vendor,
                    purchaseDate,
                    notes
                )

                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,

                (
                    receipt_id,
                    job_id,
                    original_name,
                    stored_name,
                    clean_vendor,
                    clean_date,
                    clean_notes,
                ),
            )


            connection.commit()

        except sqlite3.IntegrityError as error:

            connection.rollback()


            stored_path.unlink(
                missing_ok=True
            )


            raise HTTPException(
                status_code=409,

                detail=(
                    "Could not save receipt metadata."
                ),
            ) from error


        row = connection.execute(
            """
            SELECT *
            FROM receipts
            WHERE id = ?
            """,

            (
                receipt_id,
            ),
        ).fetchone()


        return _serialize_receipt(
            row
        )

    finally:

        connection.close()


@app.post(
    "/invoices"
)
def create_invoice(
    invoice: Invoice,
):

    invoice = _normalize_invoice(
        invoice
    )


    connection = get_db_connection()


    try:

        if not _customer_exists(
            connection,
            invoice.customerId,
        ):

            raise HTTPException(
                status_code=404,
                detail="Customer not found.",
            )


        job_row = connection.execute(
            """
            SELECT
                customerId,
                status

            FROM jobs

            WHERE id = ?
            """,

            (
                invoice.jobId,
            ),
        ).fetchone()


        if job_row is None:

            raise HTTPException(
                status_code=404,
                detail="Job not found.",
            )


        if (
            job_row[
                "customerId"
            ] != invoice.customerId
        ):

            raise HTTPException(
                status_code=400,

                detail=(
                    "Invoice customer does "
                    "not match the job customer."
                ),
            )


        if (
            job_row[
                "status"
            ] != "completed"
        ):

            raise HTTPException(
                status_code=400,

                detail=(
                    "Only completed jobs "
                    "can be invoiced."
                ),
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

        connection.rollback()


        raise HTTPException(
            status_code=409,

            detail=(
                "Could not create invoice. "
                "The invoice number may already "
                "exist, or this job may already "
                "have an invoice."
            ),
        ) from error

    finally:

        connection.close()


    return {
        "message":
            "Invoice created successfully.",
    }


# ---------------------------------------------------------
# PUT requests
# ---------------------------------------------------------

@app.put(
    "/business-info"
)
def update_business_info(
    info: BusinessInfo,
):

    info = _normalize_business_info(
        info
    )


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
                info.businessName,
                info.ownerName,
                info.phone,
                info.email,
                info.address,
                info.paymentInstructions,
            ),
        )


        connection.commit()

    finally:

        connection.close()


    return info.model_dump()


@app.put(
    "/customers/{customer_id}"
)
def update_customer(
    customer_id: str,
    customer: Customer,
):

    if customer.id != customer_id:

        raise HTTPException(
            status_code=400,

            detail=(
                "Customer ID in the URL "
                "does not match the customer body."
            ),
        )


    customer = _normalize_customer(
        customer
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


    return customer.model_dump(
        exclude_none=True
    )


@app.put(
    "/jobs/{job_id}"
)
def update_job(
    job_id: str,
    job: Job,
):

    if job.id != job_id:

        raise HTTPException(
            status_code=400,

            detail=(
                "Job ID in the URL does not "
                "match the job body."
            ),
        )


    job = _normalize_job(
        job
    )


    connection = get_db_connection()


    try:

        if not _customer_exists(
            connection,
            job.customerId,
        ):

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
            """
            SELECT *
            FROM jobs
            WHERE id = ?
            """,

            (
                job_id,
            ),
        ).fetchone()


        return _serialize_job(
            connection,
            row,
        )

    except sqlite3.IntegrityError as error:

        connection.rollback()


        raise HTTPException(
            status_code=409,

            detail=(
                "Could not update job. "
                "A work-session ID may "
                "already be in use."
            ),
        ) from error

    finally:

        connection.close()


@app.put(
    "/materials/{material_id}"
)
def update_material(
    material_id: str,
    material: Material,
):

    if material.id != material_id:

        raise HTTPException(
            status_code=400,

            detail=(
                "Material ID in the URL does "
                "not match the material body."
            ),
        )


    material = _normalize_material(
        material
    )


    connection = get_db_connection()


    try:

        existing = connection.execute(
            """
            SELECT *
            FROM materials
            WHERE id = ?
            """,

            (
                material_id,
            ),
        ).fetchone()


        if existing is None:

            raise HTTPException(
                status_code=404,
                detail="Material not found.",
            )


        if (
            existing[
                "jobId"
            ] != material.jobId
        ):

            raise HTTPException(
                status_code=400,

                detail=(
                    "A material cannot be moved "
                    "to a different job."
                ),
            )


        if (
            material.receiptId and

            not _receipt_belongs_to_job(
                connection,
                material.receiptId,
                material.jobId,
            )
        ):

            raise HTTPException(
                status_code=400,

                detail=(
                    "Receipt does not exist "
                    "or does not belong to this job."
                ),
            )


        connection.execute(
            """
            UPDATE materials

            SET
                description = ?,
                quantity = ?,
                unitCost = ?,
                receiptId = ?

            WHERE id = ?
            """,

            (
                material.description,
                material.quantity,
                material.unitCost,
                material.receiptId,
                material_id,
            ),
        )


        connection.commit()


        row = connection.execute(
            """
            SELECT *
            FROM materials
            WHERE id = ?
            """,

            (
                material_id,
            ),
        ).fetchone()


        return _serialize_material(
            row
        )

    except sqlite3.IntegrityError as error:

        connection.rollback()


        raise HTTPException(
            status_code=409,
            detail="Could not update material.",
        ) from error

    finally:

        connection.close()


@app.put(
    "/invoices/{invoice_id}"
)
def update_invoice(
    invoice_id: str,
    invoice: Invoice,
):

    if invoice.id != invoice_id:

        raise HTTPException(
            status_code=400,

            detail=(
                "Invoice ID in the URL does "
                "not match the invoice body."
            ),
        )


    invoice = _normalize_invoice(
        invoice
    )


    connection = get_db_connection()


    try:

        existing = connection.execute(
            """
            SELECT *
            FROM invoices
            WHERE id = ?
            """,

            (
                invoice_id,
            ),
        ).fetchone()


        if existing is None:

            raise HTTPException(
                status_code=404,
                detail="Invoice not found.",
            )


        immutable_fields = (
            "invoiceNumber",
            "customerId",
            "jobId",
            "createdAt",
        )


        for field in immutable_fields:

            if (
                existing[field] !=
                getattr(
                    invoice,
                    field,
                )
            ):

                raise HTTPException(
                    status_code=400,

                    detail=(
                        f"Invoice field "
                        f"'{field}' cannot be changed."
                    ),
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
            """
            SELECT *
            FROM invoices
            WHERE id = ?
            """,

            (
                invoice_id,
            ),
        ).fetchone()


        return dict(
            row
        )

    finally:

        connection.close()


# ---------------------------------------------------------
# DELETE requests
# ---------------------------------------------------------

@app.delete(
    "/receipts/{receipt_id}"
)
def delete_receipt(
    receipt_id: str,
):

    connection = get_db_connection()


    try:

        row = connection.execute(
            """
            SELECT *
            FROM receipts
            WHERE id = ?
            """,

            (
                receipt_id,
            ),
        ).fetchone()


        if row is None:

            raise HTTPException(
                status_code=404,
                detail="Receipt not found.",
            )


        stored_path = _receipt_path(
            row[
                "storedFileName"
            ]
        )


        connection.execute(
            """
            DELETE FROM receipts
            WHERE id = ?
            """,

            (
                receipt_id,
            ),
        )


        connection.commit()


        # materials.receiptId uses ON DELETE SET NULL,
        # so deleting a receipt leaves the material itself.
        try:

            stored_path.unlink(
                missing_ok=True
            )

        except OSError:

            # Do not undo the database delete just because
            # Windows temporarily has the file locked.
            pass

    finally:

        connection.close()


    return {
        "message":
            "Receipt deleted successfully.",
    }


@app.delete(
    "/materials/{material_id}"
)
def delete_material(
    material_id: str,
):

    connection = get_db_connection()


    try:

        cursor = connection.execute(
            """
            DELETE FROM materials
            WHERE id = ?
            """,

            (
                material_id,
            ),
        )


        if cursor.rowcount == 0:

            raise HTTPException(
                status_code=404,
                detail="Material not found.",
            )


        connection.commit()

    finally:

        connection.close()


    return {
        "message":
            "Material deleted successfully.",
    }


# ---------------------------------------------------------
# PATCH requests
# ---------------------------------------------------------

@app.patch(
    "/invoices/{invoice_id}/status"
)
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
            """
            SELECT *
            FROM invoices
            WHERE id = ?
            """,

            (
                invoice_id,
            ),
        ).fetchone()


        return dict(
            row
        )

    finally:

        connection.close()


# ---------------------------------------------------------
# GET requests
# ---------------------------------------------------------

@app.get("/")
def root():

    return {
        "message":
            "WorkBooks backend is running!",
    }


@app.get(
    "/business-info"
)
def get_business_info():

    connection = get_db_connection()


    try:

        row = connection.execute(
            """
            SELECT *
            FROM business_info
            WHERE id = 1
            """
        ).fetchone()

    finally:

        connection.close()


    if row is None:

        return (
            BusinessInfo()
            .model_dump()
        )


    result = dict(
        row
    )


    result.pop(
        "id",
        None,
    )


    return result


@app.get(
    "/customers"
)
def get_customers():

    connection = get_db_connection()


    try:

        rows = connection.execute(
            """
            SELECT *
            FROM customers
            """
        ).fetchall()


        return [
            dict(
                row
            )
            for row in rows
        ]

    finally:

        connection.close()


@app.get(
    "/customers/{customer_id}"
)
def get_customer(
    customer_id: str,
):

    connection = get_db_connection()


    try:

        row = connection.execute(
            """
            SELECT *
            FROM customers
            WHERE id = ?
            """,

            (
                customer_id,
            ),
        ).fetchone()

    finally:

        connection.close()


    if row is None:

        raise HTTPException(
            status_code=404,
            detail="Customer not found.",
        )


    return dict(
        row
    )


@app.get(
    "/jobs"
)
def get_jobs():

    connection = get_db_connection()


    try:

        rows = connection.execute(
            """
            SELECT *
            FROM jobs
            """
        ).fetchall()


        return [

            _serialize_job(
                connection,
                row,
            )

            for row in rows
        ]

    finally:

        connection.close()


@app.get(
    "/jobs/{job_id}"
)
def get_job(
    job_id: str,
):

    connection = get_db_connection()


    try:

        row = connection.execute(
            """
            SELECT *
            FROM jobs
            WHERE id = ?
            """,

            (
                job_id,
            ),
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


@app.get(
    "/customers/{customer_id}/jobs"
)
def get_customer_jobs(
    customer_id: str,
):

    connection = get_db_connection()


    try:

        rows = connection.execute(
            """
            SELECT *
            FROM jobs
            WHERE customerId = ?
            """,

            (
                customer_id,
            ),
        ).fetchall()


        return [

            _serialize_job(
                connection,
                row,
            )

            for row in rows
        ]

    finally:

        connection.close()


@app.get(
    "/jobs/{job_id}/receipts"
)
def get_job_receipts(
    job_id: str,
):

    connection = get_db_connection()


    try:

        if not _job_exists(
            connection,
            job_id,
        ):

            raise HTTPException(
                status_code=404,
                detail="Job not found.",
            )


        rows = connection.execute(
            """
            SELECT *
            FROM receipts
            WHERE jobId = ?
            ORDER BY rowid ASC
            """,

            (
                job_id,
            ),
        ).fetchall()


        return [

            _serialize_receipt(
                row
            )

            for row in rows
        ]

    finally:

        connection.close()


@app.get(
    "/receipts/{receipt_id}/file"
)
def get_receipt_file(
    receipt_id: str,
):

    connection = get_db_connection()


    try:

        row = connection.execute(
            """
            SELECT *
            FROM receipts
            WHERE id = ?
            """,

            (
                receipt_id,
            ),
        ).fetchone()

    finally:

        connection.close()


    if row is None:

        raise HTTPException(
            status_code=404,
            detail="Receipt not found.",
        )


    path = _receipt_path(
        row[
            "storedFileName"
        ]
    )


    if not path.is_file():

        raise HTTPException(
            status_code=404,
            detail="Receipt file is missing.",
        )


    media_type = (
        _RECEIPT_EXTENSIONS.get(
            path.suffix.lower(),
            "application/octet-stream",
        )
    )


    return FileResponse(
        path=path,
        media_type=media_type,
        filename=row[
            "fileName"
        ],
    )


@app.get(
    "/jobs/{job_id}/materials"
)
def get_job_materials(
    job_id: str,
):

    connection = get_db_connection()


    try:

        if not _job_exists(
            connection,
            job_id,
        ):

            raise HTTPException(
                status_code=404,
                detail="Job not found.",
            )


        rows = connection.execute(
            """
            SELECT *
            FROM materials
            WHERE jobId = ?
            ORDER BY rowid ASC
            """,

            (
                job_id,
            ),
        ).fetchall()


        return [

            _serialize_material(
                row
            )

            for row in rows
        ]

    finally:

        connection.close()


@app.get(
    "/materials/{material_id}"
)
def get_material(
    material_id: str,
):

    connection = get_db_connection()


    try:

        row = connection.execute(
            """
            SELECT *
            FROM materials
            WHERE id = ?
            """,

            (
                material_id,
            ),
        ).fetchone()

    finally:

        connection.close()


    if row is None:

        raise HTTPException(
            status_code=404,
            detail="Material not found.",
        )


    return _serialize_material(
        row
    )


@app.get(
    "/invoices"
)
def get_invoices():

    connection = get_db_connection()


    try:

        rows = connection.execute(
            """
            SELECT *
            FROM invoices
            ORDER BY createdAt ASC
            """
        ).fetchall()


        return [
            dict(
                row
            )
            for row in rows
        ]

    finally:

        connection.close()


@app.get(
    "/invoices/{invoice_id}/pdf"
)
def download_invoice_pdf(
    invoice_id: str,
):

    pdf_path, filename = (
        _generate_invoice_pdf(
            invoice_id
        )
    )


    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=filename,
    )


@app.get(
    "/invoices/{invoice_id}"
)
def get_invoice(
    invoice_id: str,
):

    connection = get_db_connection()


    try:

        row = connection.execute(
            """
            SELECT *
            FROM invoices
            WHERE id = ?
            """,

            (
                invoice_id,
            ),
        ).fetchone()

    finally:

        connection.close()


    if row is None:

        raise HTTPException(
            status_code=404,
            detail="Invoice not found.",
        )


    return dict(
        row
    )