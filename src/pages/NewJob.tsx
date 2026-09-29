import { useState } from "react";

import type { Customer } from "../types/Customer";
import type { Job } from "../types/Jobs";

import {
  cleanMultilineText,
  isPositiveMoney,
  isValidDateInput,
  parseMoney,
} from "../utils/formValidation";


type NewJobProps = {
  customer: Customer;
  onBack: () => void;
  onSave: (job: Job) => void;
};


function NewJob({
  customer,
  onBack,
  onSave,
}: NewJobProps) {

  const [description, setDescription] =
    useState("");

  const [scheduledDate, setScheduledDate] =
    useState("");

  const [scheduledTime, setScheduledTime] =
    useState("");

  const [pricingType, setPricingType] =
    useState<"hourly" | "fixed">("hourly");

  const [hourlyRate, setHourlyRate] =
    useState("");

  const [fixedPrice, setFixedPrice] =
    useState("");


  /*
   * Validation messages.
   */
  const [descriptionError, setDescriptionError] =
    useState("");

  const [dateError, setDateError] =
    useState("");

  const [priceError, setPriceError] =
    useState("");


  /*
   * Format a valid price to normal dollars/cents
   * after Dad leaves the field.
   *
   * 75 -> 75.00
   * 75.5 -> 75.50
   */
  function formatPrice(
    value: string,
    setter: (value: string) => void
  ) {

    const amount =
      parseMoney(value);

    if (
      amount !== null &&
      amount > 0
    ) {
      setter(
        amount.toFixed(2)
      );
    }
  }


  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();


    /*
     * Clear previous errors before checking again.
     */
    setDescriptionError("");
    setDateError("");
    setPriceError("");


    const cleanedDescription =
      cleanMultilineText(
        description
      );


    let hasError = false;


    /*
     * Job description cannot be empty or just spaces.
     */
    if (!cleanedDescription) {

      setDescriptionError(
        "Enter what needs to be done."
      );

      hasError = true;
    }


    /*
     * Require a real calendar date.
     */
    if (
      !isValidDateInput(
        scheduledDate
      )
    ) {

      setDateError(
        "Choose a valid scheduled date."
      );

      hasError = true;
    }


    /*
     * Validate only the price field currently being used.
     */
    const priceValue =
      pricingType === "hourly"
        ? hourlyRate
        : fixedPrice;


    if (
      !isPositiveMoney(
        priceValue
      )
    ) {

      setPriceError(
        pricingType === "hourly"
          ? "Enter an hourly rate greater than $0.00."
          : "Enter a fixed price greater than $0.00."
      );

      hasError = true;
    }


    /*
     * Stop before creating the job if anything
     * needs correction.
     */
    if (hasError) {
      return;
    }


    /*
     * At this point validation guarantees this is
     * a valid positive number.
     */
    const price =
      parseMoney(
        priceValue
      )!;


    const job: Job = {

      id: crypto.randomUUID(),

      customerId:
        customer.id,

      description:
        cleanedDescription,

      scheduledDate,

      scheduledTime:
        scheduledTime ||
        undefined,

      pricingType,

      hourlyRate:
        pricingType === "hourly"
          ? price
          : undefined,

      fixedPrice:
        pricingType === "fixed"
          ? price
          : undefined,

      status: "upcoming",
    };


    onSave(job);
  }


  return (
    <>
      <header className="app-header">

        <h1>
          New Job
        </h1>


        <div className="header-customer">

          <span className="header-customer-name">
            {customer.name}
          </span>

          <span className="header-customer-phone">
            {customer.phone}
          </span>

          <span className="header-customer-address">
            {customer.address}
          </span>

        </div>

      </header>


      <section className="home">

        <form
          className="job-form"
          onSubmit={handleSubmit}
          noValidate
        >

          {/* Description */}
          <label>

            What needs to be done?

            <textarea
              value={description}

              onChange={(event) => {

                setDescription(
                  event.currentTarget.value
                );

                if (descriptionError) {
                  setDescriptionError("");
                }
              }}

              placeholder="Replace kitchen faucet"

              aria-invalid={
                Boolean(
                  descriptionError
                )
              }
            />

            {descriptionError && (
              <span className="form-error">
                {descriptionError}
              </span>
            )}

          </label>


          {/* Scheduled date */}
          <label>

            Scheduled Date

            <input
              type="date"

              value={scheduledDate}

              onChange={(event) => {

                setScheduledDate(
                  event.currentTarget.value
                );

                if (dateError) {
                  setDateError("");
                }
              }}

              aria-invalid={
                Boolean(dateError)
              }
            />

            {dateError && (
              <span className="form-error">
                {dateError}
              </span>
            )}

          </label>


          {/* Scheduled time */}
          <label>

            Scheduled Time

            <input
              type="time"

              value={scheduledTime}

              onChange={(event) =>
                setScheduledTime(
                  event.currentTarget.value
                )
              }
            />

          </label>


          {/* Pricing method */}
          <label>

            Pricing

            <select
              value={pricingType}

              onChange={(event) => {

                const value =
                  event.currentTarget.value as
                    | "hourly"
                    | "fixed";

                setPricingType(value);

                /*
                 * Clear a price error when switching
                 * between hourly and fixed.
                 */
                setPriceError("");
              }}
            >

              <option value="hourly">
                Hourly
              </option>

              <option value="fixed">
                Fixed Price
              </option>

            </select>

          </label>


          {pricingType === "hourly" ? (

            /* Hourly price */
            <label>

              Hourly Rate

              <div className="money-input">

                <span>
                  $
                </span>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"

                  value={hourlyRate}

                  onChange={(event) => {

                    setHourlyRate(
                      event.currentTarget.value
                    );

                    if (priceError) {
                      setPriceError("");
                    }
                  }}

                  onBlur={() =>
                    formatPrice(
                      hourlyRate,
                      setHourlyRate
                    )
                  }

                  placeholder="75.00"

                  aria-invalid={
                    Boolean(priceError)
                  }
                />

                <span>
                  / hour
                </span>

              </div>


              {priceError && (
                <span className="form-error">
                  {priceError}
                </span>
              )}

            </label>

          ) : (

            /* Fixed price */
            <label>

              Fixed Job Price

              <div className="money-input">

                <span>
                  $
                </span>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"

                  value={fixedPrice}

                  onChange={(event) => {

                    setFixedPrice(
                      event.currentTarget.value
                    );

                    if (priceError) {
                      setPriceError("");
                    }
                  }}

                  onBlur={() =>
                    formatPrice(
                      fixedPrice,
                      setFixedPrice
                    )
                  }

                  placeholder="350.00"

                  aria-invalid={
                    Boolean(priceError)
                  }
                />

              </div>


              {priceError && (
                <span className="form-error">
                  {priceError}
                </span>
              )}

            </label>

          )}


          <button
            type="submit"
            className="new-customer-button"
          >
            Save Job
          </button>


          <button
            type="button"
            className="add-job-button"
            onClick={onBack}
          >
            Back
          </button>

        </form>

      </section>
    </>
  );
}


export default NewJob;