import type { Job } from "../types/Jobs";

/*
 * Build a local Date from the date/time values stored by the form.
 * The values intentionally do not contain a timezone because they
 * describe the local appointment time Dad entered.
 */
export function getScheduledDateTime(job: Job): Date {
  const [year, month, day] = job.scheduledDate.split("-").map(Number);
  const [hours, minutes] = (job.scheduledTime ?? "00:00")
    .split(":")
    .map(Number);

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function formatTime(time?: string): string | null {
  if (!time) return null;

  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatLongDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/*
 * This is the useful real-time description shown to Dad.
 * A scheduled time passing does NOT automatically start a job;
 * it simply tells him that the scheduled time has passed.
 */
export function getJobTimeInfo(job: Job, now = new Date()): string {
  if (job.status === "active" && job.startedAt) {
    return `In progress · ${formatDuration(now.getTime() - new Date(job.startedAt).getTime())}`;
  }

  if (job.status === "completed") {
    return "Completed";
  }

  const scheduled = getScheduledDateTime(job);
  const difference = scheduled.getTime() - now.getTime();
  const absoluteDifference = Math.abs(difference);

  if (!job.scheduledTime) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const scheduledDay = new Date(
      scheduled.getFullYear(),
      scheduled.getMonth(),
      scheduled.getDate()
    );
    const dayDifference = Math.round(
      (scheduledDay.getTime() - today.getTime()) / 86400000
    );

    if (dayDifference === 0) return "Today";
    if (dayDifference === 1) return "Tomorrow";
    if (dayDifference > 1) return `In ${dayDifference} days`;
    return `${Math.abs(dayDifference)} days ago · Not started`;
  }

  if (difference >= 0) {
    if (absoluteDifference < 60000) return "Starting now";
    if (absoluteDifference < 86400000) {
      return `Starts in ${formatDuration(absoluteDifference)}`;
    }
  } else {
    if (absoluteDifference < 60000) return "Scheduled now · Not started";
    if (absoluteDifference < 86400000) {
      return `${formatDuration(absoluteDifference)} past scheduled time · Not started`;
    }
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const scheduledDay = new Date(
    scheduled.getFullYear(),
    scheduled.getMonth(),
    scheduled.getDate()
  );
  const dayDifference = Math.round(
    (scheduledDay.getTime() - today.getTime()) / 86400000
  );

  if (dayDifference === 1) return "Tomorrow";
  if (dayDifference > 1) return `In ${dayDifference} days`;
  return `${Math.abs(dayDifference)} days ago · Not started`;
}

export function getWorkedHours(job: Job, now = new Date()): number {
  if (!job.startedAt) return 0;

  const end = job.completedAt ? new Date(job.completedAt) : now;
  return Math.max(0, (end.getTime() - new Date(job.startedAt).getTime()) / 3600000);
}

export function getJobAmount(job: Job, now = new Date()): number {
  if (job.pricingType === "fixed") return job.fixedPrice ?? 0;
  return getWorkedHours(job, now) * (job.hourlyRate ?? 0);
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}
