export type BusinessInfo = {
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  paymentInstructions: string;
};


/*
 * Used before the backend finishes loading the saved business details.
 */
export const EMPTY_BUSINESS_INFO: BusinessInfo = {
  businessName: "",
  ownerName: "",
  phone: "",
  email: "",
  address: "",
  paymentInstructions: "",
};
