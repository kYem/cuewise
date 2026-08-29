import { isFeedbackArea } from '../../../src/lib/feedback-areas';

export interface Env {
  RESEND_API_KEY: string;
}

interface RequestPayload {
  area?: unknown;
  details?: unknown;
  email?: unknown;
  source?: unknown;
  /** Honeypot. Not named for anything a password manager recognises, or it autofills. */
  trap?: unknown;
  version?: unknown;
}

const DETAILS_MAX_LENGTH = 2000;
const EMAIL_MAX_LENGTH = 254;
const VERSION_PATTERN = /^[\d.]{1,20}$/;
const SOURCE_PATTERN = /^[a-z-]{1,32}$/;
// Looser than HTML5 type="email" in some places and stricter in others; a rejected address
// costs the reply, never the request.
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

  if (typeof requestPayload.trap === 'string' && requestPayload.trap.trim().length > 0) {
    // Logged, not silent: a honeypot that misfires on a real person is undetectable otherwise.
    console.warn('Feature request dropped by honeypot', {
      detailsLength: typeof requestPayload.details === 'string' ? requestPayload.details.length : 0,
    });
    // Reported as success so a bot learns nothing.
    return json(200, { success: true });
  }

  if (typeof requestPayload.area !== 'string' || !isFeedbackArea(requestPayload.area)) {
    return json(400, { error: 'Invalid request' });
  }

  if (
    typeof requestPayload.details !== 'string' ||
    requestPayload.details.trim().length === 0 ||
    requestPayload.details.length > DETAILS_MAX_LENGTH
  ) {
    return json(400, { error: 'Invalid request' });
  }

  // Sanitized, never rejected: a malformed optional field must not cost us the request.
  const version =
    typeof requestPayload.version === 'string' && VERSION_PATTERN.test(requestPayload.version)
      ? requestPayload.version
      : 'unknown';

  const source =
    typeof requestPayload.source === 'string' && SOURCE_PATTERN.test(requestPayload.source)
      ? requestPayload.source
      : 'unknown';

  const rawEmail = typeof requestPayload.email === 'string' ? requestPayload.email : '';
  const replyAddress =
    EMAIL_PATTERN.test(rawEmail) && rawEmail.length <= EMAIL_MAX_LENGTH ? rawEmail : null;

  // An address we cannot use is still worth showing: dropping it silently is indistinguishable
  // from someone choosing to stay anonymous, and a typo is answerable by hand.
  let replyLine = '(none given)';
  if (replyAddress !== null) {
    replyLine = replyAddress;
  } else if (rawEmail.length > 0) {
    replyLine = `(unusable address given: ${rawEmail.slice(0, EMAIL_MAX_LENGTH)})`;
  }

  const lines = [
    `Area: ${requestPayload.area}`,
    `Version: ${version}`,
    `Source: ${source}`,
    `Reply to: ${replyLine}`,
    '',
    requestPayload.details,
  ];

  const send = (withReplyTo: boolean): Promise<Response> =>
    fetch('https://api.resend.com/emails', {
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
        ...(withReplyTo && replyAddress !== null ? { reply_to: [replyAddress] } : {}),
      }),
    });

  try {
    let response = await send(true);

    // The address is already in the body text, so retrying without it loses nothing — and an
    // address Resend refuses must not cost the request behind it.
    if (!response.ok && replyAddress !== null) {
      const detail = await response.text().catch(() => '<unreadable>');
      // console.error is the standard log sink for Pages Functions (@cuewise/shared logger is not a dependency here).
      console.error('Resend feature request send failed, retrying without reply_to', detail);
      response = await send(false);
    }

    if (response.ok) {
      return json(200, { success: true });
    }

    const detail = await response.text().catch(() => '<unreadable>');
    console.error('Resend feature request send failed', response.status, detail);
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
