export function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing demo element: ${id}`);
  return value;
}
export function input(id: string): HTMLInputElement {
  const value = element(id);
  if (!(value instanceof HTMLInputElement)) throw new Error(`Expected input: ${id}`);
  return value;
}
export function button(id: string): HTMLButtonElement {
  const value = element(id);
  if (!(value instanceof HTMLButtonElement)) throw new Error(`Expected button: ${id}`);
  return value;
}
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
