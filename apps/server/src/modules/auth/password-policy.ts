import { checkPassword } from '../../lib/password.js';
import { HttpError } from '../../lib/http-error.js';

export function assertPasswordAcceptable(password: string, email: string, field = 'password') {
  const problem = checkPassword(password, email);
  if (problem)
    throw new HttpError(400, 'VALIDATION_FAILED', `Invalid fields: ${field} (${problem})`);
}
