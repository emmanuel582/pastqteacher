import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail } from './domain.js';
export function verifyWebhook(raw, headers, secret, now = Date.now()) {
  if (!secret) fail('Payment webhooks are not configured.', 503);
  const v2 = String(headers['x-bachs-signature-v2'] || '')
    .split(',')
    .map((s) => s.trim().split('='));
  const stamp = v2.find(([k]) => k === 't')?.[1] || headers['x-bachs-timestamp'];
  const signatures = v2.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!signatures.length) signatures.push(headers['x-bachs-signature']);
  if (!/^\d+$/.test(String(stamp)) || Math.abs(now / 1000 - Number(stamp)) > 300)
    fail('Invalid webhook timestamp.', 400);
  const expected = createHmac('sha256', secret).update(`${stamp}.`).update(raw).digest();
  if (
    !signatures.some(
      (s) => /^[a-f0-9]{64}$/i.test(s || '') && timingSafeEqual(expected, Buffer.from(s, 'hex')),
    )
  )
    fail('Invalid webhook signature.', 400);
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    fail('Invalid webhook payload.');
  }
  if (typeof event.id !== 'string' || event.id.length > 200 || typeof event.type !== 'string')
    fail('Invalid webhook event.');
  return event;
}
export function createBachs(config, request = fetch) {
  const base =
    config.environment === 'live' ? 'https://api.bachs.io/v1' : 'https://sandbox-api.bachs.io/v1';
  async function call(path, { method = 'GET', body, account, idempotency } = {}) {
    if (!config.apiKey) fail('Bachs payments are not configured. Free exams are available.', 503);
    if (
      (config.environment === 'live' && !config.apiKey.startsWith('sk_live_')) ||
      (config.environment !== 'live' && !config.apiKey.startsWith('sk_sandbox_'))
    )
      fail('Bachs key does not match the selected environment.', 503);
    const response = await request(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(account ? { 'X-Account-Id': account } : {}),
        ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[teacher:bachs]', response.status, result.error?.code || 'provider_error');
      fail('Bachs could not complete this request. Check account setup or try again.', 502);
    }
    return result.data || result;
  }
  return {
    configured: Boolean(config.apiKey && config.webhookSecret),
    environment: config.environment,
    async onboard(profile, teacherOrigin) {
      let accountId = profile.connectedAccountId;
      if (!accountId) {
        const account = await call('/accounts', {
          method: 'POST',
          idempotency: `pastq-teacher-${profile.id}`,
          body: {
            contact_email: profile.email,
            display_name: profile.organization || profile.name,
            country: 'NG',
            entity_type: 'individual',
            configuration: {
              merchant: {
                capabilities: {
                  ngn_card_collection: { requested: true },
                  card_collection: { requested: true },
                },
              },
              recipient: {
                capabilities: { payouts: { requested: true }, transfers: { requested: true } },
              },
            },
          },
        });
        accountId = account.id;
        if (!/^acct_/.test(accountId || '')) fail('Bachs returned an invalid account.', 502);
      }
      return { accountId };
    },
    async onboardingLink(accountId, teacherOrigin) {
      return call(`/accounts/${encodeURIComponent(accountId)}/account-links`, {
        method: 'POST',
        body: {
          type: 'onboarding',
          return_url: `${teacherOrigin}/?payments=return#settings`,
          refresh_url: `${teacherOrigin}/?payments=refresh#settings`,
        },
      });
    },
    account: (id) => call(`/accounts/${encodeURIComponent(id)}`),
    async product(exam, account) {
      const product = await call('/products', {
        method: 'POST',
        account,
        idempotency: `pastq-exam-${exam.id}-${exam.revision}`,
        body: {
          name: exam.title,
          description: 'Entry to a PastQ teacher exam',
          price: {
            price_type: 'fixed',
            currency: exam.currency,
            amount: (exam.priceMinor / 100).toFixed(2),
          },
          metadata: { pastq_exam_id: exam.id },
        },
      });
      if (!product.id) fail('Bachs did not return a product.', 502);
      return product.id;
    },
    async checkout(order, studentOrigin) {
      const checkout = await call('/checkout-sessions', {
        method: 'POST',
        account: order.account,
        idempotency: order.id,
        body: {
          product_cart: [{ product_id: order.productId, quantity: 1 }],
          billing_currency: order.currency,
          customer: { email: order.email, name: order.name },
          reference: order.id,
          metadata: { pastq_order_id: order.id },
          success_url: `${studentOrigin}/?exam=${order.examId}&order=${order.id}`,
          cancel_url: `${studentOrigin}/?exam=${order.examId}&payment=cancelled`,
        },
      });
      const url = new URL(checkout.checkout_url);
      if (!['https://checkout.bachs.io', 'https://sandbox-checkout.bachs.io'].includes(url.origin))
        fail('Bachs returned an invalid checkout URL.', 502);
      return { id: checkout.checkout_id, url: url.href };
    },
  };
}
