import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";

type HomeProps = {
  customers: Customer[];
  jobs: Job[];
  onNewCustomer: () => void;
  onAddJob: () => void;
};

function Home({ customers, jobs, onNewCustomer, onAddJob }: HomeProps) {
    
    const getCustomer = (customerId: string) => {
        return customers.find((customer) => customer.id === customerId);
    };

    const today = new Date().toLocaleDateString("en-CA");

    const todaysJobs = jobs.filter((job) => {
        return job.scheduledDate === today;
    });
    
    return (
    <>
      <header className="app-header">
        <h1>WorkBooks</h1>
        <p>Simple books for people who work.</p>
      </header>

      <section className="home">
        <h2>Today</h2>

        {todaysJobs.length === 0 ? (
            <div className="empty-state">
                <p>No jobs scheduled.</p>
            </div>
        ) : (
        <div className="job-list">
            {todaysJobs.map((job) => {
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

        <div className="home-actions">
          <button
            className="new-customer-button"
            onClick={onNewCustomer}
          >
            + New Customer & Job
          </button>

          <button
            className="add-job-button"
            onClick={onAddJob}
          >
            + Add Job
          </button>
        </div>
      </section>
    </>
  );
}

export default Home;