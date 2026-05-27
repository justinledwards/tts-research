import { isSupportedBookSourceBatch } from "./model";
import type { BookImportProfile, BookSourceImportOptions, PDFTableMode } from "../../types";

const BATCH_IMPORT_ERROR = "Upload one book source or an ordered batch of image pages.";

export function normalizeBookCinemaImportFiles(
  files: FileList | File[] | null | undefined,
): File[] {
  return files ? [...files] : [];
}

export async function importBookCinemaSources({
  files,
  importProfile,
  onError,
  onImport,
  pdfTableMode,
  validateBatch = true,
}: Readonly<{
  files: FileList | File[] | null | undefined;
  importProfile: BookImportProfile;
  onError?: (error: string | null) => void;
  onImport: (files: File[], options: BookSourceImportOptions) => Promise<void>;
  pdfTableMode: PDFTableMode;
  validateBatch?: boolean;
}>) {
  const fileArray = normalizeBookCinemaImportFiles(files);
  onError?.(null);

  if (fileArray.length === 0) {
    return;
  }

  if (validateBatch && !isSupportedBookSourceBatch(fileArray)) {
    onError?.(BATCH_IMPORT_ERROR);
    return;
  }

  await onImport(fileArray, { importProfile, pdfTableMode });
}
