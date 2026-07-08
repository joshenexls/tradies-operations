# Stripe setup — conversion stack go-live

The conversion flow (claim → checkout → live site → billing lifecycle) runs
entirely on fixtures until `STRIPE_SECRET_KEY` is set. This runbook is the
one-time Stripe dashboard setup plus the legal checklist.

## 1. Products & prices

In the Stripe dashboard (live mode):

1. Create product **"Tradies website"**.
2. Add a **recurring monthly price of £19.99** → copy the price id into
   `STRIPE_PRICE_MONTHLY`.
3. Add a **one-time price of £149.99** (the displayed setup fee) → copy into
   `STRIPE_PRICE_SETUP`.
4. Create a **coupon**: 100% off, applies **once**, restricted to the setup
   product/price → copy into `STRIPE_COUPON_SETUP_WAIVER`.
   The checkout route pre-applies this coupon programmatically, so the
   customer sees the setup fee struck to £0.00 at checkout — matching the
   claim page's "Waived — code WELCOME applied" display.

## 2. Billing portal

Enable the **customer Billing Portal** (Settings → Billing → Customer portal)
with: update payment method, cancel subscription, view invoices. The portal
"Manage billing" button creates portal sessions against it.

## 3. Webhook endpoint

Add endpoint `https://app.tradies.co.uk/api/webhooks/stripe` (the SITES app,
not ops) listening to exactly:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. The endpoint verifies
the `Stripe-Signature` header (HMAC-SHA256, 300s tolerance) and 400s anything
unsigned; event types outside the three above are acknowledged and ignored.

## 4. Environment variables (sites deployment)

```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_MONTHLY=price_…
STRIPE_PRICE_SETUP=price_…
STRIPE_COUPON_SETUP_WAIVER=…
PRICE_MONTHLY_DISPLAY=£19.99
PRICE_SETUP_DISPLAY=£149.99
SETUP_WAIVER_CODE_DISPLAY=WELCOME
SETUP_FEE_PROMO=0                # see §6 — enable only after solicitor sign-off
LEAD_ALERT_FROM_EMAIL=leads@mail.tradies.co.uk   # verified Resend domain
BILLING_GRACE_DAYS=7
PRICE_MONTHLY_PENCE=1999
```

The jobs deployment also needs `STRIPE_SECRET_KEY` (the daily
`reconcile_subscriptions` cron, 05:00 UTC, mirrors subscription statuses and
lapses/recovers sites past the grace window). Deploy apps/jobs so the
schedule registers in Trigger.dev.

## 5. Lifecycle behavior (what ops sees)

- Payment → customer `active`, site `live`, noindex off, prospect
  `converted`, welcome email with the portal link.
- `past_due` → nothing immediate; the cron disables the site only after
  `currentPeriodEnd + BILLING_GRACE_DAYS`.
- Cancellation/unpaid → site `disabled` (offline), customer `canceled`;
  recovery (payment fixed) republishes automatically.
- Ops overrides on the prospect page: Publish / Unpublish / Disable — all
  audited in the events timeline.

## 6. Legal checklist — BEFORE `SETUP_FEE_PROMO=1` in production

Solicitor review items (the mechanic ships OFF by default in prod):

1. **Always-waived £149.99 setup fee** vs DMCC 2024 fictitious-pricing /
   misleading-omissions provisions — a fee that is never charged may be an
   unfair commercial practice even B2B-adjacent.
2. **T&Cs**: auto-renewal disclosure, cancellation mechanics, and the DMCC
   subscription-contract provisions (reminder notices, easy exit).
3. **Cooling-off posture**: customers are businesses (mostly sole traders);
   confirm the Consumer Contracts Regulations position and whether a
   voluntary 14-day refund policy is the cleaner path.

## 7. GDPR erasure of a paying customer (runbook)

1. In Stripe: cancel the subscription, then delete the customer object.
2. In ops: run **Erase** on the prospect. This deletes edit requests, nulls
   customer PII (email/phones/intake → status `erased`) and keeps the
   subscription rows + `stripeCustomerId` under the legal-obligation basis
   (billing records).
