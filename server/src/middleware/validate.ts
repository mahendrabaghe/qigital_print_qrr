import type { ZodSchema } from 'zod';
import { HttpError } from '../utils/errors';

/** Validates and replaces req.body with the parsed value. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: { body: unknown }, _res: unknown, next: (err?: unknown) => void) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      next(new HttpError(400, 'VALIDATION_ERROR', first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid request'));
      return;
    }
    (req as { body: T }).body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: { query: unknown }, _res: unknown, next: (err?: unknown) => void) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const first = result.error.issues[0];
      next(new HttpError(400, 'VALIDATION_ERROR', first ? `${first.path.join('.') || 'query'}: ${first.message}` : 'Invalid query'));
      return;
    }
    (req as { query: T }).query = result.data;
    next();
  };
}
