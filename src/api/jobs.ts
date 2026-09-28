import type { Job } from "../types/Jobs";

const API_URL = "http://127.0.0.1:8000";


export async function createJob(job: Job): Promise<void> {
  const response = await fetch(`${API_URL}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(job),
  });

  if (!response.ok) {
    throw new Error("Failed to create job.");
  }
}


export async function getJobs(): Promise<Job[]> {
  const response = await fetch(`${API_URL}/jobs`);

  if (!response.ok) {
    throw new Error("Failed to get jobs.");
  }

  return response.json();
}


export async function getJob(jobId: string): Promise<Job> {
  const response = await fetch(`${API_URL}/jobs/${jobId}`);

  if (!response.ok) {
    throw new Error("Failed to get job.");
  }

  return response.json();
}


export async function getCustomerJobs(
  customerId: string
): Promise<Job[]> {
  const response = await fetch(
    `${API_URL}/customers/${customerId}/jobs`
  );

  if (!response.ok) {
    throw new Error("Failed to get customer jobs.");
  }

  return response.json();
}


/*
 * Persist any edit to a job, including:
 *
 * - description / schedule
 * - hourly or fixed pricing
 * - Start Job / Finish Job timestamps
 *
 * Sending the complete Job object keeps the backend update simple.
 */
export async function updateJob(job: Job): Promise<Job> {
  const response = await fetch(
    `${API_URL}/jobs/${job.id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(job),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to update job.");
  }

  return response.json();
}
