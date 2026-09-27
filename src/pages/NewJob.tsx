import { useState } from "react";

import type { Customer } from "../types/Customer";

import type { Job } from "../types/Jobs";

type NewJobProps = {
  customer: Customer 
  onBack: () => void;
  onSave: () => void;
};

function NewJob({ customer, onBack, onSave }: NewJobProps) {
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [pricingType, setPricingType] = useState("hourly");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const job: Job = {
      id: crypto.randomUUID(),
      customerId: customer.id,
      description,
      scheduledDate,
      scheduledTime: scheduledTime || undefined,
      pricingType: pricingType as "hourly" | "fixed",
      status: "upcoming",
    };

    onSave(job);
  }

  return (
    <>
      <header className="app-header">
        <h1>New Job</h1>

        <div className="header-customer">
          <span className="header-customer-name">
            {customer.name}
          </span>

          <span className="header-customer-phone">
            {customer.phone}
          </span>

          <span className="header-customer-address">
            {customer.address}
          </span>
        </div>
      </header>

      <section className="home">
        <form className="job-form" onSubmit={handleSubmit}>
          <label>
            What needs to be done?
            <textarea
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              placeholder="Replace kitchen faucet"
              required
            />
          </label>

          <label>
            Scheduled Date
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.currentTarget.value)}
              required
            />
          </label>

          <label>
            Scheduled Time
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.currentTarget.value)}
            />
          </label>

          <label>
            Pricing
            <select
              value={pricingType}
              onChange={(e) => setPricingType(e.currentTarget.value)}
            >
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed Price</option>
            </select>
          </label>

          <button
            type="submit"
            className="new-customer-button"
          >
            Save Job
          </button>

          <button
            type="button"
            className="add-job-button"
            onClick={onBack}
          >
            Back
          </button>
        </form>
      </section>
    </>
  );
}

export default NewJob;