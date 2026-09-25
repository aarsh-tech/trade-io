import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

/** Extracts and verifies the JWT from a socket handshake; returns the user id or null. */
export function authenticateSocket(client: Socket, jwtService: JwtService): string | null {
  let raw: any =
    client.handshake.auth?.token ||
    client.handshake.query?.token ||
    client.handshake.headers?.authorization;
  if (typeof raw !== 'string' || !raw) return null;
  if (raw.startsWith('Bearer ')) raw = raw.slice(7).trim();
  try {
    const payload = jwtService.verify(raw);
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}
