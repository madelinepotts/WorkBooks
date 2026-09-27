import { useState } from "react";
import type { Customer } from "../types/Customer";

type NewCustomerProps = {
  onCancel: () => void;
  onContinue: (customer: Customer) => void;
};

function NewCustomer({ onCancel, onContinue }: NewCustomerProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const customer: Customer = {
        id: crypto.randomUUID(),
        name: customerName,
        phone: customerPhone,
        email: customerEmail.trim() || undefined,
        address: jobAddress,
    };

    onContinue(customer);
    }

  return (
    <>
      <header className="app-header">
        <h1>New Customer</h1>
        <p>Enter the customer's information.</p>
      </header>

      <section className="home">
        <form className="customer-form" onSubmit={handleSubmit}>
          <label>
            Customer Name
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.currentTarget.value)}
              placeholder="Customer name"
              required
            />
          </label>

          <label>
            Phone
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.currentTarget.value)}
              placeholder="Phone number"
              required
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.currentTarget.value)}
              placeholder="Optional"
            />
          </label>

          <label>
            Job Address
            <input
              type="text"
              value={jobAddress}
              onChange={(e) => setJobAddress(e.currentTarget.value)}
              placeholder="Job address"
              required
            />
          </label>

          <button
            type="submit"
            className="new-customer-button"
          >
            Continue to Job
          </button>

          <button
            type="button"
            className="add-job-button"
            onClick={onCancel}
          >
            Cancel
          </button>
        </form>
      </section>
    </>
  );
}

export default NewCustomer;