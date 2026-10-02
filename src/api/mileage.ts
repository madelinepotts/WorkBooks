import type { MileageEntry } from "../types/MileageEntry";

const API_URL = "http://127.0.0.1:8000";

async function readError(
  response: Response
): Promise<string> {
  try {
    const body = await response.json();

    if (typeof body?.detail === "string") {
      return body.detail;
    }
  } catch {
    // Use the generic message below.
  }

  return `Request failed (${response.status}).`;
}

export async function getJobMileage(
  jobId: string
): Promise<MileageEntry[]> {
  const response = await fetch(
    `${API_URL}/jobs/${encodeURIComponent(jobId)}/mileage`
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function createMileageEntry(
  entry: MileageEntry
): Promise<MileageEntry> {
  const response = await fetch(`${API_URL}/mileage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function updateMileageEntry(
  entry: MileageEntry
): Promise<MileageEntry> {
  const response = await fetch(
    `${API_URL}/mileage/${encodeURIComponent(entry.id)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entry),
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function deleteMileageEntry(
  entryId: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}/mileage/${encodeURIComponent(entryId)}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
