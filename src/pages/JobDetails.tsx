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
  isJobWorking,
  getTotalWorkedMs,
} from "../utils/workSessions";

import { useNow } from "../utils/useNow";


type JobDetailsProps = {
  job: Job;
  customer: Customer;
  jobs: Job[];

  onBack: () => void;

  onViewCustomer: (
    customer: Customer
  ) => void;

  /*
   * App.tsx owns saving the job.
   *
   * Job Details creates the updated Job object,
   * and App persists it through the API.
   */
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

  /*
   * Refresh once per minute.
   *
   * This keeps:
   *
   * - scheduled-time information current
   * - active work time current
   * - hourly labor totals current
   */
  const now = useNow();

  /*
   * Editing stays inside Job Details so Dad does not
   * need to navigate to a separate editing page.
   */
  const [isEditing, setIsEditing] =
    useState(false);

  const [
    editDescription,
    setEditDescription,
  ] = useState(job.description);

  const [
    editScheduledDate,
    setEditScheduledDate,
  ] = useState(job.scheduledDate);

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
      ? String(job.hourlyRate)
      : ""
  );

  const [
    editFixedPrice,
    setEditFixedPrice,
  ] = useState(
    job.fixedPrice !== undefined
      ? String(job.fixedPrice)
      : ""
  );

  const [editError, setEditError] =
    useState("");

  const [isSaving, setIsSaving] =
    useState(false);


  /*
   * Count every job belonging to this customer.
   */
  const customerJobCount = jobs.filter(
    (currentJob) =>
      currentJob.customerId === customer.id
  ).length;

  /*
   * Work sessions replace the old single startedAt
   * timestamp.
   *
   * Older jobs may not have workSessions yet, so
   * always fall back to an empty array.
   */
  const workSessions =
    job.workSessions ?? [];

  /*
   * A job is currently "working" when there is a
   * session with a start time but no end time.
   */
  const working =
    isJobWorking(workSessions);

  /*
   * Add together all completed sessions.
   *
   * If one session is currently open, its duration
   * is calculated up to the current time.
   */
  const totalWorkedMs =
    getTotalWorkedMs(
      workSessions,
      now
    );

  /*
   * Hours are useful for calculating hourly labor.
   *
   * Example:
   *
   * 2 hours 30 minutes -> 2.5 hours
   */
  const workedHours =
    totalWorkedMs /
    (1000 * 60 * 60);

  /*
   * Fixed jobs use their agreed price.
   *
   * Hourly jobs calculate the current labor amount
   * from all recorded work sessions.
   */
  const currentAmount =
    job.pricingType === "hourly"
      ? workedHours *
        (job.hourlyRate ?? 0)
      : job.fixedPrice ?? 0;


  const formattedTime =
    formatTime(job.scheduledTime);

  /*
   * Scheduled jobs still use jobTime.ts because that
   * utility answers questions such as:
   *
   * "Starts in 45m"
   * "Tomorrow"
   * "2h past scheduled time"
   *
   * Once work has started, workSessions becomes the
   * source of truth instead.
   */
  const scheduleTimeInfo =
    getJobTimeInfo(job, now);

  /*
   * Convert milliseconds into something Dad can
   * read easily.
   *
   * Examples:
   *
   * 45 min
   * 2 hr 15 min
   * 8 hr
   */
  function formatWorkedTime(
    milliseconds: number
  ) {
    const totalMinutes =
        Math.max(
            0,
            Math.floor(
            milliseconds / 60000
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
      return hours === 1
        ? "1 hr"
        : `${hours} hr`;
    }


    return `${hours} hr ${minutes} min`;
  }

  /*
   * The large time message shown near the top of
   * Job Details.
   */
  function getTimeCallout() {

    if (job.status === "completed") {
      return (
        `${formatWorkedTime(totalWorkedMs)} worked`
      );
    }


    if (job.status === "active") {

      if (working) {
        return (
          `Working now · ${formatWorkedTime(totalWorkedMs)} total`
        );
      }


      return (
        `Paused · ${formatWorkedTime(totalWorkedMs)} worked`
      );
    }


    return scheduleTimeInfo;
  }

  /*
   * Status text should describe what is actually
   * happening rather than simply saying Active.
   */
  function getStatusLabel() {

    if (job.status === "completed") {
      return "Completed";
    }


    if (job.status === "active") {
      return working
        ? "Working"
        : "Paused";
    }


    return "Scheduled";
  }

  /*
   * Start with the latest saved values every time
   * Dad presses Edit.
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
        ? String(job.hourlyRate)
        : ""
    );

    setEditFixedPrice(
      job.fixedPrice !== undefined
        ? String(job.fixedPrice)
        : ""
    );

    setEditError("");

    setIsEditing(true);
  }

  /*
   * Save editable job information.
   *
   * Because we spread the existing job first,
   * workSessions, status, and completedAt are
   * preserved automatically.
   */
  async function saveJob(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();


    const updatedJob: Job = {
      ...job,

      description:
        editDescription.trim(),

      scheduledDate:
        editScheduledDate,

      scheduledTime:
        editScheduledTime ||
        undefined,

      pricingType:
        editPricingType,

      hourlyRate:
        editPricingType === "hourly"
          ? Number(editHourlyRate)
          : undefined,

      fixedPrice:
        editPricingType === "fixed"
          ? Number(editFixedPrice)
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
   * Start Work and Resume Work use the same function.
   *
   * Every time work begins, create a NEW session.
   *
   * This means a job can span multiple days:
   *
   * Monday:
   *   Start -> Pause
   *
   * Tuesday:
   *   Resume -> Pause
   *
   * Wednesday:
   *   Resume -> Pause -> Finish
   */
  async function startWork() {

    /*
     * Do not accidentally create two running
     * sessions at the same time.
     */
    if (working) {
      return;
    }


    const newSession: WorkSession = {
      id: crypto.randomUUID(),

      jobId: job.id,

      /*
       * Exact event timestamps should use ISO/UTC.
       *
       * Unlike an invoice calendar date, timezone
       * conversion is desirable here because elapsed
       * time remains unambiguous.
       */
      startedAt:
        new Date().toISOString(),
    };


    try {

      setIsSaving(true);

      setEditError("");


      await onUpdateJob({
        ...job,

        status: "active",

        completedAt: undefined,

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
   * Pause the currently running session.
   *
   * The job itself stays active because the overall
   * job is not finished yet.
   */
  async function pauseWork() {

    const endedAt =
      new Date().toISOString();

    /*
     * Close whichever session is currently open.
     *
     * Normally there can only be one open session.
     */
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
   * Finish the overall job.
   *
   * Finish is only offered while work is paused.
   * That makes "Pause Work" and "Finish Job"
   * clearly different actions.
   */
  async function completeJob() {

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
          >

            <div className="edit-form-heading">
              <h2>Edit Job</h2>
            </div>

            <label>
              What needs to be done?

              <textarea
                value={
                  editDescription
                }

                onChange={(event) =>
                  setEditDescription(
                    event.currentTarget.value
                  )
                }

                required
              />
            </label>

            <label>
              Scheduled Date

              <input
                type="date"

                value={
                  editScheduledDate
                }

                onChange={(event) =>
                  setEditScheduledDate(
                    event.currentTarget.value
                  )
                }

                required
              />
            </label>

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

            <label>
              Pricing

              <select
                value={
                  editPricingType
                }

                onChange={(event) =>
                  setEditPricingType(
                    event.currentTarget.value as "hourly" | "fixed"
                  )
                }
              >
                <option value="hourly">
                  Hourly
                </option>

                <option value="fixed">
                  Fixed Price
                </option>
              </select>
            </label>

            {editPricingType === "hourly"
              ? (

                <label>
                  Hourly Rate

                  <div className="money-input">

                    <span>$</span>

                    <input
                      type="number"

                      min="0"

                      step="0.01"

                      inputMode="decimal"

                      value={
                        editHourlyRate
                      }

                      onChange={(event) =>
                        setEditHourlyRate(
                          event.currentTarget.value
                        )
                      }

                      required
                    />

                    <span>
                      / hour
                    </span>

                  </div>
                </label>

              ) : (

                <label>
                  Fixed Job Price

                  <div className="money-input">

                    <span>$</span>

                    <input
                      type="number"

                      min="0"

                      step="0.01"

                      inputMode="decimal"

                      value={
                        editFixedPrice
                      }

                      onChange={(event) =>
                        setEditFixedPrice(
                          event.currentTarget.value
                        )
                      }

                      required
                    />

                  </div>
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

                onClick={() =>
                  setIsEditing(false)
                }

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
                    `job-status job-status-${job.status}`
                  }
                >
                  {getStatusLabel()}
                </span>

              </div>

              {/*
               * This now reflects either the real
               * schedule OR real work-session state.
               */}
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

                  {job.pricingType === "hourly"

                    ? job.hourlyRate !== undefined

                      ? `${formatMoney(
                          job.hourlyRate
                        )} / hour`

                      : "Hourly rate not entered"

                    : job.fixedPrice !== undefined

                      ? `${formatMoney(
                          job.fixedPrice
                        )} fixed price`

                      : "Fixed price not entered"}

                </span>

              </div>

              {/*
               * Time Worked appears once at least one
               * work session exists.
               */}
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

              {/*
               * Show a labor total once it is meaningful.
               *
               * Fixed-price jobs always have a total.
               * Hourly jobs need at least one session.
               */}
              {(job.fixedPrice !== undefined ||
                (
                  job.hourlyRate !== undefined &&
                  workSessions.length > 0
                )) && (

                <div className="job-detail job-total-detail">

                  <span className="job-detail-label">

                    {job.status === "completed"
                      ? "Job Total"
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

            {editError && (
              <p className="form-error action-error">
                {editError}
              </p>
            )}

            {/*
             * A job that has never been started.
             */}
            {job.status === "upcoming" && (

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

            {/*
             * Work is currently running.
             *
             * Pausing closes the current work session
             * but does NOT finish the overall job.
             */}
            {job.status === "active" &&
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

            {/*
             * The overall job is still active, but
             * Dad is not currently working on it.
             *
             * He can either start another work session
             * or declare the whole job complete.
             */}
            {job.status === "active" &&
              !working && (

                <div className="job-work-actions">

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
                    Finish Job
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