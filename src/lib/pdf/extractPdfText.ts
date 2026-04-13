/**
 * Extracts plain text from a PDF file in the browser using pdfjs-dist.
 * Does not upload the file — pass a File from an `<input>` or drop handler only on the client.
 */

export async function extractPdfText(file: File): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("PDF text extraction must run in the browser.");
  }

  if (!file.type || !file.type.includes("pdf")) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Please choose a PDF file.");
    }
  }

  const pdfjs = await import("pdfjs-dist");

  const version = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;

  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const line = textContent.items
      .map((item) => {
        if (item && typeof item === "object" && "str" in item) {
          return String((item as { str: unknown }).str ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
    if (line) parts.push(line);
  }

  return parts.join("\n\n").replace(/\s+\n/g, "\n").trim();
}
