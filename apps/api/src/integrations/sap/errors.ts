/**
 * SAP-specific errors. These are deliberately separate from HTTP concerns — the
 * route layer translates them into clean responses — so the connector can be
 * used (and tested) without any web framework. They always carry a plain-language
 * message, never a raw stack trace, so the app can degrade gracefully when SAP is
 * not configured or cannot be reached.
 */
export class SapError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SapError';
  }
}

/** SAP connection details are not configured (blank env). The app still runs on Excel. */
export class SapNotConfiguredError extends SapError {
  constructor(
    message = 'SAP is not configured. Set SAP_BASE_URL, SAP_USERNAME and SAP_PASSWORD to enable it. The app continues to work with Excel.',
  ) {
    super('sap_not_configured', message);
    this.name = 'SapNotConfiguredError';
  }
}

/** SAP is configured but could not be reached or returned an error. */
export class SapUnavailableError extends SapError {
  constructor(message: string) {
    super('sap_unavailable', message);
    this.name = 'SapUnavailableError';
  }
}

export function isSapError(err: unknown): err is SapError {
  return err instanceof SapError;
}
