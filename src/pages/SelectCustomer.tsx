import type { Customer } from "../types/Customer";

type SelectCustomerProps = {
  customers: Customer[];
  onSelect: (customer: Customer) => void;
  onNewCustomer: () => void;
  onCancel: () => void;
};

function SelectCustomer({
  customers,
  onSelect,
  onNewCustomer,
  onCancel,
}: SelectCustomerProps) {
  return (
    <>
      <header className="app-header">
        <h1>Add Job</h1>
        <p>Who is this job for?</p>
      </header>

      <section className="home">
        {customers.length === 0 ? (
          <div className="empty-state">
            <p>No customers yet.</p>

            <button
              className="new-customer-button"
              onClick={onNewCustomer}
            >
              + New Customer
            </button>
          </div>
        ) : (
          <div className="customer-list">
            {customers.map((customer) => (
              <button
                className="customer-select-card"
                key={customer.id}
                onClick={() => onSelect(customer)}
              >
                <strong>{customer.name}</strong>

                <span>{customer.phone}</span>

                <span>{customer.address}</span>
              </button>
            ))}
          </div>
        )}

        <button
          className="secondary-button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </section>
    </>
  );
}

export default SelectCustomer;