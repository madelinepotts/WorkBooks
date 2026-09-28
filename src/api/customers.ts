import type { Customer } from "../types/Customer";

const API_URL = "http://127.0.0.1:8000";


export async function createCustomer(customer: Customer): Promise<void> {
  const response = await fetch(`${API_URL}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(customer),
  });

  if (!response.ok) {
    throw new Error("Failed to create customer.");
  }
}


export async function getCustomers(): Promise<Customer[]> {
  const response = await fetch(`${API_URL}/customers`);

  if (!response.ok) {
    throw new Error("Failed to get customers.");
  }

  return response.json();
}


export async function getCustomer(
  customerId: string
): Promise<Customer> {
  const response = await fetch(
    `${API_URL}/customers/${customerId}`
  );

  if (!response.ok) {
    throw new Error("Failed to get customer.");
  }

  return response.json();
}


/*
 * Save edits to an existing customer.
 *
 * The complete Customer object is sent so the backend can replace the
 * editable fields in one predictable operation.
 */
export async function updateCustomer(
  customer: Customer
): Promise<Customer> {
  const response = await fetch(
    `${API_URL}/customers/${customer.id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(customer),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to update customer.");
  }

  return response.json();
}
