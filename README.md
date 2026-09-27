# WorkBooks

WorkBooks is a simple business management application designed for independent contractors and small service businesses.

The goal is to provide the essential tools needed to manage customers, jobs, expenses, mileage, invoices, and payments without the complexity of traditional accounting software.

## Project Status

WorkBooks is currently in early development.

The initial version is being developed as a local Windows desktop application. Future versions are planned to support mobile access and self-hosted synchronization.

## Planned Core Features

- Customer management
- Job creation and tracking
- Work time tracking
- Job expenses
- Mileage calculation
- Invoice generation
- Payment tracking
- Basic business financial overview

## Technology

WorkBooks currently uses:

- **React** — user interface
- **TypeScript** — application logic
- **Vite** — frontend development and build tooling
- **Tauri** — native desktop application framework
- **Rust** — native Tauri application layer

The application will use a local database for persistent business data.

## Development

Install the frontend dependencies:

```bash
npm install
```

Run WorkBooks in development mode:

```bash
npm run tauri dev
```

On Windows PowerShell systems where script execution prevents `npm.ps1` from running, use:

```powershell
npm.cmd install
npm.cmd run tauri dev
```

## Roadmap

The first development milestone is:

> Create a customer, create a job for that customer, and display the job on the WorkBooks home screen.

Later development will expand WorkBooks with invoicing, expenses, mileage, reporting, mobile access, backups, and additional business-management tools.