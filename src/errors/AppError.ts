// src/errors/AppError.ts

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Set the prototype explicitly (important when using `extends Error`)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
