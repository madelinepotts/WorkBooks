import type { Job } from "../types/Jobs";

import {
  getTotalWorkedMs,
  isJobWorking,
} from "./workSessions";

/*
 * Build a local Date from the date/time values Dad entered.
 *
 * Scheduled dates and times describe a local appointment,
 * so we intentionally do not treat them as UTC.
 */
export function getScheduledDateTime(
  job: Job
): Date {

  const [year, month, day] =
    job.scheduledDate
      .split("-")
      .map(Number);

  const [hours, minutes] =
    (job.scheduledTime ?? "00:00")
      .split(":")
      .map(Number);


  return new Date(
    year,
    month - 1,
    day,
    hours,
    minutes,
    0,
    0
  );
}

/*
 * Display stored HH:mm values using normal
 * 12-hour AM/PM time.
 *
 * Example:
 *
 * 14:30 -> 2:30 PM
 */
export function formatTime(
  time?: string
): string | null {

  if (!time) {
    return null;
  }


  const [hours, minutes] =
    time
      .split(":")
      .map(Number);


  const date = new Date();

  date.setHours(
    hours,
    minutes,
    0,
    0
  );


  return date.toLocaleTimeString(
    undefined,
    {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  );
}

/*
 * Short date used on job lists.
 *
 * Example:
 *
 * Sep 28, 2026
 */
export function formatShortDate(
  date: string
): string {

  const [year, month, day] =
    date
      .split("-")
      .map(Number);


  return new Date(
    year,
    month - 1,
    day
  ).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

/*
 * Long date used on Job Details.
 *
 * Example:
 *
 * Monday, September 28, 2026
 */
export function formatLongDate(
  date: string
): string {

  const [year, month, day] =
    date
      .split("-")
      .map(Number);


  return new Date(
    year,
    month - 1,
    day
  ).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );
}

/*
 * Convert milliseconds into a compact duration.
 *
 * Examples:
 *
 * 45m
 * 2h 15m
 * 1d 3h
 */
function formatDuration(
  milliseconds: number
): string {

  const totalMinutes =
    Math.max(
      0,
      Math.floor(
        milliseconds / 60000
      )
    );


  const days =
    Math.floor(
      totalMinutes / 1440
    );


  const hours =
    Math.floor(
      (totalMinutes % 1440) / 60
    );


  const minutes =
    totalMinutes % 60;


  if (days > 0) {
    return `${days}d ${hours}h`;
  }


  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }


  return `${minutes}m`;
}

/*
 * Give Dad useful real-time information about a job.
 *
 * Scheduled jobs describe how far away their
 * appointment is.
 *
 * Active jobs use work sessions to determine whether
 * Dad is currently working or paused.
 */
export function getJobTimeInfo(
  job: Job,
  now = new Date()
): string {

  /*
   * Completed jobs no longer need a live clock.
   */
  if (job.status === "completed") {
    return "Completed";
  }

  /*
   * Once work has started, workSessions are the
   * source of truth for work time.
   */
  if (job.status === "active") {

    const sessions =
      job.workSessions ?? [];


    const totalWorkedMs =
      getTotalWorkedMs(
        sessions,
        now
      );


    if (isJobWorking(sessions)) {

      return (
        `Working · ` +
        `${formatDuration(totalWorkedMs)} total`
      );
    }


    return (
      `Paused · ` +
      `${formatDuration(totalWorkedMs)} worked`
    );
  }

  /*
   * The rest of this function handles jobs that
   * have not been started yet.
   */
  const scheduled =
    getScheduledDateTime(job);


  const difference =
    scheduled.getTime() -
    now.getTime();


  const absoluteDifference =
    Math.abs(difference);

  /*
   * Jobs without a specific appointment time are
   * described by calendar day.
   */
  if (!job.scheduledTime) {

    const today =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );


    const scheduledDay =
      new Date(
        scheduled.getFullYear(),
        scheduled.getMonth(),
        scheduled.getDate()
      );


    const dayDifference =
      Math.round(
        (
          scheduledDay.getTime() -
          today.getTime()
        ) / 86400000
      );


    if (dayDifference === 0) {
      return "Today";
    }


    if (dayDifference === 1) {
      return "Tomorrow";
    }


    if (dayDifference > 1) {
      return `In ${dayDifference} days`;
    }


    return (
      `${Math.abs(dayDifference)} days ago` +
      " · Not started"
    );
  }

  /*
   * Appointment is still in the future.
   */
  if (difference >= 0) {

    if (absoluteDifference < 60000) {
      return "Starting now";
    }


    if (absoluteDifference < 86400000) {

      return (
        `Starts in ` +
        formatDuration(
          absoluteDifference
        )
      );
    }

  } else {

    /*
     * Scheduled time has passed, but that does not
     * automatically mean Dad started working.
     */
    if (absoluteDifference < 60000) {

      return (
        "Scheduled now · Not started"
      );
    }


    if (absoluteDifference < 86400000) {

      return (
        `${formatDuration(
          absoluteDifference
        )} past scheduled time · Not started`
      );
    }
  }

  /*
   * If the appointment is more than a day away,
   * return a simple calendar description.
   */
  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );


  const scheduledDay =
    new Date(
      scheduled.getFullYear(),
      scheduled.getMonth(),
      scheduled.getDate()
    );


  const dayDifference =
    Math.round(
      (
        scheduledDay.getTime() -
        today.getTime()
      ) / 86400000
    );


  if (dayDifference === 1) {
    return "Tomorrow";
  }


  if (dayDifference > 1) {
    return `In ${dayDifference} days`;
  }


  return (
    `${Math.abs(dayDifference)} days ago` +
    " · Not started"
  );
}

/*
 * Calculate total labor hours across every work
 * session belonging to the job.
 *
 * Other pages can continue calling getWorkedHours()
 * without needing to know how WorkSession works.
 */
export function getWorkedHours(
  job: Job,
  now = new Date()
): number {

  const milliseconds =
    getTotalWorkedMs(
      job.workSessions ?? [],
      now
    );


  return (
    milliseconds /
    (1000 * 60 * 60)
  );
}

/*
 * Calculate the labor amount for a job.
 *
 * Fixed-price jobs simply use the agreed price.
 *
 * Hourly jobs multiply ALL recorded work sessions
 * by the hourly rate.
 */
export function getJobAmount(
  job: Job,
  now = new Date()
): number {

  if (job.pricingType === "fixed") {

    return (
      job.fixedPrice ?? 0
    );
  }


  return (
    getWorkedHours(
      job,
      now
    ) *
    (job.hourlyRate ?? 0)
  );
}

/*
 * Format numbers as normal US currency.
 *
 * Example:
 *
 * 125.5 -> $125.50
 */
export function formatMoney(
  amount: number
): string {

  return amount.toLocaleString(
    undefined,
    {
      style: "currency",
      currency: "USD",
    }
  );
}