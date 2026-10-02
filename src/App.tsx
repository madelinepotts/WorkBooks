import { useEffect, useState } from "react";

import Home from "./pages/Home";
import NewCustomer from "./pages/NewCustomer";
import Customers from "./pages/Customers";
import NewJob from "./pages/NewJob";
import Jobs from "./pages/Jobs";
import Finances from "./pages/Finances";
import SelectCustomer from "./pages/SelectCustomer";
import CustomerDetails from "./pages/CustomerDetails";
import JobDetails from "./pages/JobDetails";

import type { Customer } from "./types/Customer";
import type { Job } from "./types/Jobs";
import type { Invoice, InvoiceStatus } from "./types/Invoice";
import type { BusinessInfo } from "./types/BusinessInfo";
import { EMPTY_BUSINESS_INFO } from "./types/BusinessInfo";

import {
  createCustomer,
  getCustomers,
  updateCustomer,
} from "./api/customers";

import {
  createJob,
  getJobs,
  updateJob,
} from "./api/jobs";

import {
  createInvoice,
  getInvoices,
  updateInvoice,
  updateInvoiceStatus,
} from "./api/invoices";

import {
  getBusinessInfo,
  updateBusinessInfo,
} from "./api/businessInfo";

import "./App.css";


function App() {

  /*
   * Controls which page is currently visible.
   */
  const [screen, setScreen] =
    useState("home");


  /*
   * Main business records loaded from SQLite through FastAPI.
   */
  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [jobs, setJobs] =
    useState<Job[]>([]);

  const [invoices, setInvoices] =
    useState<Invoice[]>([]);


  /*
   * Business information printed on generated invoices.
   *
   * WorkBooks only needs one saved set of this information, so it is
   * kept as one object rather than a list like customers or jobs.
   */
  const [businessInfo, setBusinessInfo] =
    useState<BusinessInfo>(EMPTY_BUSINESS_INFO);


  /*
   * Customer currently being used while creating a new job.
   */
  const [currentCustomer, setCurrentCustomer] =
    useState<Customer | null>(null);


  /*
   * Customer currently open on Customer Details.
   */
  const [selectedCustomer, setSelectedCustomer] =
    useState<Customer | null>(null);


  /*
   * Job currently open on Job Details.
   */
  const [selectedJob, setSelectedJob] =
    useState<Job | null>(null);


  /*
   * Remembers where New Job was opened from.
   *
   * This lets the Back button return to the correct page instead of
   * always returning Home.
   */
  const [jobBackScreen, setJobBackScreen] =
    useState("home");


  /*
   * Remembers where Job Details was opened from.
   *
   * Examples:
   *
   * Jobs -> Job Details
   * Customer Details -> Job Details
   */
  const [
    jobDetailsBackScreen,
    setJobDetailsBackScreen,
  ] = useState("jobs");


  /*
   * Remembers where Customer Details was opened from.
   *
   * Examples:
   *
   * Customers -> Customer Details
   * Job Details -> Customer Details
   */
  const [
    customerDetailsBackScreen,
    setCustomerDetailsBackScreen,
  ] = useState("customers");


  /*
   * Bottom navigation only belongs on the four main pages.
   */
  const showBottomNav = [
    "home",
    "jobs",
    "customers",
    "finances",
  ].includes(screen);


  /*
   * Load all persisted business data when WorkBooks starts.
   *
   * Promise.all starts the three independent requests together.
   */
  useEffect(() => {

    async function loadData() {
      try {
        const [
          loadedCustomers,
          loadedJobs,
          loadedInvoices,
          loadedBusinessInfo,
        ] = await Promise.all([
          getCustomers(),
          getJobs(),
          getInvoices(),
          getBusinessInfo(),
        ]);

        setCustomers(loadedCustomers);
        setJobs(loadedJobs);
        setInvoices(loadedInvoices);
        setBusinessInfo(loadedBusinessInfo);

      } catch (error) {
        console.error(
          "Could not load WorkBooks data:",
          error
        );
      }
    }

    loadData();

  }, []);


  /*
   * Save a new customer.
   *
   * After saving the customer, immediately continue to creating their
   * first job.
   */
  async function handleNewCustomer(
    customer: Customer
  ) {
    try {
      await createCustomer(customer);

      setCustomers((currentCustomers) => [
        ...currentCustomers,
        customer,
      ]);

      setCurrentCustomer(customer);

      /*
       * The customer is already saved. If Dad backs out of New Job,
       * return to Customers instead of the customer form.
       */
      setJobBackScreen("customers");

      setScreen("new-job");

    } catch (error) {
      console.error(
        "Could not create customer:",
        error
      );
    }
  }


  /*
   * Persist edits to a customer and then replace that customer in every
   * piece of React state that may currently reference it.
   */
  async function handleUpdateCustomer(
    editedCustomer: Customer
  ) {
    try {
      const savedCustomer =
        await updateCustomer(editedCustomer);

      setCustomers((currentCustomers) =>
        currentCustomers.map((customer) =>
          customer.id === savedCustomer.id
            ? savedCustomer
            : customer
        )
      );

      setSelectedCustomer((current) =>
        current?.id === savedCustomer.id
          ? savedCustomer
          : current
      );

      setCurrentCustomer((current) =>
        current?.id === savedCustomer.id
          ? savedCustomer
          : current
      );

    } catch (error) {
      console.error(
        "Could not update customer:",
        error
      );

      /*
       * Re-throw so the edit form can stay open and show an error.
       */
      throw error;
    }
  }


  /*
   * Save a new job.
   */
  async function handleNewJob(
    job: Job
  ) {
    try {
      await createJob(job);

      setJobs((currentJobs) => [
        ...currentJobs,
        job,
      ]);

      setCurrentCustomer(null);
      setScreen("home");

    } catch (error) {
      console.error(
        "Could not create job:",
        error
      );
    }
  }


  /*
   * Persist any job change before updating the interface.
   *
   * This handles normal edits as well as the Start Job and Finish Job
   * timestamp changes.
   */
  async function handleUpdateJob(
    editedJob: Job
  ) {
    try {
      const savedJob =
        await updateJob(editedJob);

      setJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.id === savedJob.id
            ? savedJob
            : job
        )
      );

      setSelectedJob((current) =>
        current?.id === savedJob.id
          ? savedJob
          : current
      );

    } catch (error) {
      console.error(
        "Could not update job:",
        error
      );

      throw error;
    }
  }


  /*
   * Select an existing customer before creating a new job.
   *
   * backScreen remembers where New Job should return if Dad presses
   * Back.
   */
  function handleSelectCustomer(
    customer: Customer,
    backScreen: string
  ) {
    setCurrentCustomer(customer);
    setJobBackScreen(backScreen);
    setScreen("new-job");
  }


  /*
   * Return from New Job to whichever page opened it.
   */
  function handleBackFromJob() {
    setCurrentCustomer(null);
    setScreen(jobBackScreen);
  }


  /*
   * Open Customer Details and remember its origin.
   */
  function handleViewCustomer(
    customer: Customer,
    backScreen: string
  ) {
    setSelectedCustomer(customer);
    setCustomerDetailsBackScreen(backScreen);
    setScreen("customer-details");
  }


  /*
   * Return from Customer Details to whichever page opened it.
   *
   * Do not clear selectedJob here. If Customer Details was opened from
   * Job Details, that job still needs to exist when we return to it.
   */
  function handleBackFromCustomerDetails() {
    setSelectedCustomer(null);
    setScreen(customerDetailsBackScreen);
  }


  /*
   * Open Job Details and remember its origin.
   */
  function handleViewJob(
    job: Job,
    backScreen: string
  ) {
    setSelectedJob(job);
    setJobDetailsBackScreen(backScreen);
    setScreen("job-details");
  }


  /*
   * Return from Job Details to whichever page opened it.
   */
  function handleBackFromJobDetails() {
    setSelectedJob(null);
    setScreen(jobDetailsBackScreen);
  }


  /*
   * Save the business information used on every generated invoice.
   */
  async function handleUpdateBusinessInfo(
    editedBusinessInfo: BusinessInfo
  ) {
    try {
      const savedBusinessInfo =
        await updateBusinessInfo(editedBusinessInfo);

      setBusinessInfo(savedBusinessInfo);

    } catch (error) {
      console.error(
        "Could not update business information:",
        error
      );

      throw error;
    }
  }


  /*
   * Invoice changes are persisted just like customers and jobs.
   */
  async function handleCreateInvoice(
    invoice: Invoice
  ) {
    try {
      await createInvoice(invoice);

      setInvoices((currentInvoices) => [
        ...currentInvoices,
        invoice,
      ]);

    } catch (error) {
      console.error(
        "Could not create invoice:",
        error
      );

      throw error;
    }
  }


  async function handleUpdateInvoice(
    editedInvoice: Invoice
  ) {
    try {
      const savedInvoice =
        await updateInvoice(editedInvoice);

      setInvoices((currentInvoices) =>
        currentInvoices.map((invoice) =>
          invoice.id === savedInvoice.id
            ? savedInvoice
            : invoice
        )
      );

    } catch (error) {
      console.error(
        "Could not update invoice:",
        error
      );

      throw error;
    }
  }


  async function handleUpdateInvoiceStatus(
    invoiceId: string,
    status: InvoiceStatus
  ) {
    try {
      const savedInvoice =
        await updateInvoiceStatus(
          invoiceId,
          status
        );

      setInvoices((currentInvoices) =>
        currentInvoices.map((invoice) =>
          invoice.id === savedInvoice.id
            ? savedInvoice
            : invoice
        )
      );

    } catch (error) {
      console.error(
        "Could not update invoice status:",
        error
      );

      throw error;
    }
  }


  /*
   * Find the customer belonging to the currently selected job.
   *
   * Calculating this once keeps the JSX below cleaner.
   */
  const selectedJobCustomer =
    selectedJob
      ? customers.find(
          (customer) =>
            customer.id === selectedJob.customerId
        ) ?? null
      : null;


  return (
    <main className="app">

      {/* =====================================================
          Home
          ===================================================== */}

      {screen === "home" && (
        <Home
          customers={customers}
          jobs={jobs}

          onNewCustomer={() =>
            setScreen("new-customer")
          }

          onAddJob={() =>
            setScreen("add-job")
          }

          /* Today's cards open Job Details too. */
          onSelectJob={(job) =>
            handleViewJob(job, "home")
          }
        />
      )}


      {/* =====================================================
          New Customer
          ===================================================== */}

      {screen === "new-customer" && (
        <NewCustomer
          onCancel={() =>
            setScreen("home")
          }

          onContinue={handleNewCustomer}
        />
      )}


      {/* =====================================================
          New Job
          ===================================================== */}

      {screen === "new-job" &&
        currentCustomer && (
          <NewJob
            customer={currentCustomer}
            onBack={handleBackFromJob}
            onSave={handleNewJob}
          />
        )}


      {/* =====================================================
          Select Customer for New Job
          ===================================================== */}

      {screen === "add-job" && (
        <SelectCustomer
          customers={customers}

          onSelect={(customer) =>
            handleSelectCustomer(
              customer,
              "add-job"
            )
          }

          onNewCustomer={() =>
            setScreen("new-customer")
          }

          onCancel={() =>
            setScreen("home")
          }
        />
      )}


      {/* =====================================================
          Jobs
          ===================================================== */}

      {screen === "jobs" && (
        <Jobs
          customers={customers}
          jobs={jobs}

          /* A job opened here should return to Jobs. */
          onSelectJob={(job) =>
            handleViewJob(
              job,
              "jobs"
            )
          }
        />
      )}


      {/* =====================================================
          Customers
          ===================================================== */}

      {screen === "customers" && (
        <Customers
          customers={customers}
          jobs={jobs}

          /* A customer opened here should return to Customers. */
          onSelectCustomer={(customer) =>
            handleViewCustomer(
              customer,
              "customers"
            )
          }

          onAddJob={(customer) =>
            handleSelectCustomer(
              customer,
              "customers"
            )
          }
        />
      )}


      {/* =====================================================
          Customer Details
          ===================================================== */}

      {screen === "customer-details" &&
        selectedCustomer && (
          <CustomerDetails
            customer={selectedCustomer}
            jobs={jobs}

            /* Tell Dad where the Back button will go. */
            backLabel={
              customerDetailsBackScreen === "job-details"
                ? "Job Details"
                : "Customers"
            }

            onBack={
              handleBackFromCustomerDetails
            }

            onUpdateCustomer={
              handleUpdateCustomer
            }

            /* Add a job directly for this customer. */
            onAddJob={(customer) =>
              handleSelectCustomer(
                customer,
                "customer-details"
              )
            }

            /* A job opened here returns to this customer. */
            onSelectJob={(job) =>
              handleViewJob(
                job,
                "customer-details"
              )
            }
          />
        )}


      {/* =====================================================
          Job Details
          ===================================================== */}

      {screen === "job-details" &&
        selectedJob &&
        selectedJobCustomer && (
          <JobDetails
            job={selectedJob}
            hasInvoice={
              invoices.some(
                (invoice) =>
                  invoice.jobId === selectedJob.id
              )
            }
            customer={selectedJobCustomer}
            jobs={jobs}

            onBack={
              handleBackFromJobDetails
            }

            /*
             * Saves edits as well as Start/Finish timestamps.
             */
            onUpdateJob={handleUpdateJob}

            /*
             * Keep selectedJob when opening Customer Details so Back can
             * return to this exact job.
             */
            onViewCustomer={(customer) =>
              handleViewCustomer(
                customer,
                "job-details"
              )
            }
          />
        )}


      {/* =====================================================
          Finances
          ===================================================== */}

      {screen === "finances" && (
        <Finances
          customers={customers}
          jobs={jobs}
          invoices={invoices}
          businessInfo={businessInfo}
          onUpdateBusinessInfo={handleUpdateBusinessInfo}
          onCreateInvoice={handleCreateInvoice}
          onUpdateInvoice={handleUpdateInvoice}
          onUpdateInvoiceStatus={handleUpdateInvoiceStatus}
        />
      )}


      {/* =====================================================
          Bottom Navigation
          ===================================================== */}

      {showBottomNav && (
        <nav className="bottom-nav">

          <button
            className={
              screen === "home"
                ? "active"
                : ""
            }
            onClick={() =>
              setScreen("home")
            }
          >
            Home
          </button>

          <button
            className={
              screen === "jobs"
                ? "active"
                : ""
            }
            onClick={() =>
              setScreen("jobs")
            }
          >
            Jobs
          </button>

          <button
            className={
              screen === "customers"
                ? "active"
                : ""
            }
            onClick={() =>
              setScreen("customers")
            }
          >
            Customers
          </button>

          <button
            className={
              screen === "finances"
                ? "active"
                : ""
            }
            onClick={() =>
              setScreen("finances")
            }
          >
            Finances
          </button>

        </nav>
      )}

    </main>
  );
}


export default App;
