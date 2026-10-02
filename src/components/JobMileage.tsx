import { useEffect, useMemo, useState } from "react";

import {
  createMileageEntry,
  deleteMileageEntry,
  getJobMileage,
  updateMileageEntry,
} from "../api/mileage";

import type { Job } from "../types/Jobs";
import type { MileageEntry } from "../types/MileageEntry";

type JobMileageProps = {
  job: Job;
};

function todayInputValue(): string {
  return new Date().toLocaleDateString("en-CA");
}

function JobMileage({
  job,
}: JobMileageProps) {
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [tripDate, setTripDate] = useState(todayInputValue());
  const [miles, setMiles] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const totalMiles = useMemo(
    () =>
      entries.reduce(
        (total, entry) => total + entry.miles,
        0
      ),
    [entries]
  );

  async function loadMileage() {
    try {
      setError("");
      setEntries(await getJobMileage(job.id));
    } catch (loadError) {
      console.error("Could not load mileage:", loadError);
      setError("Could not load mileage.");
    }
  }

  useEffect(() => {
    void loadMileage();
  }, [job.id]);

  function resetForm() {
    setEditingId(null);
    setTripDate(todayInputValue());
    setMiles("");
    setNotes("");
    setError("");
  }

  function beginEdit(
    entry: MileageEntry
  ) {
    setEditingId(entry.id);
    setTripDate(entry.tripDate);
    setMiles(entry.miles.toString());
    setNotes(entry.notes ?? "");
    setError("");
  }

  async function saveMileage(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const parsedMiles = Number(miles);

    if (!tripDate) {
      setError("Choose a trip date.");
      return;
    }

    if (
      !Number.isFinite(parsedMiles) ||
      parsedMiles <= 0
    ) {
      setError("Enter miles greater than zero.");
      return;
    }

    const entry: MileageEntry = {
      id: editingId ?? crypto.randomUUID(),
      jobId: job.id,
      tripDate,
      miles: parsedMiles,
      notes: notes.trim() || undefined,
    };

    try {
      setIsSaving(true);
      setError("");

      if (editingId) {
        await updateMileageEntry(entry);
      } else {
        await createMileageEntry(entry);
      }

      await loadMileage();
      resetForm();
    } catch (saveError) {
      console.error("Could not save mileage:", saveError);
      setError("Could not save mileage.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeMileage(
    entry: MileageEntry
  ) {
    const confirmed = window.confirm(
      `Delete the ${entry.miles.toFixed(1)} mile trip from ${entry.tripDate}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);
      setError("");

      await deleteMileageEntry(entry.id);
      await loadMileage();

      if (editingId === entry.id) {
        resetForm();
      }
    } catch (deleteError) {
      console.error("Could not delete mileage:", deleteError);
      setError("Could not delete mileage.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="job-details-card">
      <div className="job-details-heading">
        <h2>Mileage</h2>
        <strong>{totalMiles.toFixed(1)} mi</strong>
      </div>

      {entries.length > 0 && (
        <div className="record-list">
          {entries.map((entry) => (
            <div
              className="job-detail"
              key={entry.id}
            >
              <span>
                <strong>
                  {entry.miles.toFixed(1)} mi
                </strong>
                {" · "}
                {entry.tripDate}
                {entry.notes
                  ? ` · ${entry.notes}`
                  : ""}
              </span>

              <div className="edit-actions">
                <button
                  className="small-edit-button"
                  type="button"
                  onClick={() => beginEdit(entry)}
                  disabled={isSaving}
                >
                  Edit
                </button>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    void removeMileage(entry)
                  }
                  disabled={isSaving}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        className="record-edit-form"
        onSubmit={saveMileage}
        noValidate
      >
        <div className="edit-form-heading">
          <h3>
            {editingId
              ? "Edit Trip"
              : "Add Trip"}
          </h3>
        </div>

        <label>
          Date
          <input
            type="date"
            value={tripDate}
            onChange={(event) =>
              setTripDate(
                event.currentTarget.value
              )
            }
          />
        </label>

        <label>
          Miles
          <input
            type="number"
            min="0.1"
            step="0.1"
            inputMode="decimal"
            value={miles}
            onChange={(event) =>
              setMiles(
                event.currentTarget.value
              )
            }
            placeholder="12.5"
          />
        </label>

        <label>
          Note (optional)
          <input
            type="text"
            value={notes}
            onChange={(event) =>
              setNotes(
                event.currentTarget.value
              )
            }
            placeholder="Supply run, customer visit, etc."
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
            disabled={isSaving}
          >
            {isSaving
              ? "Saving..."
              : editingId
                ? "Save Trip"
                : "Add Mileage"}
          </button>

          {editingId && (
            <button
              className="secondary-button"
              type="button"
              onClick={resetForm}
              disabled={isSaving}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default JobMileage;
