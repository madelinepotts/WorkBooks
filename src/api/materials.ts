import type { Material } from "../types/Material";


const API_URL = "http://127.0.0.1:8000";


/*
 * Pull a useful FastAPI error message out of an HTTP
 * response instead of showing only "request failed".
 */
async function getErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {

  try {
    const body = await response.json();

    if (
      body &&
      typeof body.detail === "string"
    ) {
      return body.detail;
    }
  } catch {
    // The response did not contain JSON.
  }

  return fallback;
}


export async function getJobMaterials(
  jobId: string
): Promise<Material[]> {

  const response = await fetch(
    `${API_URL}/jobs/${jobId}/materials`
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "Could not load materials."
      )
    );
  }

  return response.json();
}


export async function createMaterial(
  material: Material
): Promise<Material> {

  const response = await fetch(
    `${API_URL}/materials`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(material),
    }
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "Could not add material."
      )
    );
  }

  return response.json();
}


export async function updateMaterial(
  material: Material
): Promise<Material> {

  const response = await fetch(
    `${API_URL}/materials/${material.id}`,
    {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(material),
    }
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "Could not update material."
      )
    );
  }

  return response.json();
}


export async function deleteMaterial(
  materialId: string
): Promise<void> {

  const response = await fetch(
    `${API_URL}/materials/${materialId}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "Could not delete material."
      )
    );
  }
}
