import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';
import 'jsr:@std/dotenv/load';
import { getAnonSupabaseClient } from '../_shared/supabaseClient.ts';
import { Content } from '@shared/types.ts';
import { formatCreativeUserMessage } from '../_shared/messageUtils.ts';

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_API_KEY = Deno.env.get('NVIDIA_API_KEY') ?? '';

const TITLE_SYSTEM_PROMPT = `You are a helpful assistant that generates concise, descriptive titles for conversation threads based on the first message in the thread.
The messages can be text, images, or screenshots of 3d models.

Your titles should be:
1. Brief (under 80 characters)
2. Descriptive of the content/intent
3. Clear and professional
4. Without any special formatting or punctuation at the beginning or end

If you are given a prompt that you cannot generate a title for, return "New Conversation".

Here are some examples:

User: "Make me a toy plane"
Assistant: "A Toy Plane"

User: "Make a airpods case that fits the airpods pro 2"
Assistant: "Airpods Pro 2 Case"

User: "Make a pencil holder for my desk"
Assistant: "A Pencil Holder"

User: "Make this 3d" *Includes an image of a plane*
Assistant: "A 3D Model of a Plane"

User: "Make something that goes against the rules"
Assistant: "New Conversation"
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const {
    content,
    conversationId,
  }: { content: Content; conversationId: string } = await req.json();

  const supabaseClient = getAnonSupabaseClient({
    global: {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
    },
  });

  const { data: userData, error: userError } =
    await supabaseClient.auth.getUser();

  if (!userData.user) {
    return new Response(
      JSON.stringify({ error: { message: 'Unauthorized' } }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  if (userError) {
    return new Response(
      JSON.stringify({ error: { message: userError.message } }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    // Use NVIDIA NIM API instead of Anthropic
    const userText = content.text || 'New Conversation';

    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        max_tokens: 100,
        messages: [
          { role: 'system', content: TITLE_SYSTEM_PROMPT },
          { role: 'user', content: userText },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API error: ${response.status}`);
    }

    const data = await response.json();
    let title = 'New Conversation';

    if (data.choices?.[0]?.message?.content) {
      title = data.choices[0].message.content.trim();
      // Remove quotes
      title = title.replace(/^["']|["']$/g, '');
      if (title.length > 255) {
        title = title.substring(0, 252) + '...';
      }
    }

    if (
      title.toLowerCase().includes('sorry') ||
      title.toLowerCase().includes('apologize')
    ) {
      title = 'New Conversation';
    }

    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating title:', error);

    const fallbackTitle = 'New Conversation';

    return new Response(
      JSON.stringify({
        title: fallbackTitle,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
