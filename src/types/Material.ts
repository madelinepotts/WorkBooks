export type Material = {
  id: string;
  jobId: string;

  /*
   * Short description shown on the job and invoice.
   */
  description: string;

  /*
   * Quantity may be fractional for things such as
   * feet of pipe or partial boxes of supplies.
   */
  quantity: number;

  /*
   * Cost for one unit.
   */
  unitCost: number;

  /*
   * Optional receipt link. Receipt uploads are added
   * in the next step.
   */
  receiptId?: string;
};
