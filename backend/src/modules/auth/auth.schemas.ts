import { z } from 'zod';

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or fewer')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const signupSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(30).optional().or(z.literal('')),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
