/** POST JSON and return the parsed body, or throw an Error with the API's friendly message. */
export async function postJSON<T>(url: string, body: unknown, fallback = "Something went wrong. Please try again."): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(typeof data?.error === "string" ? data.error : fallback);
  return data as T;
}

export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again.") {
  return e instanceof Error && e.message ? e.message : fallback;
}
