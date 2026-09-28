import { useState } from "react";

import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";

type NewJobProps = {
  customer: Customer;
  onBack: () => void;
  onSave: (job: Job) => void;
};

function NewJob({ customer, onBack, onSave }: NewJobProps) {
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [pricingType, setPricingType] = useState<"hourly" | "fixed">("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [fixedPrice, setFixedPrice] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const job: Job = {
      id: crypto.randomUUID(),
      customerId: customer.id,
      description,
      scheduledDate,
      scheduledTime: scheduledTime || undefined,
      pricingType,
      hourlyRate:
        pricingType === "hourly"
          ? Number(hourlyRate)
          : undefined,
      fixedPrice:
        pricingType === "fixed"
          ? Number(fixedPrice)
          : undefined,
      status: "upcoming",
    };

    onSave(job);
  }

  return (
    <>
      <header className="app-header">
        <h1>New Job</h1>

        <div className="header-customer">
          <span className="header-customer-name">{customer.name}</span>
          <span className="header-customer-phone">{customer.phone}</span>
          <span className="header-customer-address">{customer.address}</span>
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
              onChange={(e) =>
                setPricingType(e.currentTarget.value as "hourly" | "fixed")
              }
            >
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed Price</option>
            </select>
          </label>

          {/*
           * Only show the price field that matches the selected
           * pricing method so Dad never has to decide which box matters.
           */}
          {pricingType === "hourly" ? (
            <label>
              Hourly Rate
              <div className="money-input">
                <span>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.currentTarget.value)}
                  placeholder="75.00"
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
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.currentTarget.value)}
                  placeholder="350.00"
                  required
                />
              </div>
            </label>
          )}

          <button type="submit" className="new-customer-button">
            Save Job
          </button>

          <button type="button" className="add-job-button" onClick={onBack}>
            Back
          </button>
        </form>
      </section>
    </>
  );
}

export default NewJob;
