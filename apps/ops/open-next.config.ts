import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

/**
 * OpenNext → Cloudflare Workers build config. Incremental cache lives in R2
 * (wrangler binding NEXT_INC_CACHE_R2_BUCKET). Tag cache / revalidation queue
 * stay on the defaults — the ops desk is a fully dynamic, Basic-auth'd app
 * with no ISR; see docs/deploy-cloudflare.md for the post-deploy Durable
 * Object tag-cache optimisation if that changes.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
