import { useState } from "react";

import type { Customer } from "../types/Customer";
import type { Invoice, InvoiceStatus } from "../types/Invoice";
import type { Job } from "../types/Jobs";
import { formatMoney, getJobAmount } from "../utils/jobTime";
import { useNow } from "../utils/useNow";


type FinancesProps = {
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];

  /*
   * These callbacks all persist through FastAPI/SQLite before App.tsx
   * updates the local React state.
   */
  onCreateInvoice: (invoice: Invoice) => Promise<void>;
  onUpdateInvoiceStatus: (
    invoiceId: string,
    status: InvoiceStatus
  ) => Promise<void>;
  onUpdateInvoice: (invoice: Invoice) => Promise<void>;
};


function Finances({
  customers,
  jobs,
  invoices,
  onCreateInvoice,
  onUpdateInvoiceStatus,
  onUpdateInvoice,
}: FinancesProps) {
  const now = useNow();

  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [dueDate, setDueDate] = useState("");

  /*
   * Only one invoice is edited at a time to keep the page simple.
   */
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editStatus, setEditStatus] = useState<InvoiceStatus>("draft");

  const [savingInvoiceId, setSavingInvoiceId] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState("");


  const getCustomer = (customerId: string) =>
    customers.find((customer) => customer.id === customerId);

  const getJob = (jobId: string) =>
    jobs.find((job) => job.id === jobId);


  const invoicedJobIds = new Set(
    invoices.map((invoice) => invoice.jobId)
  );


  /*
   * Only offer jobs that have a price and have not already been invoiced.
   * Completed jobs appear first because they are normally ready to bill.
   */
  const invoiceableJobs = jobs
    .filter((job) => {
      const hasPrice =
        job.pricingType === "fixed"
          ? job.fixedPrice !== undefined
          : job.hourlyRate !== undefined && job.startedAt !== undefined;

      return hasPrice && !invoicedJobIds.has(job.id);
    })
    .sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return -1;
      if (a.status !== "completed" && b.status === "completed") return 1;
      return b.scheduledDate.localeCompare(a.scheduledDate);
    });


  const selectedJob = getJob(selectedJobId);
  const selectedCustomer = selectedJob
    ? getCustomer(selectedJob.customerId)
    : undefined;
  const selectedAmount = selectedJob
    ? getJobAmount(selectedJob, now)
    : 0;


  /*
   * Finance summary values come from saved invoices rather than from
   * temporary UI values, so they remain correct after restarting the app.
   */
  const totalInvoiced = invoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0
  );

  const totalPaid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const outstanding = invoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const completedNotInvoiced = jobs
    .filter(
      (job) =>
        job.status === "completed" &&
        !invoicedJobIds.has(job.id)
    )
    .reduce(
      (sum, job) => sum + getJobAmount(job, now),
      0
    );


  /*
   * Create a new invoice and wait for SQLite to accept it before
   * closing the form.
   */
  async function createInvoice(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!selectedJob || !selectedCustomer || !dueDate) {
      return;
    }

    const invoice: Invoice = {
      id: crypto.randomUUID(),
      invoiceNumber: `INV-${String(invoices.length + 1).padStart(4, "0")}`,
      customerId: selectedCustomer.id,
      jobId: selectedJob.id,
      createdAt: new Date().toISOString(),
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
      console.error("Could not create invoice:", error);
      setInvoiceError("Could not create the invoice.");

    } finally {
      setSavingInvoiceId(null);
    }
  }


  /*
   * Fill the edit form from the current saved invoice.
   */
  function beginInvoiceEdit(invoice: Invoice) {
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
      console.error("Could not update invoice:", error);
      setInvoiceError("Could not save the invoice changes.");

    } finally {
      setSavingInvoiceId(null);
    }
  }


  /*
   * Quick status buttons still use the smaller status endpoint.
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
      console.error("Could not update invoice status:", error);
      setInvoiceError("Could not update the invoice status.");

    } finally {
      setSavingInvoiceId(null);
    }
  }


  return (
    <>
      <header className="app-header">
        <h1>Finances</h1>
        <p>Invoices, payments, and money still owed.</p>
      </header>


      <section className="finances-page">

        {/* Quick business snapshot */}
        <div className="finance-summary-grid">
          <div className="finance-summary-card">
            <span>Invoiced</span>
            <strong>{formatMoney(totalInvoiced)}</strong>
          </div>

          <div className="finance-summary-card">
            <span>Paid</span>
            <strong>{formatMoney(totalPaid)}</strong>
          </div>

          <div className="finance-summary-card">
            <span>Still Owed</span>
            <strong>{formatMoney(outstanding)}</strong>
          </div>

          <div className="finance-summary-card">
            <span>Ready to Invoice</span>
            <strong>{formatMoney(completedNotInvoiced)}</strong>
          </div>
        </div>


        <button
          className="new-customer-button"
          onClick={() => {
            setInvoiceError("");
            setShowInvoiceForm((current) => !current);
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
                  setSelectedJobId(event.currentTarget.value)
                }
                required
              >
                <option value="">Choose a job...</option>

                {invoiceableJobs.map((job) => {
                  const customer = getCustomer(job.customerId);

                  return (
                    <option key={job.id} value={job.id}>
                      {customer?.name ?? "Unknown Customer"} — {job.description}
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
                  setDueDate(event.currentTarget.value)
                }
                required
              />
            </label>


            {invoiceError && (
              <p className="form-error">{invoiceError}</p>
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
            <p className="form-error">{invoiceError}</p>
          )}


          {invoices.length === 0 ? (
            <div className="empty-state">
              <p>No invoices yet.</p>
            </div>
          ) : (
            <div className="invoice-list">

              {[...invoices].reverse().map((invoice) => {
                const customer = getCustomer(invoice.customerId);
                const job = getJob(invoice.jobId);
                const isEditing = editingInvoiceId === invoice.id;
                const isSaving = savingInvoiceId === invoice.id;

                return (
                  <div className="invoice-card" key={invoice.id}>

                    {isEditing ? (
                      <form
                        className="invoice-edit-form"
                        onSubmit={(event) =>
                          saveInvoiceEdit(event, invoice)
                        }
                      >
                        <div className="edit-form-heading">
                          <div>
                            <strong>{invoice.invoiceNumber}</strong>
                            <span>{customer?.name ?? "Unknown Customer"}</span>
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
                                setEditAmount(event.currentTarget.value)
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
                              setEditDueDate(event.currentTarget.value)
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
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                          </select>
                        </label>

                        <div className="edit-actions compact-edit-actions">
                          <button
                            className="new-customer-button"
                            type="submit"
                            disabled={isSaving}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </button>

                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setEditingInvoiceId(null)}
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
                            <strong>{customer?.name ?? "Unknown Customer"}</strong>
                            <span>{invoice.invoiceNumber}</span>
                          </div>

                          <strong>{formatMoney(invoice.amount)}</strong>
                        </div>

                        <p>{job?.description ?? "Job"}</p>
                        <p>Due {invoice.dueDate}</p>

                        <div className="invoice-status-row">
                          <span
                            className={
                              `invoice-status invoice-status-${invoice.status}`
                            }
                          >
                            {invoice.status}
                          </span>

                          <button
                            onClick={() => beginInvoiceEdit(invoice)}
                            disabled={isSaving}
                          >
                            Edit
                          </button>

                          {invoice.status === "draft" && (
                            <button
                              onClick={() =>
                                changeStatus(invoice.id, "sent")
                              }
                              disabled={isSaving}
                            >
                              Mark Sent
                            </button>
                          )}

                          {invoice.status !== "paid" && (
                            <button
                              onClick={() =>
                                changeStatus(invoice.id, "paid")
                              }
                              disabled={isSaving}
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
