export type Material = {
  id: string;
  jobId: string;

  description: string;

  quantity: number;

  /*
   * Cost for one item.
   */
  unitCost: number;

  /*
   * Optional receipt associated with this purchase.
   */
  receiptId?: string;
};