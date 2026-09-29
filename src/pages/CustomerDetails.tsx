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

import {
  cleanEmail,
  cleanMultilineText,
  cleanText,
  formatPhone,
  isValidEmail,
  isValidPhone,
} from "../utils/formValidation";


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
  onUpdateCustomer: (
    customer: Customer
  ) => Promise<void>;
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
   * Edit mode stays local to this page.
   */
  const [isEditing, setIsEditing] =
    useState(false);

  const [editName, setEditName] =
    useState(customer.name);

  const [editPhone, setEditPhone] =
    useState(customer.phone);

  const [editEmail, setEditEmail] =
    useState(customer.email ?? "");

  const [editAddress, setEditAddress] =
    useState(customer.address);


  /*
   * Field-specific validation messages.
   */
  const [nameError, setNameError] =
    useState("");

  const [phoneError, setPhoneError] =
    useState("");

  const [emailError, setEmailError] =
    useState("");

  const [addressError, setAddressError] =
    useState("");


  /*
   * This error is reserved for an actual save/backend
   * failure rather than a bad form field.
   */
  const [editError, setEditError] =
    useState("");

  const [isSaving, setIsSaving] =
    useState(false);


  /*
   * Only keep jobs belonging to this customer.
   */
  const customerJobs = jobs.filter(
    (job) =>
      job.customerId === customer.id
  );


  /*
   * Sort jobs by scheduled date.
   *
   * Most recent/future dates appear first.
   */
  const sortedJobs = [
    ...customerJobs,
  ].sort(
    (a, b) =>
      b.scheduledDate.localeCompare(
        a.scheduledDate
      )
  );


  /*
   * Convert YYYY-MM-DD into a readable local date.
   */
  function formatDate(
    date: string
  ) {

    const [
      year,
      month,
      day,
    ] = date
      .split("-")
      .map(Number);


    return new Date(
      year,
      month - 1,
      day
    ).toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    );
  }


  /*
   * Keep time-sensitive job labels current.
   */
  const now = useNow();


  /*
   * Clear all form validation messages.
   */
  function clearValidationErrors() {
    setNameError("");
    setPhoneError("");
    setEmailError("");
    setAddressError("");
    setEditError("");
  }


  /*
   * Refresh the edit fields from the current saved
   * customer every time Dad starts editing.
   */
  function beginEdit() {

    setEditName(
      customer.name
    );

    setEditPhone(
      customer.phone
    );

    setEditEmail(
      customer.email ?? ""
    );

    setEditAddress(
      customer.address
    );

    clearValidationErrors();

    setIsEditing(true);
  }


  /*
   * Clean and validate everything before saving.
   */
  async function saveCustomer(
    event:
      React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    clearValidationErrors();


    /*
     * Normalize values before checking them.
     */
    const name =
      cleanText(editName);

    const phone =
      formatPhone(editPhone);

    const email =
      cleanEmail(editEmail);

    const address =
      cleanMultilineText(
        editAddress
      );


    let hasError = false;


    /*
     * Name is required.
     */
    if (!name) {

      setNameError(
        "Enter the customer's name."
      );

      hasError = true;
    }


    /*
     * Require a normal 10-digit US phone number.
     *
     * A leading 1 is also accepted.
     */
    if (
      !isValidPhone(editPhone)
    ) {

      setPhoneError(
        "Enter a 10-digit phone number."
      );

      hasError = true;
    }


    /*
     * Email is optional, but must be valid if supplied.
     */
    if (
      email &&
      !isValidEmail(email)
    ) {

      setEmailError(
        "Enter a valid email address."
      );

      hasError = true;
    }


    /*
     * Address is required.
     */
    if (!address) {

      setAddressError(
        "Enter the customer's address."
      );

      hasError = true;
    }


    /*
     * Do not send bad data to the backend.
     */
    if (hasError) {
      return;
    }


    const updatedCustomer:
      Customer = {

      ...customer,

      name,

      phone,

      email:
        email || undefined,

      address,
    };


    try {

      setIsSaving(true);

      setEditError("");


      await onUpdateCustomer(
        updatedCustomer
      );


      setIsEditing(false);

    } catch (error) {

      console.error(
        "Could not update customer:",
        error
      );

      setEditError(
        "Could not save the customer changes."
      );

    } finally {

      setIsSaving(false);
    }
  }


  return (
    <>
      <header className="app-header">

        {/*
         * The actual destination is controlled
         * by App.tsx.
         */}
        <button
          className="header-back-button"
          onClick={onBack}
        >
          ← {backLabel}
        </button>


        <h1>
          {customer.name}
        </h1>

        <p>
          Customer Details
        </p>

      </header>


      <section className="customer-details-page">

        {isEditing ? (

          /* Customer edit form */
          <form
            className="record-edit-form"
            onSubmit={saveCustomer}
            noValidate
          >

            <div className="edit-form-heading">
              <h2>
                Edit Customer
              </h2>
            </div>


            {/* Customer name */}
            <label>

              Name

              <input
                type="text"

                value={editName}

                onChange={(event) => {

                  setEditName(
                    event.currentTarget.value
                  );

                  if (nameError) {
                    setNameError("");
                  }
                }}

                autoComplete="name"

                aria-invalid={
                  Boolean(nameError)
                }
              />

              {nameError && (
                <span className="form-error">
                  {nameError}
                </span>
              )}

            </label>


            {/* Phone */}
            <label>

              Phone

              <input
                type="tel"

                value={editPhone}

                onChange={(event) => {

                  setEditPhone(
                    event.currentTarget.value
                  );

                  if (phoneError) {
                    setPhoneError("");
                  }
                }}

                /*
                 * Format the phone number once Dad
                 * leaves the field.
                 */
                onBlur={() => {

                  if (
                    isValidPhone(
                      editPhone
                    )
                  ) {

                    setEditPhone(
                      formatPhone(
                        editPhone
                      )
                    );
                  }
                }}

                placeholder="(801) 555-1234"

                autoComplete="tel"

                inputMode="tel"

                aria-invalid={
                  Boolean(phoneError)
                }
              />

              {phoneError && (
                <span className="form-error">
                  {phoneError}
                </span>
              )}

            </label>


            {/* Email */}
            <label>

              Email

              <input
                type="email"

                value={editEmail}

                onChange={(event) => {

                  setEditEmail(
                    event.currentTarget.value
                  );

                  if (emailError) {
                    setEmailError("");
                  }
                }}

                /*
                 * Trim and normalize the email after
                 * Dad leaves the field.
                 */
                onBlur={() =>
                  setEditEmail(
                    cleanEmail(
                      editEmail
                    )
                  )
                }

                placeholder="Optional"

                autoComplete="email"

                inputMode="email"

                aria-invalid={
                  Boolean(emailError)
                }
              />

              {emailError && (
                <span className="form-error">
                  {emailError}
                </span>
              )}

            </label>


            {/* Address */}
            <label>

              Address

              <textarea
                value={editAddress}

                onChange={(event) => {

                  setEditAddress(
                    event.currentTarget.value
                  );

                  if (addressError) {
                    setAddressError("");
                  }
                }}

                aria-invalid={
                  Boolean(addressError)
                }
              />

              {addressError && (
                <span className="form-error">
                  {addressError}
                </span>
              )}

            </label>


            {/* Backend/save failure */}
            {editError && (
              <p className="form-error">
                {editError}
              </p>
            )}


            <div className="edit-actions">

              <button
                className="new-customer-button"
                type="submit"
                disabled={isSaving}
              >
                {isSaving
                  ? "Saving..."
                  : "Save Changes"}
              </button>


              <button
                className="secondary-button"
                type="button"

                onClick={() => {
                  clearValidationErrors();
                  setIsEditing(false);
                }}

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

                <h2>
                  Contact Information
                </h2>


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

                <span>
                  {customer.phone}
                </span>

              </div>


              {customer.email && (
                <div className="customer-detail">

                  <span className="customer-detail-label">
                    Email
                  </span>

                  <span>
                    {customer.email}
                  </span>

                </div>
              )}


              <div className="customer-detail">

                <span className="customer-detail-label">
                  Address
                </span>

                <span>
                  {customer.address}
                </span>

              </div>

            </div>


            {/* Main customer action */}
            <button
              className="new-customer-button"
              onClick={() =>
                onAddJob(customer)
              }
            >
              + Add Job
            </button>

          </>

        )}


        {/* Customer job history */}
        <div className="customer-jobs-section">

          <div className="section-heading">

            <h2>
              Jobs
            </h2>

            <span>
              {customerJobs.length}
            </span>

          </div>


          {sortedJobs.length === 0 ? (

            <div className="empty-state">

              <p>
                No jobs for this customer yet.
              </p>

            </div>

          ) : (

            <div className="job-list">

              {sortedJobs.map(
                (job) => {

                  const formattedTime =
                    formatTime(
                      job.scheduledTime
                    );


                  return (
                    <div
                      className="job-card clickable-job-card"
                      key={job.id}
                      onClick={() =>
                        onSelectJob(job)
                      }
                    >

                      <div className="job-card-header">

                        <strong>
                          {job.description}
                        </strong>


                        <span className="job-status">

                          {job.status === "active"
                            ? "In Progress"
                            : job.status === "completed"
                              ? "Completed"
                              : "Scheduled"}

                        </span>

                      </div>


                      <div className="job-schedule">

                        <span>
                          {formatDate(
                            job.scheduledDate
                          )}
                        </span>


                        {formattedTime && (
                          <span>
                            {formattedTime}
                          </span>
                        )}

                      </div>


                      <p className="job-pricing">
                        {getJobTimeInfo(
                          job,
                          now
                        )}
                      </p>


                      <p className="job-pricing">

                        {job.pricingType ===
                        "hourly"

                          ? job.hourlyRate !==
                            undefined

                            ? `${formatMoney(
                                job.hourlyRate
                              )} / hour`

                            : "Hourly rate not entered"

                          : job.fixedPrice !==
                            undefined

                            ? `${formatMoney(
                                job.fixedPrice
                              )} fixed price`

                            : "Fixed price not entered"}

                      </p>


                      {job.status ===
                        "completed" && (

                        <p className="job-pricing">

                          Total:{" "}

                          {formatMoney(
                            getJobAmount(
                              job,
                              now
                            )
                          )}

                        </p>

                      )}

                    </div>
                  );
                }
              )}

            </div>

          )}

        </div>

      </section>
    </>
  );
}


export default CustomerDetails;