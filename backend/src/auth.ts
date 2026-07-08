import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '7d'

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL })
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL })
}

export function verifyAccessToken(token: string): { sub: string } {
  const payload = jwt.verify(token, JWT_SECRET) as { sub: string; type: string }
  if (payload.type !== 'access') throw new Error('Wrong token type')
  return payload
}

export function verifyRefreshToken(token: string): { sub: string } {
  const payload = jwt.verify(token, JWT_SECRET) as { sub: string; type: string }
  if (payload.type !== 'refresh') throw new Error('Wrong token type')
  return payload
}
