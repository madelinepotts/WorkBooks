export type Job = {
  id: string;
  customerId: string;
  description: string;
  scheduledDate: string;
  scheduledTime?: string;
  pricingType: "hourly" | "fixed";
  status: "upcoming" | "active" | "completed";
};