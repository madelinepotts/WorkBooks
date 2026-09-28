import type { WorkSession } from "../types/WorkSession";


/*
 * Return the currently running work session.
 *
 * An open session has a start time but no end time.
 */
export function getOpenWorkSession(
  sessions: WorkSession[] = []
) {
  return sessions.find(
    (session) => !session.endedAt
  );
}

/*
 * True while Dad currently has the timer running.
 */
export function isJobWorking(
  sessions: WorkSession[] = []
) {
  return getOpenWorkSession(sessions) !== undefined;
}

/*
 * Calculate the total amount of work recorded for
 * every work session.
 *
 * If a session is still running, "now" is used as
 * its temporary end time.
 *
 * Math.max prevents an invalid/future timestamp from
 * creating negative worked time or negative labor.
 */
export function getTotalWorkedMs(
  sessions: WorkSession[] = [],
  now = new Date()
) {
  return sessions.reduce(
    (total, session) => {

      const start =
        new Date(
          session.startedAt
        ).getTime();

      const end =
        session.endedAt
          ? new Date(
              session.endedAt
            ).getTime()
          : now.getTime();

      /*
       * Never allow a work session to contribute
       * negative time.
       */
      const duration =
        Math.max(
          0,
          end - start
        );

      return total + duration;

    },
    0
  );
}