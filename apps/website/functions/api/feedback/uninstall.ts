export interface Env {
  RESEND_API_KEY: string;
}

interface FeedbackPayload {
  reason?: unknown;
  details?: unknown;
  version?: unknown;
  website?: unknown;
}

const REASONS = ['missing-feature', 'cluttered', 'performance', 'switched', 'trying', 'other'];
const DETAILS_MAX_LENGTH = 2000;
const VERSION_PATTERN = /^[\d.]{1,20}$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleUninstallFeedback(request: Request, env: Env): Promise<Response> {
  if (!env.RESEND_API_KEY) {
    console.error('Resend env var missing');
    return json(500, { error: 'Feedback is temporarily unavailable' });
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

  const feedbackPayload = payload as FeedbackPayload;

  if (typeof feedbackPayload.website === 'string' && feedbackPayload.website.length > 0) {
    // Honeypot field was filled by a bot — report success so it learns nothing.
    return json(200, { success: true });
  }

  if (typeof feedbackPayload.reason !== 'string' || !REASONS.includes(feedbackPayload.reason)) {
    return json(400, { error: 'Invalid feedback' });
  }

  if (feedbackPayload.details !== undefined) {
    if (
      typeof feedbackPayload.details !== 'string' ||
      feedbackPayload.details.length > DETAILS_MAX_LENGTH
    ) {
      return json(400, { error: 'Invalid feedback' });
    }
  }

  // Version arrives in the JSON body (the page forwarded its query param) —
  // sanitize, never reject.
  const version =
    typeof feedbackPayload.version === 'string' && VERSION_PATTERN.test(feedbackPayload.version)
      ? feedbackPayload.version
      : 'unknown';

  const lines = [
    `Reason: ${feedbackPayload.reason}`,
    `Version: ${version}`,
    '',
    feedbackPayload.details ? String(feedbackPayload.details) : '(no details given)',
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
        subject: `Uninstall feedback: ${feedbackPayload.reason}`,
        text: lines.join('\n'),
      }),
    });

    if (response.ok) {
      return json(200, { success: true });
    }

    // console.error is the standard log sink for Pages Functions (@cuewise/shared logger is not a dependency here).
    console.error('Resend feedback send failed', response.status);
    return json(502, { error: 'Could not send feedback — please email us instead' });
  } catch (error) {
    console.error('Resend feedback request failed', error);
    return json(502, { error: 'Could not send feedback — please email us instead' });
  }
}

interface PagesContext {
  request: Request;
  env: Env;
}

export function onRequestPost(context: PagesContext): Promise<Response> {
  return handleUninstallFeedback(context.request, context.env);
}
