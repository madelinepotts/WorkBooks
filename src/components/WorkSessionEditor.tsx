import {
  useState,
} from "react";

import type { Job } from "../types/Jobs";

import type { WorkSession } from "../types/WorkSession";


type WorkSessionEditorProps = {
  job: Job;

  onUpdateJob: (
    job: Job
  ) => Promise<void>;
};


/*
 * Convert an ISO timestamp such as:
 *
 *   2026-09-30T22:30:00.000Z
 *
 * into the local format required by:
 *
 *   <input type="datetime-local">
 */
function isoToLocalInput(
  value: string
): string {

  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  const offsetMilliseconds =
    date.getTimezoneOffset() *
    60_000;


  return new Date(
    date.getTime() -
    offsetMilliseconds
  )
    .toISOString()
    .slice(0, 16);
}


/*
 * datetime-local values represent local time.
 *
 * new Date(value) interprets that value using the
 * computer's local timezone, then toISOString()
 * converts it to UTC for storage.
 */
function localInputToIso(
  value: string
): string {

  return new Date(
    value
  ).toISOString();
}


/*
 * Friendly date shown in the session list.
 */
function formatSessionDate(
  value: string
): string {

  const date =
    new Date(value);


  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}


/*
 * Friendly 12-hour clock time.
 */
function formatSessionTime(
  value: string
): string {

  const date =
    new Date(value);


  return date.toLocaleTimeString(
    undefined,
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}


/*
 * Human-readable session length.
 */
function formatDuration(
  startedAt: string,
  endedAt?: string
): string {

  const start =
    new Date(
      startedAt
    ).getTime();


  const end =
    endedAt
      ? new Date(
          endedAt
        ).getTime()
      : Date.now();


  const milliseconds =
    Math.max(
      0,
      end - start
    );


  const totalMinutes =
    Math.floor(
      milliseconds /
      60_000
    );


  const hours =
    Math.floor(
      totalMinutes /
      60
    );


  const minutes =
    totalMinutes % 60;


  if (hours === 0) {

    return `${minutes} min`;

  }


  if (minutes === 0) {

    return `${hours} hr`;

  }


  return (
    `${hours} hr ` +
    `${minutes} min`
  );
}


/*
 * Check whether two closed time ranges overlap.
 */
function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {

  return (
    startA < endB &&
    endA > startB
  );
}


function WorkSessionEditor({
  job,
  onUpdateJob,
}: WorkSessionEditorProps) {

  const sessions =
    job.workSessions ?? [];


  /*
   * The open session is the one currently being timed.
   */
  const openSession =
    sessions.find(
      (session) =>
        !session.endedAt
    );


  const [
    isAdding,
    setIsAdding,
  ] = useState(false);


  const [
    editingId,
    setEditingId,
  ] = useState<
    string | null
  >(null);


  const [
    startValue,
    setStartValue,
  ] = useState("");


  const [
    endValue,
    setEndValue,
  ] = useState("");


  const [
    error,
    setError,
  ] = useState("");


  const [
    isSaving,
    setIsSaving,
  ] = useState(false);


  /*
   * Sort sessions only for display.
   *
   * Do not mutate the Job's original array.
   */
  const sortedSessions =
    [...sessions].sort(
      (a, b) =>
        new Date(
          a.startedAt
        ).getTime() -
        new Date(
          b.startedAt
        ).getTime()
    );


  function clearEditor() {

    setIsAdding(false);

    setEditingId(null);

    setStartValue("");

    setEndValue("");

    setError("");

  }


  /*
   * Begin entering a missed session.
   */
  function beginAdd() {

    setEditingId(null);

    setStartValue("");

    setEndValue("");

    setError("");

    setIsAdding(true);

  }


  /*
   * Begin editing an existing completed session.
   */
  function beginEdit(
    session: WorkSession
  ) {

    /*
     * Running sessions should be paused through the normal
     * Pause Work button rather than edited while the timer
     * is still moving.
     */
    if (!session.endedAt) {

      setError(
        "Pause the current work session before editing it."
      );

      return;
    }


    setIsAdding(false);

    setEditingId(
      session.id
    );

    setStartValue(
      isoToLocalInput(
        session.startedAt
      )
    );

    setEndValue(
      isoToLocalInput(
        session.endedAt
      )
    );

    setError("");

  }


  /*
   * Validate the times and check that the edited session
   * does not overlap another session.
   */
  function validateTimes(
    sessionId:
      string | null
  ): {
    startedAt: string;
    endedAt: string;
  } | null {

    if (
      !startValue ||
      !endValue
    ) {

      setError(
        "Enter both a start time and an end time."
      );

      return null;
    }


    const start =
      new Date(
        startValue
      );


    const end =
      new Date(
        endValue
      );


    if (
      Number.isNaN(
        start.getTime()
      ) ||
      Number.isNaN(
        end.getTime()
      )
    ) {

      setError(
        "Enter valid start and end times."
      );

      return null;
    }


    if (
      end.getTime() <=
      start.getTime()
    ) {

      setError(
        "The end time must be after the start time."
      );

      return null;
    }


    /*
     * Prevent accidentally double-counting time by
     * overlapping two sessions.
     */
    for (
      const otherSession
      of sessions
    ) {

      if (
        otherSession.id ===
        sessionId
      ) {
        continue;
      }


      const otherStart =
        new Date(
          otherSession.startedAt
        ).getTime();


      /*
       * Treat the currently-running session as continuing
       * indefinitely for overlap checking.
       */
      const otherEnd =
        otherSession.endedAt
          ? new Date(
              otherSession.endedAt
            ).getTime()
          : Number.POSITIVE_INFINITY;


      if (
        rangesOverlap(
          start.getTime(),
          end.getTime(),
          otherStart,
          otherEnd
        )
      ) {

        setError(
          "This work session overlaps another recorded session."
        );

        return null;
      }
    }


    return {
      startedAt:
        localInputToIso(
          startValue
        ),

      endedAt:
        localInputToIso(
          endValue
        ),
    };
  }


  /*
   * Save either a new manual session or edits to an
   * existing session.
   */
  async function saveSession(
    event:
      React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    setError("");


    const validated =
      validateTimes(
        editingId
      );


    if (!validated) {
      return;
    }


    let updatedSessions:
      WorkSession[];


    if (editingId) {

      updatedSessions =
        sessions.map(
          (session) => {

            if (
              session.id !==
              editingId
            ) {

              return session;

            }


            return {
              ...session,

              startedAt:
                validated.startedAt,

              endedAt:
                validated.endedAt,
            };
          }
        );

    } else {

      const newSession:
        WorkSession = {

        id:
          crypto.randomUUID(),

        jobId:
          job.id,

        startedAt:
          validated.startedAt,

        endedAt:
          validated.endedAt,
      };


      updatedSessions = [
        ...sessions,
        newSession,
      ];
    }


    /*
     * Keep stored sessions chronological.
     */
    updatedSessions.sort(
      (a, b) =>
        new Date(
          a.startedAt
        ).getTime() -
        new Date(
          b.startedAt
        ).getTime()
    );


    /*
     * If Dad manually adds work to a job that was still
     * marked upcoming, that job has now actually begun.
     */
    const updatedStatus =
      job.status ===
        "upcoming"
        ? "active"
        : job.status;


    try {

      setIsSaving(true);

      setError("");


      await onUpdateJob({
        ...job,

        status:
          updatedStatus,

        completedAt:
          updatedStatus ===
            "active"
            ? undefined
            : job.completedAt,

        workSessions:
          updatedSessions,
      });


      clearEditor();

    } catch (saveError) {

      console.error(
        "Could not save work session:",
        saveError
      );


      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the work session."
      );

    } finally {

      setIsSaving(false);

    }
  }


  /*
   * Delete a completed work session.
   */
  async function deleteSession(
    session: WorkSession
  ) {

    if (!session.endedAt) {

      setError(
        "Pause the current work session before deleting it."
      );

      return;
    }


    const confirmed =
      window.confirm(
        "Delete this work session? This will change the total time worked."
      );


    if (!confirmed) {
      return;
    }


    const updatedSessions =
      sessions.filter(
        (currentSession) =>
          currentSession.id !==
          session.id
      );


    try {

      setIsSaving(true);

      setError("");


      await onUpdateJob({
        ...job,

        workSessions:
          updatedSessions,
      });


      if (
        editingId ===
        session.id
      ) {

        clearEditor();

      }

    } catch (deleteError) {

      console.error(
        "Could not delete work session:",
        deleteError
      );


      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the work session."
      );

    } finally {

      setIsSaving(false);

    }
  }


  return (
    <div className="job-details-card">

      <div className="job-details-heading">

        <h2>
          Work Sessions
        </h2>


        {!isAdding &&
          !editingId && (

          <button
            className="small-edit-button"
            type="button"

            disabled={
              isSaving
            }

            onClick={
              beginAdd
            }
          >

            + Add Missed Session

          </button>

        )}

      </div>


      {sessions.length === 0 ? (

        <p className="job-detail">

          No work sessions
          recorded yet.

        </p>

      ) : (

        <div className="job-list">

          {sortedSessions.map(
            (session) => {

              const running =
                !session.endedAt;


              return (
                <div
                  className="job-card"
                  key={session.id}
                >

                  <div className="job-card-header">

                    <div>

                      <strong>

                        {formatSessionDate(
                          session.startedAt
                        )}

                      </strong>


                      <div className="job-detail">

                        {formatSessionTime(
                          session.startedAt
                        )}

                        {" – "}

                        {session.endedAt
                          ? formatSessionTime(
                              session.endedAt
                            )
                          : "Working now"}

                      </div>

                    </div>


                    <strong>

                      {formatDuration(
                        session.startedAt,
                        session.endedAt
                      )}

                    </strong>

                  </div>


                  {running ? (

                    <p className="job-detail">

                      Pause work before
                      editing this session.

                    </p>

                  ) : (

                    <div className="edit-actions">

                      <button
                        className="secondary-button"
                        type="button"

                        disabled={
                          isSaving
                        }

                        onClick={() =>
                          beginEdit(
                            session
                          )
                        }
                      >

                        Edit

                      </button>


                      <button
                        className="secondary-button"
                        type="button"

                        disabled={
                          isSaving
                        }

                        onClick={() =>
                          void deleteSession(
                            session
                          )
                        }
                      >

                        Delete

                      </button>

                    </div>

                  )}

                </div>
              );
            }
          )}

        </div>

      )}


      {(isAdding ||
        editingId) && (

        <form
          className="record-edit-form"
          onSubmit={
            saveSession
          }
          noValidate
        >

          <div className="edit-form-heading">

            <h3>

              {editingId
                ? "Edit Work Session"
                : "Add Missed Work Session"}

            </h3>

          </div>


          <label>

            Start

            <input
              type="datetime-local"

              value={
                startValue
              }

              onChange={(event) => {

                setStartValue(
                  event.currentTarget.value
                );

                setError("");

              }}
            />

          </label>


          <label>

            End

            <input
              type="datetime-local"

              value={
                endValue
              }

              onChange={(event) => {

                setEndValue(
                  event.currentTarget.value
                );

                setError("");

              }}
            />

          </label>


          {error && (

            <p className="form-error">

              {error}

            </p>

          )}


          <div className="edit-actions">

            <button
              className="new-customer-button"
              type="submit"

              disabled={
                isSaving
              }
            >

              {isSaving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Add Session"}

            </button>


            <button
              className="secondary-button"
              type="button"

              disabled={
                isSaving
              }

              onClick={
                clearEditor
              }
            >

              Cancel

            </button>

          </div>

        </form>

      )}


      {!isAdding &&
        !editingId &&
        error && (

          <p className="form-error">

            {error}

          </p>

        )}


      {openSession &&
        !isAdding &&
        !editingId && (

        <p className="job-detail">

          The current running
          session will continue to
          update until work is paused.

        </p>

      )}

    </div>
  );
}


export default WorkSessionEditor;