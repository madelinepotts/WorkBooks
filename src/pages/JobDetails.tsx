import { useState } from "react";

import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";
import type { WorkSession } from "../types/WorkSession";

import {
  formatLongDate,
  formatMoney,
  formatTime,
  getJobTimeInfo,
} from "../utils/jobTime";

import {
  getTotalWorkedMs,
  isJobWorking,
} from "../utils/workSessions";

import {
  cleanMultilineText,
  isPositiveMoney,
  isValidDateInput,
  parseMoney,
} from "../utils/formValidation";

import { useNow } from "../utils/useNow";

import JobMaterials from "../components/JobMaterials";
import JobReceipts from "../components/JobReceipts";
import WorkSessionEditor from "../components/WorkSessionEditor";


type JobDetailsProps = {
  job: Job;
  customer: Customer;
  jobs: Job[];

  onBack: () => void;

  onViewCustomer: (
    customer: Customer
  ) => void;

  onUpdateJob: (
    job: Job
  ) => Promise<void>;
};


function JobDetails({
  job,
  customer,
  jobs,
  onBack,
  onViewCustomer,
  onUpdateJob,
}: JobDetailsProps) {

  const now = useNow();


  /*
   * Editing state.
   */
  const [isEditing, setIsEditing] =
    useState(false);

  const [
    editDescription,
    setEditDescription,
  ] = useState(
    job.description
  );

  const [
    editScheduledDate,
    setEditScheduledDate,
  ] = useState(
    job.scheduledDate
  );

  const [
    editScheduledTime,
    setEditScheduledTime,
  ] = useState(
    job.scheduledTime ?? ""
  );

  const [
    editPricingType,
    setEditPricingType,
  ] = useState<"hourly" | "fixed">(
    job.pricingType
  );

  const [
    editHourlyRate,
    setEditHourlyRate,
  ] = useState(
    job.hourlyRate !== undefined
      ? job.hourlyRate.toFixed(2)
      : ""
  );

  const [
    editFixedPrice,
    setEditFixedPrice,
  ] = useState(
    job.fixedPrice !== undefined
      ? job.fixedPrice.toFixed(2)
      : ""
  );


  /*
   * Validation errors.
   */
  const [
    descriptionError,
    setDescriptionError,
  ] = useState("");

  const [
    dateError,
    setDateError,
  ] = useState("");

  const [
    priceError,
    setPriceError,
  ] = useState("");

  const [
    editError,
    setEditError,
  ] = useState("");

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);


  const customerJobCount =
    jobs.filter(
      (currentJob) =>
        currentJob.customerId ===
        customer.id
    ).length;


  /*
   * Work-session state.
   */
  const workSessions =
    job.workSessions ?? [];

  const working =
    isJobWorking(
      workSessions
    );

  const totalWorkedMs =
    getTotalWorkedMs(
      workSessions,
      now
    );

  const workedHours =
    totalWorkedMs /
    3_600_000;


  /*
   * Current labor value.
   *
   * Materials are displayed separately by JobMaterials.
   * We will combine labor + materials into invoice totals
   * in the next step.
   */
  const currentAmount =
    job.pricingType === "fixed"
      ? job.fixedPrice ?? 0
      : workedHours *
        (job.hourlyRate ?? 0);


  const formattedTime =
    formatTime(
      job.scheduledTime
    );


  /*
   * Human-friendly duration.
   */
  function formatWorkedTime(
    milliseconds: number
  ) {

    const totalMinutes =
      Math.max(
        0,
        Math.floor(
          milliseconds / 60_000
        )
      );


    const hours =
      Math.floor(
        totalMinutes / 60
      );

    const minutes =
      totalMinutes % 60;


    if (hours === 0) {
      return `${minutes} min`;
    }


    if (minutes === 0) {
      return `${hours} hr`;
    }


    return (
      `${hours} hr ` +
      `${minutes} min`
    );
  }


  /*
   * Derived job status displayed to Dad.
   */
  function getStatusLabel() {

    if (
      job.status === "completed"
    ) {
      return "Completed";
    }


    if (
      job.status === "active"
    ) {
      return working
        ? "Working"
        : "Paused";
    }


    return "Scheduled";
  }


  /*
   * Main callout shown near the top of the job.
   */
  function getTimeCallout() {

    const worked =
      formatWorkedTime(
        totalWorkedMs
      );


    if (
      job.status === "completed"
    ) {
      return `${worked} worked`;
    }


    if (
      job.status === "active"
    ) {

      if (working) {
        return (
          `Working now · ` +
          `${worked} total`
        );
      }


      return (
        `Paused · ` +
        `${worked} worked`
      );
    }


    return getJobTimeInfo(
      job,
      now
    );
  }


  function clearValidationErrors() {
    setDescriptionError("");
    setDateError("");
    setPriceError("");
    setEditError("");
  }


  /*
   * Format prices after leaving the field.
   *
   * 75 -> 75.00
   */
  function formatPrice(
    value: string,
    setter: (
      value: string
    ) => void
  ) {

    const amount =
      parseMoney(value);


    if (
      amount !== null &&
      amount > 0
    ) {
      setter(
        amount.toFixed(2)
      );
    }
  }


  /*
   * Load the current saved values every time Edit
   * is opened.
   */
  function beginEdit() {

    setEditDescription(
      job.description
    );

    setEditScheduledDate(
      job.scheduledDate
    );

    setEditScheduledTime(
      job.scheduledTime ?? ""
    );

    setEditPricingType(
      job.pricingType
    );

    setEditHourlyRate(
      job.hourlyRate !== undefined
        ? job.hourlyRate.toFixed(2)
        : ""
    );

    setEditFixedPrice(
      job.fixedPrice !== undefined
        ? job.fixedPrice.toFixed(2)
        : ""
    );

    clearValidationErrors();

    setIsEditing(true);
  }


  /*
   * Validate and save job edits.
   *
   * Existing work sessions and status are preserved
   * because we spread the existing job first.
   */
  async function saveJob(
    event:
      React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    clearValidationErrors();


    const description =
      cleanMultilineText(
        editDescription
      );


    let hasError = false;


    if (!description) {

      setDescriptionError(
        "Enter what needs to be done."
      );

      hasError = true;
    }


    if (
      !isValidDateInput(
        editScheduledDate
      )
    ) {

      setDateError(
        "Choose a valid scheduled date."
      );

      hasError = true;
    }


    const priceValue =
      editPricingType === "hourly"
        ? editHourlyRate
        : editFixedPrice;


    if (
      !isPositiveMoney(
        priceValue
      )
    ) {

      setPriceError(
        editPricingType === "hourly"
          ? "Enter an hourly rate greater than $0.00."
          : "Enter a fixed price greater than $0.00."
      );

      hasError = true;
    }


    if (hasError) {
      return;
    }


    const price =
      parseMoney(
        priceValue
      )!;


    const updatedJob: Job = {
      ...job,

      description,

      scheduledDate:
        editScheduledDate,

      scheduledTime:
        editScheduledTime ||
        undefined,

      pricingType:
        editPricingType,

      hourlyRate:
        editPricingType ===
        "hourly"
          ? price
          : undefined,

      fixedPrice:
        editPricingType ===
        "fixed"
          ? price
          : undefined,
    };


    try {

      setIsSaving(true);

      setEditError("");


      await onUpdateJob(
        updatedJob
      );


      setIsEditing(false);

    } catch (error) {

      console.error(
        "Could not update job:",
        error
      );

      setEditError(
        "Could not save the job changes."
      );

    } finally {

      setIsSaving(false);
    }
  }


  /*
   * Start Work and Resume Work use the same operation:
   * create a new open work session.
   */
  async function startWork() {

    if (working) {
      return;
    }


    const newSession:
      WorkSession = {

      id:
        crypto.randomUUID(),

      jobId:
        job.id,

      startedAt:
        new Date().toISOString(),
    };


    try {

      setIsSaving(true);

      setEditError("");


      await onUpdateJob({
        ...job,

        status: "active",

        completedAt:
          undefined,

        workSessions: [
          ...workSessions,
          newSession,
        ],
      });

    } catch (error) {

      console.error(
        "Could not start work:",
        error
      );

      setEditError(
        "Could not start work."
      );

    } finally {

      setIsSaving(false);
    }
  }


  /*
   * Pause the currently open work session.
   */
  async function pauseWork() {

    if (!working) {
      return;
    }


    const endedAt =
      new Date().toISOString();


    const updatedSessions =
      workSessions.map(
        (session) => {

          if (!session.endedAt) {
            return {
              ...session,
              endedAt,
            };
          }


          return session;
        }
      );


    try {

      setIsSaving(true);

      setEditError("");


      await onUpdateJob({
        ...job,

        status: "active",

        workSessions:
          updatedSessions,
      });

    } catch (error) {

      console.error(
        "Could not pause work:",
        error
      );

      setEditError(
        "Could not pause work."
      );

    } finally {

      setIsSaving(false);
    }
  }


  /*
   * Finish Job is intentionally separate from Pause.
   *
   * The button is only available while the job is
   * already paused.
   */
  async function completeJob() {

    if (working) {
      return;
    }


    try {

      setIsSaving(true);

      setEditError("");


      await onUpdateJob({
        ...job,

        status: "completed",

        completedAt:
          new Date().toISOString(),
      });

    } catch (error) {

      console.error(
        "Could not finish job:",
        error
      );

      setEditError(
        "Could not finish the job."
      );

    } finally {

      setIsSaving(false);
    }
  }


  return (
    <>
      <header className="app-header">

        <button
          className="header-back-button"
          onClick={onBack}
        >
          ← Back
        </button>


        <h1>
          Job Details
        </h1>


        <div className="job-customer-header">

          <div className="job-customer-info">

            <button
              className="header-customer-link"

              onClick={() =>
                onViewCustomer(
                  customer
                )
              }
            >
              {customer.name}
            </button>


            <span className="header-customer-address">
              {customer.address}
            </span>

          </div>


          <span className="header-customer-job-count">

            {customerJobCount === 1
              ? "1 job"
              : `${customerJobCount} jobs`}

          </span>

        </div>

      </header>


      <section className="job-details-page">

        {isEditing ? (

          <form
            className="record-edit-form"
            onSubmit={saveJob}
            noValidate
          >

            <div className="edit-form-heading">
              <h2>
                Edit Job
              </h2>
            </div>


            {/* Description */}
            <label>

              What needs to be done?

              <textarea
                value={
                  editDescription
                }

                onChange={(event) => {

                  setEditDescription(
                    event.currentTarget.value
                  );

                  if (
                    descriptionError
                  ) {
                    setDescriptionError(
                      ""
                    );
                  }
                }}

                aria-invalid={
                  Boolean(
                    descriptionError
                  )
                }
              />

              {descriptionError && (
                <span className="form-error">
                  {descriptionError}
                </span>
              )}

            </label>


            {/* Date */}
            <label>

              Scheduled Date

              <input
                type="date"

                value={
                  editScheduledDate
                }

                onChange={(event) => {

                  setEditScheduledDate(
                    event.currentTarget.value
                  );

                  if (dateError) {
                    setDateError("");
                  }
                }}

                aria-invalid={
                  Boolean(dateError)
                }
              />

              {dateError && (
                <span className="form-error">
                  {dateError}
                </span>
              )}

            </label>


            {/* Time */}
            <label>

              Scheduled Time

              <input
                type="time"

                value={
                  editScheduledTime
                }

                onChange={(event) =>
                  setEditScheduledTime(
                    event.currentTarget.value
                  )
                }
              />

            </label>


            {/* Pricing type */}
            <label>

              Pricing

              <select
                value={
                  editPricingType
                }

                onChange={(event) => {

                  setEditPricingType(
                    event.currentTarget.value as
                      | "hourly"
                      | "fixed"
                  );

                  setPriceError("");
                }}
              >

                <option value="hourly">
                  Hourly
                </option>

                <option value="fixed">
                  Fixed Price
                </option>

              </select>

            </label>


            {editPricingType ===
            "hourly" ? (

              <label>

                Hourly Rate

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
                      editHourlyRate
                    }

                    onChange={(event) => {

                      setEditHourlyRate(
                        event.currentTarget.value
                      );

                      if (priceError) {
                        setPriceError("");
                      }
                    }}

                    onBlur={() =>
                      formatPrice(
                        editHourlyRate,
                        setEditHourlyRate
                      )
                    }

                    aria-invalid={
                      Boolean(
                        priceError
                      )
                    }
                  />

                  <span>
                    / hour
                  </span>

                </div>


                {priceError && (
                  <span className="form-error">
                    {priceError}
                  </span>
                )}

              </label>

            ) : (

              <label>

                Fixed Job Price

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
                      editFixedPrice
                    }

                    onChange={(event) => {

                      setEditFixedPrice(
                        event.currentTarget.value
                      );

                      if (priceError) {
                        setPriceError("");
                      }
                    }}

                    onBlur={() =>
                      formatPrice(
                        editFixedPrice,
                        setEditFixedPrice
                      )
                    }

                    aria-invalid={
                      Boolean(
                        priceError
                      )
                    }
                  />

                </div>


                {priceError && (
                  <span className="form-error">
                    {priceError}
                  </span>
                )}

              </label>

            )}


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

            <div className="job-details-card">

              <div className="job-details-heading">

                <h2>
                  {job.description}
                </h2>


                <span
                  className={
                    `job-status ` +
                    `job-status-${job.status}`
                  }
                >
                  {getStatusLabel()}
                </span>

              </div>


              <div className="job-time-callout">
                {getTimeCallout()}
              </div>


              <div className="job-detail">

                <span className="job-detail-label">
                  Scheduled
                </span>

                <span>
                  {formatLongDate(
                    job.scheduledDate
                  )}
                </span>

                {formattedTime && (
                  <span>
                    {formattedTime}
                  </span>
                )}

              </div>


              <div className="job-detail">

                <span className="job-detail-label">
                  Pricing
                </span>

                <span>

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

                </span>

              </div>


              {workSessions.length > 0 && (
                <div className="job-detail">

                  <span className="job-detail-label">
                    Time Worked
                  </span>

                  <span>
                    {formatWorkedTime(
                      totalWorkedMs
                    )}
                  </span>

                </div>
              )}


              {(job.fixedPrice !==
                undefined ||
                (job.hourlyRate !==
                  undefined &&
                  workSessions.length >
                    0)) && (

                <div className="job-detail job-total-detail">

                  <span className="job-detail-label">

                    {job.status ===
                    "completed"
                      ? "Labor Total"
                      : "Current Labor Total"}

                  </span>


                  <strong>
                    {formatMoney(
                      currentAmount
                    )}
                  </strong>

                </div>

              )}


              <button
                className="small-edit-button job-edit-button"
                type="button"
                onClick={beginEdit}
              >
                Edit Job
              </button>

            </div>

            {/*
             * Individual recorded work periods.
             *
             * Dad can fix incorrect times, delete an
             * accidental session, or enter missed time.
             */}
            <WorkSessionEditor
              job={job}
              onUpdateJob={onUpdateJob}
            />

            {/*
             * Materials are kept in their own component so all
             * material loading/editing/deleting logic stays out
             * of this already-large page.
             */}
            <JobMaterials
              job={job}
            />

            {/*
            * Receipt images and PDFs for this job.
            */}
            <JobReceipts
              job={job}
            />


            {editError && (
              <p className="form-error action-error">
                {editError}
              </p>
            )}


            {/* New job */}
            {job.status ===
              "upcoming" && (

              <button
                className="start-job-button"
                onClick={startWork}
                disabled={isSaving}
              >
                {isSaving
                  ? "Saving..."
                  : "Start Work"}
              </button>

            )}


            {/* Currently working */}
            {job.status ===
              "active" &&
              working && (

              <button
                className="complete-job-button"
                onClick={pauseWork}
                disabled={isSaving}
              >
                {isSaving
                  ? "Saving..."
                  : "Pause Work"}
              </button>

            )}


            {/* Paused */}
            {job.status ===
              "active" &&
              !working && (

              <div className="edit-actions">

                <button
                  className="start-job-button"
                  onClick={startWork}
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Saving..."
                    : "Resume Work"}
                </button>


                <button
                  className="complete-job-button"
                  onClick={completeJob}
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Saving..."
                    : "Finish Job"}
                </button>

              </div>

            )}

          </>

        )}

      </section>
    </>
  );
}


export default JobDetails;