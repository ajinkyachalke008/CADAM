import '@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'stripe';
import { getServiceRoleSupabaseClient } from '../_shared/supabaseClient.ts';
import { initSentry, logError, logApiError } from '../_shared/sentry.ts';

// Initialize Sentry for error logging
initSentry();

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseClient = getServiceRoleSupabaseClient();

Deno.serve(async (request) => {
  const signature = request.headers.get('Stripe-Signature');

  const body = await request.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    logApiError(err, {
      functionName: 'stripe-webhook',
      apiName: 'Stripe webhook construct',
      statusCode: 400,
      requestData: { hasSignature: !!signature },
    });
    return new Response((err as Error).message, { status: 400 });
  }

  const requestOptions =
    event.request && event.request.idempotency_key
      ? { idempotencyKey: event.request.idempotency_key }
      : {};

  let retrievedEvent;
  try {
    retrievedEvent = await stripe.events.retrieve(event.id, requestOptions);
  } catch (err) {
    logApiError(err, {
      functionName: 'stripe-webhook',
      apiName: 'Stripe event retrieve',
      statusCode: 400,
      requestData: { eventId: event.id, requestOptions },
    });
    return new Response((err as Error).message, { status: 400 });
  }

  switch (retrievedEvent.type) {
    case 'customer.subscription.updated':
      return await handleCustomerSubscriptionUpdated(retrievedEvent);
    case 'customer.subscription.deleted':
      return await handleCustomerSubscriptionDeleted(retrievedEvent);
    case 'checkout.session.completed':
      return await handleCheckoutSessionCompleted(retrievedEvent.data.object);
    case 'invoice.paid':
      return await handleInvoicePaid(retrievedEvent);
    default:
      break;
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

async function handleCustomerSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionUpdatedEvent,
) {
  const subscription = event.data.object;

  const price = await stripe.prices.retrieve(
    subscription.items.data[0].price.id,
  );

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Don't change this unless you update the lookup keys in Stripe
  const level =
    price.lookup_key === 'pro_yearly' || price.lookup_key === 'pro_monthly'
      ? 'pro'
      : 'standard';

  // Update the subscription status
  const { data: subscriptionData, error: subscriptionError } =
    await supabaseClient
      .from('subscriptions')
      .update({
        status: subscription.status,
        stripe_customer_id: customerId,
        level,
      })
      .eq('stripe_subscription_id', subscription.id)
      .select()
      .maybeSingle();

  if (subscriptionError) {
    logError(subscriptionError, {
      functionName: 'stripe-webhook',
      statusCode: 500,
      additionalContext: {
        operation: 'update_subscription',
        subscriptionId: subscription.id,
        customerId,
        level,
        handler: 'handleCustomerSubscriptionUpdated',
      },
    });
    return new Response(JSON.stringify({ error: subscriptionError.message }), {
      status: 500,
    });
  }

  if (!subscriptionData) {
    logError(new Error('No subscription data found for update'), {
      functionName: 'stripe-webhook',
      statusCode: 200,
      additionalContext: {
        operation: 'update_subscription',
        subscriptionId: subscription.id,
        customerId,
        level,
        handler: 'handleCustomerSubscriptionUpdated',
      },
    });
    return new Response(JSON.stringify({ error: 'No subscription data' }), {
      // We don't need this getting resent if it doesn't exist
      // We do new subscriptions in the table with the checkout.session.completed webhook
      status: 200,
    });
  }

  // Grant subscription tokens based on level
  const tokenAmount = level === 'pro' ? 10000 : 2000;
  const expiresAt = new Date(
    subscription.current_period_end * 1000,
  ).toISOString();

  await supabaseClient.rpc('grant_subscription_tokens', {
    p_user_id: subscriptionData.user_id,
    p_token_amount: tokenAmount,
    p_expires_at: expiresAt,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

async function handleCustomerSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
) {
  const subscription = event.data.object;

  const { data: subscriptionData, error: subscriptionError } =
    await supabaseClient
      .from('subscriptions')
      .delete()
      .eq('stripe_subscription_id', subscription.id)
      .select()
      .maybeSingle();

  if (subscriptionError) {
    logError(subscriptionError, {
      functionName: 'stripe-webhook',
      statusCode: 500,
      additionalContext: {
        operation: 'delete_subscription',
        subscriptionId: subscription.id,
        handler: 'handleCustomerSubscriptionDeleted',
      },
    });
    return new Response(JSON.stringify({ error: subscriptionError.message }), {
      status: 500,
    });
  }

  if (!subscriptionData) {
    logError(new Error('No subscription data found for deletion'), {
      functionName: 'stripe-webhook',
      statusCode: 200,
      additionalContext: {
        operation: 'delete_subscription',
        subscriptionId: subscription.id,
        handler: 'handleCustomerSubscriptionDeleted',
      },
    });
    return new Response(JSON.stringify({ error: 'No subscription data' }), {
      // We don't need this getting resent if it doesn't exist
      status: 200,
    });
  }

  // Reset to free tier tokens (50 tokens, 1-day expiry)
  const freeTierExpiry = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  ).toISOString();

  await supabaseClient.rpc('grant_subscription_tokens', {
    p_user_id: subscriptionData.user_id,
    p_token_amount: 50,
    p_expires_at: freeTierExpiry,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  // Handle token pack one-time purchases
  if (session.mode === 'payment') {
    return await handleTokenPackPurchase(session);
  }

  const customer = session.customer;

  const client_reference_id = session.client_reference_id ?? '';
  const { data: userData, error: userError } =
    await supabaseClient.auth.admin.getUserById(client_reference_id);

  if (userError) {
    logError(userError, {
      functionName: 'stripe-webhook',
      statusCode: 500,
      additionalContext: {
        operation: 'get_user_by_id',
        clientReferenceId: client_reference_id,
        handler: 'handleCheckoutSessionCompleted',
      },
    });
    return new Response(JSON.stringify({ error: userError.message }), {
      status: 500,
    });
  }

  const { data: profileData, error: profileError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('user_id', userData.user.id)
    .limit(1)
    .single();

  if (profileError) {
    logError(profileError, {
      functionName: 'stripe-webhook',
      statusCode: 500,
      userId: userData.user?.id,
      additionalContext: { operation: 'fetch_profile' },
    });
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500,
    });
  }

  if (!profileData) {
    logError(new Error('No profile data found for user'), {
      functionName: 'stripe-webhook',
      statusCode: 500,
      userId: userData.user?.id,
      additionalContext: { operation: 'fetch_profile' },
    });
    return new Response(JSON.stringify({ error: 'No profile data' }), {
      status: 500,
    });
  }

  const customerId = typeof customer === 'string' ? customer : customer?.id;

  if (!customerId) {
    logError(new Error('No customer ID provided in session'), {
      functionName: 'stripe-webhook',
      statusCode: 404,
      additionalContext: {
        operation: 'extract_customer_id',
        sessionId: session.id,
        handler: 'handleCheckoutSessionCompleted',
      },
    });
    return new Response(JSON.stringify({ error: 'No customer given' }), {
      status: 404,
    });
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    logError(new Error('No subscription ID provided in session'), {
      functionName: 'stripe-webhook',
      statusCode: 404,
      additionalContext: {
        operation: 'extract_subscription_id',
        sessionId: session.id,
        customerId,
        handler: 'handleCheckoutSessionCompleted',
      },
    });
    return new Response(JSON.stringify({ error: 'No subscription ID' }), {
      status: 404,
    });
  }

  // This will tell us if they are trialing right away instead of having to wait for the subscription to be updated
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const level = session.metadata?.level ?? 'standard';

  const { error: subscriptionError } = await supabaseClient
    .from('subscriptions')
    .insert({
      status: subscription.status,
      stripe_customer_id: customerId,
      user_id: userData.user.id,
      stripe_subscription_id: subscriptionId,
      level: level as 'pro' | 'standard',
    })
    .select();

  if (subscriptionError) {
    logError(subscriptionError, {
      functionName: 'stripe-webhook',
      statusCode: 500,
      additionalContext: {
        operation: 'insert_subscription',
        subscriptionId,
        customerId,
        userId: userData.user.id,
        level,
        handler: 'handleCheckoutSessionCompleted',
      },
    });
    return new Response(JSON.stringify({ error: subscriptionError.message }), {
      status: 500,
    });
  }

  // So that they can't start a trial again
  await supabaseClient.from('trial_users').upsert(
    {
      user_id: userData.user.id,
    },
    {
      onConflict: 'user_id',
      ignoreDuplicates: true,
    },
  );

  // Grant subscription tokens
  const tokenAmount = level === 'pro' ? 10000 : 2000;
  const expiresAt = new Date(
    subscription.current_period_end * 1000,
  ).toISOString();

  await supabaseClient.rpc('grant_subscription_tokens', {
    p_user_id: userData.user.id,
    p_token_amount: tokenAmount,
    p_expires_at: expiresAt,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

async function handleTokenPackPurchase(session: Stripe.Checkout.Session) {
  const client_reference_id = session.client_reference_id ?? '';

  const { data: userData, error: userError } =
    await supabaseClient.auth.admin.getUserById(client_reference_id);

  if (userError || !userData.user) {
    logError(userError || new Error('User not found'), {
      functionName: 'stripe-webhook',
      statusCode: 500,
      additionalContext: {
        operation: 'token_pack_get_user',
        clientReferenceId: client_reference_id,
        handler: 'handleTokenPackPurchase',
      },
    });
    return new Response(
      JSON.stringify({ error: userError?.message || 'User not found' }),
      { status: 500 },
    );
  }

  // Get line items to find the price, then resolve its lookup key
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
  const priceId = lineItems.data[0]?.price?.id;

  if (!priceId) {
    logError(new Error('No price ID in token pack checkout'), {
      functionName: 'stripe-webhook',
      statusCode: 400,
      additionalContext: {
        sessionId: session.id,
        handler: 'handleTokenPackPurchase',
      },
    });
    return new Response(JSON.stringify({ error: 'No price ID found' }), {
      status: 400,
    });
  }

  const priceObj = await stripe.prices.retrieve(priceId);
  const lookupKey = priceObj.lookup_key;

  if (!lookupKey) {
    logError(new Error('No lookup key on token pack price'), {
      functionName: 'stripe-webhook',
      statusCode: 400,
      additionalContext: {
        priceId,
        handler: 'handleTokenPackPurchase',
      },
    });
    return new Response(JSON.stringify({ error: 'No lookup key found' }), {
      status: 400,
    });
  }

  // Look up token amount from our products table by lookup key
  const { data: packData, error: packError } = await supabaseClient
    .from('token_pack_products')
    .select('token_amount')
    .eq('stripe_lookup_key', lookupKey)
    .single();

  if (packError || !packData) {
    logError(packError || new Error('Token pack product not found'), {
      functionName: 'stripe-webhook',
      statusCode: 400,
      additionalContext: {
        priceId,
        handler: 'handleTokenPackPurchase',
      },
    });
    return new Response(
      JSON.stringify({ error: 'Token pack product not found' }),
      { status: 400 },
    );
  }

  // Credit purchased tokens
  await supabaseClient.rpc('credit_purchased_tokens', {
    p_user_id: userData.user.id,
    p_amount: packData.token_amount,
    p_reference_id: session.id,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

async function handleInvoicePaid(event: Stripe.InvoicePaidEvent) {
  const invoice = event.data.object;

  // Only handle subscription invoices (not one-time)
  if (!invoice.subscription) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id;

  // Get the subscription to find the user and period end
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Find the user from our subscriptions table
  const { data: subData, error: subError } = await supabaseClient
    .from('subscriptions')
    .select('user_id, level')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (subError || !subData) {
    // May not exist yet (first invoice), checkout.session.completed handles that
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // Grant tokens for the new billing period
  const tokenAmount = subData.level === 'pro' ? 10000 : 2000;
  const expiresAt = new Date(
    subscription.current_period_end * 1000,
  ).toISOString();

  await supabaseClient.rpc('grant_subscription_tokens', {
    p_user_id: subData.user_id,
    p_token_amount: tokenAmount,
    p_expires_at: expiresAt,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
