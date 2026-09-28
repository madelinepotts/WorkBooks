import { useState } from "react";

import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";


type CustomersProps = {
  customers: Customer[];
  jobs: Job[];
  onAddJob: (customer: Customer) => void;
  onSelectCustomer: (customer: Customer) => void;
};


function Customers({
  customers,
  jobs,
  onAddJob,
  onSelectCustomer,
}: CustomersProps) {
  const [search, setSearch] = useState("");


  function getJobCount(customerId: string) {
    return jobs.filter(
      (job) => job.customerId === customerId
    ).length;
  }


  const filteredCustomers = customers.filter(
    (customer) => {
      const searchText = search.toLowerCase();

      return (
        customer.name
          .toLowerCase()
          .includes(searchText) ||
        customer.phone
          .toLowerCase()
          .includes(searchText) ||
        customer.address
          .toLowerCase()
          .includes(searchText) ||
        (customer.email ?? "")
          .toLowerCase()
          .includes(searchText)
      );
    }
  );


  const sortedCustomers = [...filteredCustomers].sort(
    (a, b) => a.name.localeCompare(b.name)
  );


  return (
    <>
      <header className="app-header">
        <h1>Customers</h1>
        <p>
          {customers.length === 1
            ? "1 customer"
            : `${customers.length} customers`}
        </p>
      </header>


      <section className="customers-page">

        {customers.length > 0 && (
          <input
            className="customer-search"
            type="search"
            placeholder="Search customers..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        )}


        {customers.length === 0 ? (
          <div className="empty-state">
            <h2>No customers yet</h2>

            <p>
              Customers will appear here after
              you add them.
            </p>
          </div>
        ) : sortedCustomers.length === 0 ? (
          <div className="empty-state">
            <h2>No customers found</h2>

            <p>
              Try a different search.
            </p>
          </div>
        ) : (
          <div className="customer-list">

            {sortedCustomers.map((customer) => {
              const jobCount =
                getJobCount(customer.id);

              return (
                <div
                  className="customer-card"
                  key={customer.id}
                >
                  <div className="customer-card-header">

                    <div>
                      <button
                        className="customer-name-button"
                        onClick={() => onSelectCustomer(customer)}
                      >
                        {customer.name}
                      </button>

                      <span className="customer-job-count">
                        {jobCount === 1
                          ? "1 job"
                          : `${jobCount} jobs`}
                      </span>
                    </div>

                  </div>


                  <div className="customer-info">

                    <p>
                      <strong>Phone</strong>
                      <br />
                      {customer.phone}
                    </p>

                    {customer.email && (
                      <p>
                        <strong>Email</strong>
                        <br />
                        {customer.email}
                      </p>
                    )}

                    <p>
                      <strong>Address</strong>
                      <br />
                      {customer.address}
                    </p>

                  </div>


                  <button
                    className="customer-add-job-button"
                    onClick={() =>
                      onAddJob(customer)
                    }
                  >
                    + Add Job
                  </button>

                </div>
              );
            })}

          </div>
        )}

      </section>
    </>
  );
}

export default Customers;