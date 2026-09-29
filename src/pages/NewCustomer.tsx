import { useState } from "react";

import type { Customer } from "../types/Customer";

import {
  cleanEmail,
  cleanText,
  formatPhone,
  isValidEmail,
  isValidPhone,
} from "../utils/formValidation";


type NewCustomerProps = {
  onCancel: () => void;
  onContinue: (customer: Customer) => void;
};


function NewCustomer({
  onCancel,
  onContinue,
}: NewCustomerProps) {

  const [customerName, setCustomerName] =
    useState("");

  const [customerPhone, setCustomerPhone] =
    useState("");

  const [customerEmail, setCustomerEmail] =
    useState("");

  const [address, setAddress] =
    useState("");


  /*
   * Keep validation messages separate so Dad knows
   * exactly which field needs to be corrected.
   */
  const [nameError, setNameError] =
    useState("");

  const [phoneError, setPhoneError] =
    useState("");

  const [emailError, setEmailError] =
    useState("");

  const [addressError, setAddressError] =
    useState("");


  /*
   * Clear all old validation messages before checking
   * the form again.
   */
  function clearErrors() {
    setNameError("");
    setPhoneError("");
    setEmailError("");
    setAddressError("");
  }


  /*
   * Format the phone number after Dad leaves the field.
   *
   * Example:
   *
   * 8015551234
   * ->
   * (801) 555-1234
   *
   * We wait until blur instead of formatting every
   * keystroke so typing stays simple.
   */
  function handlePhoneBlur() {

    if (isValidPhone(customerPhone)) {
      setCustomerPhone(
        formatPhone(customerPhone)
      );
    }
  }


  /*
   * Normalize the email after leaving the field.
   *
   * Example:
   *
   * Dad@Example.COM
   * ->
   * dad@example.com
   */
  function handleEmailBlur() {
    setCustomerEmail(
      cleanEmail(customerEmail)
    );
  }


  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    clearErrors();


    /*
     * Clean values once before validating/saving.
     */
    const name =
      cleanText(customerName);

    const phone =
      formatPhone(customerPhone);

    const email =
      cleanEmail(customerEmail);

    const cleanedAddress =
      cleanText(address);


    let hasError = false;


    /*
     * Customer name is required.
     *
     * HTML "required" catches an empty input, but this
     * also catches a value containing only spaces.
     */
    if (!name) {

      setNameError(
        "Enter the customer's name."
      );

      hasError = true;
    }


    /*
     * For V1 we expect a standard 10-digit US phone
     * number, with an optional leading country code 1.
     */
    if (!isValidPhone(customerPhone)) {

      setPhoneError(
        "Enter a 10-digit phone number."
      );

      hasError = true;
    }


    /*
     * Email is optional, but if Dad enters one it must
     * look like a valid email address.
     */
    if (
      email &&
      !isValidEmail(email)
    ) {

      setEmailError(
        "Enter a valid email address."
      );

      hasError = true;
    }


    /*
     * A customer needs an address because jobs and
     * future mileage features depend on it.
     */
    if (!cleanedAddress) {

      setAddressError(
        "Enter the customer's address."
      );

      hasError = true;
    }


    /*
     * Don't create anything until every field passes.
     */
    if (hasError) {
      return;
    }


    const customer: Customer = {

      id: crypto.randomUUID(),

      name,

      phone,

      /*
       * Keep the optional TypeScript field undefined
       * when no email was entered.
       */
      email:
        email || undefined,

      address:
        cleanedAddress,
    };


    onContinue(customer);
  }


  return (
    <>
      <header className="app-header">

        <h1>
          New Customer
        </h1>

        <p>
          Enter the customer's information.
        </p>

      </header>


      <section className="home">

        <form
          className="customer-form"
          onSubmit={handleSubmit}
          noValidate
        >

          {/* Customer name */}
          <label>

            Customer Name

            <input
              type="text"

              value={customerName}

              onChange={(event) => {
                setCustomerName(
                  event.currentTarget.value
                );

                /*
                 * Remove the error as soon as Dad
                 * starts correcting the field.
                 */
                if (nameError) {
                  setNameError("");
                }
              }}

              placeholder="Customer name"

              autoComplete="name"

              aria-invalid={
                Boolean(nameError)
              }
            />

            {nameError && (
              <span className="form-error">
                {nameError}
              </span>
            )}

          </label>


          {/* Phone number */}
          <label>

            Phone

            <input
              type="tel"

              value={customerPhone}

              onChange={(event) => {
                setCustomerPhone(
                  event.currentTarget.value
                );

                if (phoneError) {
                  setPhoneError("");
                }
              }}

              onBlur={handlePhoneBlur}

              placeholder="(801) 555-1234"

              autoComplete="tel"

              inputMode="tel"

              aria-invalid={
                Boolean(phoneError)
              }
            />

            {phoneError && (
              <span className="form-error">
                {phoneError}
              </span>
            )}

          </label>


          {/* Optional email */}
          <label>

            Email

            <input
              type="email"

              value={customerEmail}

              onChange={(event) => {
                setCustomerEmail(
                  event.currentTarget.value
                );

                if (emailError) {
                  setEmailError("");
                }
              }}

              onBlur={handleEmailBlur}

              placeholder="Optional"

              autoComplete="email"

              inputMode="email"

              aria-invalid={
                Boolean(emailError)
              }
            />

            {emailError && (
              <span className="form-error">
                {emailError}
              </span>
            )}

          </label>


          {/* Customer / job address */}
          <label>

            Address

            <input
              type="text"

              value={address}

              onChange={(event) => {
                setAddress(
                  event.currentTarget.value
                );

                if (addressError) {
                  setAddressError("");
                }
              }}

              placeholder="123 Main St, Salt Lake City, UT 84101"

              autoComplete="street-address"

              aria-invalid={
                Boolean(addressError)
              }
            />

            {addressError && (
              <span className="form-error">
                {addressError}
              </span>
            )}

          </label>


          <button
            type="submit"
            className="new-customer-button"
          >
            Continue to Job
          </button>


          <button
            type="button"
            className="add-job-button"
            onClick={onCancel}
          >
            Cancel
          </button>

        </form>

      </section>
    </>
  );
}


export default NewCustomer;