import {
  useEffect,
  useState,
} from "react";

import { downloadInvoicePdf } from "../api/invoices";
import { getJobMaterials } from "../api/materials";
import { getJobMileage } from "../api/mileage";
import { downloadBackup, restoreBackup } from "../api/backups";

import type { BusinessInfo } from "../types/BusinessInfo";
import type { Customer } from "../types/Customer";
import type { Invoice, InvoiceStatus } from "../types/Invoice";
import type { Job } from "../types/Jobs";
import type { Material } from "../types/Material";
import type { MileageEntry } from "../types/MileageEntry";

import {
  formatMoney,
  getJobAmount,
  getWorkedHours,
} from "../utils/jobTime";
import { useNow } from "../utils/useNow";
import {
  cleanEmail,
  cleanMultilineText,
  cleanText,
  formatPhone,
  isDateOnOrAfter,
  isPositiveMoney,
  isValidDateInput,
  isValidEmail,
  isValidPhone,
  parseMoney,
} from "../utils/formValidation";

type FinancesProps = {
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  businessInfo: BusinessInfo;

  /*
   * These callbacks persist through FastAPI/SQLite before App.tsx
   * updates the local React state.
   */
  onUpdateBusinessInfo: (
    businessInfo: BusinessInfo
  ) => Promise<void>;

  onCreateInvoice: (
    invoice: Invoice
  ) => Promise<void>;

  onUpdateInvoiceStatus: (
    invoiceId: string,
    status: InvoiceStatus
  ) => Promise<void>;

  onUpdateInvoice: (
    invoice: Invoice
  ) => Promise<void>;
};

function Finances({
  customers,
  jobs,
  invoices,
  businessInfo,
  onUpdateBusinessInfo,
  onCreateInvoice,
  onUpdateInvoiceStatus,
  onUpdateInvoice,
}: FinancesProps) {
  const now = useNow();

  /*
   * Materials live in their own SQLite table rather than
   * directly on the Job object.
   *
   * Load the material list for every job when the Finances
   * page opens so invoice totals can include both labor
   * and materials.
   */
  const [
    materialsByJob,
    setMaterialsByJob,
  ] = useState<Record<string, Material[]>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadMaterials() {
      try {
        const entries = await Promise.all(
          jobs.map(async (job) => {
            const materials =
              await getJobMaterials(job.id);

            return [
              job.id,
              materials,
            ] as const;
          }),
        );

        if (!cancelled) {
          setMaterialsByJob(
            Object.fromEntries(entries)
          );
        }
      } catch (error) {
        console.error(
          "Could not load materials for finances:",
          error
        );
      }
    }

    void loadMaterials();

    return () => {
      cancelled = true;
    };
  }, [jobs]);

  /*
   * Mileage is stored separately from the Job object.
   *
   * Load mileage for every job so the Finances page can
   * build a yearly business-mileage summary.
   */
  const [
    mileageByJob,
    setMileageByJob,
  ] = useState<
    Record<string, MileageEntry[]>
  >({});

  const [
    mileageError,
    setMileageError,
  ] = useState("");

  const [
    selectedMileageYear,
    setSelectedMileageYear,
  ] = useState(
    new Date()
      .getFullYear()
      .toString()
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMileage() {
      try {
        const entries = await Promise.all(
          jobs.map(async (job) => {
            const mileage =
              await getJobMileage(job.id);

            return [
              job.id,
              mileage,
            ] as const;
          }),
        );

        if (!cancelled) {
          setMileageByJob(
            Object.fromEntries(entries)
          );

          setMileageError("");
        }
      } catch (error) {
        console.error(
          "Could not load mileage for finances:",
          error
        );

        if (!cancelled) {
          setMileageError(
            "Could not load mileage summary."
          );
        }
      }
    }

    void loadMileage();

    return () => {
      cancelled = true;
    };
  }, [jobs]);

  /*
   * Material totals are calculated rather than stored.
   */
  function getMaterialSubtotal(
    jobId: string
  ): number {
    const materials =
      materialsByJob[jobId] ?? [];

    return materials.reduce(
      (sum, material) =>
        sum +
        material.quantity *
          material.unitCost,
      0
    );
  }

  /*
   * Full invoice value for one job.
   */
  function getInvoiceTotal(
    job: Job
  ): number {
    return (
      getJobAmount(job, now) +
      getMaterialSubtotal(job.id)
    );
  }

  /*
   * Invoice creation state.
   */
  const [
    showInvoiceForm,
    setShowInvoiceForm,
  ] = useState(false);

  const [
    selectedJobId,
    setSelectedJobId,
  ] = useState("");

  const [
    dueDate,
    setDueDate,
  ] = useState("");

  /*
   * Only one invoice is edited at a time to keep
   * the page simple.
   */
  const [
    editingInvoiceId,
    setEditingInvoiceId,
  ] = useState<string | null>(null);

  const [
    editAmount,
    setEditAmount,
  ] = useState("");

  const [
    editDueDate,
    setEditDueDate,
  ] = useState("");

  const [
    editStatus,
    setEditStatus,
  ] = useState<InvoiceStatus>("draft");

  const [
    savingInvoiceId,
    setSavingInvoiceId,
  ] = useState<string | null>(null);

  const [
    downloadingInvoiceId,
    setDownloadingInvoiceId,
  ] = useState<string | null>(null);

  const [
    invoiceError,
    setInvoiceError,
  ] = useState("");

  const [
    invoiceJobError,
    setInvoiceJobError,
  ] = useState("");

  const [
    invoiceDueDateError,
    setInvoiceDueDateError,
  ] = useState("");

  const [
    invoiceAmountError,
    setInvoiceAmountError,
  ] = useState("");

  /*
   * Business information used at the top of every generated
   * PDF invoice.
   *
   * The edit fields are refreshed from the saved values
   * whenever Dad presses Edit.
   */
  const [
    isEditingBusinessInfo,
    setIsEditingBusinessInfo,
  ] = useState(false);

  const [
    businessName,
    setBusinessName,
  ] = useState("");

  const [
    ownerName,
    setOwnerName,
  ] = useState("");

  const [
    businessPhone,
    setBusinessPhone,
  ] = useState("");

  const [
    businessEmail,
    setBusinessEmail,
  ] = useState("");

  const [
    businessAddress,
    setBusinessAddress,
  ] = useState("");

  const [
    paymentInstructions,
    setPaymentInstructions,
  ] = useState("");

  const [
    businessInfoError,
    setBusinessInfoError,
  ] = useState("");

  const [
    businessNameError,
    setBusinessNameError,
  ] = useState("");

  const [
    businessPhoneError,
    setBusinessPhoneError,
  ] = useState("");

  const [
    businessEmailError,
    setBusinessEmailError,
  ] = useState("");

  const [
    businessAddressError,
    setBusinessAddressError,
  ] = useState("");

  const [
    isSavingBusinessInfo,
    setIsSavingBusinessInfo,
  ] = useState(false);

  /*
   * Backup / restore state.
   */
  const [
    isCreatingBackup,
    setIsCreatingBackup,
  ] = useState(false);

  const [
    isRestoringBackup,
    setIsRestoringBackup,
  ] = useState(false);

  const [
    backupMessage,
    setBackupMessage,
  ] = useState("");

  const [
    backupError,
    setBackupError,
  ] = useState("");

  const getCustomer = (
    customerId: string
  ) =>
    customers.find(
      (customer) =>
        customer.id === customerId
    );

  const getJob = (
    jobId: string
  ) =>
    jobs.find(
      (job) =>
        job.id === jobId
    );

  const invoicedJobIds =
    new Set(
      invoices.map(
        (invoice) =>
          invoice.jobId
      )
    );

  /*
   * Jobs that can be turned into invoices.
   */
  const invoiceableJobs = jobs
    .filter((job) => {
      if (
        job.status !== "completed"
      ) {
        return false;
      }

      if (
        invoicedJobIds.has(job.id)
      ) {
        return false;
      }

      if (
        job.pricingType === "fixed"
      ) {
        return (
          job.fixedPrice !== undefined
        );
      }

      return (
        job.hourlyRate !== undefined &&
        (
          job.workSessions?.length ??
          0
        ) > 0
      );
    })
    .sort((a, b) => {
      const aDate =
        a.completedAt ??
        a.scheduledDate;

      const bDate =
        b.completedAt ??
        b.scheduledDate;

      return bDate.localeCompare(
        aDate
      );
    });

  const selectedJob =
    getJob(selectedJobId);

  const selectedCustomer =
    selectedJob
      ? getCustomer(
          selectedJob.customerId
        )
      : undefined;

  /*
   * Break the selected invoice into labor
   * and materials.
   */
  const selectedLaborAmount =
    selectedJob
      ? getJobAmount(
          selectedJob,
          now
        )
      : 0;

  const selectedMaterialAmount =
    selectedJob
      ? getMaterialSubtotal(
          selectedJob.id
        )
      : 0;

  const selectedAmount =
    selectedLaborAmount +
    selectedMaterialAmount;

  /*
   * Used to explain the labor calculation for
   * hourly invoices.
   */
  const selectedWorkedHours =
    selectedJob &&
    selectedJob.pricingType === "hourly"
      ? getWorkedHours(
          selectedJob,
          now
        )
      : 0;

  /*
   * Finance summary values come from saved invoices.
   */
  const totalInvoiced =
    invoices.reduce(
      (sum, invoice) =>
        sum + invoice.amount,
      0
    );

  const totalPaid =
    invoices
      .filter(
        (invoice) =>
          invoice.status === "paid"
      )
      .reduce(
        (sum, invoice) =>
          sum + invoice.amount,
        0
      );

  const outstanding =
    invoices
      .filter(
        (invoice) =>
          invoice.status !== "paid"
      )
      .reduce(
        (sum, invoice) =>
          sum + invoice.amount,
        0
      );

  const completedNotInvoiced =
    jobs
      .filter(
        (job) =>
          job.status === "completed" &&
          !invoicedJobIds.has(job.id)
      )
      .reduce(
        (sum, job) =>
          sum +
          getInvoiceTotal(job),
        0
      );

  /*
   * Flatten all mileage entries while keeping
   * their job association.
   */
  const allMileageEntries =
    jobs.flatMap(
      (job) =>
        (
          mileageByJob[job.id] ??
          []
        ).map(
          (entry) => ({
            ...entry,
            jobId: job.id,
          })
        )
    );

  const mileageYears =
    Array.from(
      new Set(
        allMileageEntries.map(
          (entry) =>
            entry.tripDate.slice(
              0,
              4
            )
        )
      )
    ).sort(
      (a, b) =>
        b.localeCompare(a)
    );

  const currentMileageYear =
    new Date()
      .getFullYear()
      .toString();

  if (
    !mileageYears.includes(
      currentMileageYear
    )
  ) {
    mileageYears.push(
      currentMileageYear
    );

    mileageYears.sort(
      (a, b) =>
        b.localeCompare(a)
    );
  }

  const yearlyMileageEntries =
    allMileageEntries
      .filter(
        (entry) =>
          entry.tripDate.startsWith(
            `${selectedMileageYear}-`
          )
      )
      .sort(
        (a, b) =>
          b.tripDate.localeCompare(
            a.tripDate
          )
      );

  const yearlyMileageTotal =
    yearlyMileageEntries.reduce(
      (sum, entry) =>
        sum + entry.miles,
      0
    );

  /*
   * Fill the business-info form from the current
   * saved values every time Dad opens it.
   */
  function beginBusinessInfoEdit() {
    setBusinessName(
      businessInfo.businessName
    );

    setOwnerName(
      businessInfo.ownerName
    );

    setBusinessPhone(
      businessInfo.phone
    );

    setBusinessEmail(
      businessInfo.email
    );

    setBusinessAddress(
      businessInfo.address
    );

    setPaymentInstructions(
      businessInfo.paymentInstructions
    );

    setBusinessInfoError("");
    setBusinessNameError("");
    setBusinessPhoneError("");
    setBusinessEmailError("");
    setBusinessAddressError("");

    setIsEditingBusinessInfo(
      true
    );
  }

  /*
   * Save invoice header/payment information.
   */
  async function saveBusinessInfo(
    event:
      React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setBusinessInfoError("");
    setBusinessNameError("");
    setBusinessPhoneError("");
    setBusinessEmailError("");
    setBusinessAddressError("");

    const cleanedBusinessName =
      cleanText(
        businessName
      );

    const cleanedOwnerName =
      cleanText(
        ownerName
      );

    const cleanedPhone =
      formatPhone(
        businessPhone
      );

    const cleanedEmail =
      cleanEmail(
        businessEmail
      );

    const cleanedAddress =
      cleanMultilineText(
        businessAddress
      );

    const cleanedPaymentInstructions =
      cleanMultilineText(
        paymentInstructions
      );

    let hasError = false;

    if (
      !cleanedBusinessName
    ) {
      setBusinessNameError(
        "Enter the business name."
      );

      hasError = true;
    }

    if (
      !isValidPhone(
        businessPhone
      )
    ) {
      setBusinessPhoneError(
        "Enter a 10-digit phone number."
      );

      hasError = true;
    }

    if (
      cleanedEmail &&
      !isValidEmail(
        cleanedEmail
      )
    ) {
      setBusinessEmailError(
        "Enter a valid email address."
      );

      hasError = true;
    }

    if (
      !cleanedAddress
    ) {
      setBusinessAddressError(
        "Enter the business address."
      );

      hasError = true;
    }

    if (
      hasError
    ) {
      return;
    }

    const updatedBusinessInfo:
      BusinessInfo = {
        businessName:
          cleanedBusinessName,

        ownerName:
          cleanedOwnerName,

        phone:
          cleanedPhone,

        email:
          cleanedEmail,

        address:
          cleanedAddress,

        paymentInstructions:
          cleanedPaymentInstructions,
      };

    try {
      setIsSavingBusinessInfo(
        true
      );

      await onUpdateBusinessInfo(
        updatedBusinessInfo
      );

      setIsEditingBusinessInfo(
        false
      );
    } catch (error) {
      console.error(
        "Could not update business information:",
        error
      );

      setBusinessInfoError(
        "Could not save the invoice information."
      );
    } finally {
      setIsSavingBusinessInfo(
        false
      );
    }
  }

  /*
   * Create a new invoice.
   */
  async function createInvoice(
    event:
      React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setInvoiceError("");
    setInvoiceJobError("");
    setInvoiceDueDateError("");

    const createdAt =
      new Date()
        .toLocaleDateString(
          "en-CA"
        );

    let hasError = false;

    if (
      !selectedJob ||
      !selectedCustomer
    ) {
      setInvoiceJobError(
        "Choose a completed job to invoice."
      );

      hasError = true;
    }

    if (
      !isValidDateInput(
        dueDate
      )
    ) {
      setInvoiceDueDateError(
        "Choose a valid due date."
      );

      hasError = true;
    } else if (
      !isDateOnOrAfter(
        dueDate,
        createdAt
      )
    ) {
      setInvoiceDueDateError(
        "Due date cannot be before the invoice date."
      );

      hasError = true;
    }

    if (
      selectedJob &&
      selectedAmount <= 0
    ) {
      setInvoiceError(
        "The invoice total must be greater than $0.00."
      );

      hasError = true;
    }

    if (
      hasError ||
      !selectedJob ||
      !selectedCustomer
    ) {
      return;
    }

    const invoice: Invoice = {
      id:
        crypto.randomUUID(),

      invoiceNumber:
        `INV-${String(
          invoices.length + 1
        ).padStart(
          4,
          "0"
        )}`,

      customerId:
        selectedCustomer.id,

      jobId:
        selectedJob.id,

      createdAt,

      dueDate,

      amount:
        selectedAmount,

      status:
        "draft",
    };

    try {
      setSavingInvoiceId(
        invoice.id
      );

      await onCreateInvoice(
        invoice
      );

      setSelectedJobId("");
      setDueDate("");
      setShowInvoiceForm(false);
    } catch (error) {
      console.error(
        "Could not create invoice:",
        error
      );

      setInvoiceError(
        "Could not create the invoice."
      );
    } finally {
      setSavingInvoiceId(
        null
      );
    }
  }

  /*
   * Fill invoice edit form.
   */
  function beginInvoiceEdit(
    invoice: Invoice
  ) {
    setEditingInvoiceId(
      invoice.id
    );

    setEditAmount(
      invoice.amount.toFixed(2)
    );

    setEditDueDate(
      invoice.dueDate
    );

    setEditStatus(
      invoice.status
    );

    setInvoiceError("");
    setInvoiceAmountError("");
    setInvoiceDueDateError("");
  }

  /*
   * Save editable invoice fields.
   */
  async function saveInvoiceEdit(
    event:
      React.FormEvent<HTMLFormElement>,

    invoice:
      Invoice
  ) {
    event.preventDefault();

    setInvoiceError("");
    setInvoiceAmountError("");
    setInvoiceDueDateError("");

    const amount =
      parseMoney(
        editAmount
      );

    let hasError =
      false;

    if (
      amount === null ||
      !isPositiveMoney(
        editAmount
      )
    ) {
      setInvoiceAmountError(
        "Enter an amount greater than $0.00."
      );

      hasError = true;
    }

    if (
      !isValidDateInput(
        editDueDate
      )
    ) {
      setInvoiceDueDateError(
        "Choose a valid due date."
      );

      hasError = true;
    } else if (
      !isDateOnOrAfter(
        editDueDate,
        invoice.createdAt
      )
    ) {
      setInvoiceDueDateError(
        "Due date cannot be before the invoice date."
      );

      hasError = true;
    }

    if (
      hasError ||
      amount === null
    ) {
      return;
    }

    const updatedInvoice:
      Invoice = {
        ...invoice,

        amount,

        dueDate:
          editDueDate,

        status:
          editStatus,
      };

    try {
      setSavingInvoiceId(
        invoice.id
      );

      await onUpdateInvoice(
        updatedInvoice
      );

      setEditingInvoiceId(
        null
      );
    } catch (error) {
      console.error(
        "Could not update invoice:",
        error
      );

      setInvoiceError(
        "Could not save the invoice changes."
      );
    } finally {
      setSavingInvoiceId(
        null
      );
    }
  }

  /*
   * Quick invoice status update.
   */
  async function changeStatus(
    invoiceId: string,
    status: InvoiceStatus
  ) {
    try {
      setSavingInvoiceId(
        invoiceId
      );

      setInvoiceError("");

      await onUpdateInvoiceStatus(
        invoiceId,
        status
      );
    } catch (error) {
      console.error(
        "Could not update invoice status:",
        error
      );

      setInvoiceError(
        "Could not update the invoice status."
      );
    } finally {
      setSavingInvoiceId(
        null
      );
    }
  }

  /*
   * Download invoice PDF.
   */
  async function downloadPdf(
    invoice: Invoice
  ) {
    try {
      setDownloadingInvoiceId(
        invoice.id
      );

      setInvoiceError("");

      await downloadInvoicePdf(
        invoice
      );
    } catch (error) {
      console.error(
        "Could not download invoice PDF:",
        error
      );

      setInvoiceError(
        "Could not download the invoice PDF."
      );
    } finally {
      setDownloadingInvoiceId(
        null
      );
    }
  }

  /*
   * Download a complete local backup.
   */
  async function createBackup() {
    try {
      setIsCreatingBackup(
        true
      );

      setBackupError("");
      setBackupMessage("");

      await downloadBackup();

      setBackupMessage(
        "Backup downloaded successfully."
      );
    } catch (error) {
      console.error(
        "Could not create backup:",
        error
      );

      setBackupError(
        error instanceof Error
          ? error.message
          : "Could not create the backup."
      );
    } finally {
      setIsCreatingBackup(
        false
      );
    }
  }

  /*
   * Restore a WorkBooks backup.
   */
  async function restoreSelectedBackup(
    file: File
  ) {
    const confirmed =
      window.confirm(
        "Restore this backup? The current WorkBooks data will be replaced by the data in the backup."
      );

    if (
      !confirmed
    ) {
      return;
    }

    try {
      setIsRestoringBackup(
        true
      );

      setBackupError("");
      setBackupMessage("");

      await restoreBackup(
        file
      );

      window.alert(
        "Backup restored successfully. WorkBooks will reload now."
      );

      window.location.reload();
    } catch (error) {
      console.error(
        "Could not restore backup:",
        error
      );

      setBackupError(
        error instanceof Error
          ? error.message
          : "Could not restore the backup."
      );
    } finally {
      setIsRestoringBackup(
        false
      );
    }
  }

  const hasBusinessInfo =
    Boolean(
      businessInfo.businessName ||
      businessInfo.ownerName ||
      businessInfo.phone ||
      businessInfo.email ||
      businessInfo.address ||
      businessInfo.paymentInstructions
    );

  return (
    <>
      <header className="app-header">
        <h1>
          Finances
        </h1>

        <p>
          Invoices, payments, and money still owed.
        </p>
      </header>

      <section className="finances-page">
        <div className="finance-summary-grid">

          <div className="finance-summary-card">
            <span>
              Invoiced
            </span>

            <strong>
              {formatMoney(
                totalInvoiced
              )}
            </strong>
          </div>

          <div className="finance-summary-card">
            <span>
              Paid
            </span>

            <strong>
              {formatMoney(
                totalPaid
              )}
            </strong>
          </div>

          <div className="finance-summary-card">
            <span>
              Still Owed
            </span>

            <strong>
              {formatMoney(
                outstanding
              )}
            </strong>
          </div>

          <div className="finance-summary-card">
            <span>
              Ready to Invoice
            </span>

            <strong>
              {formatMoney(
                completedNotInvoiced
              )}
            </strong>
          </div>

        </div>

        <div className="finance-section invoice-business-section">
          <div className="details-card-heading">

            <div>
              <h2>
                Invoice Information
              </h2>

              <p className="section-help-text">
                This information appears on every PDF invoice.
              </p>
            </div>

            {!isEditingBusinessInfo && (
              <button
                className="small-edit-button"
                type="button"
                onClick={
                  beginBusinessInfoEdit
                }
              >
                {hasBusinessInfo
                  ? "Edit"
                  : "Set Up"}
              </button>
            )}

          </div>

          {isEditingBusinessInfo ? (
            <form
              className="record-edit-form invoice-business-form"
              onSubmit={
                saveBusinessInfo
              }
              noValidate
            >

              <label>
                Business Name

                <input
                  type="text"
                  value={
                    businessName
                  }
                  onChange={(event) => {
                    setBusinessName(
                      event.currentTarget.value
                    );

                    if (
                      businessNameError
                    ) {
                      setBusinessNameError(
                        ""
                      );
                    }
                  }}
                  placeholder="Smith Handyman Services"
                  aria-invalid={
                    Boolean(
                      businessNameError
                    )
                  }
                />

                {businessNameError && (
                  <span className="form-error">
                    {businessNameError}
                  </span>
                )}
              </label>

              <label>
                Owner Name

                <input
                  type="text"
                  value={
                    ownerName
                  }
                  onChange={(event) =>
                    setOwnerName(
                      event.currentTarget.value
                    )
                  }
                  placeholder="John Smith"
                />
              </label>

              <label>
                Phone

                <input
                  type="tel"
                  value={
                    businessPhone
                  }
                  onChange={(event) => {
                    setBusinessPhone(
                      event.currentTarget.value
                    );

                    if (
                      businessPhoneError
                    ) {
                      setBusinessPhoneError(
                        ""
                      );
                    }
                  }}
                  onBlur={() => {
                    if (
                      isValidPhone(
                        businessPhone
                      )
                    ) {
                      setBusinessPhone(
                        formatPhone(
                          businessPhone
                        )
                      );
                    }
                  }}
                  placeholder="(801) 555-1234"
                  inputMode="tel"
                  aria-invalid={
                    Boolean(
                      businessPhoneError
                    )
                  }
                />

                {businessPhoneError && (
                  <span className="form-error">
                    {businessPhoneError}
                  </span>
                )}
              </label>

              <label>
                Email

                <input
                  type="email"
                  value={
                    businessEmail
                  }
                  onChange={(event) => {
                    setBusinessEmail(
                      event.currentTarget.value
                    );

                    if (
                      businessEmailError
                    ) {
                      setBusinessEmailError(
                        ""
                      );
                    }
                  }}
                  onBlur={() =>
                    setBusinessEmail(
                      cleanEmail(
                        businessEmail
                      )
                    )
                  }
                  placeholder="Optional"
                  inputMode="email"
                  aria-invalid={
                    Boolean(
                      businessEmailError
                    )
                  }
                />

                {businessEmailError && (
                  <span className="form-error">
                    {businessEmailError}
                  </span>
                )}
              </label>

              <label>
                Business Address

                <textarea
                  value={
                    businessAddress
                  }
                  onChange={(event) => {
                    setBusinessAddress(
                      event.currentTarget.value
                    );

                    if (
                      businessAddressError
                    ) {
                      setBusinessAddressError(
                        ""
                      );
                    }
                  }}
                  aria-invalid={
                    Boolean(
                      businessAddressError
                    )
                  }
                />

                {businessAddressError && (
                  <span className="form-error">
                    {businessAddressError}
                  </span>
                )}
              </label>

              <label>
                Payment Instructions

                <textarea
                  value={
                    paymentInstructions
                  }
                  onChange={(event) =>
                    setPaymentInstructions(
                      event.currentTarget.value
                    )
                  }
                  placeholder="Make checks payable to..."
                />
              </label>

              {businessInfoError && (
                <p className="form-error">
                  {businessInfoError}
                </p>
              )}

              <div className="edit-actions">
                <button
                  className="new-customer-button"
                  type="submit"
                  disabled={
                    isSavingBusinessInfo
                  }
                >
                  {isSavingBusinessInfo
                    ? "Saving..."
                    : "Save"}
                </button>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setBusinessInfoError("");
                    setBusinessNameError("");
                    setBusinessPhoneError("");
                    setBusinessEmailError("");
                    setBusinessAddressError("");

                    setIsEditingBusinessInfo(
                      false
                    );
                  }}
                  disabled={
                    isSavingBusinessInfo
                  }
                >
                  Cancel
                </button>
              </div>

            </form>
          ) : (
            <div className="invoice-business-card">

              {hasBusinessInfo ? (
                <>
                  <strong>
                    {businessInfo.businessName ||
                      "Business information"}
                  </strong>

                  {businessInfo.ownerName && (
                    <span>
                      {businessInfo.ownerName}
                    </span>
                  )}

                  {businessInfo.phone && (
                    <span>
                      {businessInfo.phone}
                    </span>
                  )}

                  {businessInfo.email && (
                    <span>
                      {businessInfo.email}
                    </span>
                  )}

                  {businessInfo.address && (
                    <span>
                      {businessInfo.address}
                    </span>
                  )}

                  {businessInfo.paymentInstructions && (
                    <p>
                      {
                        businessInfo.paymentInstructions
                      }
                    </p>
                  )}
                </>
              ) : (
                <p className="invoice-info-empty-state">
                  No invoice information has been saved yet.
                </p>
              )}

            </div>
          )}
        </div>

        <div className="finance-section">
          <div className="details-card-heading">

            <div className="section-heading">
              <h2>
                Invoices
              </h2>

              <span>
                {invoices.length}
              </span>
            </div>

            <button
              className="small-edit-button"
              type="button"
              onClick={() => {
                setInvoiceError("");
                setInvoiceJobError("");
                setInvoiceDueDateError("");

                setShowInvoiceForm(
                  (current) =>
                    !current
                );
              }}
            >
              {showInvoiceForm
                ? "Cancel"
                : "+ Create Invoice"}
            </button>

          </div>

          {showInvoiceForm && (
            <form
              className="invoice-form"
              onSubmit={
                createInvoice
              }
              noValidate
            >

              <h2>
                Create Invoice
              </h2>

              <label>
                Job

                <select
                  value={
                    selectedJobId
                  }
                  onChange={(event) => {
                    setSelectedJobId(
                      event.currentTarget.value
                    );

                    setInvoiceJobError(
                      ""
                    );
                  }}
                  aria-invalid={
                    Boolean(
                      invoiceJobError
                    )
                  }
                >
                  <option value="">
                    Choose a job...
                  </option>

                  {invoiceableJobs.map(
                    (job) => {
                      const customer =
                        getCustomer(
                          job.customerId
                        );

                      return (
                        <option
                          key={
                            job.id
                          }
                          value={
                            job.id
                          }
                        >
                          {
                            customer?.name ??
                            "Unknown Customer"
                          }
                          {" — "}
                          {
                            job.description
                          }
                        </option>
                      );
                    }
                  )}
                </select>

                {invoiceJobError && (
                  <span className="form-error">
                    {invoiceJobError}
                  </span>
                )}
              </label>

              {selectedJob &&
                selectedCustomer && (

                <div className="invoice-preview">

                  <div>
                    <span>
                      Customer
                    </span>

                    <strong>
                      {
                        selectedCustomer.name
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Job
                    </span>

                    <strong>
                      {
                        selectedJob.description
                      }
                    </strong>
                  </div>

                  {selectedJob.pricingType ===
                    "hourly" && (

                    <div>
                      <span>
                        Labor
                      </span>

                      <strong>
                        {
                          selectedWorkedHours.toFixed(
                            2
                          )
                        }
                        {" hours × "}
                        {
                          formatMoney(
                            selectedJob.hourlyRate ??
                              0
                          )
                        }
                      </strong>
                    </div>
                  )}

                  {selectedJob.pricingType ===
                    "fixed" && (

                    <div>
                      <span>
                        Labor
                      </span>

                      <strong>
                        Fixed Price
                      </strong>
                    </div>
                  )}

                  <div>
                    <span>
                      Labor Total
                    </span>

                    <strong>
                      {
                        formatMoney(
                          selectedLaborAmount
                        )
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Materials
                    </span>

                    <strong>
                      {
                        formatMoney(
                          selectedMaterialAmount
                        )
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Invoice Total
                    </span>

                    <strong>
                      {
                        formatMoney(
                          selectedAmount
                        )
                      }
                    </strong>
                  </div>

                </div>
              )}

              <label>
                Due Date

                <input
                  type="date"
                  value={
                    dueDate
                  }
                  onChange={(event) => {
                    setDueDate(
                      event.currentTarget.value
                    );

                    setInvoiceDueDateError(
                      ""
                    );
                  }}
                  min={
                    new Date()
                      .toLocaleDateString(
                        "en-CA"
                      )
                  }
                  aria-invalid={
                    Boolean(
                      invoiceDueDateError
                    )
                  }
                />

                {invoiceDueDateError && (
                  <span className="form-error">
                    {
                      invoiceDueDateError
                    }
                  </span>
                )}
              </label>

              {invoiceError && (
                <p className="form-error">
                  {invoiceError}
                </p>
              )}

              <div className="edit-actions">
                <button
                  className="new-customer-button"
                  type="submit"
                  disabled={
                    savingInvoiceId !==
                    null
                  }
                >
                  {savingInvoiceId
                    ? "Creating..."
                    : "Create Invoice"}
                </button>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setShowInvoiceForm(
                      false
                    );

                    setSelectedJobId(
                      ""
                    );

                    setDueDate(
                      ""
                    );

                    setInvoiceError(
                      ""
                    );

                    setInvoiceJobError(
                      ""
                    );

                    setInvoiceDueDateError(
                      ""
                    );
                  }}
                  disabled={
                    savingInvoiceId !==
                    null
                  }
                >
                  Cancel
                </button>
              </div>

            </form>
          )}

          {!showInvoiceForm &&
            invoiceError && (

            <p className="form-error">
              {invoiceError}
            </p>
          )}

          {invoices.length === 0 ? (

            <div className="empty-state">
              <p>
                No invoices yet.
              </p>
            </div>

          ) : (

            <div className="invoice-list">

              {[...invoices]
                .sort(
                  (a, b) =>
                    b.createdAt.localeCompare(
                      a.createdAt
                    )
                )
                .map(
                  (invoice) => {
                    const customer =
                      getCustomer(
                        invoice.customerId
                      );

                    const job =
                      getJob(
                        invoice.jobId
                      );

                    const isEditing =
                      editingInvoiceId ===
                      invoice.id;

                    const isSaving =
                      savingInvoiceId ===
                      invoice.id;

                    const isDownloading =
                      downloadingInvoiceId ===
                      invoice.id;

                    return (
                      <div
                        className="invoice-card"
                        key={
                          invoice.id
                        }
                      >

                        {isEditing ? (

                          <form
                            className="invoice-edit-form"
                            noValidate
                            onSubmit={(
                              event
                            ) =>
                              saveInvoiceEdit(
                                event,
                                invoice
                              )
                            }
                          >

                            <div className="edit-form-heading">
                              <div>
                                <strong>
                                  {
                                    invoice.invoiceNumber
                                  }
                                </strong>

                                <span>
                                  {
                                    customer?.name ??
                                    "Unknown Customer"
                                  }
                                </span>
                              </div>
                            </div>

                            <label>
                              Amount

                              <div className="money-input">
                                <span>
                                  $
                                </span>

                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={
                                    editAmount
                                  }
                                  onChange={(
                                    event
                                  ) => {
                                    setEditAmount(
                                      event.currentTarget.value
                                    );

                                    setInvoiceAmountError(
                                      ""
                                    );
                                  }}
                                  onBlur={() => {
                                    const amount =
                                      parseMoney(
                                        editAmount
                                      );

                                    if (
                                      amount !==
                                        null &&
                                      amount >
                                        0
                                    ) {
                                      setEditAmount(
                                        amount.toFixed(
                                          2
                                        )
                                      );
                                    }
                                  }}
                                  aria-invalid={
                                    Boolean(
                                      invoiceAmountError
                                    )
                                  }
                                />
                              </div>

                              {invoiceAmountError && (
                                <span className="form-error">
                                  {
                                    invoiceAmountError
                                  }
                                </span>
                              )}
                            </label>

                            <label>
                              Due Date

                              <input
                                type="date"
                                value={
                                  editDueDate
                                }
                                onChange={(
                                  event
                                ) => {
                                  setEditDueDate(
                                    event.currentTarget.value
                                  );

                                  setInvoiceDueDateError(
                                    ""
                                  );
                                }}
                                min={
                                  invoice.createdAt
                                }
                                aria-invalid={
                                  Boolean(
                                    invoiceDueDateError
                                  )
                                }
                              />

                              {invoiceDueDateError && (
                                <span className="form-error">
                                  {
                                    invoiceDueDateError
                                  }
                                </span>
                              )}
                            </label>

                            <label>
                              Status

                              <select
                                value={
                                  editStatus
                                }
                                onChange={(
                                  event
                                ) =>
                                  setEditStatus(
                                    event.currentTarget.value as
                                      InvoiceStatus
                                  )
                                }
                              >
                                <option value="draft">
                                  Draft
                                </option>

                                <option value="sent">
                                  Sent
                                </option>

                                <option value="paid">
                                  Paid
                                </option>
                              </select>
                            </label>

                            <div className="edit-actions compact-edit-actions">

                              <button
                                className="new-customer-button"
                                type="submit"
                                disabled={
                                  isSaving
                                }
                              >
                                {isSaving
                                  ? "Saving..."
                                  : "Save"}
                              </button>

                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                  setInvoiceError(
                                    ""
                                  );

                                  setInvoiceAmountError(
                                    ""
                                  );

                                  setInvoiceDueDateError(
                                    ""
                                  );

                                  setEditingInvoiceId(
                                    null
                                  );
                                }}
                                disabled={
                                  isSaving
                                }
                              >
                                Cancel
                              </button>

                            </div>

                          </form>

                        ) : (

                          <>
                            <div className="invoice-card-header">

                              <div>
                                <strong>
                                  {
                                    customer?.name ??
                                    "Unknown Customer"
                                  }
                                </strong>

                                <span>
                                  {
                                    invoice.invoiceNumber
                                  }
                                </span>
                              </div>

                              <strong>
                                {
                                  formatMoney(
                                    invoice.amount
                                  )
                                }
                              </strong>

                            </div>

                            <p>
                              {
                                job?.description ??
                                "Job"
                              }
                            </p>

                            <p>
                              Due{" "}
                              {
                                invoice.dueDate
                              }
                            </p>

                            <div className="invoice-status-row">

                              <span
                                className={
                                  `invoice-status ` +
                                  `invoice-status-${invoice.status}`
                                }
                              >
                                {
                                  invoice.status
                                }
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  downloadPdf(
                                    invoice
                                  )
                                }
                                disabled={
                                  isSaving ||
                                  isDownloading
                                }
                              >
                                {isDownloading
                                  ? "Preparing PDF..."
                                  : "Download PDF"}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  beginInvoiceEdit(
                                    invoice
                                  )
                                }
                                disabled={
                                  isSaving ||
                                  isDownloading
                                }
                              >
                                Edit
                              </button>

                              {invoice.status ===
                                "draft" && (

                                <button
                                  type="button"
                                  onClick={() =>
                                    changeStatus(
                                      invoice.id,
                                      "sent"
                                    )
                                  }
                                  disabled={
                                    isSaving ||
                                    isDownloading
                                  }
                                >
                                  Mark Sent
                                </button>
                              )}

                              {invoice.status !==
                                "paid" && (

                                <button
                                  type="button"
                                  onClick={() =>
                                    changeStatus(
                                      invoice.id,
                                      "paid"
                                    )
                                  }
                                  disabled={
                                    isSaving ||
                                    isDownloading
                                  }
                                >
                                  Mark Paid
                                </button>
                              )}

                            </div>

                          </>
                        )}

                      </div>
                    );
                  }
                )}

            </div>
          )}
        </div>

        <div className="finance-section">
          <div className="details-card-heading">

            <div>
              <h2>
                Mileage
              </h2>

              <p className="section-help-text">
                Business mileage recorded on jobs. Mileage is kept separate from customer invoices.
              </p>
            </div>

            <label>
              Year

              <select
                value={
                  selectedMileageYear
                }
                onChange={(event) =>
                  setSelectedMileageYear(
                    event.currentTarget.value
                  )
                }
              >
                {mileageYears.map(
                  (year) => (
                    <option
                      key={
                        year
                      }
                      value={
                        year
                      }
                    >
                      {
                        year
                      }
                    </option>
                  )
                )}
              </select>
            </label>

          </div>

          <div className="finance-summary-grid">

            <div className="finance-summary-card">
              <span>
                Business Miles
              </span>

              <strong>
                {
                  yearlyMileageTotal.toFixed(
                    1
                  )
                }{" "}
                mi
              </strong>
            </div>

            <div className="finance-summary-card">
              <span>
                Trips
              </span>

              <strong>
                {
                  yearlyMileageEntries.length
                }
              </strong>
            </div>

          </div>

          {mileageError && (
            <p className="form-error">
              {mileageError}
            </p>
          )}

          {!mileageError &&
          yearlyMileageEntries.length ===
            0 ? (

            <div className="empty-state">
              <p>
                No mileage recorded for{" "}
                {
                  selectedMileageYear
                }.
              </p>
            </div>

          ) : (

            <div className="invoice-list">

              {yearlyMileageEntries.map(
                (entry) => {
                  const job =
                    getJob(
                      entry.jobId
                    );

                  const customer =
                    job
                      ? getCustomer(
                          job.customerId
                        )
                      : undefined;

                  return (
                    <div
                      className="invoice-card"
                      key={
                        entry.id
                      }
                    >

                      <div className="invoice-card-header">

                        <div>
                          <strong>
                            {
                              entry.miles.toFixed(
                                1
                              )
                            }{" "}
                            mi
                          </strong>

                          <span>
                            {
                              entry.tripDate
                            }
                          </span>
                        </div>

                        <strong>
                          {
                            customer?.name ??
                            "Unknown Customer"
                          }
                        </strong>

                      </div>

                      <p>
                        {
                          job?.description ??
                          "Job"
                        }
                      </p>

                      {entry.notes && (
                        <p>
                          {
                            entry.notes
                          }
                        </p>
                      )}

                    </div>
                  );
                }
              )}

            </div>
          )}
        </div>

        <div className="finance-section">
          <div className="details-card-heading">
            <h2>
              Backup &amp; Restore
            </h2>
          </div>

          <div className="record-edit-form">
            <div className="edit-actions">

              <button
                className="new-customer-button"
                type="button"
                onClick={
                  createBackup
                }
                disabled={
                  isCreatingBackup ||
                  isRestoringBackup
                }
              >
                {isCreatingBackup
                  ? "Creating Backup..."
                  : "Download Backup"}
              </button>

              <label
                className="secondary-button"
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  justifyContent:
                    "center",

                  minHeight:
                    "48px",

                  textAlign:
                    "center",

                  cursor:
                    isCreatingBackup ||
                    isRestoringBackup
                      ? "not-allowed"
                      : "pointer",

                  opacity:
                    isCreatingBackup ||
                    isRestoringBackup
                      ? 0.6
                      : 1,
                }}
              >
                <input
                  type="file"
                  accept=".zip,.json,.backup,application/zip"
                  style={{
                    display:
                      "none",
                  }}
                  onChange={(event) => {
                    const file =
                      event.currentTarget.files?.[0];

                    if (
                      file
                    ) {
                      void restoreSelectedBackup(
                        file
                      );
                    }

                    event.currentTarget.value =
                      "";
                  }}
                  disabled={
                    isCreatingBackup ||
                    isRestoringBackup
                  }
                />

                {isRestoringBackup
                  ? "Restoring..."
                  : "Restore Backup"}
              </label>

            </div>

            {backupMessage && (
              <p
                style={{
                  margin:
                    0,

                  padding:
                    "10px 12px",

                  color:
                    "#15803d",

                  background:
                    "#ecfdf5",

                  border:
                    "1px solid #a7f3d0",

                  borderRadius:
                    "8px",
                }}
              >
                {
                  backupMessage
                }
              </p>
            )}

            {backupError && (
              <p className="form-error">
                {backupError}
              </p>
            )}

          </div>
        </div>

      </section>
    </>
  );
}

export default Finances;