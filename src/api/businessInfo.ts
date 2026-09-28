import type { BusinessInfo } from "../types/BusinessInfo";


const API_URL = "http://127.0.0.1:8000";


/*
 * Load the one saved set of business information used on invoices.
 */
export async function getBusinessInfo(): Promise<BusinessInfo> {
  const response = await fetch(`${API_URL}/business-info`);

  if (!response.ok) {
    throw new Error("Failed to get business information.");
  }

  return response.json();
}


/*
 * Save the business information that appears at the top of every invoice.
 */
export async function updateBusinessInfo(
  businessInfo: BusinessInfo
): Promise<BusinessInfo> {
  const response = await fetch(`${API_URL}/business-info`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(businessInfo),
  });

  if (!response.ok) {
    throw new Error("Failed to update business information.");
  }

  return response.json();
}
