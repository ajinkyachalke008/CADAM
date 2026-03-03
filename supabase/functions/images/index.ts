import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { GoogleGenAI } from 'npm:@google/genai';
import {
  generateImageWithGeminiMultiTurn,
  generateImageWithFalFlux,
} from '../_shared/imageGen.ts';
import { GenerationStatus, Model } from '@shared/types.ts';
import {
  getServiceRoleSupabaseClient,
  SupabaseClient,
} from '../_shared/supabaseClient.ts';
import { initSentry, logError, logApiError } from '../_shared/sentry.ts';

// Initialize Sentry for error logging
initSentry();

const supabaseClient = getServiceRoleSupabaseClient();

const googleGenAI = new GoogleGenAI({
  apiKey: Deno.env.get('GOOGLE_API_KEY') ?? '',
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Authenticate user using bearer token
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser(token);

  if (!userData.user) {
    logError(new Error('No user found in token'), {
      functionName: 'images',
      statusCode: 401,
    });
    return new Response(
      JSON.stringify({ error: { message: 'Unauthorized' } }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  if (userError) {
    logError(userError, {
      functionName: 'images',
      statusCode: 401,
    });
    return new Response(
      JSON.stringify({ error: { message: userError.message } }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const {
    text,
    images: requestImages,
    conversationId,
    model,
  }: {
    text?: string;
    images?: string[];
    conversationId?: string;
    model?: Model;
  } = await req.json();

  const images = requestImages ? requestImages : [];

  if (!conversationId) {
    logError(new Error('Conversation ID is required'), {
      functionName: 'images',
      statusCode: 400,
      userId: userData.user?.id,
    });
    return new Response(
      JSON.stringify({ error: { message: 'Conversation ID is required' } }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const { data: imageData, error: imageError } = await supabaseClient
    .from('images')
    .insert({
      user_id: userData.user.id,
      prompt: {
        ...(text && { text: text }),
        ...(images.length > 0 && { images: images }),
        ...(model && { model: model }),
      },
      conversation_id: conversationId,
      status: 'pending',
    })
    .select()
    .single();

  if (imageError) {
    logError(imageError, {
      functionName: 'images',
      statusCode: 500,
      userId: userData.user?.id,
      conversationId,
      additionalContext: {
        operation: 'insert_image_record',
        hasText: !!text,
        imagesCount: images.length,
        model,
      },
    });
    return new Response(
      JSON.stringify({ error: { message: imageError.message } }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  EdgeRuntime.waitUntil(
    generateImage(
      supabaseClient,
      text,
      images,
      userData.user.id,
      conversationId,
      imageData.id,
      model ?? 'quality',
    ),
  );

  return new Response(JSON.stringify({ id: imageData.id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function generateImage(
  supabaseClient: SupabaseClient,
  text: string | undefined,
  images: string[],
  userId: string,
  conversationId: string,
  imageId: string,
  model: Model,
) {
  try {
    const existingImages = (
      await Promise.all(
        images.map(async (image: string) => {
          const { data: exists } = await supabaseClient.storage
            .from('images')
            .exists(`${userId}/${conversationId}/${image}`);
          return exists ? image : null;
        }),
      )
    ).filter((path: string | null) => path !== null);

    if (!text && existingImages.length === 0) {
      throw new Error('No text or image provided');
    }

    let imageBytes;
    let imageGenerationCallId: string | undefined;

    if (model === 'fast') {
      if (Deno.env.get('ENVIRONMENT') === 'local') {
        console.log('fal flux');
      }
      imageBytes = await generateImageWithFalFlux(
        supabaseClient,
        userId,
        conversationId,
        text ?? '',
        existingImages,
      );
    } else {
      // Use Gemini Multi-Turn for quality/editing, fallback to Fal Flux if it fails
      try {
        if (Deno.env.get('ENVIRONMENT') === 'local') {
          console.log('gemini multi-turn');
        }

        imageBytes = await generateImageWithGeminiMultiTurn(
          supabaseClient,
          googleGenAI,
          userId,
          conversationId,
          text ?? '',
          existingImages,
        );

        // Gemini Multi-Turn doesn't use call ID chaining in this implementation
      } catch (geminiError) {
        logApiError(geminiError, {
          functionName: 'images',
          apiName: 'Gemini',
          statusCode: 500,
          userId,
          conversationId,
          requestData: { text, imageId, fallbackMode: 'flux' },
        });
        if (Deno.env.get('ENVIRONMENT') === 'local') {
          console.log(
            'gemini multi-turn failed, falling back to flux:',
            geminiError,
          );
        }

        // Fallback to Flux if Gemini fails
        imageBytes = await generateImageWithFalFlux(
          supabaseClient,
          userId,
          conversationId,
          text ?? '',
          existingImages,
        );
      }
    }

    const { error: imageError } = await supabaseClient.storage
      .from('images')
      .upload(`${userId}/${conversationId}/${imageId}`, imageBytes, {
        contentType: 'image/png',
      });

    if (imageError) {
      throw new Error(imageError.message);
    }

    // Update with success status
    const updateData: {
      status: GenerationStatus;
      image_generation_call_id?: string;
    } = {
      status: 'success',
    };

    if (imageGenerationCallId) {
      updateData.image_generation_call_id = imageGenerationCallId;
    }

    await supabaseClient.from('images').update(updateData).eq('id', imageId);
  } catch (error) {
    logError(error, {
      functionName: 'images',
      statusCode: 500,
      userId,
      conversationId,
      additionalContext: {
        operation: 'generate_image',
        imageId,
        model,
      },
    });
    console.error(error);
    await supabaseClient
      .from('images')
      .update({
        status: 'failure',
      })
      .eq('id', imageId);
  }
}
