import { useState } from "react";

import { downloadInvoicePdf } from "../api/invoices";

import type { BusinessInfo } from "../types/BusinessInfo";
import type { Customer } from "../types/Customer";
import type { Invoice, InvoiceStatus } from "../types/Invoice";
import type { Job } from "../types/Jobs";

import {
  formatMoney,
  getJobAmount,
  getWorkedHours,
} from "../utils/jobTime";
import { useNow } from "../utils/useNow";


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
   * Invoice creation state.
   */
  const [showInvoiceForm, setShowInvoiceForm] =
    useState(false);

  const [selectedJobId, setSelectedJobId] =
    useState("");

  const [dueDate, setDueDate] =
    useState("");

  /*
   * Only one invoice is edited at a time to keep the page simple.
   */
  const [editingInvoiceId, setEditingInvoiceId] =
    useState<string | null>(null);

  const [editAmount, setEditAmount] =
    useState("");

  const [editDueDate, setEditDueDate] =
    useState("");

  const [editStatus, setEditStatus] =
    useState<InvoiceStatus>("draft");

  const [savingInvoiceId, setSavingInvoiceId] =
    useState<string | null>(null);

  const [downloadingInvoiceId, setDownloadingInvoiceId] =
    useState<string | null>(null);

  const [invoiceError, setInvoiceError] =
    useState("");

  /*
   * Business information used at the top of every generated PDF invoice.
   *
   * The edit fields are refreshed from the saved values whenever Dad
   * presses Edit, so they never depend on stale component state.
   */
  const [isEditingBusinessInfo, setIsEditingBusinessInfo] =
    useState(false);

  const [businessName, setBusinessName] =
    useState("");

  const [ownerName, setOwnerName] =
    useState("");

  const [businessPhone, setBusinessPhone] =
    useState("");

  const [businessEmail, setBusinessEmail] =
    useState("");

  const [businessAddress, setBusinessAddress] =
    useState("");

  const [paymentInstructions, setPaymentInstructions] =
    useState("");

  const [businessInfoError, setBusinessInfoError] =
    useState("");

  const [isSavingBusinessInfo, setIsSavingBusinessInfo] =
    useState(false);


  const getCustomer = (customerId: string) =>
    customers.find(
      (customer) => customer.id === customerId
    );


  const getJob = (jobId: string) =>
    jobs.find(
      (job) => job.id === jobId
    );


  const invoicedJobIds = new Set(
    invoices.map((invoice) => invoice.jobId)
  );

  /*
   * Jobs that can be turned into invoices.
   *
   * A job must:
   *
   * - be completed
   * - not already have an invoice
   * - have enough pricing/work information to calculate
   *   a labor total
   *
   * Completed jobs are sorted with the most recently
   * completed job first.
   */
  const invoiceableJobs = jobs
    .filter((job) => {
      /*
       * Don't invoice a job until Dad explicitly
       * marks the overall job complete.
       */
      if (job.status !== "completed") {
        return false;
      }

      /*
       * Each job should only have one invoice.
       */
      if (invoicedJobIds.has(job.id)) {
        return false;
      }

      /*
       * Fixed-price jobs only need their agreed price.
       */
      if (job.pricingType === "fixed") {
        return job.fixedPrice !== undefined;
      }

      /*
       * Hourly jobs need both an hourly rate and
       * at least one recorded work session.
       */
      return (
        job.hourlyRate !== undefined &&
        (job.workSessions?.length ?? 0) > 0
      );
    })
    .sort((a, b) => {
      /*
       * completedAt is the best timestamp for sorting
       * finished jobs. scheduledDate is a fallback for
       * older jobs that do not have completedAt yet.
       */
      const aDate =
        a.completedAt ?? a.scheduledDate;

      const bDate =
        b.completedAt ?? b.scheduledDate;

      return bDate.localeCompare(aDate);
    });

  const selectedJob =
    getJob(selectedJobId);

  const selectedCustomer = selectedJob
    ? getCustomer(selectedJob.customerId)
    : undefined;

  const selectedAmount = selectedJob
    ? getJobAmount(selectedJob, now)
    : 0;

  /*
   * Used to explain the labor calculation when Dad
   * is creating an hourly invoice.
   */
  const selectedWorkedHours =
    selectedJob &&
    selectedJob.pricingType === "hourly"
      ? getWorkedHours(selectedJob, now)
      : 0;

  /*
   * Finance summary values come from saved invoices rather than temporary
   * UI values, so they remain correct after restarting the app.
   */
  const totalInvoiced = invoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0
  );

  const totalPaid = invoices
    .filter(
      (invoice) => invoice.status === "paid"
    )
    .reduce(
      (sum, invoice) => sum + invoice.amount,
      0
    );

  const outstanding = invoices
    .filter(
      (invoice) => invoice.status !== "paid"
    )
    .reduce(
      (sum, invoice) => sum + invoice.amount,
      0
    );


  const completedNotInvoiced = jobs
    .filter(
      (job) =>
        job.status === "completed" &&
        !invoicedJobIds.has(job.id)
    )
    .reduce(
      (sum, job) =>
        sum + getJobAmount(job, now),
      0
    );

  /*
   * There is only one set of business information for WorkBooks.
   * Fill the form from the current saved values each time Dad opens it.
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
    setIsEditingBusinessInfo(true);
  }

  /*
   * Save the invoice header/payment information in SQLite.
   */
  async function saveBusinessInfo(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const updatedBusinessInfo: BusinessInfo = {
      businessName: businessName.trim(),
      ownerName: ownerName.trim(),
      phone: businessPhone.trim(),
      email: businessEmail.trim(),
      address: businessAddress.trim(),
      paymentInstructions:
        paymentInstructions.trim(),
    };

    try {
      setIsSavingBusinessInfo(true);
      setBusinessInfoError("");

      await onUpdateBusinessInfo(
        updatedBusinessInfo
      );

      setIsEditingBusinessInfo(false);

    } catch (error) {
      console.error(
        "Could not update business information:",
        error
      );

      setBusinessInfoError(
        "Could not save the invoice information."
      );

    } finally {
      setIsSavingBusinessInfo(false);
    }
  }

  /*
   * Create a new invoice and wait for SQLite to accept it before
   * closing the form.
   */
  async function createInvoice(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !selectedJob ||
      !selectedCustomer ||
      !dueDate
    ) {
      return;
    }

    const invoice: Invoice = {
      id: crypto.randomUUID(),
      invoiceNumber:
        `INV-${String(invoices.length + 1).padStart(4, "0")}`,
      customerId: selectedCustomer.id,
      jobId: selectedJob.id,
      createdAt: new Date().toLocaleDateString("en-CA"),
      dueDate,
      amount: selectedAmount,
      status: "draft",
    };

    try {
      setSavingInvoiceId(invoice.id);
      setInvoiceError("");

      await onCreateInvoice(invoice);

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
      setSavingInvoiceId(null);
    }
  }

  /*
   * Fill the invoice edit form from the current saved invoice.
   */
  function beginInvoiceEdit(
    invoice: Invoice
  ) {
    setEditingInvoiceId(invoice.id);
    setEditAmount(String(invoice.amount));
    setEditDueDate(invoice.dueDate);
    setEditStatus(invoice.status);
    setInvoiceError("");
  }

  /*
   * Invoice numbers and their customer/job links stay fixed after
   * creation. Dad can correct the amount, due date, or status.
   */
  async function saveInvoiceEdit(
    event: React.FormEvent<HTMLFormElement>,
    invoice: Invoice
  ) {
    event.preventDefault();

    const updatedInvoice: Invoice = {
      ...invoice,
      amount: Number(editAmount),
      dueDate: editDueDate,
      status: editStatus,
    };


    try {
      setSavingInvoiceId(invoice.id);
      setInvoiceError("");

      await onUpdateInvoice(updatedInvoice);

      setEditingInvoiceId(null);

    } catch (error) {
      console.error(
        "Could not update invoice:",
        error
      );

      setInvoiceError(
        "Could not save the invoice changes."
      );

    } finally {
      setSavingInvoiceId(null);
    }
  }

  /*
   * Quick status buttons use the smaller status endpoint.
   */
  async function changeStatus(
    invoiceId: string,
    status: InvoiceStatus
  ) {
    try {
      setSavingInvoiceId(invoiceId);
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
      setSavingInvoiceId(null);
    }
  }

  /*
   * Ask the backend for a fresh PDF made from the current database data.
   * The browser/Tauri webview then downloads it like a normal file.
   */
  async function downloadPdf(
    invoice: Invoice
  ) {
    try {
      setDownloadingInvoiceId(invoice.id);
      setInvoiceError("");

      await downloadInvoicePdf(invoice);

    } catch (error) {
      console.error(
        "Could not download invoice PDF:",
        error
      );

      setInvoiceError(
        "Could not download the invoice PDF."
      );

    } finally {
      setDownloadingInvoiceId(null);
    }
  }

  const hasBusinessInfo = Boolean(
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
        <h1>Finances</h1>
        <p>
          Invoices, payments, and money still owed.
        </p>
      </header>

      <section className="finances-page">

        {/* Quick business snapshot */}
        <div className="finance-summary-grid">
          <div className="finance-summary-card">
            <span>Invoiced</span>
            <strong>
              {formatMoney(totalInvoiced)}
            </strong>
          </div>

          <div className="finance-summary-card">
            <span>Paid</span>
            <strong>
              {formatMoney(totalPaid)}
            </strong>
          </div>

          <div className="finance-summary-card">
            <span>Still Owed</span>
            <strong>
              {formatMoney(outstanding)}
            </strong>
          </div>

          <div className="finance-summary-card">
            <span>Ready to Invoice</span>
            <strong>
              {formatMoney(completedNotInvoiced)}
            </strong>
          </div>
        </div>

        {/*
         * Saved information printed on PDF invoices.
         */}
        <div className="finance-section invoice-business-section">
          <div className="details-card-heading">
            <div>
              <h2>Invoice Information</h2>
              <p className="section-help-text">
                This information appears on every PDF invoice.
              </p>
            </div>

            {!isEditingBusinessInfo && (
              <button
                className="small-edit-button"
                type="button"
                onClick={beginBusinessInfoEdit}
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
              onSubmit={saveBusinessInfo}
            >
              <label>
                Business Name
                <input
                  type="text"
                  value={businessName}
                  onChange={(event) =>
                    setBusinessName(
                      event.currentTarget.value
                    )
                  }
                  placeholder="Smith Handyman Services"
                />
              </label>

              <label>
                Owner Name
                <input
                  type="text"
                  value={ownerName}
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
                  value={businessPhone}
                  onChange={(event) =>
                    setBusinessPhone(
                      event.currentTarget.value
                    )
                  }
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={businessEmail}
                  onChange={(event) =>
                    setBusinessEmail(
                      event.currentTarget.value
                    )
                  }
                />
              </label>

              <label>
                Business Address
                <textarea
                  value={businessAddress}
                  onChange={(event) =>
                    setBusinessAddress(
                      event.currentTarget.value
                    )
                  }
                />
              </label>

              <label>
                Payment Instructions
                <textarea
                  value={paymentInstructions}
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
                  disabled={isSavingBusinessInfo}
                >
                  {isSavingBusinessInfo
                    ? "Saving..."
                    : "Save Invoice Information"}
                </button>


                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setIsEditingBusinessInfo(false)
                  }
                  disabled={isSavingBusinessInfo}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : hasBusinessInfo ? (
            <div className="invoice-business-card">
              <strong>
                {businessInfo.businessName ||
                  businessInfo.ownerName ||
                  "Business"}
              </strong>

              {businessInfo.ownerName &&
                businessInfo.ownerName !==
                  businessInfo.businessName && (
                  <span>{businessInfo.ownerName}</span>
                )}

              {businessInfo.address && (
                <span>{businessInfo.address}</span>
              )}

              {businessInfo.phone && (
                <span>{businessInfo.phone}</span>
              )}

              {businessInfo.email && (
                <span>{businessInfo.email}</span>
              )}

              {businessInfo.paymentInstructions && (
                <p>
                  <strong>Payment:</strong>{" "}
                  {businessInfo.paymentInstructions}
                </p>
              )}
            </div>
          ) : (
            <div className="empty-state invoice-info-empty-state">
              <p>
                Add the business name and contact information
                that should appear on invoices.
              </p>
            </div>
          )}
        </div>

        <button
          className="new-customer-button"
          onClick={() => {
            setInvoiceError("");
            setShowInvoiceForm(
              (current) => !current
            );
          }}
        >
          {showInvoiceForm
            ? "Cancel Invoice"
            : "+ Create Invoice"}
        </button>

        {showInvoiceForm && (
          <form
            className="invoice-form"
            onSubmit={createInvoice}
          >
            <h2>Create Invoice</h2>


            <label>
              Job
              <select
                value={selectedJobId}
                onChange={(event) =>
                  setSelectedJobId(
                    event.currentTarget.value
                  )
                }
                required
              >
                <option value="">
                  Choose a job...
                </option>

                {invoiceableJobs.map((job) => {
                  const customer =
                    getCustomer(job.customerId);

                  return (
                    <option
                      key={job.id}
                      value={job.id}
                    >
                      {customer?.name ?? "Unknown Customer"}
                      {" — "}
                      {job.description}
                    </option>
                  );
                })}
              </select>
            </label>

            {selectedJob && selectedCustomer && (
              <div className="invoice-preview">
                <div>
                  <span>Customer</span>
                  <strong>{selectedCustomer.name}</strong>
                </div>

                <div>
                  <span>Job</span>
                  <strong>{selectedJob.description}</strong>
                </div>

                {/*
                 * For hourly work, show Dad exactly where
                 * the invoice labor total came from.
                 */}
                {selectedJob.pricingType === "hourly" && (
                  <div>
                    <span>Labor</span>
                    <strong>
                      {selectedWorkedHours.toFixed(2)}
                      {" hours × "}
                      {formatMoney(
                        selectedJob.hourlyRate ?? 0
                      )}
                    </strong>
                  </div>
                )}

                {/*
                 * Fixed-price jobs simply use the agreed
                 * labor price.
                 */}
                {selectedJob.pricingType === "fixed" && (
                  <div>
                    <span>Labor</span>
                    <strong>Fixed Price</strong>
                  </div>
                )}

                <div>
                  <span>Total</span>
                  <strong>{formatMoney(selectedAmount)}</strong>
                </div>
              </div>
            )}

            <label>
              Due Date
              <input
                type="date"
                value={dueDate}
                onChange={(event) =>
                  setDueDate(
                    event.currentTarget.value
                  )
                }
                required
              />
            </label>

            {invoiceError && (
              <p className="form-error">
                {invoiceError}
              </p>
            )}

            <button
              className="new-customer-button"
              type="submit"
              disabled={savingInvoiceId !== null}
            >
              {savingInvoiceId
                ? "Saving..."
                : "Create Invoice"}
            </button>
          </form>
        )}

        <div className="finance-section">
          <div className="section-heading">
            <h2>Invoices</h2>
            <span>{invoices.length}</span>
          </div>


          {!showInvoiceForm && invoiceError && (
            <p className="form-error">
              {invoiceError}
            </p>
          )}

          {invoices.length === 0 ? (
            <div className="empty-state">
              <p>No invoices yet.</p>
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
                .map((invoice) => {
                  const customer =
                    getCustomer(invoice.customerId);

                  const job =
                    getJob(invoice.jobId);

                  const isEditing =
                    editingInvoiceId === invoice.id;

                  const isSaving =
                    savingInvoiceId === invoice.id;

                  const isDownloading =
                    downloadingInvoiceId === invoice.id;

                  return (
                    <div
                      className="invoice-card"
                      key={invoice.id}
                    >

                      {isEditing ? (
                        <form
                          className="invoice-edit-form"
                          onSubmit={(event) =>
                            saveInvoiceEdit(
                              event,
                              invoice
                            )
                          }
                        >
                          <div className="edit-form-heading">
                            <div>
                              <strong>
                                {invoice.invoiceNumber}
                              </strong>

                              <span>
                                {customer?.name ??
                                  "Unknown Customer"}
                              </span>
                            </div>
                          </div>

                          <label>
                            Amount
                            <div className="money-input">
                              <span>$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={editAmount}
                                onChange={(event) =>
                                  setEditAmount(
                                    event.currentTarget.value
                                  )
                                }
                                required
                              />
                            </div>
                          </label>

                          <label>
                            Due Date
                            <input
                              type="date"
                              value={editDueDate}
                              onChange={(event) =>
                                setEditDueDate(
                                  event.currentTarget.value
                                )
                              }
                              required
                            />
                          </label>

                          <label>
                            Status
                            <select
                              value={editStatus}
                              onChange={(event) =>
                                setEditStatus(
                                  event.currentTarget.value as InvoiceStatus
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
                              disabled={isSaving}
                            >
                              {isSaving
                                ? "Saving..."
                                : "Save"}
                            </button>

                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                setEditingInvoiceId(null)
                              }
                              disabled={isSaving}
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
                                {customer?.name ??
                                  "Unknown Customer"}
                              </strong>

                              <span>
                                {invoice.invoiceNumber}
                              </span>
                            </div>

                            <strong>
                              {formatMoney(
                                invoice.amount
                              )}
                            </strong>
                          </div>

                          <p>
                            {job?.description ?? "Job"}
                          </p>

                          <p>
                            Due {invoice.dueDate}
                          </p>

                          <div className="invoice-status-row">
                            <span
                              className={
                                `invoice-status invoice-status-${invoice.status}`
                              }
                            >
                              {invoice.status}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                downloadPdf(invoice)
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
                                beginInvoiceEdit(invoice)
                              }
                              disabled={
                                isSaving ||
                                isDownloading
                              }
                            >
                              Edit
                            </button>

                            {invoice.status === "draft" && (
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

                            {invoice.status !== "paid" && (
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
                })}

            </div>
          )}
        </div>

      </section>
    </>
  );
}

export default Finances;