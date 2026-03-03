CREATE OR REPLACE FUNCTION "public"."user_extradata"("user_id_input" "uuid") RETURNS "public"."user_data"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  hasTrialed boolean;
  userlevel public.subscriptions.level%TYPE;
  userstatus public.subscriptions.status%TYPE;
  daily_generations_used integer;
  monthly_generations_used integer;
  ret user_data;
BEGIN
  -- Get trial status
  SELECT (
    (SELECT count(*) FROM public.trial_users WHERE user_id = user_id_input) > 0
  ) INTO hasTrialed;

  -- Get subscription info
  SELECT STATUS, LEVEL INTO userstatus, userlevel
  FROM public.subscriptions
  WHERE user_id = user_id_input;

  -- Get daily generation count (for free tier)
  SELECT COUNT(*) INTO daily_generations_used
  FROM public.prompts
  WHERE user_id = user_id_input
  AND type != 'image'
  AND type != 'chat'  -- Exclude parametric generations
  AND created_at >= NOW() - INTERVAL '1 day';
  
  -- Get monthly generation count (for standard tier)
  SELECT COUNT(*) INTO monthly_generations_used
  FROM public.prompts
  WHERE user_id = user_id_input
  AND type != 'image'
  AND type != 'chat'  -- Exclude parametric generations
  AND created_at >= date_trunc('month', NOW());

  -- Set return values
  ret."hasTrialed" = hasTrialed;

  -- Set subscription level
  IF (userstatus = 'active') THEN 
    ret."sublevel" = userlevel;
  ELSIF (userstatus = 'trialing') THEN
    ret."sublevel" = 'pro';
  ELSE 
    ret."sublevel" = 'free';
  END IF;

  -- Calculate remaining generations based on subscription level
  IF ret."sublevel" = 'free' THEN
    -- Free tier: 3 generations per day
    ret."generationsRemaining" = GREATEST(3 - daily_generations_used, 0);
  ELSIF ret."sublevel" = 'standard' THEN
    -- Standard tier: 100 generations per month
    ret."generationsRemaining" = GREATEST(100 - monthly_generations_used, 0);
  ELSE 
    -- Pro or enterprise: unlimited
    ret."generationsRemaining" = 999999; -- effectively unlimited
  END IF;

  RETURN ret;

EXCEPTION
  WHEN others THEN 
    RAISE EXCEPTION 'An error occurred in function user_extradata(): %', SQLERRM;
END;
$$;
