// src/errors/AppError.ts

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Set the prototype explicitly (important when using `extends Error`)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
