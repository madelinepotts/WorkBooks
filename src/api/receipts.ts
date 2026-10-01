import type { Receipt } from "../types/Receipt";


const API_URL =
  "http://127.0.0.1:8000";


async function getErrorMessage(
  response: Response
): Promise<string> {

  try {

    const data =
      await response.json();


    if (
      data &&
      typeof data.detail === "string"
    ) {

      return data.detail;

    }

  } catch {

    // Use the generic message below.

  }


  return (
    `Request failed with status ` +
    `${response.status}.`
  );
}


export async function getJobReceipts(
  jobId: string
): Promise<Receipt[]> {

  const response =
    await fetch(
      `${API_URL}/jobs/${encodeURIComponent(jobId)}/receipts`
    );


  if (!response.ok) {

    throw new Error(
      await getErrorMessage(
        response
      )
    );

  }


  return response.json();
}


export type UploadReceiptInput = {
  jobId: string;

  file: File;

  vendor?: string;

  purchaseDate?: string;

  notes?: string;
};


export async function uploadReceipt(
  input: UploadReceiptInput
): Promise<Receipt> {

  const formData =
    new FormData();


  formData.append(
    "file",
    input.file
  );


  if (input.vendor) {

    formData.append(
      "vendor",
      input.vendor
    );

  }


  if (input.purchaseDate) {

    formData.append(
      "purchaseDate",
      input.purchaseDate
    );

  }


  if (input.notes) {

    formData.append(
      "notes",
      input.notes
    );

  }


  const response =
    await fetch(
      `${API_URL}/jobs/${encodeURIComponent(input.jobId)}/receipts`,
      {
        method: "POST",

        body: formData,
      }
    );


  if (!response.ok) {

    throw new Error(
      await getErrorMessage(
        response
      )
    );

  }


  return response.json();
}


export async function deleteReceipt(
  receiptId: string
): Promise<void> {

  const response =
    await fetch(
      `${API_URL}/receipts/${encodeURIComponent(receiptId)}`,
      {
        method: "DELETE",
      }
    );


  if (!response.ok) {

    throw new Error(
      await getErrorMessage(
        response
      )
    );

  }

}


export function getReceiptFileUrl(
  receiptId: string
): string {

  return (
    `${API_URL}/receipts/` +
    `${encodeURIComponent(receiptId)}/file`
  );
}