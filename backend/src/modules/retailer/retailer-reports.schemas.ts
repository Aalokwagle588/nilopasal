import { z } from 'zod';

export const reportPeriodEnum = z.enum([
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'last_month',
  'custom',
]);

export const reportDateRangeQuerySchema = z.object({
  period: reportPeriodEnum.default('this_month'),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const productPerformanceQuerySchema = reportDateRangeQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['revenue', 'units', 'profit']).default('revenue'),
});

export type ReportPeriod = z.infer<typeof reportPeriodEnum>;
export type ReportDateRangeQuery = z.infer<typeof reportDateRangeQuerySchema>;
export type ProductPerformanceQuery = z.infer<typeof productPerformanceQuerySchema>;
