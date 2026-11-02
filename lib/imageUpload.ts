import { File } from "expo-file-system";

const extensionMimeTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const supportedMimeTypes = new Set(Object.values(extensionMimeTypes));

export async function readImageForUpload(
  uri: string,
  maxBytes: number,
  mimeType?: string | null,
  fileName?: string | null,
) {
  let bytes: ArrayBuffer;
  let fileType = "";
  try {
    const file = new File(uri);
    fileType = file.type.split(";")[0].toLowerCase();
    bytes = await file.arrayBuffer();
  } catch (error) {
    console.warn("Could not read selected image file", error);
    throw new Error("The selected image is no longer available. Please choose it again.");
  }

  if (!bytes.byteLength) {
    throw new Error("The selected image is empty. Please choose it again.");
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error("Images must be 5 MB or smaller.");
  }

  const uriName = uri.split(/[?#]/)[0];
  const extension = (fileName || uriName).split(".").pop()?.toLowerCase() || "";
  const typeFromExtension = extensionMimeTypes[extension];
  const candidates = [
    mimeType?.split(";")[0].toLowerCase(),
    fileType,
    typeFromExtension,
  ];
  const contentType = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && supportedMimeTypes.has(candidate),
  );
  if (!contentType) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }

  return { bytes, contentType };
}
