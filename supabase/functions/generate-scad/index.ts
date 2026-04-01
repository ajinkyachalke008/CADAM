/**
 * generate-scad/index.ts
 * ─────────────────────────────────────────────────────────────
 * Supabase Edge Function — Text/Image → OpenSCAD Code
 * Provider: NVIDIA NIM API (OpenAI-compatible)
 *
 * PLACE THIS FILE AT:
 *   apps/magic-cad/supabase/functions/generate-scad/index.ts
 *
 * This OVERRIDES the original Anthropic-based implementation.
 * ─────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── CORS ──────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── NVIDIA NIM Config ─────────────────────────────────────────
const NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1";

// Primary model: best for structured code generation
const MODEL_CODE = "meta/llama-3.3-70b-instruct";

// Vision model: used when image is provided
const MODEL_VISION = "meta/llama-3.2-11b-vision-instruct";

// ── OpenSCAD Expert System Prompt ────────────────────────────
const SYSTEM_PROMPT = `You are an expert OpenSCAD programmer and parametric 3D CAD designer.
Your job is to convert natural language descriptions or image references into valid, working OpenSCAD code.

STRICT OUTPUT RULES:
- Output ONLY valid OpenSCAD code. No explanations, no markdown, no code fences.
- Never start your response with text. The very first character must be either // or a variable assignment or an OpenSCAD keyword.

PARAMETRIC DESIGN RULES:
- Define all key dimensions as variables at the top of the file.
- Each variable must have a comment describing it (units in mm unless stated).
- Minimum 4 parametric variables.
- Use descriptive snake_case variable names.

VARIABLE FORMAT (top of file):
// ── Parameters ──────────────────────────────────────────────
width = 50;        // Width in mm
height = 30;       // Height in mm
depth = 20;        // Depth in mm
wall_thickness = 2; // Wall thickness in mm

CODE QUALITY:
- Use union(), difference(), intersection() for boolean operations.
- Use translate(), rotate(), scale() for transformations.
- Include BOSL2 library calls only if needed for complex shapes.
- Keep code clean, readable, modular with named modules where appropriate.

OUTPUT: Pure OpenSCAD code only. Start immediately with code.`;

// ── Call NVIDIA NIM API ───────────────────────────────────────
async function callNvidiaAPI(options: {
  prompt: string;
  imageUrl?: string;
  apiKey: string;
}): Promise<string> {
  const { prompt, imageUrl, apiKey } = options;

  const useVision = !!imageUrl;
  const model = useVision ? MODEL_VISION : MODEL_CODE;

  // Build user message content
  let userContent: string | Array<Record<string, unknown>>;

  if (useVision && imageUrl) {
    userContent = [
      {
        type: "image_url",
        image_url: {
          url: imageUrl,
        },
      },
      {
        type: "text",
        text: prompt,
      },
    ];
  } else {
    userContent = prompt;
  }

  const requestPayload = {
    model,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    max_tokens: 4096,
    temperature: 0.15,   // Low = more deterministic code
    top_p: 0.9,
    stream: false,
  };

  const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    let errorMsg = `NVIDIA API HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errorMsg += `: ${errBody?.detail || errBody?.message || JSON.stringify(errBody)}`;
    } catch {
      errorMsg += `: ${await response.text()}`;
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const rawContent: string = data?.choices?.[0]?.message?.content ?? "";

  if (!rawContent.trim()) {
    throw new Error("NVIDIA API returned an empty response.");
  }

  // Strip accidental markdown code fences
  return rawContent
    .replace(/^```(?:openscad|scad|javascript|typescript)?\n?/gi, "")
    .replace(/\n?```\s*$/gi, "")
    .trim();
}

// ── Extract Parameters from SCAD code ─────────────────────────
interface ScadParameter {
  name: string;
  value: number;
  comment: string;
}

function extractParameters(scadCode: string): ScadParameter[] {
  const params: ScadParameter[] = [];
  const lines = scadCode.split("\n");
  const RESERVED = new Set(["true", "false", "undef", "PI", "e"]);

  for (const line of lines) {
    // Match lines like: variable_name = 50; // Comment
    const match = line.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([\d.]+)\s*;?\s*(?:\/\/\s*(.*))?/
    );
    if (match) {
      const [, name, rawValue, comment] = match;
      if (!RESERVED.has(name)) {
        params.push({
          name,
          value: parseFloat(rawValue),
          comment: comment?.trim() || name,
        });
      }
    }
  }

  return params;
}

// ── Apply Parameter Update to SCAD code ──────────────────────
function applyParameterUpdate(
  scadCode: string,
  paramName: string,
  paramValue: number
): string {
  const regex = new RegExp(
    `(${escapeRegex(paramName)}\\s*=\\s*)([\\d.]+)(\\s*;)`,
    "g"
  );
  return scadCode.replace(regex, `$1${paramValue}$3`);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Resolve Image URL for Local Dev (ngrok proxy) ────────────
function resolveImageUrl(
  imageUrl: string | undefined,
  environment: string,
  ngrokUrl: string | undefined
): string | undefined {
  if (!imageUrl) return undefined;
  if (environment === "local" && ngrokUrl) {
    try {
      const urlObj = new URL(imageUrl);
      return `${ngrokUrl}${urlObj.pathname}${urlObj.search}`;
    } catch {
      return imageUrl;
    }
  }
  return imageUrl;
}

// ── Main Serve Handler ────────────────────────────────────────
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ── Parse Request Body ──────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      prompt,
      imageUrl,
      currentScad,
      paramName,
      paramValue,
    } = body as {
      prompt?: string;
      imageUrl?: string;
      currentScad?: string;
      paramName?: string;
      paramValue?: number;
    };

    // ── Get NVIDIA API Key ──────────────────────────────────
    const apiKey = Deno.env.get("NVIDIA_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "NVIDIA_API_KEY not set. Add it to supabase/functions/.env and run: supabase secrets set NVIDIA_API_KEY=<key>",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mode A: Parameter Update (no AI call needed) ────────
    if (
      currentScad &&
      paramName !== undefined &&
      paramValue !== undefined
    ) {
      const updatedScad = applyParameterUpdate(currentScad, paramName, paramValue);
      return new Response(
        JSON.stringify({
          scadCode: updatedScad,
          parameters: extractParameters(updatedScad),
          mode: "parameter_update",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mode B: AI Generation via NVIDIA NIM ────────────────
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "prompt is required for AI generation." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const environment = Deno.env.get("ENVIRONMENT") ?? "local";
    const ngrokUrl = Deno.env.get("NGROK_URL");
    const resolvedImageUrl = resolveImageUrl(imageUrl, environment, ngrokUrl);

    const scadCode = await callNvidiaAPI({
      prompt,
      imageUrl: resolvedImageUrl,
      apiKey,
    });

    const parameters = extractParameters(scadCode);

    return new Response(
      JSON.stringify({
        scadCode,
        parameters,
        mode: "ai_generation",
        provider: "NVIDIA NIM",
        model: resolvedImageUrl ? MODEL_VISION : MODEL_CODE,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-scad] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
