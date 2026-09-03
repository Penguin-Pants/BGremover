export const MODEL_ID = "onnx-community/BiRefNet_lite-ONNX";

export function normalizeColor(raw) {
  if (!raw) return null;
  return /^[0-9a-fA-F]{3,8}$/.test(raw) ? `#${raw}` : raw;
}
