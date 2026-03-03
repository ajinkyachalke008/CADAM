import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useManageSubscription,
  useSubscriptionService,
} from '@/services/subscriptionService';
import { usePricingTest, PricingVariant } from '@/hooks/usePricingTest';

interface PricingTier {
  name: string;
  oldPrice?: string;
  price: string;
  features: string[];
  buttonText: string;
  popular?: boolean;
  lookupKey: string;
}

const createPricingTiers = (
  variant: PricingVariant,
): { yearly: PricingTier[]; monthly: PricingTier[] } => {
  const yearlyPricingTiers: PricingTier[] = [];
  const monthlyPricingTiers: PricingTier[] = [];

  // Always add Free plan first
  const freePlan = {
    name: 'Free Tier',
    price: '0',
    features: [
      '3 creative runs per day',
      'Infinite parametric runs',
      'Community support',
    ],
    buttonText: 'Current Plan',
    lookupKey: 'free',
  };

  monthlyPricingTiers.push(freePlan);
  yearlyPricingTiers.push(freePlan);

  // Determine Pro lookup keys based on variant
  const proMonthlyLookupKey =
    variant.id === 'variant_b' || variant.id === 'variant_c'
      ? 'pro_monthly_variant'
      : 'pro_monthly';
  const proYearlyLookupKey =
    variant.id === 'variant_b' || variant.id === 'variant_c'
      ? 'pro_yearly_variant'
      : 'pro_yearly';

  // Add Pro plan in the middle position
  const proYearly = {
    name: 'Adam Pro',
    oldPrice: variant.proPrice.yearlyOriginal,
    price: variant.proPrice.yearly,
    features: variant.proFeatures,
    buttonText: 'Get Pro',
    popular: true,
    lookupKey: proYearlyLookupKey,
  };

  const proMonthly = {
    name: 'Adam Pro',
    price: variant.proPrice.monthly,
    features: variant.proFeatures,
    buttonText: 'Get Pro',
    popular: true,
    lookupKey: proMonthlyLookupKey,
  };

  monthlyPricingTiers.push(proMonthly);
  yearlyPricingTiers.push(proYearly);

  // Add Standard plan last (if variant has it)
  if (variant.hasStandard && variant.standardPrice) {
    yearlyPricingTiers.push({
      name: 'Adam Standard',
      oldPrice: variant.standardPrice.yearlyOriginal,
      price: variant.standardPrice.yearly,
      features: [
        '100 3D generations per month',
        'Conversational edits',
        'Unlimited Parametric Generations',
      ],
      buttonText: 'Get Standard',
      lookupKey: 'standard_yearly',
    });

    monthlyPricingTiers.push({
      name: 'Adam Standard',
      price: variant.standardPrice.monthly,
      features: [
        '100 3D generations per month',
        'Conversational edits',
        'Unlimited Parametric Generations',
      ],
      buttonText: 'Get Standard',
      lookupKey: 'standard_monthly',
    });
  }

  return { yearly: yearlyPricingTiers, monthly: monthlyPricingTiers };
};

export function Subscriptions() {
  const navigate = useNavigate();
  const { user, subscription } = useAuth();
  const {
    variant,
    isLoading: isPricingLoading,
    trackPricingEvent,
  } = usePricingTest();

  const { mutate: handleSubscribeMutation, isPending: isSubscribeLoading } =
    useSubscriptionService();
  const { mutate: handleManageSubscription, isPending: isManageLoading } =
    useManageSubscription();

  // Memoize pricing tiers before early returns to avoid conditional hook calls
  const { yearly: yearlyPricingTiers, monthly: monthlyPricingTiers } = useMemo(
    () => createPricingTiers(variant),
    [variant],
  );

  const handleSubscribe = (lookupKey: string) => {
    if (!user) {
      navigate('/signin');
      return;
    }

    // Track subscription attempt
    trackPricingEvent('subscription_attempted', {
      lookup_key: lookupKey,
      source: 'subscriptions',
    });

    handleSubscribeMutation({ lookupKey, source: 'subscriptions' });
  };

  if (isPricingLoading) {
    return (
      <div className="min-h-screen w-full bg-adam-bg-secondary-dark pt-24">
        <div className="flex w-full flex-col items-center justify-start pt-8">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-adam-bg-secondary-dark">
      <div className="flex min-h-screen w-full flex-col items-center justify-center">
        <div className="w-full max-w-4xl">
          {/* Main content */}
          <div className="mb-4 px-8 text-center md:mb-6">
            <h1 className="mb-3 font-kumbh-sans text-3xl font-light text-white">
              Choose a plan that works for you
            </h1>
          </div>

          {/* Monthly/Yearly Toggle */}
          <Tabs
            defaultValue="monthly"
            className="mb-4 flex w-full flex-col items-center md:mb-6"
          >
            <TabsList className="border border-adam-neutral-700 bg-adam-neutral-900 text-sm sm:text-base">
              <TabsTrigger
                value="monthly"
                className="data-[state=active]:bg-adam-neutral-100 data-[state=active]:text-adam-neutral-900"
              >
                Monthly
              </TabsTrigger>
              <TabsTrigger
                value="yearly"
                className="data-[state=active]:bg-adam-neutral-100 data-[state=active]:text-adam-neutral-900"
              >
                Annual
              </TabsTrigger>
            </TabsList>
            <TabsContent value="yearly" className="w-full">
              <div className="mb-4 flex flex-col items-center md:mb-6">
                <p className="text-center text-sm text-adam-neutral-200 sm:text-base">
                  <span className="text-adam-blue">Save 40%</span> on an annual
                  subscription
                </p>
              </div>
              <div className="relative mb-4 overflow-visible md:mb-6">
                <div className="hide-scrollbar flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-8 pb-4 md:justify-center md:overflow-visible">
                  {yearlyPricingTiers.map((tier) => {
                    return (
                      <div
                        key={tier.name}
                        className={cn(
                          'my-2 flex-shrink-0 snap-center',
                          // Mobile width - make Pro card much wider for single-line bullets
                          tier.name === 'Adam Pro' ? 'w-96' : 'w-72',
                          // Desktop width - adjust based on number of plans
                          yearlyPricingTiers.length === 2
                            ? 'md:w-[calc(45%-10px)]'
                            : 'md:w-[calc(38%-10px)]',
                        )}
                      >
                        <SubscriptionCard
                          tier={tier}
                          isLoading={isSubscribeLoading || isManageLoading}
                          onClick={
                            subscription === 'free'
                              ? () => handleSubscribe(tier.lookupKey)
                              : handleManageSubscription
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="monthly" className="w-full">
              <div className="mb-4 flex flex-col items-center md:mb-6">
                <p className="text-center text-sm text-adam-neutral-200 sm:text-base">
                  <span className="text-adam-blue">Save 40%</span> on an annual
                  subscription
                </p>
              </div>
              <div className="relative mb-4 overflow-visible md:mb-6">
                <div className="hide-scrollbar flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-8 pb-4 md:justify-center md:overflow-visible">
                  {monthlyPricingTiers.map((tier) => {
                    return (
                      <div
                        key={tier.name}
                        className={cn(
                          'my-2 flex-shrink-0 snap-center',
                          // Mobile width - make Pro card much wider for single-line bullets
                          tier.name === 'Adam Pro' ? 'w-96' : 'w-72',
                          // Desktop width - adjust based on number of plans
                          monthlyPricingTiers.length === 2
                            ? 'md:w-[calc(45%-10px)]'
                            : 'md:w-[calc(38%-10px)]',
                        )}
                      >
                        <SubscriptionCard
                          tier={tier}
                          isLoading={isSubscribeLoading || isManageLoading}
                          onClick={
                            subscription === 'free'
                              ? () => handleSubscribe(tier.lookupKey)
                              : handleManageSubscription
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function SubscriptionCard({
  tier,
  isLoading,
  onClick,
}: {
  tier: PricingTier;
  isLoading: boolean;
  onClick: () => void;
}) {
  const { subscription } = useAuth();

  return (
    <Card
      className={cn(
        'relative border-none bg-adam-neutral-950 transition-all duration-200 md:px-4',
        tier.name === 'Adam Pro' ? 'max-w-[420px]' : 'max-w-[300px]',
        tier.popular &&
          'bg-[#00A6FF14] shadow-[0px_0px_32px_0px_#00A6FF3d] ring-2 ring-[#00A6FF]',
      )}
    >
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-normal text-adam-neutral-10">
          {tier.name}
        </CardTitle>
        <div className="text-2xl font-normal text-adam-neutral-10">
          {tier.oldPrice && (
            <span className="mr-2 text-base text-adam-neutral-200 line-through">
              <span className="text-adam-neutral-200">$</span>
              {tier.oldPrice}
            </span>
          )}
          <span className="text-base text-adam-neutral-10">$</span>
          {tier.price}
          <span className="text-xs font-normal text-adam-neutral-300">/mo</span>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Subscription Button */}
        <div className="mb-4">
          {tier.name === 'Free Tier' ? (
            <Button
              className={cn(
                'h-10 w-full cursor-default rounded-full bg-adam-neutral-700 text-sm font-medium text-adam-neutral-200 transition-all',
                subscription !== 'free' &&
                  'cursor-pointer bg-adam-neutral-10 text-sm font-medium text-adam-neutral-800 transition-all hover:bg-adam-neutral-100 hover:text-adam-neutral-900',
              )}
              disabled={subscription === 'free'}
              onClick={() => onClick()}
            >
              {subscription === 'free' ? 'Current Plan' : 'Manage Plan'}
            </Button>
          ) : (
            <Button
              className="h-10 w-full rounded-full bg-adam-neutral-10 text-sm font-medium text-adam-neutral-800 transition-all hover:bg-adam-neutral-100 hover:text-adam-neutral-900"
              onClick={() => onClick()}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : subscription !== 'free' ? (
                'Manage Plan'
              ) : (
                tier.buttonText
              )}
            </Button>
          )}
        </div>

        <ul>
          {tier.features.map((feature) => (
            <li
              key={feature}
              className="flex items-center text-adam-neutral-100"
            >
              <Check className="mr-2 h-4 w-4 flex-shrink-0 text-adam-neutral-100" />
              <span className="whitespace-nowrap text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
