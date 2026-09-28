export type WorkSession = {
  id: string;
  jobId: string;

  /*
   * Exact times this work session started and stopped.
   *
   * endedAt is empty while Dad is actively working.
   */
  startedAt: string;
  endedAt?: string;
};