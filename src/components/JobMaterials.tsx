import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { Job } from "../types/Jobs";
import type { Material } from "../types/Material";

import {
  createMaterial,
  deleteMaterial,
  getJobMaterials,
  updateMaterial,
} from "../api/materials";

import {
  cleanText,
  parseMoney,
} from "../utils/formValidation";

import {
  formatMoney,
} from "../utils/jobTime";


type JobMaterialsProps = {
  job: Job;
};


function JobMaterials({
  job,
}: JobMaterialsProps) {

  const [
    materials,
    setMaterials,
  ] = useState<Material[]>([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    isAdding,
    setIsAdding,
  ] = useState(false);

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(
    null
  );

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    quantity,
    setQuantity,
  ] = useState("1");

  const [
    unitCost,
    setUnitCost,
  ] = useState("");

  const [
    descriptionError,
    setDescriptionError,
  ] = useState("");

  const [
    quantityError,
    setQuantityError,
  ] = useState("");

  const [
    unitCostError,
    setUnitCostError,
  ] = useState("");

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);


  /*
   * Reload materials whenever Job Details switches to
   * a different job.
   */
  useEffect(() => {

    let cancelled = false;


    async function loadMaterials() {

      setIsLoading(true);

      setError("");


      try {

        const loaded =
          await getJobMaterials(
            job.id
          );


        if (!cancelled) {
          setMaterials(
            loaded
          );
        }

      } catch (loadError) {

        if (!cancelled) {

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load materials."
          );
        }

      } finally {

        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }


    void loadMaterials();


    return () => {
      cancelled = true;
    };

  }, [job.id]);


  /*
   * Material totals are calculated from the individual
   * lines instead of being stored in SQLite.
   */
  const materialsTotal =
    useMemo(
      () =>
        materials.reduce(
          (
            total,
            material
          ) =>
            total +
            (
              material.quantity *
              material.unitCost
            ),
          0
        ),
      [materials]
    );


  function clearForm() {

    setDescription("");

    setQuantity("1");

    setUnitCost("");

    setDescriptionError("");

    setQuantityError("");

    setUnitCostError("");

    setError("");

    setEditingId(null);

    setIsAdding(false);
  }


  function beginAdd() {

    clearForm();

    setIsAdding(true);
  }


  function beginEdit(
    material: Material
  ) {

    setDescription(
      material.description
    );

    setQuantity(
      String(
        material.quantity
      )
    );

    setUnitCost(
      material.unitCost.toFixed(
        2
      )
    );

    setDescriptionError("");

    setQuantityError("");

    setUnitCostError("");

    setError("");

    setEditingId(
      material.id
    );

    setIsAdding(true);
  }


  /*
   * Quantity is not money, so validate it separately.
   */
  function parseQuantity():
    number | null {

    const value =
      Number(quantity);


    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return null;
    }


    return value;
  }


  function formatUnitCost() {

    const amount =
      parseMoney(unitCost);


    if (
      amount !== null &&
      amount > 0
    ) {
      setUnitCost(
        amount.toFixed(2)
      );
    }
  }


  async function saveMaterial(
    event:
      React.FormEvent<HTMLFormElement>
  ) {

    event.preventDefault();

    setDescriptionError("");

    setQuantityError("");

    setUnitCostError("");

    setError("");


    const cleanedDescription =
      cleanText(description);

    const parsedQuantity =
      parseQuantity();

    const parsedUnitCost =
      parseMoney(unitCost);


    let hasError = false;


    if (!cleanedDescription) {

      setDescriptionError(
        "Enter a material description."
      );

      hasError = true;
    }


    if (parsedQuantity === null) {

      setQuantityError(
        "Quantity must be greater than 0."
      );

      hasError = true;
    }


    if (
      parsedUnitCost === null ||
      parsedUnitCost <= 0
    ) {

      setUnitCostError(
        "Unit cost must be greater than $0.00."
      );

      hasError = true;
    }


    if (
      hasError ||
      parsedQuantity === null ||
      parsedUnitCost === null
    ) {
      return;
    }


    const material: Material = {

      id:
        editingId ??
        crypto.randomUUID(),

      jobId:
        job.id,

      description:
        cleanedDescription,

      quantity:
        parsedQuantity,

      unitCost:
        parsedUnitCost,
    };


    /*
     * Preserve a receipt link when editing an existing
     * material. Receipt upload support comes next.
     */
    if (editingId) {

      const existing =
        materials.find(
          (item) =>
            item.id === editingId
        );


      if (existing?.receiptId) {
        material.receiptId =
          existing.receiptId;
      }
    }


    try {

      setIsSaving(true);


      if (editingId) {

        const saved =
          await updateMaterial(
            material
          );


        setMaterials(
          (current) =>
            current.map(
              (item) =>
                item.id === saved.id
                  ? saved
                  : item
            )
        );

      } else {

        const saved =
          await createMaterial(
            material
          );


        setMaterials(
          (current) => [
            ...current,
            saved,
          ]
        );
      }


      clearForm();

    } catch (saveError) {

      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save material."
      );

    } finally {

      setIsSaving(false);
    }
  }


  async function removeMaterial(
    material: Material
  ) {

    const confirmed =
      window.confirm(
        `Delete "${material.description}"?`
      );


    if (!confirmed) {
      return;
    }


    try {

      setError("");


      await deleteMaterial(
        material.id
      );


      setMaterials(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              material.id
          )
      );


      /*
       * If Dad deletes the line currently being edited,
       * close the edit form too.
       */
      if (
        editingId ===
        material.id
      ) {
        clearForm();
      }

    } catch (deleteError) {

      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete material."
      );
    }
  }


  return (
    <div className="job-details-card">

      <div className="job-details-heading">

        <h2>
          Materials
        </h2>


        {!isAdding && (
          <button
            className="small-edit-button"
            type="button"
            onClick={beginAdd}
          >
            + Add Material
          </button>
        )}

      </div>


      {isLoading ? (

        <p>
          Loading materials...
        </p>

      ) : materials.length === 0 &&
        !isAdding ? (

        <p className="job-pricing">
          No materials added yet.
        </p>

      ) : (

        <>
          {materials.length > 0 && (

            <div className="job-list">

              {materials.map(
                (material) => {

                  const lineTotal =
                    material.quantity *
                    material.unitCost;


                  return (
                    <div
                      className="job-card"
                      key={
                        material.id
                      }
                    >

                      <div className="job-card-header">

                        <strong>
                          {
                            material.description
                          }
                        </strong>


                        <strong>
                          {formatMoney(
                            lineTotal
                          )}
                        </strong>

                      </div>


                      <p className="job-pricing">

                        {material.quantity}
                        {" × "}
                        {formatMoney(
                          material.unitCost
                        )}

                      </p>


                      <div className="edit-actions">

                        <button
                          className="small-edit-button"
                          type="button"

                          onClick={() =>
                            beginEdit(
                              material
                            )
                          }
                        >
                          Edit
                        </button>


                        <button
                          className="secondary-button"
                          type="button"

                          onClick={() =>
                            void removeMaterial(
                              material
                            )
                          }
                        >
                          Delete
                        </button>

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          )}


          {materials.length > 0 && (

            <div className="job-detail job-total-detail">

              <span className="job-detail-label">
                Materials Total
              </span>

              <strong>
                {formatMoney(
                  materialsTotal
                )}
              </strong>

            </div>

          )}

        </>
      )}


      {isAdding && (

        <form
          className="record-edit-form"
          onSubmit={saveMaterial}
          noValidate
        >

          <h3>
            {editingId
              ? "Edit Material"
              : "Add Material"}
          </h3>


          <label>

            Description

            <input
              type="text"

              value={description}

              onChange={(event) => {

                setDescription(
                  event.currentTarget.value
                );

                if (
                  descriptionError
                ) {
                  setDescriptionError(
                    ""
                  );
                }
              }}

              placeholder="Supply line"

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


          <label>

            Quantity

            <input
              type="number"

              min="0.01"

              step="any"

              inputMode="decimal"

              value={quantity}

              onChange={(event) => {

                setQuantity(
                  event.currentTarget.value
                );

                if (quantityError) {
                  setQuantityError(
                    ""
                  );
                }
              }}

              aria-invalid={
                Boolean(
                  quantityError
                )
              }
            />

            {quantityError && (
              <span className="form-error">
                {quantityError}
              </span>
            )}

          </label>


          <label>

            Unit Cost

            <div className="money-input">

              <span>
                $
              </span>

              <input
                type="number"

                min="0.01"

                step="0.01"

                inputMode="decimal"

                value={unitCost}

                onChange={(event) => {

                  setUnitCost(
                    event.currentTarget.value
                  );

                  if (
                    unitCostError
                  ) {
                    setUnitCostError(
                      ""
                    );
                  }
                }}

                onBlur={
                  formatUnitCost
                }

                placeholder="8.50"

                aria-invalid={
                  Boolean(
                    unitCostError
                  )
                }
              />

            </div>

            {unitCostError && (
              <span className="form-error">
                {unitCostError}
              </span>
            )}

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
              disabled={isSaving}
            >
              {isSaving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Add Material"}
            </button>


            <button
              className="secondary-button"
              type="button"
              onClick={clearForm}
              disabled={isSaving}
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


export default JobMaterials;
