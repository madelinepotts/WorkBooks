export type Receipt = {
  id: string;
  jobId: string;

  /*
   * Friendly/original filename.
   */
  fileName: string;

  /*
   * Path or stored filename managed by WorkBooks.
   */
  storedFileName: string;

  vendor?: string;

  purchaseDate?: string;

  notes?: string;
};