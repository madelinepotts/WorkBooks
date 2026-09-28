import { useState } from "react";

import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";
import {
  formatShortDate,
  formatTime,
  getJobTimeInfo,
} from "../utils/jobTime";
import { useNow } from "../utils/useNow";


type JobsProps = {
  customers: Customer[];
  jobs: Job[];
  onSelectJob: (job: Job) => void;
};


function Jobs({
  customers,
  jobs,
  onSelectJob,
}: JobsProps) {
  const now = useNow();
  const [search, setSearch] = useState("");


  const getCustomer = (customerId: string) =>
    customers.find(
      (customer) => customer.id === customerId
    );


  /*
   * Convert the job's saved date/time into one number we can sort by.
   *
   * Completed jobs use their actual completion time when available.
   * Open jobs use their scheduled date/time. This keeps the newest
   * relevant job at the top of each section.
   */
  function getSortTime(job: Job) {
    if (job.status === "completed" && job.completedAt) {
      const completedTime =
        new Date(job.completedAt).getTime();

      if (!Number.isNaN(completedTime)) {
        return completedTime;
      }
    }

    const scheduledDateTime =
      `${job.scheduledDate}T${job.scheduledTime ?? "00:00"}`;

    const scheduledTime =
      new Date(scheduledDateTime).getTime();

    return Number.isNaN(scheduledTime)
      ? 0
      : scheduledTime;
  }


  /*
   * Search jobs by the things Dad is most likely to remember:
   * customer, description, address, date, or current status.
   */
  const filteredJobs = jobs.filter((job) => {
    const customer = getCustomer(job.customerId);
    const searchText = search.trim().toLowerCase();

    if (!searchText) {
      return true;
    }

    const statusText =
      job.status === "active"
        ? "in progress active"
        : job.status === "completed"
          ? "completed"
          : "scheduled upcoming open";

    return [
      customer?.name ?? "",
      customer?.address ?? "",
      job.description,
      job.scheduledDate,
      statusText,
    ].some((value) =>
      value.toLowerCase().includes(searchText)
    );
  });


  /*
   * Open and completed jobs are kept in separate sections, but both are
   * ordered newest first as requested.
   */
  const openJobs = filteredJobs
    .filter((job) => job.status !== "completed")
    .sort(
      (a, b) => getSortTime(b) - getSortTime(a)
    );


  const completedJobs = filteredJobs
    .filter((job) => job.status === "completed")
    .sort(
      (a, b) => getSortTime(b) - getSortTime(a)
    );


  function renderJob(job: Job) {
    const customer = getCustomer(job.customerId);
    const formattedTime =
      formatTime(job.scheduledTime);


    return (
      <div
        className="job-card clickable-job-card"
        key={job.id}
        onClick={() => onSelectJob(job)}
      >
        <div className="job-card-header">
          <strong>
            {customer?.name ?? "Unknown Customer"}
          </strong>

          <span className="job-status">
            {job.status === "active"
              ? "In Progress"
              : job.status === "completed"
                ? "Completed"
                : "Scheduled"}
          </span>
        </div>


        <p className="job-description">
          {job.description}
        </p>


        {customer && (
          <p className="job-address">
            {customer.address}
          </p>
        )}


        <div className="job-schedule">
          <span>
            {formatShortDate(job.scheduledDate)}
          </span>

          {formattedTime && (
            <span>{formattedTime}</span>
          )}

          <span>
            {getJobTimeInfo(job, now)}
          </span>
        </div>
      </div>
    );
  }


  const noSearchResults =
    jobs.length > 0 &&
    filteredJobs.length === 0;


  return (
    <>
      <header className="app-header">
        <h1>Jobs</h1>
        <p>View and manage your jobs.</p>
      </header>


      <section className="jobs-page">

        {jobs.length > 0 && (
          <input
            className="job-search"
            type="search"
            placeholder="Search jobs..."
            value={search}
            onChange={(event) =>
              setSearch(event.currentTarget.value)
            }
          />
        )}


        {noSearchResults ? (
          <div className="empty-state">
            <h2>No jobs found</h2>
            <p>Try a different search.</p>
          </div>
        ) : (
          <>
            <h2>Open Jobs</h2>

            {openJobs.length === 0 ? (
              <div className="empty-state">
                <p>No open jobs.</p>
              </div>
            ) : (
              <div className="job-list">
                {openJobs.map(renderJob)}
              </div>
            )}


            <h2>Completed</h2>

            {completedJobs.length === 0 ? (
              <div className="empty-state">
                <p>No completed jobs.</p>
              </div>
            ) : (
              <div className="job-list">
                {completedJobs.map(renderJob)}
              </div>
            )}
          </>
        )}

      </section>
    </>
  );
}


export default Jobs;
