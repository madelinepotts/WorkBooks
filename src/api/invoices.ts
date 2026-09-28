import type { Invoice, InvoiceStatus } from "../types/Invoice";

const API_URL = "http://127.0.0.1:8000";


/*
 * Load every saved invoice for the Finances page.
 */
export async function getInvoices(): Promise<Invoice[]> {
  const response = await fetch(`${API_URL}/invoices`);

  if (!response.ok) {
    throw new Error("Failed to get invoices.");
  }

  return response.json();
}


/*
 * Save a newly-created invoice.
 */
export async function createInvoice(
  invoice: Invoice
): Promise<void> {
  const response = await fetch(`${API_URL}/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(invoice),
  });

  if (!response.ok) {
    throw new Error("Failed to create invoice.");
  }
}


/*
 * Save editable invoice fields such as the amount, due date,
 * and status. The invoice number and job association remain stable.
 */
export async function updateInvoice(
  invoice: Invoice
): Promise<Invoice> {
  const response = await fetch(
    `${API_URL}/invoices/${invoice.id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoice),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to update invoice.");
  }

  return response.json();
}


/*
 * Status changes are common enough to keep a small dedicated endpoint.
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus
): Promise<Invoice> {
  const response = await fetch(
    `${API_URL}/invoices/${invoiceId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to update invoice status.");
  }

  return response.json();
}
