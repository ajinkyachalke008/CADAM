import { User } from '@supabase/supabase-js';

export function isNewUser(user: User | null): boolean {
  if (!user) return false;

  // Consider a user "new" if they were created in the last 24 hours
  const userCreatedAt = new Date(user.created_at);
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return userCreatedAt > twentyFourHoursAgo;
}

export function shouldShowPricingTest(user: User | null): boolean {
  if (!user) return false;

  return isNewUser(user);
}
