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

function Jobs({ customers, jobs, onSelectJob }: JobsProps) {
  const now = useNow();

  const getCustomer = (customerId: string) =>
    customers.find((customer) => customer.id === customerId);

  const openJobs = jobs
    .filter((job) => job.status !== "completed")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const completedJobs = jobs
    .filter((job) => job.status === "completed")
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  function renderJob(job: Job) {
    const customer = getCustomer(job.customerId);
    const formattedTime = formatTime(job.scheduledTime);

    return (
      <div
        className="job-card clickable-job-card"
        key={job.id}
        onClick={() => onSelectJob(job)}
      >
        <div className="job-card-header">
          <strong>{customer?.name ?? "Unknown Customer"}</strong>
          <span className="job-status">
            {job.status === "active" ? "In Progress" : job.status === "completed" ? "Completed" : "Scheduled"}
          </span>
        </div>

        <p className="job-description">{job.description}</p>
        {customer && <p className="job-address">{customer.address}</p>}

        <div className="job-schedule">
          <span>{formatShortDate(job.scheduledDate)}</span>
          {formattedTime && <span>{formattedTime}</span>}
          <span>{getJobTimeInfo(job, now)}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="app-header">
        <h1>Jobs</h1>
        <p>View and manage your jobs.</p>
      </header>

      <section className="home">
        <h2>Open Jobs</h2>
        {openJobs.length === 0 ? (
          <div className="empty-state"><p>No open jobs.</p></div>
        ) : (
          <div className="job-list">{openJobs.map(renderJob)}</div>
        )}

        <h2>Completed</h2>
        {completedJobs.length === 0 ? (
          <div className="empty-state"><p>No completed jobs.</p></div>
        ) : (
          <div className="job-list">{completedJobs.map(renderJob)}</div>
        )}
      </section>
    </>
  );
}

export default Jobs;
