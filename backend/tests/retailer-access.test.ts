import { describe, expect, it } from 'vitest';

describe('retailer ERP access gate', () => {
  it('allows active subscriptions without an expiry date', async () => {
    process.env.DATABASE_URL ||= 'postgresql://nilopasal:nilopasal_dev@127.0.0.1:5432/nilopasal?schema=public';
    const { isSubscriptionUsable } = await import('../src/modules/retailer/retailer.service.js');
    expect(isSubscriptionUsable('ACTIVE', null, null)).toBe(true);
  });

  it('rejects expired subscriptions', async () => {
    process.env.DATABASE_URL ||= 'postgresql://nilopasal:nilopasal_dev@127.0.0.1:5432/nilopasal?schema=public';
    const { isSubscriptionUsable } = await import('../src/modules/retailer/retailer.service.js');
    expect(isSubscriptionUsable('ACTIVE', new Date(Date.now() - 1000), null)).toBe(false);
  });

  it('allows non-expired trials and rejects cancelled subscriptions', async () => {
    process.env.DATABASE_URL ||= 'postgresql://nilopasal:nilopasal_dev@127.0.0.1:5432/nilopasal?schema=public';
    const { isSubscriptionUsable } = await import('../src/modules/retailer/retailer.service.js');
    expect(isSubscriptionUsable('TRIAL', null, new Date(Date.now() + 1000 * 60))).toBe(true);
    expect(isSubscriptionUsable('CANCELLED', null, null)).toBe(false);
  });
});
