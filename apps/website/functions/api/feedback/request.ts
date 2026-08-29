import { isFeedbackArea } from '../../../src/lib/feedback-areas';

export interface Env {
  RESEND_API_KEY: string;
}

export interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string[];
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
// Deliberately disagrees with HTML5 type="email": stricter, in that a dot is required.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The status Resend uses for a field it will not accept. Anything else (429, 401, 5xx) is about
// us or the service, and re-sending only burns rate budget or duplicates a queued email.
const FIELD_REJECTED = 422;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Progressive enhancement: the form posts natively whenever its script has not run. */
function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}

async function readPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(await request.formData());
  }
  return request.json();
}

export async function handleFeatureRequest(request: Request, env: Env): Promise<Response> {
  const nativeSubmit = (request.headers.get('Content-Type') ?? '').includes(
    'application/x-www-form-urlencoded'
  );
  const fail = (status: number, error: string): Response =>
    nativeSubmit ? seeOther('/feedback/?failed=1') : json(status, { error });

  if (!env.RESEND_API_KEY) {
    console.error('Resend env var missing');
    return fail(500, 'Feature requests are temporarily unavailable');
  }

  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch {
    return fail(400, 'Invalid request body');
  }

  if (typeof payload !== 'object' || payload === null) {
    return fail(400, 'Invalid request body');
  }

  const requestPayload = payload as RequestPayload;

  const trap = requestPayload.trap;
  if (trap !== undefined && trap !== null && String(trap).trim().length > 0) {
    // The trap's own contents are what separate a bot from a password-manager misfire.
    console.warn('Feature request dropped by honeypot', {
      trapLooksLikeEmail: EMAIL_PATTERN.test(String(trap)),
      trapLength: String(trap).length,
      detailsLength: typeof requestPayload.details === 'string' ? requestPayload.details.length : 0,
    });
    // Reported as success so a bot learns nothing.
    return nativeSubmit ? seeOther('/feedback/?sent=1') : json(200, { success: true });
  }

  if (typeof requestPayload.area !== 'string' || !isFeedbackArea(requestPayload.area)) {
    return fail(400, 'Invalid request');
  }
  const area = requestPayload.area;

  if (
    typeof requestPayload.details !== 'string' ||
    requestPayload.details.trim().length === 0 ||
    requestPayload.details.length > DETAILS_MAX_LENGTH
  ) {
    return fail(400, 'Invalid request');
  }
  const details = requestPayload.details;

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
    rawEmail.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(rawEmail) ? rawEmail : null;

  // Printed even when unusable: dropping it silently is indistinguishable from staying anonymous.
  let replyLine = '(none given)';
  if (replyAddress !== null) {
    replyLine = replyAddress;
  } else if (rawEmail.length > 0) {
    replyLine = `(unusable address given: ${rawEmail.slice(0, EMAIL_MAX_LENGTH)})`;
  }

  const lines = [
    `Area: ${area}`,
    `Version: ${version}`,
    `Source: ${source}`,
    `Reply to: ${replyLine}`,
    '',
    details,
  ];

  // Same key on both attempts, so a retry after a lost response cannot deliver twice.
  const idempotencyKey = crypto.randomUUID();
  const send = (reply: string | null): Promise<Response> => {
    const email: ResendEmail = {
      from: 'Cuewise Feedback <feedback@cuewise.app>',
      to: ['support@cuewise.app'],
      subject: `Feature request: ${area}`,
      text: lines.join('\n'),
      ...(reply !== null ? { reply_to: [reply] } : {}),
    };
    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(email),
    });
  };

  try {
    let response = await send(replyAddress);

    // The address is already in the body text, so retrying without it loses nothing.
    if (response.status === FIELD_REJECTED && replyAddress !== null) {
      const detail = await response.text().catch(() => '<unreadable>');
      // console.error is the standard log sink for Pages Functions (@cuewise/shared logger is not a dependency here).
      console.error('Resend rejected a field, retrying without reply_to', response.status, detail);
      response = await send(null);
    }

    if (response.ok) {
      return nativeSubmit ? seeOther('/feedback/?sent=1') : json(200, { success: true });
    }

    const detail = await response.text().catch(() => '<unreadable>');
    console.error('Resend feature request send failed', response.status, detail);
    return fail(502, 'Could not send your request — please email us instead');
  } catch (error) {
    console.error('Resend feature request failed', error);
    return fail(502, 'Could not send your request — please email us instead');
  }
}

interface PagesContext {
  request: Request;
  env: Env;
}

export function onRequestPost(context: PagesContext): Promise<Response> {
  return handleFeatureRequest(context.request, context.env);
}
