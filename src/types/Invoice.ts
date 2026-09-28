export type InvoiceStatus = "draft" | "sent" | "paid";

export type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  jobId: string;
  createdAt: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
};
