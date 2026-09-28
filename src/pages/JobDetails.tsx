import { useState } from "react";

import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";
import {
  formatLongDate,
  formatMoney,
  formatTime,
  getJobAmount,
  getJobTimeInfo,
  getWorkedHours,
} from "../utils/jobTime";
import { useNow } from "../utils/useNow";


type JobDetailsProps = {
  job: Job;
  customer: Customer;
  jobs: Job[];
  onBack: () => void;
  onViewCustomer: (customer: Customer) => void;

  /*
   * Every job change is persisted through App.tsx before the page is
   * updated. This covers edits as well as Start Job / Finish Job.
   */
  onUpdateJob: (job: Job) => Promise<void>;
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
   * Refresh once per minute so schedule information and the active
   * work timer stay useful without Dad refreshing the page.
   */
  const now = useNow();


  /*
   * Edit state stays inside Job Details so there is no separate edit
   * page to learn or navigate.
   */
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(job.description);
  const [editScheduledDate, setEditScheduledDate] = useState(job.scheduledDate);
  const [editScheduledTime, setEditScheduledTime] = useState(job.scheduledTime ?? "");
  const [editPricingType, setEditPricingType] =
    useState<"hourly" | "fixed">(job.pricingType);
  const [editHourlyRate, setEditHourlyRate] = useState(
    job.hourlyRate !== undefined ? String(job.hourlyRate) : ""
  );
  const [editFixedPrice, setEditFixedPrice] = useState(
    job.fixedPrice !== undefined ? String(job.fixedPrice) : ""
  );
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);


  const customerJobCount = jobs.filter(
    (currentJob) => currentJob.customerId === customer.id
  ).length;

  const formattedTime = formatTime(job.scheduledTime);
  const timeInfo = getJobTimeInfo(job, now);
  const workedHours = getWorkedHours(job, now);
  const currentAmount = getJobAmount(job, now);


  /*
   * Start with the latest saved values each time Dad presses Edit.
   */
  function beginEdit() {
    setEditDescription(job.description);
    setEditScheduledDate(job.scheduledDate);
    setEditScheduledTime(job.scheduledTime ?? "");
    setEditPricingType(job.pricingType);
    setEditHourlyRate(
      job.hourlyRate !== undefined ? String(job.hourlyRate) : ""
    );
    setEditFixedPrice(
      job.fixedPrice !== undefined ? String(job.fixedPrice) : ""
    );
    setEditError("");
    setIsEditing(true);
  }


  /*
   * Save editable job information while preserving the work timestamps
   * and current job status.
   */
  async function saveJob(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const updatedJob: Job = {
      ...job,
      description: editDescription.trim(),
      scheduledDate: editScheduledDate,
      scheduledTime: editScheduledTime || undefined,
      pricingType: editPricingType,
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

      await onUpdateJob(updatedJob);

      setIsEditing(false);

    } catch (error) {
      console.error("Could not update job:", error);
      setEditError("Could not save the job changes.");

    } finally {
      setIsSaving(false);
    }
  }


  /*
   * Work timing is based on saved timestamps, not a fragile counter.
   * Closing and reopening WorkBooks therefore keeps the correct time.
   */
  async function startJob() {
    try {
      setIsSaving(true);
      setEditError("");

      await onUpdateJob({
        ...job,
        status: "active",
        startedAt: new Date().toISOString(),
        completedAt: undefined,
      });

    } catch (error) {
      console.error("Could not start job:", error);
      setEditError("Could not start the job.");

    } finally {
      setIsSaving(false);
    }
  }


  async function completeJob() {
    try {
      setIsSaving(true);
      setEditError("");

      await onUpdateJob({
        ...job,
        status: "completed",
        completedAt: new Date().toISOString(),
      });

    } catch (error) {
      console.error("Could not finish job:", error);
      setEditError("Could not finish the job.");

    } finally {
      setIsSaving(false);
    }
  }


  return (
    <>
      <header className="app-header">
        <button className="header-back-button" onClick={onBack}>
          ← Back
        </button>

        <h1>Job Details</h1>

        <div className="job-customer-header">
          <div className="job-customer-info">
            <button
              className="header-customer-link"
              onClick={() => onViewCustomer(customer)}
            >
              {customer.name}
            </button>

            <span className="header-customer-address">
              {customer.address}
            </span>
          </div>

          <span className="header-customer-job-count">
            {customerJobCount === 1 ? "1 job" : `${customerJobCount} jobs`}
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
                value={editDescription}
                onChange={(event) =>
                  setEditDescription(event.currentTarget.value)
                }
                required
              />
            </label>

            <label>
              Scheduled Date
              <input
                type="date"
                value={editScheduledDate}
                onChange={(event) =>
                  setEditScheduledDate(event.currentTarget.value)
                }
                required
              />
            </label>

            <label>
              Scheduled Time
              <input
                type="time"
                value={editScheduledTime}
                onChange={(event) =>
                  setEditScheduledTime(event.currentTarget.value)
                }
              />
            </label>

            <label>
              Pricing
              <select
                value={editPricingType}
                onChange={(event) =>
                  setEditPricingType(
                    event.currentTarget.value as "hourly" | "fixed"
                  )
                }
              >
                <option value="hourly">Hourly</option>
                <option value="fixed">Fixed Price</option>
              </select>
            </label>

            {editPricingType === "hourly" ? (
              <label>
                Hourly Rate
                <div className="money-input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={editHourlyRate}
                    onChange={(event) =>
                      setEditHourlyRate(event.currentTarget.value)
                    }
                    required
                  />
                  <span>/ hour</span>
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
                    value={editFixedPrice}
                    onChange={(event) =>
                      setEditFixedPrice(event.currentTarget.value)
                    }
                    required
                  />
                </div>
              </label>
            )}

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
            <div className="job-details-card">
              <div className="job-details-heading">
                <h2>{job.description}</h2>

                <span className={`job-status job-status-${job.status}`}>
                  {job.status === "active"
                    ? "In Progress"
                    : job.status === "completed"
                      ? "Completed"
                      : "Scheduled"}
                </span>
              </div>

              {/*
               * This is derived from the real clock. It can say things like
               * "Starts in 45m", "2h past scheduled time", or show the
               * running work duration for an active job.
               */}
              <div className="job-time-callout">{timeInfo}</div>

              <div className="job-detail">
                <span className="job-detail-label">Scheduled</span>
                <span>{formatLongDate(job.scheduledDate)}</span>
                {formattedTime && <span>{formattedTime}</span>}
              </div>

              <div className="job-detail">
                <span className="job-detail-label">Pricing</span>
                <span>
                  {job.pricingType === "hourly"
                    ? job.hourlyRate !== undefined
                      ? `${formatMoney(job.hourlyRate)} / hour`
                      : "Hourly rate not entered"
                    : job.fixedPrice !== undefined
                      ? `${formatMoney(job.fixedPrice)} fixed price`
                      : "Fixed price not entered"}
                </span>
              </div>

              {job.startedAt && (
                <div className="job-detail">
                  <span className="job-detail-label">Time Worked</span>
                  <span>{workedHours.toFixed(2)} hours</span>
                </div>
              )}

              {(job.fixedPrice !== undefined ||
                (job.hourlyRate !== undefined && job.startedAt)) && (
                <div className="job-detail job-total-detail">
                  <span className="job-detail-label">
                    {job.status === "completed"
                      ? "Job Total"
                      : "Current Labor Total"}
                  </span>
                  <strong>{formatMoney(currentAmount)}</strong>
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
              <p className="form-error action-error">{editError}</p>
            )}

            {job.status === "upcoming" && (
              <button
                className="start-job-button"
                onClick={startJob}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Start Job"}
              </button>
            )}

            {job.status === "active" && (
              <button
                className="complete-job-button"
                onClick={completeJob}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Finish Job"}
              </button>
            )}
          </>
        )}

      </section>
    </>
  );
}


export default JobDetails;
