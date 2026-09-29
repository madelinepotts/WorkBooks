/*
 * Shared form cleaning, formatting, and validation.
 *
 * Keeping these rules here means New Customer, Edit Customer,
 * New Job, Edit Job, and Finances all behave consistently.
 */


/*
 * Remove whitespace from the beginning/end and collapse
 * repeated whitespace inside a value.
 *
 * Example:
 *
 * "  Replace   kitchen faucet  "
 * ->
 * "Replace kitchen faucet"
 */
export function cleanText(
  value: string
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

/*
 * Addresses can contain line breaks, so clean each line
 * without destroying the multi-line layout.
 */
export function cleanMultilineText(
  value: string
): string {
  return value
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/[ \t]+/g, " ")
    )
    .filter((line) => line.length > 0)
    .join("\n");
}

/*
 * Keep only numeric phone digits.
 */
export function getPhoneDigits(
  value: string
): string {
  return value.replace(/\D/g, "");
}

/*
 * Normalize a US phone number.
 *
 * Accepted examples:
 *
 * 8015551234
 * 801-555-1234
 * (801) 555-1234
 * 1-801-555-1234
 *
 * Saved result:
 *
 * (801) 555-1234
 */
export function formatPhone(
  value: string
): string {

  let digits =
    getPhoneDigits(value);


  /*
   * Allow a normal US country code.
   */
  if (
    digits.length === 11 &&
    digits.startsWith("1")
  ) {
    digits = digits.slice(1);
  }


  if (digits.length !== 10) {
    return value.trim();
  }


  return (
    `(${digits.slice(0, 3)}) ` +
    `${digits.slice(3, 6)}-` +
    `${digits.slice(6)}`
  );
}

/*
 * Check whether a phone number contains ten US digits.
 *
 * An optional leading 1 is also accepted.
 */
export function isValidPhone(
  value: string
): boolean {

  let digits =
    getPhoneDigits(value);


  if (
    digits.length === 11 &&
    digits.startsWith("1")
  ) {
    digits = digits.slice(1);
  }


  return digits.length === 10;
}

/*
 * Normalize email for storage.
 *
 * Email domains are case-insensitive and people usually
 * expect an address to appear in lowercase.
 */
export function cleanEmail(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

/*
 * This intentionally performs simple validation rather
 * than trying to implement the entire email specification.
 */
export function isValidEmail(
  value: string
): boolean {

  if (!value) {
    return true;
  }


  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

/*
 * Parse a money field safely.
 *
 * Returns null instead of allowing NaN into a Job,
 * Invoice, or database request.
 */
export function parseMoney(
  value: string
): number | null {

  if (value.trim() === "") {
    return null;
  }


  const amount =
    Number(value);


  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return null;
  }

  /*
   * Store dollars to two decimal places.
   *
   * Example:
   *
   * 75.999 -> 76.00
   */
  return Math.round(
    amount * 100
  ) / 100;
}

/*
 * Most labor prices should actually be greater than zero.
 */
export function isPositiveMoney(
  value: string
): boolean {

  const amount =
    parseMoney(value);


  return (
    amount !== null &&
    amount > 0
  );
}

/*
 * YYYY-MM-DD dates from HTML date inputs can be
 * validated without involving timezone conversions.
 */
export function isValidDateInput(
  value: string
): boolean {

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }


  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);


  const date =
    new Date(
      year,
      month - 1,
      day
    );


  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/*
 * Compare YYYY-MM-DD strings directly.
 *
 * Because this format is ordered year -> month -> day,
 * normal string comparison works correctly.
 */
export function isDateOnOrAfter(
  value: string,
  minimum: string
): boolean {

  return (
    isValidDateInput(value) &&
    isValidDateInput(minimum) &&
    value >= minimum
  );
}