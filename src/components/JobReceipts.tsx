import {
  useEffect,
  useState,
} from "react";

import type { Job } from "../types/Jobs";

import type { Receipt } from "../types/Receipt";

import {
  deleteReceipt,
  getJobReceipts,
  getReceiptFileUrl,
  uploadReceipt,
} from "../api/receipts";

import {
  cleanMultilineText,
  cleanText,
  isValidDateInput,
} from "../utils/formValidation";


type JobReceiptsProps = {
  job: Job;
};


const MAX_RECEIPT_BYTES =
  20 * 1024 * 1024;


const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".pdf",
];


function formatReceiptDate(
  value?: string
): string {

  if (!value) {
    return "";
  }


  const date =
    new Date(
      `${value}T00:00:00`
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;

  }


  return date.toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
}


function JobReceipts({
  job,
}: JobReceiptsProps) {

  const [
    receipts,
    setReceipts,
  ] = useState<Receipt[]>([]);


  const [
    isLoading,
    setIsLoading,
  ] = useState(true);


  const [
    isAdding,
    setIsAdding,
  ] = useState(false);


  const [
    isSaving,
    setIsSaving,
  ] = useState(false);


  const [
    deletingId,
    setDeletingId,
  ] = useState<string | null>(
    null
  );


  const [
    selectedFile,
    setSelectedFile,
  ] = useState<File | null>(
    null
  );


  const [
    vendor,
    setVendor,
  ] = useState("");


  const [
    purchaseDate,
    setPurchaseDate,
  ] = useState("");


  const [
    notes,
    setNotes,
  ] = useState("");


  const [
    error,
    setError,
  ] = useState("");


  /*
   * Load all receipts belonging to this job.
   */
  useEffect(() => {

    let cancelled = false;


    async function loadReceipts() {

      try {

        setIsLoading(true);

        setError("");


        const loaded =
          await getJobReceipts(
            job.id
          );


        if (!cancelled) {

          setReceipts(
            loaded
          );

        }

      } catch (loadError) {

        console.error(
          "Could not load receipts:",
          loadError
        );


        if (!cancelled) {

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load receipts."
          );

        }

      } finally {

        if (!cancelled) {

          setIsLoading(
            false
          );

        }

      }

    }


    void loadReceipts();


    return () => {

      cancelled = true;

    };

  }, [job.id]);


  /*
   * Clear the Add Receipt form.
   */
  function resetForm() {

    setSelectedFile(
      null
    );

    setVendor("");

    setPurchaseDate("");

    setNotes("");

    setError("");
  }


  function cancelAdd() {

    resetForm();

    setIsAdding(
      false
    );
  }


  /*
   * Frontend file validation.
   *
   * The backend validates this again before
   * accepting the file.
   */
  function validateFile(
    file: File
  ): string | null {

    const lowerName =
      file.name.toLowerCase();


    const validExtension =
      ALLOWED_EXTENSIONS.some(
        (extension) =>
          lowerName.endsWith(
            extension
          )
      );


    if (!validExtension) {

      return (
        "Choose a JPG, JPEG, PNG, " +
        "or PDF receipt."
      );

    }


    if (
      file.size >
      MAX_RECEIPT_BYTES
    ) {

      return (
        "Receipt files must be " +
        "20 MB or smaller."
      );

    }


    if (file.size === 0) {

      return (
        "The selected receipt file " +
        "is empty."
      );

    }


    return null;
  }


  /*
   * Upload and save a receipt.
   */
  async function saveReceipt(
    event:
      React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();


    setError("");


    if (!selectedFile) {

      setError(
        "Choose a receipt file."
      );

      return;

    }


    const fileError =
      validateFile(
        selectedFile
      );


    if (fileError) {

      setError(
        fileError
      );

      return;

    }


    const cleanedVendor =
      cleanText(
        vendor
      );


    const cleanedNotes =
      cleanMultilineText(
        notes
      );


    if (
      purchaseDate &&
      !isValidDateInput(
        purchaseDate
      )
    ) {

      setError(
        "Choose a valid purchase date."
      );

      return;

    }


    try {

      setIsSaving(
        true
      );


      const created =
        await uploadReceipt({

          jobId:
            job.id,

          file:
            selectedFile,

          vendor:
            cleanedVendor ||
            undefined,

          purchaseDate:
            purchaseDate ||
            undefined,

          notes:
            cleanedNotes ||
            undefined,

        });


      setReceipts(
        (current) => [

          ...current,

          created,

        ]
      );


      resetForm();


      setIsAdding(
        false
      );

    } catch (saveError) {

      console.error(
        "Could not save receipt:",
        saveError
      );


      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the receipt."
      );

    } finally {

      setIsSaving(
        false
      );

    }

  }


  /*
   * Delete a receipt.
   */
  async function removeReceipt(
    receipt: Receipt
  ) {

    const confirmed =
      window.confirm(
        `Delete receipt "${receipt.fileName}"?`
      );


    if (!confirmed) {
      return;
    }


    try {

      setDeletingId(
        receipt.id
      );

      setError("");


      await deleteReceipt(
        receipt.id
      );


      setReceipts(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              receipt.id
          )
      );

    } catch (deleteError) {

      console.error(
        "Could not delete receipt:",
        deleteError
      );


      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the receipt."
      );

    } finally {

      setDeletingId(
        null
      );

    }

  }


  /*
   * Open the receipt file.
   */
  function openReceipt(
    receipt: Receipt
  ) {

    window.open(
      getReceiptFileUrl(
        receipt.id
      ),
      "_blank",
      "noopener,noreferrer"
    );

  }


  return (

    <div className="job-details-card">

      <div className="job-details-heading">

        <h2>
          Receipts
        </h2>


        {!isAdding && (

          <button
            className="small-edit-button"
            type="button"

            onClick={() => {

              resetForm();

              setIsAdding(
                true
              );

            }}
          >

            + Add Receipt

          </button>

        )}

      </div>


      {isLoading ? (

        <p className="job-detail">

          Loading receipts...

        </p>

      ) : receipts.length === 0 ? (

        <p className="job-detail">

          No receipts have been added
          to this job yet.

        </p>

      ) : (

        <div className="job-list">

          {receipts.map(
            (receipt) => (

              <div
                className="job-card"
                key={receipt.id}
              >

                <div className="job-card-header">

                  <div>

                    <strong>

                      {receipt.vendor ||
                        receipt.fileName}

                    </strong>


                    {receipt.vendor && (

                      <div className="job-detail">

                        {receipt.fileName}

                      </div>

                    )}

                  </div>


                  {receipt.purchaseDate && (

                    <span>

                      {formatReceiptDate(
                        receipt.purchaseDate
                      )}

                    </span>

                  )}

                </div>


                {receipt.notes && (

                  <div className="job-detail">

                    {receipt.notes}

                  </div>

                )}


                <div className="edit-actions">

                  <button
                    className="secondary-button"
                    type="button"

                    onClick={() =>
                      openReceipt(
                        receipt
                      )
                    }
                  >

                    View Receipt

                  </button>


                  <button
                    className="secondary-button"
                    type="button"

                    disabled={
                      deletingId ===
                      receipt.id
                    }

                    onClick={() =>
                      void removeReceipt(
                        receipt
                      )
                    }
                  >

                    {deletingId ===
                    receipt.id
                      ? "Deleting..."
                      : "Delete"}

                  </button>

                </div>

              </div>

            )
          )}

        </div>

      )}


      {isAdding && (

        <form
          className="record-edit-form"
          onSubmit={saveReceipt}
          noValidate
        >

          <div className="edit-form-heading">

            <h3>
              Add Receipt
            </h3>

          </div>


          <label>

            Receipt File

            <input
              type="file"

              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"

              onChange={(event) => {

                const file =
                  event.currentTarget
                    .files?.[0] ??
                  null;


                setSelectedFile(
                  file
                );


                if (error) {

                  setError("");

                }

              }}
            />

          </label>


          <label>

            Vendor

            <input
              type="text"

              value={vendor}

              placeholder="Home Depot"

              onChange={(event) => {

                setVendor(
                  event.currentTarget.value
                );

              }}
            />

          </label>


          <label>

            Purchase Date

            <input
              type="date"

              value={purchaseDate}

              onChange={(event) => {

                setPurchaseDate(
                  event.currentTarget.value
                );


                if (error) {

                  setError("");

                }

              }}
            />

          </label>


          <label>

            Notes

            <textarea
              value={notes}

              placeholder="Optional notes about this receipt"

              onChange={(event) => {

                setNotes(
                  event.currentTarget.value
                );

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
                : "Save Receipt"}

            </button>


            <button
              className="secondary-button"
              type="button"

              disabled={
                isSaving
              }

              onClick={
                cancelAdd
              }
            >

              Cancel

            </button>

          </div>

        </form>

      )}


      {!isAdding &&
        error && (

          <p className="form-error">

            {error}

          </p>

        )}

    </div>

  );
}


export default JobReceipts;