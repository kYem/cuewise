export interface Env {
  RESEND_API_KEY: string;
  RESEND_AUDIENCE_ID: string;
}

interface SubscribePayload {
  email?: unknown;
  website?: unknown;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  let payload: SubscribePayload;
  try {
    payload = (await request.json()) as SubscribePayload;
  } catch {
    return json(400, { error: 'Invalid request body' });
  }

  if (typeof payload.website === 'string' && payload.website.length > 0) {
    // Honeypot field was filled by a bot — report success so it learns nothing.
    return json(200, { success: true });
  }

  if (typeof payload.email !== 'string' || !EMAIL_PATTERN.test(payload.email)) {
    return json(400, { error: 'Please enter a valid email address' });
  }

  const response = await fetch(
    `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: payload.email, unsubscribed: false }),
    }
  );

  if (response.ok || response.status === 409) {
    return json(200, { success: true });
  }

  return json(502, { error: 'Subscription failed — please try again later' });
}

interface PagesContext {
  request: Request;
  env: Env;
}

export function onRequestPost(context: PagesContext): Promise<Response> {
  return handleSubscribe(context.request, context.env);
}
