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
   * Actual work timestamps. These are ISO strings so elapsed
   * time can be reconstructed even if the page is closed.
   */
  startedAt?: string;
  completedAt?: string;

  status: "upcoming" | "active" | "completed";
};
