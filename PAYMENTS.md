# Bachs payment integration

Provider confirmed by the user: **Bachs.io**. Research used the provider’s official documentation on 18 October 2026. The integration uses REST directly, with separate sandbox/live origins, and does not rely on an unofficial SDK.

| Concern | Implementation |
| --- | --- |
| API environment | `https://sandbox-api.bachs.io/v1` or `https://api.bachs.io/v1`; matching `sk_sandbox_` / `sk_live_` key required. |
| Teacher earnings | Bachs Connect direct charges; `X-Account-Id` identifies the teacher’s connected account. No platform commission is invented or charged. |
| Teacher onboarding | `POST /accounts`, then `POST /accounts/{id}/account-links`. The account ID is saved before requesting its short-lived onboarding link. |
| Collection capability | `ngn_card_collection` for NGN and `card_collection` for USD. Publishing reads the current account state instead of trusting a browser redirect. |
| Product | One-time fixed-price product per exam revision, created in that teacher’s account. |
| Amounts | Integers inside PastQ; decimal strings such as `"1250.50"` in Bachs requests. |
| Checkout | `POST /checkout-sessions`, one product and one student order. Unique order reference, fixed currency, and server-defined return URLs. |
| Fulfillment | `collection.succeeded` after raw-body signature verification. Match account, checkout, reference, currency, status, and expected amount before enrolling. A redirect is never proof of payment. |
| Delivery security | V2 webhook signatures support rotation; legacy headers are supported. HMAC-SHA256, constant-time comparison, five-minute timestamp tolerance, event-ID deduplication, and transactional enrollment. |
| Retries | Stable idempotency keys for account/product creation and checkout requests. An early webhook whose checkout has not been registered returns a retriable error. |

Set these server variables:

```dotenv
BACHS_ENVIRONMENT=sandbox
BACHS_API_KEY=sk_sandbox_your_key
BACHS_WEBHOOK_SECRET=your_endpoint_signing_secret
TEACHER_ORIGIN=https://teachers.your-domain.example
STUDENT_ORIGIN=https://students.your-domain.example
```

Register `https://teachers.your-domain.example/api/payments/bachs/webhook` as a Bachs webhook destination. Subscribe to `collection.succeeded` and set its event source to **connect** or **all** so direct-charge events reach the platform.

Complete a sandbox onboarding and checkout through an actual student account before changing environments. Verify account capabilities, checkout currency, provider fee handling, signature headers, repeated delivery, return navigation, and an API restart. The current integration accepts exact successful collections; accepted/underpaid/overpaid or mismatched events do not automatically grant exam access. Verify those cases with Bachs before broadening fulfillment rules. Live provider access was not supplied during implementation.

The app reports gross exam collections, not a bank balance or a payout guarantee. Provider processing fees, refund handling, disputes, and payouts are managed through Bachs. No real financial account was opened or payment made while building this app.

Official references:

- [API conventions and amounts](https://docs.bachs.io/llms.txt)
- [Accept a payment with Checkout](https://docs.bachs.io/guides/checkout/checkout-sessions)
- [Create a product](https://docs.bachs.io/api-reference/products/create-a-product)
- [Connect quickstart](https://docs.bachs.io/connect/quickstart)
- [Direct charges and connected accounts](https://docs.bachs.io/connect/split-payments/direct)
- [Hosted account onboarding](https://docs.bachs.io/connect/guides/hosted-onboarding)
- [Webhook verification and signing-key rotation](https://docs.bachs.io/guides/webhooks/overview)
- [Successful collection event](https://docs.bachs.io/guides/webhooks/events/collection-succeeded)
