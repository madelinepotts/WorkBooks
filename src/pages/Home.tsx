import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";
import { formatTime, getJobTimeInfo } from "../utils/jobTime";
import { useNow } from "../utils/useNow";


type HomeProps = {
  customers: Customer[];
  jobs: Job[];
  onNewCustomer: () => void;
  onAddJob: () => void;
  onSelectJob: (job: Job) => void;
};


function Home({
  customers,
  jobs,
  onNewCustomer,
  onAddJob,
  onSelectJob,
}: HomeProps) {
  const now = useNow();


  const getCustomer = (customerId: string) =>
    customers.find(
      (customer) => customer.id === customerId
    );


  /*
   * Build YYYY-MM-DD from local date parts instead of UTC so a late
   * evening timezone conversion cannot accidentally select tomorrow.
   */
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");


  /*
   * Home is for work Dad still needs to deal with today.
   *
   * Completed jobs deliberately disappear from Home even if they were
   * scheduled for today. Active jobs remain visible even if they were
   * originally scheduled on another day.
   */
  const todaysJobs = jobs.filter(
    (job) =>
      job.status !== "completed" &&
      (
        job.scheduledDate === today ||
        job.status === "active"
      )
  );


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
              const customer =
                getCustomer(job.customerId);

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
                      {getJobTimeInfo(job, now)}
                    </span>

                    {formattedTime && (
                      <span>{formattedTime}</span>
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
