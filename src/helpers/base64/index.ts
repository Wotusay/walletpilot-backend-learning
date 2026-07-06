export type base64 = string & { readonly __brand: "Base64String" };

export function isBase64(value: string): value is base64 {
  if (value.length === 0) return false;
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return value.length % 4 === 0 && base64Regex.test(value);
}

export function toBase64String(value: string): base64 {
  if (!isBase64(value)) {
    throw new Error(`Invalid base64 string: ${value}`);
  }
  return value as base64;
}
