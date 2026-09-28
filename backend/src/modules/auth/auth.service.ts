import { randomBytes, createHash } from 'node:crypto';
import { CartStatus, RoleCode, UserStatus, type User } from '@prisma/client';
import argon2 from 'argon2';
import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { AppError } from '../../errors/app-error.js';
import type { LoginInput, SignupInput } from './auth.schemas.js';

const SESSION_TOKEN_BYTES = 32;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  emailVerified: boolean;
  roles: RoleCode[];
};

export type SessionResult = {
  token: string;
  expiresAt: Date;
  user: PublicUser;
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const normalizePhone = (phone?: string) => {
  const value = phone?.replace(/[^\d+]/g, '').trim();
  return value || null;
};

export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

const newSessionToken = () => randomBytes(SESSION_TOKEN_BYTES).toString('base64url');

const roleCodesForUser = (user: User & { roles: { role: { code: RoleCode } }[] }) => user.roles.map(({ role }) => role.code);

export const toPublicUser = (user: User & { roles: { role: { code: RoleCode } }[] }): PublicUser => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  status: user.status,
  emailVerified: user.emailVerified,
  roles: roleCodesForUser(user),
});

async function ensureRole(code: RoleCode) {
  return prisma.role.upsert({
    where: { code },
    create: { code, name: code.toLowerCase().replaceAll('_', ' ') },
    update: {},
  });
}

async function createSession(userId: string, userAgent?: string, ipAddress?: string): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * MS_PER_DAY);
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
      expiresAt,
    },
    select: { id: true },
  });

  return { token, expiresAt, sessionId: session.id };
}

export async function signup(input: SignupInput, userAgent?: string, ipAddress?: string): Promise<SessionResult> {
  const emailNormalized = normalizeEmail(input.email);
  const phoneNormalized = normalizePhone(input.phone);
  const passwordHash = await argon2.hash(input.password);

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { emailNormalized },
        ...(phoneNormalized ? [{ phoneNormalized }] : []),
      ],
    },
    select: { id: true },
  });

  if (existingUser) throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email or phone already exists');

  const customerRole = await ensureRole(RoleCode.CUSTOMER);
  const user = await prisma.user.create({
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      emailNormalized,
      phone: phoneNormalized,
      phoneNormalized,
      passwordHash,
      status: UserStatus.ACTIVE,
      roles: { create: { roleId: customerRole.id } },
      wishlist: { create: {} },
      carts: { create: { status: CartStatus.ACTIVE } },
    },
    include: { roles: { include: { role: true } } },
  });

  const session = await createSession(user.id, userAgent, ipAddress);
  return { token: session.token, expiresAt: session.expiresAt, user: toPublicUser(user) };
}

export async function login(input: LoginInput, userAgent?: string, ipAddress?: string): Promise<SessionResult> {
  const user = await prisma.user.findUnique({
    where: { emailNormalized: normalizeEmail(input.email) },
    include: { roles: { include: { role: true } } },
  });

  if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DISABLED) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account cannot sign in. Please contact support.');
  }

  const validPassword = await argon2.verify(user.passwordHash, input.password);
  if (!validPassword) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  const session = await createSession(user.id, userAgent, ipAddress);
  return { token: session.token, expiresAt: session.expiresAt, user: toPublicUser(user) };
}

export async function getSessionUser(token?: string): Promise<{ user: PublicUser; sessionId: string; roles: RoleCode[] } | null> {
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.user.status === UserStatus.SUSPENDED || session.user.status === UserStatus.DISABLED) return null;

  await prisma.authSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  const user = toPublicUser(session.user);
  return { user, sessionId: session.id, roles: user.roles };
}

export async function revokeSession(token?: string): Promise<void> {
  if (!token) return;
  await prisma.authSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
