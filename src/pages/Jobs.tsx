import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";

type JobsProps = {
  customers: Customer[];
  jobs: Job[];
};

function Jobs({ customers, jobs }: JobsProps) {
  const getCustomer = (customerId: string) => {
    return customers.find((customer) => customer.id === customerId);
  };

  const upcomingJobs = jobs.filter((job) => {
    return job.status === "upcoming";
  });

  const completedJobs = jobs.filter((job) => {
    return job.status === "completed";
  });

  return (
    <>
      <header className="app-header">
        <h1>Jobs</h1>
        <p>View and manage your jobs.</p>
      </header>

      <section className="home">
        <h2>Upcoming</h2>

        {upcomingJobs.length === 0 ? (
          <div className="empty-state">
            <p>No upcoming jobs.</p>
          </div>
        ) : (
          <div className="job-list">
            {upcomingJobs.map((job) => {
              const customer = getCustomer(job.customerId);

              return (
                <div className="job-card" key={job.id}>
                  <div className="job-card-header">
                    <strong>
                      {customer?.name ?? "Unknown Customer"}
                    </strong>

                    <span className="job-status">
                      {job.status}
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
                    <span>{job.scheduledDate}</span>

                    {job.scheduledTime && (
                      <span>{job.scheduledTime}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <h2>Completed</h2>

        {completedJobs.length === 0 ? (
          <div className="empty-state">
            <p>No completed jobs.</p>
          </div>
        ) : (
          <div className="job-list">
            {completedJobs.map((job) => {
              const customer = getCustomer(job.customerId);

              return (
                <div className="job-card" key={job.id}>
                  <div className="job-card-header">
                    <strong>
                      {customer?.name ?? "Unknown Customer"}
                    </strong>

                    <span className="job-status">
                      {job.status}
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
                    <span>{job.scheduledDate}</span>

                    {job.scheduledTime && (
                      <span>{job.scheduledTime}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export default Jobs;