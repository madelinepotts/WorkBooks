import { useState } from "react";

import Home from "./pages/Home";
import NewCustomer from "./pages/NewCustomer";
import NewJob from "./pages/NewJob";
import Jobs from "./pages/Jobs";

import type { Customer } from "./types/Customer";
import type { Job } from "./types/Jobs";

import "./App.css";

function App() {

  const [screen, setScreen] = useState("home")
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currentCustomer, setCurrentCustomer] =
    useState<Customer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  return (
    <main className="app">
      {screen === "home" && (
        <Home
          customers={customers}
          jobs ={jobs}
          onNewCustomer={() => setScreen("new-customer")}
          onAddJob={() => setScreen("add-job")}
        />
      )}

      {screen === "new-customer" && (
        <NewCustomer
          onCancel={() => setScreen("home")}
          onContinue={(customer) => {
            setCustomers([...customers, customer]);
            setCurrentCustomer(customer);
            setScreen("new-job");
          }}
        />
      )}

      {screen === "new-job" && currentCustomer && (
        <NewJob
          customer={currentCustomer}
          onBack={() => setScreen("new-customer")}
          onSave={(job) => {
            setJobs([...jobs, job]);
            setCurrentCustomer(null);
            setScreen("home");
          }}
        />
      )}

      {screen === "jobs" && (
        <Jobs
          customers={customers}
          jobs={jobs}
        />
      )}
    
      <nav className="bottom-nav">
        <button
          className={screen === "home" ? "active" : ""}
          onClick={() => setScreen("home")}
        >
          Home
        </button>

        <button
          className={screen === "jobs" ? "active" : ""}
          onClick={() => setScreen("jobs")}
        >
          Jobs
        </button>

        <button
          className={screen === "customers" ? "active" : ""}
          onClick={() => setScreen("customers")}
        >
          Customers
        </button>

        <button
          className={screen === "finances" ? "active" : ""}
          onClick={() => setScreen("finances")}
        >
          Finances
        </button>
      </nav>
    </main>
  );
}

export default App;