export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "HttpError"
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request", code?: string) {
    super(400, message, code)
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED")
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN")
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message, "NOT_FOUND")
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict", code?: string) {
    super(409, message, code)
  }
}
