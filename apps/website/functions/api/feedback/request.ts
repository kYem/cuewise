export interface Env {
  RESEND_API_KEY: string;
}

interface RequestPayload {
  area?: unknown;
  details?: unknown;
  email?: unknown;
  source?: unknown;
  version?: unknown;
  website?: unknown;
}

const AREAS = ['widgets', 'goals', 'pomodoro', 'quotes', 'reminders', 'sync', 'other'];
const DETAILS_MAX_LENGTH = 2000;
const EMAIL_MAX_LENGTH = 254;
const VERSION_PATTERN = /^[\d.]{1,20}$/;
const SOURCE_PATTERN = /^[a-z-]{1,32}$/;
// Deliberately loose: this address is only ever echoed into an email we send ourselves,
// so the cost of a false reject (a lost request) beats the cost of a false accept.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleFeatureRequest(request: Request, env: Env): Promise<Response> {
  if (!env.RESEND_API_KEY) {
    console.error('Resend env var missing');
    return json(500, { error: 'Feature requests are temporarily unavailable' });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Invalid request body' });
  }

  if (typeof payload !== 'object' || payload === null) {
    return json(400, { error: 'Invalid request body' });
  }

  const requestPayload = payload as RequestPayload;

  if (typeof requestPayload.website === 'string' && requestPayload.website.length > 0) {
    // Honeypot field was filled by a bot — report success so it learns nothing.
    return json(200, { success: true });
  }

  if (typeof requestPayload.area !== 'string' || !AREAS.includes(requestPayload.area)) {
    return json(400, { error: 'Invalid request' });
  }

  // Unlike uninstall feedback, the free text is the request itself, so it is required.
  if (
    typeof requestPayload.details !== 'string' ||
    requestPayload.details.trim().length === 0 ||
    requestPayload.details.length > DETAILS_MAX_LENGTH
  ) {
    return json(400, { error: 'Invalid request' });
  }

  // Everything below is sanitized, never rejected: losing a real request over a
  // malformed optional field would defeat the point of collecting it.
  const version =
    typeof requestPayload.version === 'string' && VERSION_PATTERN.test(requestPayload.version)
      ? requestPayload.version
      : 'unknown';

  const source =
    typeof requestPayload.source === 'string' && SOURCE_PATTERN.test(requestPayload.source)
      ? requestPayload.source
      : 'settings';

  const hasReplyAddress =
    typeof requestPayload.email === 'string' &&
    requestPayload.email.length <= EMAIL_MAX_LENGTH &&
    EMAIL_PATTERN.test(requestPayload.email);

  const lines = [
    `Area: ${requestPayload.area}`,
    `Version: ${version}`,
    `Source: ${source}`,
    `Reply to: ${hasReplyAddress ? String(requestPayload.email) : '(none given)'}`,
    '',
    requestPayload.details,
  ];

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Cuewise Feedback <feedback@cuewise.app>',
        to: ['support@cuewise.app'],
        subject: `Feature request: ${requestPayload.area}`,
        text: lines.join('\n'),
        ...(hasReplyAddress ? { reply_to: [String(requestPayload.email)] } : {}),
      }),
    });

    if (response.ok) {
      return json(200, { success: true });
    }

    // console.error is the standard log sink for Pages Functions (@cuewise/shared logger is not a dependency here).
    console.error('Resend feature request send failed', response.status);
    return json(502, { error: 'Could not send your request — please email us instead' });
  } catch (error) {
    console.error('Resend feature request failed', error);
    return json(502, { error: 'Could not send your request — please email us instead' });
  }
}

interface PagesContext {
  request: Request;
  env: Env;
}

export function onRequestPost(context: PagesContext): Promise<Response> {
  return handleFeatureRequest(context.request, context.env);
}
