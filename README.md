# WorkBooks

WorkBooks is a lightweight, self-hosted business management app for independent contractors.

It is designed around a simple workflow for users who do not want complicated business software:

**Customer → Job → Work Sessions → Invoice → Payment**

The current version is focused on small handyman / contractor businesses and provides customer management, scheduling, labor tracking, invoicing, PDF generation, and basic financial tracking.

---

## Features

### Customers

- Create and edit customers
- Store name, phone, email, and address
- Customer-specific job history
- Input validation and automatic formatting
- Phone numbers normalized to `(555) 123-4567`

### Jobs

- Create and edit jobs
- Schedule jobs by date and time
- Search jobs by customer, description, address, date, or status
- Hourly or fixed-price labor
- Job statuses:
  - Scheduled
  - Working
  - Paused
  - Completed

The stored database statuses are:

```text
upcoming
active
completed
```

`Working` and `Paused` are derived from the current work-session state.

### Work Sessions

Jobs can span multiple work periods:

```text
Start Work
    ↓
Pause Work
    ↓
Resume Work
    ↓
Pause Work
    ↓
Finish Job
```

Every Start/Resume → Pause cycle is stored as a separate work session.

This allows jobs to span multiple hours or multiple days without losing labor time.

Work-session timestamps are stored using ISO timestamps.

Example:

```text
2026-09-29T03:15:42.123Z
```

### Pricing

Jobs may use either hourly or fixed-price labor.

Hourly example:

```text
$75.00 / hour
```

The labor total is calculated from all recorded work sessions.

Fixed-price example:

```text
$350.00 fixed price
```

### Invoices

Completed jobs can be converted into invoices.

Invoices include:

- Invoice number
- Customer information
- Job description
- Labor description
- Invoice date
- Due date
- Total
- Payment instructions
- Invoice status

Invoice statuses:

```text
Draft
Sent
Paid
```

### PDF Invoices

Invoices can be exported as PDF files.

The PDF includes the current business information and labor total.

Generated invoice PDFs are treated as output files. SQLite remains the source of truth.

### Finances

The Finances page shows:

- Invoiced
- Paid
- Still Owed
- Ready to Invoice

Completed jobs that have not yet been invoiced appear under **Ready to Invoice**.

---

## Technology

### Frontend

- React
- TypeScript
- Vite

### Desktop Application

- Tauri 2
- Rust

### Backend

- Python
- FastAPI
- Uvicorn

### Database

- SQLite

### PDF Generation

- ReportLab

### Packaging

- PyInstaller
- Tauri NSIS / MSI bundles

---

## Architecture

```text
React / TypeScript
        │
        ▼
     Tauri
        │
        ▼
FastAPI Backend
        │
        ▼
      SQLite
```

The FastAPI backend is packaged as a Tauri sidecar executable.

When WorkBooks starts:

```text
WorkBooks
   │
   └── starts workbooks-backend.exe
```

When WorkBooks closes, the backend process tree is terminated automatically.

---

## Development Setup

### Requirements

Install:

- Python
- Node.js / npm
- Rust
- Cargo
- Tauri prerequisites for Windows

### Clone

```powershell
git clone https://github.com/madelinepotts/WorkBooks.git
cd WorkBooks
```

### Python Environment

Create a virtual environment:

```powershell
python -m venv .venv
```

Install backend dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Install PyInstaller:

```powershell
.\.venv\Scripts\python.exe -m pip install pyinstaller
```

### Frontend Dependencies

```powershell
npm.cmd install
```

`npm.cmd` is used instead of `npm` because some Windows PowerShell configurations block `npm.ps1`.

---

## Running in Development

Normally the Tauri app starts the packaged FastAPI sidecar automatically.

Run:

```powershell
npm.cmd run tauri dev
```

The frontend development server runs at:

```text
http://localhost:1420
```

The backend runs at:

```text
http://127.0.0.1:8000
```

### Running FastAPI Manually

For backend development or debugging:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

Do not run the manual backend at the same time as the Tauri-managed backend because both use port `8000`.

To check whether something is using the port:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
```

To stop old WorkBooks processes:

```powershell
Get-Process workbooks-backend, workbooks -ErrorAction SilentlyContinue |
    Stop-Process -Force
```

---

## Persistent Data

### Development

During development, WorkBooks uses:

```text
backend\workbooks.db
```

Invoice PDFs are stored under:

```text
backend\invoices\
```

### Installed Application

Installed release builds use:

```text
%LOCALAPPDATA%\WorkBooks\
```

Example:

```text
C:\Users\<username>\AppData\Local\WorkBooks\
```

The directory contains:

```text
workbooks.db
invoices\
```

This keeps business data separate from the installed application files so upgrades do not overwrite customer data.

---

## Building a Release

WorkBooks includes a release build script:

```text
build-release.ps1
```

The script:

1. Stops stale WorkBooks processes
2. Builds the FastAPI backend using PyInstaller
3. Detects the current Rust target
4. Copies the backend into the Tauri sidecar directory
5. Builds the React frontend
6. Builds the Tauri application
7. Generates Windows installers
8. Copies the finished installers into one release folder

### Recommended Release Command

If PowerShell script execution is restricted, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build-release.ps1
```

A convenience wrapper can also be used:

```text
build-release.cmd
```

with:

```bat
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release.ps1"
```

Then releases can be built with:

```powershell
.\build-release.cmd
```

---

## Release Output

Finished installers are copied to:

```text
build-release\release\
```

Tauri also generates its native bundle output under:

```text
src-tauri\target\release\bundle\
```

Typical output:

```text
bundle\
├── msi\
│   └── workbooks_0.1.0_x64_en-US.msi
│
└── nsis\
    └── workbooks_0.1.0_x64-setup.exe
```

For normal Windows installation, the NSIS installer is generally the simplest option:

```text
workbooks_0.1.0_x64-setup.exe
```

---

## Backend Sidecar

The backend is built using PyInstaller:

```text
workbooks-backend.exe
```

Tauri requires sidecar binaries to include the Rust target triple.

Example:

```text
workbooks-backend-x86_64-pc-windows-msvc.exe
```

The release build script handles this automatically.

The sidecar is stored under:

```text
src-tauri\binaries\
```

---

## Input Validation

WorkBooks validates data in both the frontend and backend.

### Customers

- Name required
- Address required
- Valid US phone number
- Valid email if supplied
- Whitespace cleaned automatically

### Jobs

- Description required
- Valid scheduled date
- Valid scheduled time when supplied
- Hourly rate must be greater than `$0.00`
- Fixed price must be greater than `$0.00`

### Work Sessions

- Work sessions must belong to the correct job
- Only one work session may be open at a time
- Session end time cannot occur before start time
- Completed jobs cannot contain an open work session

### Invoices

- Amount must be greater than `$0.00`
- Invoice date must be valid
- Due date cannot precede invoice date
- Only completed jobs can be invoiced

---

## Current V1 Workflow

```text
Create Customer
      ↓
Create Job
      ↓
Schedule Job
      ↓
Start Work
      ↓
Pause / Resume as needed
      ↓
Finish Job
      ↓
Create Invoice
      ↓
Generate PDF
      ↓
Mark Paid
```

---

## Planned Post-V1 Features

Possible future additions include:

- Reopen completed jobs
- Edit recorded work sessions
- Materials and receipt tracking
- Mileage tracking
- Backup / restore tools
- More detailed accounting and tax features
- Customer portal
- Emailing invoices
- Cloud / multi-device synchronization
- Additional financial reporting

### Reopening Completed Jobs

A future version may allow:

```text
Completed
   ↓
Reopen Job
   ↓
Paused / Active
   ↓
Additional Work Sessions
```

Existing work sessions would remain intact.

Special handling will be needed when reopening a job that already has an invoice.

---

## Project Structure

```text
WorkBooks/
│
├── backend/
│   ├── app_paths.py
│   ├── database.py
│   ├── main.py
│   ├── run_backend.py
│   ├── requirements.txt
│   └── workbooks.db
│
├── src/
│   ├── api/
│   ├── pages/
│   ├── types/
│   │   ├── Customer.ts
│   │   ├── Jobs.ts
│   │   └── WorkSession.ts
│   └── utils/
│
├── src-tauri/
│   ├── binaries/
│   ├── capabilities/
│   ├── icons/
│   ├── src/
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── build-release.ps1
├── build-release.cmd
├── package.json
└── README.md
```

---

## Git

Before committing a release, check:

```powershell
git status
```

Generated files such as installers, PyInstaller output, databases, and compiled sidecars should normally not be committed.

Recommended `.gitignore` entries:

```gitignore
# Python
.venv/
__pycache__/
*.pyc

# SQLite runtime data
backend/workbooks.db

# Invoice output
backend/invoices/

# Frontend
node_modules/
dist/

# Rust / Tauri
src-tauri/target/

# Release artifacts
build-release/
workbooks-backend.spec
src-tauri/binaries/workbooks-backend-*.exe
```

---

## License

License information has not yet been selected.

---

## Status

WorkBooks is currently in early V1 development.

The core workflow is functional:

- Customers
- Jobs
- Scheduling
- Multi-session work tracking
- Hourly and fixed pricing
- Invoicing
- PDF generation
- Payment tracking
- Local persistence
- Windows desktop packaging
