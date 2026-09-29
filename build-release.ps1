$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Always run from the repository root, even if this script
# is launched from another directory.
$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$BackendEntry = Join-Path $RepoRoot "backend\run_backend.py"
$TauriConfig = Join-Path $RepoRoot "src-tauri\tauri.conf.json"

$BuildRoot = Join-Path $RepoRoot "build-release"
$PyInstallerWork = Join-Path $BuildRoot "pyinstaller-work"
$PyInstallerDist = Join-Path $BuildRoot "backend"
$PyInstallerSpec = Join-Path $BuildRoot "spec"
$ReleaseOut = Join-Path $BuildRoot "release"

Write-Host ""
Write-Host "=== WorkBooks Release Build ===" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# Basic checks
# ---------------------------------------------------------------------------

if (-not (Test-Path $Python)) {
    throw "Python virtual environment not found at: $Python"
}

if (-not (Test-Path $BackendEntry)) {
    throw "Backend entry point not found at: $BackendEntry"
}

if (-not (Test-Path $TauriConfig)) {
    throw "Tauri config not found at: $TauriConfig"
}

# ---------------------------------------------------------------------------
# Stop old WorkBooks/backend processes.
#
# This prevents Windows from locking the sidecar executable and also keeps
# an old backend from occupying port 8000 during the build.
# ---------------------------------------------------------------------------

Write-Host "[1/5] Stopping old WorkBooks processes..." -ForegroundColor Yellow

Get-Process workbooks-backend, workbooks -ErrorAction SilentlyContinue |
    Stop-Process -Force

Start-Sleep -Milliseconds 300

# ---------------------------------------------------------------------------
# Prepare temporary build directories.
# ---------------------------------------------------------------------------

Write-Host "[2/5] Preparing build directories..." -ForegroundColor Yellow

if (Test-Path $BuildRoot) {
    Remove-Item $BuildRoot -Recurse -Force
}

New-Item -ItemType Directory -Force $PyInstallerWork | Out-Null
New-Item -ItemType Directory -Force $PyInstallerDist | Out-Null
New-Item -ItemType Directory -Force $PyInstallerSpec | Out-Null
New-Item -ItemType Directory -Force $ReleaseOut | Out-Null

# ---------------------------------------------------------------------------
# Build the Python/FastAPI backend.
# ---------------------------------------------------------------------------

Write-Host "[3/5] Building FastAPI sidecar..." -ForegroundColor Yellow

& $Python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --name workbooks-backend `
    --workpath $PyInstallerWork `
    --distpath $PyInstallerDist `
    --specpath $PyInstallerSpec `
    --collect-all uvicorn `
    --collect-all fastapi `
    --collect-all reportlab `
    $BackendEntry

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller build failed."
}

$BackendExe = Join-Path $PyInstallerDist "workbooks-backend.exe"

if (-not (Test-Path $BackendExe)) {
    throw "Backend executable was not produced: $BackendExe"
}

# ---------------------------------------------------------------------------
# Determine Rust's target triple and copy the backend to the filename Tauri
# expects, e.g.:
#
# workbooks-backend-x86_64-pc-windows-msvc.exe
# ---------------------------------------------------------------------------

Write-Host "[4/5] Preparing Tauri sidecar..." -ForegroundColor Yellow

$RustInfo = & rustc -vV

if ($LASTEXITCODE -ne 0) {
    throw "Could not run rustc -vV."
}

$HostLine = $RustInfo |
    Where-Object { $_ -match "^host:\s+" } |
    Select-Object -First 1

if (-not $HostLine) {
    throw "Could not determine Rust host target."
}

$TargetTriple = ($HostLine -replace "^host:\s+", "").Trim()

$TauriBinaries = Join-Path $RepoRoot "src-tauri\binaries"

New-Item -ItemType Directory -Force $TauriBinaries | Out-Null

$SidecarExe = Join-Path `
    $TauriBinaries `
    "workbooks-backend-$TargetTriple.exe"

Copy-Item $BackendExe $SidecarExe -Force
Unblock-File $SidecarExe -ErrorAction SilentlyContinue

Write-Host "      Sidecar: $SidecarExe"

# ---------------------------------------------------------------------------
# Build Tauri and its Windows installers.
#
# We intentionally do NOT run cargo clean here. Keeping Cargo's incremental
# build cache makes repeated release builds much faster.
# ---------------------------------------------------------------------------

Write-Host "[5/5] Building Tauri release..." -ForegroundColor Yellow

& npm.cmd run tauri build

if ($LASTEXITCODE -ne 0) {
    throw "Tauri release build failed."
}

# ---------------------------------------------------------------------------
# Gather the finished Windows installers into one simple release folder.
# ---------------------------------------------------------------------------

$BundleRoot = Join-Path `
    $RepoRoot `
    "src-tauri\target\release\bundle"

$Installers = @()

if (Test-Path $BundleRoot) {
    $Installers = @(
        Get-ChildItem `
            $BundleRoot `
            -Recurse `
            -File |
            Where-Object {
                $_.Extension -in ".exe", ".msi"
            }
    )
}

if ($Installers.Count -eq 0) {
    throw "Tauri completed, but no Windows installer was found."
}

foreach ($Installer in $Installers) {
    Copy-Item `
        $Installer.FullName `
        (Join-Path $ReleaseOut $Installer.Name) `
        -Force
}

Write-Host ""
Write-Host "=== Release build complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Installers:" -ForegroundColor Green

Get-ChildItem $ReleaseOut -File |
    ForEach-Object {
        Write-Host "  $($_.FullName)"
    }

Write-Host ""
