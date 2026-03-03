import { useEffect, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { useAuth } from '@/contexts/AuthContext';
import { shouldShowPricingTest } from '@/utils/userUtils';

export interface PricingVariant {
  id: 'control' | 'variant_b' | 'variant_c';
  name: string;
  description: string;
  hasStandard: boolean;
  standardPrice?: {
    monthly: string;
    yearly: string;
    yearlyOriginal?: string;
  };
  proPrice: {
    monthly: string;
    yearly: string;
    yearlyOriginal?: string;
  };
  proFeatures: string[];
}

const PRICING_VARIANTS: Record<string, PricingVariant> = {
  control: {
    id: 'control',
    name: 'Original Pricing',
    description: 'Free, Standard, and Pro plans',
    hasStandard: true,
    standardPrice: {
      monthly: '9.99',
      yearly: '5.99',
      yearlyOriginal: '9.99',
    },
    proPrice: {
      monthly: '29.99',
      yearly: '17.99',
      yearlyOriginal: '29.99',
    },
    proFeatures: [
      'Unlimited generations',
      'Phone number of founders',
      'Exclusive access to new features',
      'Good vibes',
    ],
  },
  variant_b: {
    id: 'variant_b',
    name: 'Free + Pro Only',
    description: 'Simplified pricing with just Free and Pro',
    hasStandard: false,
    proPrice: {
      monthly: '20.00',
      yearly: '12.00',
      yearlyOriginal: '20.00',
    },
    proFeatures: [
      'Unlimited generations',
      'Phone number of founders',
      'Exclusive access to new features',
      'Good vibes',
    ],
  },
  variant_c: {
    id: 'variant_c',
    name: 'Three Tier Balanced',
    description: 'Free, Standard $10, Pro $20',
    hasStandard: true,
    standardPrice: {
      monthly: '10.00',
      yearly: '6.00',
      yearlyOriginal: '10.00',
    },
    proPrice: {
      monthly: '20.00',
      yearly: '12.00',
      yearlyOriginal: '20.00',
    },
    proFeatures: [
      'Unlimited generations',
      'Phone number of founders',
      'Exclusive access to new features',
      'Good vibes',
    ],
  },
};

export function usePricingTest() {
  const posthog = usePostHog();
  const { user } = useAuth();
  const [variant, setVariant] = useState<PricingVariant>(
    PRICING_VARIANTS.control,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!posthog || !user) {
      setIsLoading(false);
      return;
    }

    // Create a stable key for this user's pricing test session
    const sessionKey = `pricing_test_${user.id}`;

    // Check if we already have a cached variant for this user
    const cachedVariant = sessionStorage.getItem(sessionKey);

    let selectedVariant: PricingVariant;

    if (cachedVariant) {
      // Use cached variant to ensure consistency
      selectedVariant =
        PRICING_VARIANTS[cachedVariant] || PRICING_VARIANTS.control;
    } else {
      // First time seeing this user - determine if they should see test
      const shouldShowTest = shouldShowPricingTest(user);

      if (shouldShowTest) {
        // Get feature flag value for new users
        const flagValue = posthog.getFeatureFlag('pricing-test-abc');

        // Map flag value to variant
        switch (flagValue) {
          case 'variant_b':
            selectedVariant = PRICING_VARIANTS.variant_b;
            break;
          case 'variant_c':
            selectedVariant = PRICING_VARIANTS.variant_c;
            break;
          default:
            selectedVariant = PRICING_VARIANTS.control;
            break;
        }

        // Cache the variant for this session
        sessionStorage.setItem(sessionKey, selectedVariant.id);
      } else {
        // Existing users always see control (original pricing)
        selectedVariant = PRICING_VARIANTS.control;
        sessionStorage.setItem(sessionKey, 'control');
      }

      // Track which variant was shown (only on first determination)
      posthog.capture('pricing_variant_shown', {
        variant: selectedVariant.id,
        variant_name: selectedVariant.name,
        is_new_user: shouldShowPricingTest(user),
        user_eligible_for_test: shouldShowPricingTest(user),
      });
    }

    setVariant(selectedVariant);
    setIsLoading(false);
  }, [posthog, user]);

  const trackPricingEvent = (
    eventName: string,
    additionalProps?: Record<string, unknown>,
  ) => {
    if (!posthog) return;

    const isEligibleForTest = shouldShowPricingTest(user);

    posthog.capture(eventName, {
      pricing_variant: variant.id,
      pricing_variant_name: variant.name,
      is_new_user: isEligibleForTest,
      user_eligible_for_test: isEligibleForTest,
      ...additionalProps,
    });
  };

  return {
    variant,
    isLoading,
    trackPricingEvent,
  };
}
