import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import posthog from 'posthog-js';
import * as Sentry from '@sentry/react';

export const useSubscriptionService = () => {
  const { toast } = useToast();

  const subscriptionMutation = useMutation({
    mutationFn: async ({
      lookupKey,
      trial,
      source,
    }: {
      lookupKey: string;
      trial?: boolean;
      source: string;
    }) => {
      posthog.capture('subscribe_clicked', {
        source: source,
        selected_plan: lookupKey,
      });
      const { data, error } = await supabase.functions.invoke(
        'stripe-create-checkout-session',
        {
          body: {
            lookupKey,
            ...(trial && { trial }),
          },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error, variables) => {
      Sentry.captureException(error, {
        extra: {
          variables,
        },
      });
      toast({
        title: 'Error',
        description: 'Failed to start checkout process. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return subscriptionMutation;
};

export const useManageSubscription = () => {
  const { toast } = useToast();

  const manageSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        'stripe-create-portal-session',
      );

      if (error) throw error;
      if (!data?.url) throw new Error('No portal URL returned');

      return data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error, variables) => {
      Sentry.captureException(error, {
        extra: {
          variables,
        },
      });
      toast({
        title: 'Error',
        description:
          'Failed to open subscription management. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return manageSubscriptionMutation;
};
