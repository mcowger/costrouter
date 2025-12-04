/**
 * Returns a human-readable error message from an unknown error value.
 *
 * - If the error is an instance of `Error`, returns its message.
 * - If the error is a string, returns the string itself.
 * - Otherwise, returns a generic unexpected error message.
 *
 * @param error - The error value to extract a message from.
 * @returns A string describing the error.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred.";
}

export function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} day(s)`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour(s)`;
  if (seconds % 60 === 0) return `${seconds / 60} minute(s)`;
  return `${seconds} second(s)`;
}
