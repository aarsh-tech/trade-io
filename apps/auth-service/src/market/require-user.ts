import { UnauthorizedException } from '@nestjs/common';

/**
 * Returns the authenticated user's id or throws 401.
 * Use on any route that touches a broker session so an undefined userId can
 * never reach a Prisma `where` and match another user's account.
 */
export function requireUserId(req: any): string {
  const id = req?.user?.id;
  if (!id || typeof id !== 'string') {
    throw new UnauthorizedException('Authentication required');
  }
  return id;
}
