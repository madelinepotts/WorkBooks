import os
import sys
from pathlib import Path


def get_data_dir() -> Path:
    """
    Return the folder WorkBooks should use for persistent local data.

    During normal development we keep using backend/ so the existing
    workbooks.db continues to work exactly as it does now.

    In a packaged PyInstaller build, __file__ may point inside a temporary
    extraction folder. In that case, store data in the user's Local AppData
    folder instead so the database, invoice PDFs, and receipts survive
    app restarts and upgrades.
    """
    override = os.environ.get(
        "WORKBOOKS_DATA_DIR"
    )

    if override:
        data_dir = Path(
            override
        ).expanduser()

    elif getattr(
        sys,
        "frozen",
        False,
    ):
        local_appdata = os.environ.get(
            "LOCALAPPDATA"
        )

        if local_appdata:
            data_dir = (
                Path(local_appdata) /
                "WorkBooks"
            )
        else:
            data_dir = (
                Path.home() /
                ".workbooks"
            )

    else:
        data_dir = (
            Path(__file__)
            .resolve()
            .parent
        )

    data_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    return data_dir


DATA_DIR = get_data_dir()


# SQLite database.
DATABASE_PATH = (
    DATA_DIR /
    "workbooks.db"
)


# Generated invoice PDFs.
INVOICE_PDF_DIR = (
    DATA_DIR /
    "invoices"
)


# Copies of uploaded receipt files.
RECEIPT_DIR = (
    DATA_DIR /
    "receipts"
)


INVOICE_PDF_DIR.mkdir(
    parents=True,
    exist_ok=True,
)


RECEIPT_DIR.mkdir(
    parents=True,
    exist_ok=True,
)