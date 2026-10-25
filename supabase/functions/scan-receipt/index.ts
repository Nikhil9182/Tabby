import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// In-memory rate limiting: max 10 receipt scans per minute per authenticated user
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const userRecord = rateLimitMap.get(userId);

  if (!userRecord || now > userRecord.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (userRecord.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((userRecord.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  userRecord.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Verify User Authentication Token via Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing or malformed Authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or expired authentication session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Enforce Abuse-Control Rate Limiting by User ID
    const { allowed, retryAfterSeconds } = checkRateLimit(user.id);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} scans per minute. Please wait ${retryAfterSeconds} seconds or use local OCR.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSeconds),
          },
        }
      );
    }

    // 3. Verify Server-Side Gemini API Key Secret
    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "AI receipt scanning is currently unavailable on this server. Please use local OCR or contact the administrator.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Configurable Gemini model ID (defaults to modern gemini-2.5-flash)
    const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-2.5-flash";

    // 4. Parse and Validate Request Payload
    let bodyText: string;
    try {
      bodyText = await req.text();
    } catch {
      return new Response(JSON.stringify({ error: "Failed to read request body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check request payload size (15MB base64 ceiling)
    if (bodyText.length > 15 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "Receipt image exceeds 10 MB limit. Please use a smaller photo." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: { imageBase64?: string; mimeType?: string; currency?: string };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON request body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, mimeType = "image/jpeg", currency = "INR" } = payload;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required 'imageBase64' field in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
      return new Response(
        JSON.stringify({ error: "Unsupported image MIME type. Use JPEG, PNG, or WebP." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Build Gemini API Structured Request
    const promptText = `
You are an expert receipt extraction AI. Analyze this receipt image and extract structured financial details.
Return ONLY valid JSON with numerical values in standard major currency units (e.g. 15.50, 350.00).
Rules:
- Extract item descriptions, quantities, unit prices (if visible), and line total prices.
- Identify merchant name, receipt date (in YYYY-MM-DD if recognizable), and currency code (e.g. ${currency}).
- Distinguish subtotal, tax / GST, tip / service charge, discount, and final grand total.
- If quantity is omitted, assume 1.
- Do NOT include currency symbols in numbers.
`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            merchantName: { type: "STRING" },
            date: { type: "STRING", description: "YYYY-MM-DD format if visible" },
            currency: { type: "STRING", description: "3-letter currency code, e.g. INR, USD, EUR" },
            subtotal: { type: "NUMBER", description: "Subtotal before tax" },
            tax: { type: "NUMBER", description: "Total tax, VAT, or GST" },
            discount: { type: "NUMBER", description: "Total discount" },
            tip: { type: "NUMBER", description: "Tip or service charge" },
            total: { type: "NUMBER", description: "Final grand total payable" },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  quantity: { type: "NUMBER" },
                  unitPrice: { type: "NUMBER" },
                  lineTotal: { type: "NUMBER" },
                },
                required: ["name", "lineTotal"],
              },
            },
          },
          required: ["total", "items"],
        },
      },
    };

    // 6. Call Google Gemini API with 25-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let geminiRes: Response;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr?.name === "AbortError") {
        return new Response(
          JSON.stringify({ error: "Gemini Vision API request timed out after 25 seconds. Please use local OCR." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Network error connecting to Gemini Vision: ${fetchErr?.message || "Unknown error"}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => null);
      const errMsg = errBody?.error?.message || `Gemini API returned status ${geminiRes.status}`;

      if (geminiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Gemini quota or rate limit reached. Please try again shortly or use local OCR." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `AI Vision processing error: ${errMsg}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiJson = await geminiRes.json();
    const textOutput = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      return new Response(
        JSON.stringify({ error: "Gemini did not return recognized receipt content." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let structuredOutput: unknown;
    try {
      structuredOutput = JSON.parse(textOutput);
    } catch {
      return new Response(
        JSON.stringify({ error: "Gemini returned non-JSON text that could not be parsed." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ data: structuredOutput }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Internal server error: ${err?.message || "Unexpected failure"}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
