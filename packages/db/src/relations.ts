import { relations } from 'drizzle-orm'
import {
  editRequests,
  events,
  inboxMessages,
  inboxThreads,
  leads,
  outreachCampaigns,
  outreachMessages,
  prospects,
  sites,
  siteSpecs,
  stylePresets,
} from './schema'

export const prospectsRelations = relations(prospects, ({ one, many }) => ({
  siteSpecs: many(siteSpecs),
  site: one(sites),
  outreachMessages: many(outreachMessages),
  events: many(events),
  inboxThreads: many(inboxThreads),
}))

export const siteSpecsRelations = relations(siteSpecs, ({ one }) => ({
  prospect: one(prospects, { fields: [siteSpecs.prospectId], references: [prospects.id] }),
  stylePreset: one(stylePresets, {
    fields: [siteSpecs.stylePresetId],
    references: [stylePresets.id],
  }),
}))

export const sitesRelations = relations(sites, ({ one, many }) => ({
  prospect: one(prospects, { fields: [sites.prospectId], references: [prospects.id] }),
  leads: many(leads),
  editRequests: many(editRequests),
  events: many(events),
}))

export const leadsRelations = relations(leads, ({ one }) => ({
  site: one(sites, { fields: [leads.siteId], references: [sites.id] }),
}))

export const editRequestsRelations = relations(editRequests, ({ one }) => ({
  site: one(sites, { fields: [editRequests.siteId], references: [sites.id] }),
}))

export const outreachCampaignsRelations = relations(outreachCampaigns, ({ many }) => ({
  messages: many(outreachMessages),
}))

export const outreachMessagesRelations = relations(outreachMessages, ({ one }) => ({
  prospect: one(prospects, { fields: [outreachMessages.prospectId], references: [prospects.id] }),
  campaign: one(outreachCampaigns, {
    fields: [outreachMessages.campaignId],
    references: [outreachCampaigns.id],
  }),
}))

export const eventsRelations = relations(events, ({ one }) => ({
  prospect: one(prospects, { fields: [events.prospectId], references: [prospects.id] }),
  site: one(sites, { fields: [events.siteId], references: [sites.id] }),
}))

export const inboxThreadsRelations = relations(inboxThreads, ({ one, many }) => ({
  prospect: one(prospects, { fields: [inboxThreads.prospectId], references: [prospects.id] }),
  messages: many(inboxMessages),
}))

export const inboxMessagesRelations = relations(inboxMessages, ({ one }) => ({
  thread: one(inboxThreads, { fields: [inboxMessages.threadId], references: [inboxThreads.id] }),
}))
