import type { WorkSession } from "./WorkSession";

export type Job = {
  id: string;
  customerId: string;
  description: string;
  scheduledDate: string;
  scheduledTime?: string;
  pricingType: "hourly" | "fixed";

  /*
   * Only one of these is normally used.
   * Keeping them optional also lets old jobs from the current
   * backend continue loading until we update SQLite later.
   */
  hourlyRate?: number;
  fixedPrice?: number;

  /*
   * A completed job still needs a final completion
   * timestamp even though its work is stored as sessions.
   */
  completedAt?: string;

  /*
   * Every Start/Resume -> Pause cycle becomes one
   * work session.
   */
  workSessions?: WorkSession[];

  status: "upcoming" | "active" | "completed";
};