import { useState } from "react";

import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";
import {
  formatMoney,
  formatTime,
  getJobAmount,
  getJobTimeInfo,
} from "../utils/jobTime";
import { useNow } from "../utils/useNow";


type CustomerDetailsProps = {
  customer: Customer;
  jobs: Job[];

  /*
   * Text displayed in the Back button.
   *
   * Examples:
   * "Customers"
   * "Job Details"
   */
  backLabel: string;

  onBack: () => void;
  onAddJob: (customer: Customer) => void;
  onSelectJob: (job: Job) => void;

  /*
   * Saves edits to this customer in SQLite through App.tsx.
   */
  onUpdateCustomer: (customer: Customer) => Promise<void>;
};


function CustomerDetails({
  customer,
  jobs,
  backLabel,
  onBack,
  onAddJob,
  onSelectJob,
  onUpdateCustomer,
}: CustomerDetailsProps) {

  /*
   * Edit mode stays local to this page. The normal details view remains
   * uncluttered until Dad intentionally presses Edit Customer.
   */
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(customer.name);
  const [editPhone, setEditPhone] = useState(customer.phone);
  const [editEmail, setEditEmail] = useState(customer.email ?? "");
  const [editAddress, setEditAddress] = useState(customer.address);
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);


  /*
   * Only keep jobs belonging to this customer.
   */
  const customerJobs = jobs.filter(
    (job) => job.customerId === customer.id
  );


  /*
   * Sort jobs by scheduled date.
   *
   * Most recent/future dates will appear first.
   */
  const sortedJobs = [...customerJobs].sort(
    (a, b) =>
      b.scheduledDate.localeCompare(a.scheduledDate)
  );


  /*
   * Convert our YYYY-MM-DD date into something easier
   * for Dad to read.
   */
  function formatDate(date: string) {
    const [year, month, day] = date
      .split("-")
      .map(Number);

    return new Date(
      year,
      month - 1,
      day
    ).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }


  /*
   * Keep time-sensitive job labels current while this page is open.
   */
  const now = useNow();


  /*
   * Refresh the edit fields from the current saved customer every time
   * Dad starts editing. This matters if the record changed previously.
   */
  function beginEdit() {
    setEditName(customer.name);
    setEditPhone(customer.phone);
    setEditEmail(customer.email ?? "");
    setEditAddress(customer.address);
    setEditError("");
    setIsEditing(true);
  }


  /*
   * Save the edited customer through the backend before returning to
   * the normal details view.
   */
  async function saveCustomer(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const updatedCustomer: Customer = {
      ...customer,
      name: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim() || undefined,
      address: editAddress.trim(),
    };

    try {
      setIsSaving(true);
      setEditError("");

      await onUpdateCustomer(updatedCustomer);

      setIsEditing(false);

    } catch (error) {
      console.error("Could not update customer:", error);
      setEditError("Could not save the customer changes.");

    } finally {
      setIsSaving(false);
    }
  }


  return (
    <>
      <header className="app-header">

        {/*
         * The actual destination is controlled by App.tsx.
         *
         * backLabel makes sure the button also tells Dad
         * where it will take him.
         */}
        <button
          className="header-back-button"
          onClick={onBack}
        >
          ← {backLabel}
        </button>

        <h1>{customer.name}</h1>

        <p>Customer Details</p>

      </header>


      <section className="customer-details-page">

        {isEditing ? (
          /* Customer edit form */
          <form
            className="record-edit-form"
            onSubmit={saveCustomer}
          >
            <div className="edit-form-heading">
              <h2>Edit Customer</h2>
            </div>

            <label>
              Name
              <input
                type="text"
                value={editName}
                onChange={(event) =>
                  setEditName(event.currentTarget.value)
                }
                required
              />
            </label>

            <label>
              Phone
              <input
                type="tel"
                value={editPhone}
                onChange={(event) =>
                  setEditPhone(event.currentTarget.value)
                }
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={editEmail}
                onChange={(event) =>
                  setEditEmail(event.currentTarget.value)
                }
              />
            </label>

            <label>
              Address
              <textarea
                value={editAddress}
                onChange={(event) =>
                  setEditAddress(event.currentTarget.value)
                }
                required
              />
            </label>

            {editError && (
              <p className="form-error">{editError}</p>
            )}

            <div className="edit-actions">
              <button
                className="new-customer-button"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Customer contact information */}
            <div className="customer-details-card">

              <div className="details-card-heading">
                <h2>Contact Information</h2>

                <button
                  className="small-edit-button"
                  type="button"
                  onClick={beginEdit}
                >
                  Edit
                </button>
              </div>

              <div className="customer-detail">
                <span className="customer-detail-label">
                  Phone
                </span>

                <span>{customer.phone}</span>
              </div>

              {customer.email && (
                <div className="customer-detail">
                  <span className="customer-detail-label">
                    Email
                  </span>

                  <span>{customer.email}</span>
                </div>
              )}

              <div className="customer-detail">
                <span className="customer-detail-label">
                  Address
                </span>

                <span>{customer.address}</span>
              </div>

            </div>

            {/* Main customer action */}
            <button
              className="new-customer-button"
              onClick={() => onAddJob(customer)}
            >
              + Add Job
            </button>
          </>
        )}


        {/* Customer job history */}
        <div className="customer-jobs-section">

          <div className="section-heading">
            <h2>Jobs</h2>

            <span>{customerJobs.length}</span>
          </div>


          {sortedJobs.length === 0 ? (
            <div className="empty-state">
              <p>No jobs for this customer yet.</p>
            </div>
          ) : (
            <div className="job-list">

              {sortedJobs.map((job) => {
                const formattedTime =
                  formatTime(job.scheduledTime);

                return (
                  <div
                    className="job-card clickable-job-card"
                    key={job.id}
                    onClick={() => onSelectJob(job)}
                  >
                    <div className="job-card-header">
                      <strong>{job.description}</strong>

                      <span className="job-status">
                        {job.status === "active"
                          ? "In Progress"
                          : job.status === "completed"
                            ? "Completed"
                            : "Scheduled"}
                      </span>
                    </div>

                    <div className="job-schedule">
                      <span>{formatDate(job.scheduledDate)}</span>

                      {formattedTime && (
                        <span>{formattedTime}</span>
                      )}
                    </div>

                    <p className="job-pricing">
                      {getJobTimeInfo(job, now)}
                    </p>

                    <p className="job-pricing">
                      {job.pricingType === "hourly"
                        ? job.hourlyRate !== undefined
                          ? `${formatMoney(job.hourlyRate)} / hour`
                          : "Hourly rate not entered"
                        : job.fixedPrice !== undefined
                          ? `${formatMoney(job.fixedPrice)} fixed price`
                          : "Fixed price not entered"}
                    </p>

                    {job.status === "completed" && (
                      <p className="job-pricing">
                        Total: {formatMoney(getJobAmount(job, now))}
                      </p>
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


export default CustomerDetails;
