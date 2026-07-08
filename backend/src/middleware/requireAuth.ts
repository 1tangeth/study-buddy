import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from '../auth'

export interface AuthRequest extends Request {
  userId: string
}
/**
 * Protect routes so that only logged-in user can access them
 * @param req incoming request
 * @param res response object
 * @param next function that says continue to the next route handler
 * @returns 
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization // authorization head example: Bearer eyjfew...
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing or invalid Authorization header' })
  }

  const token = header.slice(7)
  try {
    const { sub } = verifyAccessToken(token)
    ;(req as AuthRequest).userId = sub // This saves the user ID onto the request object. The semicolon before it is just a safety semicolon because the line starts with (.This means later route handlers can do something like:
    next() // authentication passed continue to the real route
  } catch {
    return res.status(401).json({ detail: 'Token expired or invalid' }) // user not authenticated
  }
}
