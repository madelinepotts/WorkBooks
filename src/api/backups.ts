const API_URL =
  "http://127.0.0.1:8000";


async function getErrorMessage(
  response: Response
): Promise<string> {

  try {

    const body =
      await response.json();


    if (
      body &&
      typeof body.detail === "string"
    ) {

      return body.detail;

    }

  } catch {
    /*
     * The backend did not return JSON.
     */
  }


  return (
    `Request failed with status ` +
    `${response.status}.`
  );
}


/*
 * Download a complete WorkBooks backup.
 *
 * The backend creates the ZIP from a SQLite snapshot plus
 * the saved receipt and invoice files.
 */
export async function downloadBackup():
  Promise<void> {

  const response =
    await fetch(
      `${API_URL}/backup`
    );


  if (!response.ok) {

    throw new Error(
      await getErrorMessage(
        response
      )
    );

  }


  const blob =
    await response.blob();


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-"
      )
      .slice(
        0,
        19
      );


  const fileName =
    `WorkBooks-Backup-${timestamp}.zip`;


  const objectUrl =
    URL.createObjectURL(
      blob
    );


  try {

    const link =
      document.createElement(
        "a"
      );


    link.href =
      objectUrl;

    link.download =
      fileName;


    document.body.appendChild(
      link
    );


    link.click();


    link.remove();

  } finally {

    URL.revokeObjectURL(
      objectUrl
    );

  }
}


/*
 * Restore a ZIP created by WorkBooks.
 *
 * The backend validates the archive and SQLite database
 * before replacing the current data.
 */
export async function restoreBackup(
  file: File
): Promise<void> {

  const formData =
    new FormData();


  formData.append(
    "backup",
    file
  );


  const response =
    await fetch(
      `${API_URL}/restore-backup`,
      {
        method: "POST",
        body: formData,
      }
    );


  if (!response.ok) {

    throw new Error(
      await getErrorMessage(
        response
      )
    );

  }
}
