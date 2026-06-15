import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import type { UserRole } from '../modules/users/users.repo';

export interface TokenPayload {
  /** user id */
  sub: string;
  /** tenant id */
  tid: string;
  role: UserRole;
}

export function signToken(payload: TokenPayload): string {
  const options: SignOptions = { expiresIn: config.auth.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, config.auth.jwtSecret, options);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.auth.jwtSecret) as TokenPayload;
}
