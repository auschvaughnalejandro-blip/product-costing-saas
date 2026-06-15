/**
 * Engine errors. The engine NEVER returns a wrong number — when the inputs are
 * bad it throws one of these with a clear, plain-language message. The API turns
 * these into 400 responses; the UI and AI assistant can show the message as-is.
 */
export type EngineErrorCode =
  | 'INVALID_INPUT'
  | 'MISSING_RATES'
  | 'MISSING_MATERIAL_RATE'
  | 'MISSING_LABOUR_RATE'
  | 'MISSING_MACHINE_RATE'
  | 'INVALID_QUANTITY'
  | 'INVALID_VALUE'
  | 'INVALID_OVERHEAD'
  | 'CIRCULAR_REFERENCE'
  | 'DUPLICATE_PART_ID'
  | 'UNKNOWN_OPERATION_PART';

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export function isEngineError(err: unknown): err is EngineError {
  return err instanceof EngineError;
}
