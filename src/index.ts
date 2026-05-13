#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE_URL = "https://api.givebutter.com/v1";

// Get API key from environment variable
const getApiKey = (): string => {
  const apiKey = process.env.GIVEBUTTER_API_KEY;
  if (!apiKey) {
    throw new Error("GIVEBUTTER_API_KEY environment variable is required");
  }
  return apiKey;
};

// Helper function to make API requests
async function apiRequest(
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>,
  queryParams?: Record<string, string | number | undefined>
): Promise<unknown> {
  const apiKey = getApiKey();

  let url = `${API_BASE_URL}${endpoint}`;

  // Add query parameters if present
  if (queryParams) {
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, String(value));
      }
    });
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  // Some endpoints (notably DELETE /campaigns/{id}) return 200 with an
  // empty body rather than 204, so trust the body length, not the status.
  const text = await response.text();
  if (text.length === 0) {
    return { success: true };
  }
  return JSON.parse(text);
}

// Helper to build a body from optional fields
function buildBody(fields: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      body[key] = value;
    }
  }
  return body;
}

// Create MCP server
const server = new McpServer({
  name: "givebutter-mcp",
  version: "2.0.0",
});

// ============ CAMPAIGNS ============

server.tool(
  "list_campaigns",
  "List all campaigns associated with your Givebutter account",
  {
    page: z.number().optional().describe("Page number (1-indexed)"),
    per_page: z.number().int().min(1).max(100).optional().describe("Items per page (default 20, max 100)"),
    scope: z.enum(["owned", "beneficiary", "chapter"]).optional().describe("Filter by campaign scope"),
  },
  async ({ page, per_page, scope }) => {
    const result = await apiRequest("/campaigns", "GET", undefined, { page, per_page, scope });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_campaign",
  "Get details of a specific campaign by ID",
  {
    campaign_id: z.number().describe("The campaign ID"),
  },
  async ({ campaign_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Source: docs.givebutter.com/api-reference/campaigns/create-a-campaign (verified 2026-04-30)
const campaignSettingsSchema = z.array(z.object({
  name: z.string().describe("Setting key (e.g., 'theme_color', 'default_frequency', 'custom_donation_amounts')"),
  value: z.any().describe("Setting value — type depends on the setting (string, boolean, object, or array)"),
}).strict()).optional().describe("Campaign settings as {name, value} pairs. The OpenAPI spec lists this as string[] but the live API rejects strings with 'settings.0.name field is required'.");

const campaignTypeDescription = `Campaign type. Maps to the Givebutter dashboard creation options as follows:

- 'collect' → 'Fundraising Page' in the dashboard. Standalone donation page with goal, donation tiers, and updates feed. Most common type.
- 'fundraise' → 'Peer-to-Peer Fundraiser' in the dashboard. Like 'collect' but supports team and member sub-pages. Can be linked to an event via event_id.
- 'event' → 'Event' in the dashboard. Ticketed events with registration. Pairs with the campaign-ticket tools.
- 'general' → NOT shown in the dashboard creation chooser. Represents the account's primary donation page (singleton — only one per account, accessible at givebutter.com/[account-slug]). Attempting to create a second one returns 422: 'You can only have one general donations campaign.'

If creating campaigns programmatically and unsure, 'collect' is the right default for most use cases.`;

server.tool(
  "create_campaign",
  "Create a new campaign. Note: cover images cannot be set via the public API — they must be uploaded through the Givebutter dashboard after creation.",
  {
    title: z.string().max(150).describe("Campaign title"),
    type: z.enum(["general", "collect", "fundraise", "event"]).describe(campaignTypeDescription),
    subtitle: z.string().max(255).optional().describe("Campaign subtitle"),
    campaign_description: z.string().optional().describe("The campaign body HTML. This becomes the public donor-facing content on givebutter.com — write the actual content, not metadata or reasoning notes."),
    website: z.string().url().max(255).optional().describe("Campaign website URL"),
    slug: z.string().max(255).optional().describe("Custom URL slug. Note: Givebutter may append the auto-generated campaign code as a suffix if the slug conflicts with an existing campaign (observed empirically; not in the official docs)."),
    goal: z.number().int().min(0).optional().describe("Fundraising goal in whole dollars (e.g. 1200 for a $1,200 goal — the API does NOT use cents). Set to 0 to clear the goal; Givebutter stores 0 as null."),
    end_at: z.string().optional().describe("End date in ISO 8601 format"),
    beneficiary_id: z.number().int().optional().describe("Beneficiary account ID"),
    timezone: z.string().max(255).optional().describe("Campaign timezone (e.g., America/New_York)"),
    currency: z.string().optional().describe("Currency code. USD is the only currently-supported value as of 2026-04-30; loosened to a string to avoid breaking if Givebutter expands."),
    settings: campaignSettingsSchema,
  },
  async ({ title, type, subtitle, campaign_description, website, slug, goal, end_at, beneficiary_id, timezone, currency, settings }) => {
    const body = buildBody({ title, type, subtitle, description: campaign_description, website, slug, goal, end_at, beneficiary_id, timezone, currency, settings });
    const result = await apiRequest("/campaigns", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_campaign",
  "Update an existing campaign. Partial updates supported — only supply the fields you want to change. (The endpoint is documented as PUT but Givebutter applies it as a partial update; omitted fields are preserved.) Note: cover images cannot be set via the public API — they must be uploaded through the Givebutter dashboard.",
  {
    campaign_id: z.number().describe("The campaign ID"),
    title: z.string().max(150).optional().describe("Campaign title"),
    type: z.enum(["general", "collect", "fundraise", "event"]).optional().describe(campaignTypeDescription),
    subtitle: z.string().max(255).optional().describe("Campaign subtitle"),
    campaign_description: z.string().optional().describe("The campaign body HTML. This becomes the public donor-facing content on givebutter.com — write the actual content, not metadata or reasoning notes."),
    website: z.string().url().max(255).optional().describe("Campaign website URL"),
    slug: z.string().max(255).optional().describe("Custom URL slug. Note: Givebutter may append the auto-generated campaign code as a suffix if the slug conflicts with an existing campaign (observed empirically; not in the official docs)."),
    goal: z.number().int().min(0).optional().describe("Fundraising goal in whole dollars (e.g. 1200 for a $1,200 goal — the API does NOT use cents). Set to 0 to clear the goal; Givebutter stores 0 as null."),
    end_at: z.string().optional().describe("End date in ISO 8601 format"),
    beneficiary_id: z.number().int().optional().describe("Beneficiary account ID"),
    timezone: z.string().max(255).optional().describe("Campaign timezone"),
    currency: z.string().optional().describe("Currency code. USD is the only currently-supported value as of 2026-04-30; loosened to a string to avoid breaking if Givebutter expands."),
    settings: campaignSettingsSchema,
  },
  async ({ campaign_id, title, type, subtitle, campaign_description, website, slug, goal, end_at, beneficiary_id, timezone, currency, settings }) => {
    const body = buildBody({ title, type, subtitle, description: campaign_description, website, slug, goal, end_at, beneficiary_id, timezone, currency, settings });
    const result = await apiRequest(`/campaigns/${campaign_id}`, "PUT", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_campaign",
  "Delete a campaign. Constraints: (1) the API key must own the campaign — campaigns from sub-accounts, beneficiaries, or chapters return 404 even if visible elsewhere; (2) campaigns that have raised money cannot be deleted (the API returns 409 'This campaign has already raised money, and can not be deleted.'). A 404 typically means scope/permission, not a wrapper bug.",
  {
    campaign_id: z.number().describe("The campaign ID to delete"),
  },
  async ({ campaign_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ CONTACTS ============

server.tool(
  "list_contacts",
  "List all contacts in your Givebutter account",
  {
    page: z.number().optional().describe("Page number for pagination"),
    email: z.string().optional().describe("Filter by email address"),
  },
  async ({ page, email }) => {
    const result = await apiRequest("/contacts", "GET", undefined, { page, email });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_contact",
  "Get details of a specific contact by ID",
  {
    contact_id: z.number().describe("The contact ID"),
  },
  async ({ contact_id }) => {
    const result = await apiRequest(`/contacts/${contact_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_contact",
  "Create a new contact",
  {
    email: z.string().describe("Contact email address"),
    first_name: z.string().optional().describe("Contact first name"),
    last_name: z.string().optional().describe("Contact last name"),
    phone: z.string().optional().describe("Contact phone number"),
    address_line1: z.string().optional().describe("Street address line 1"),
    address_line2: z.string().optional().describe("Street address line 2"),
    city: z.string().optional().describe("City"),
    state: z.string().optional().describe("State/Province"),
    zipcode: z.string().optional().describe("ZIP/Postal code"),
    country: z.string().optional().describe("Country code (e.g., US)"),
  },
  async ({ email, first_name, last_name, phone, address_line1, address_line2, city, state, zipcode, country }) => {
    const body: Record<string, unknown> = { email };
    if (first_name) body.first_name = first_name;
    if (last_name) body.last_name = last_name;
    if (phone) body.phone = phone;
    if (address_line1) body.address_line1 = address_line1;
    if (address_line2) body.address_line2 = address_line2;
    if (city) body.city = city;
    if (state) body.state = state;
    if (zipcode) body.zipcode = zipcode;
    if (country) body.country = country;

    const result = await apiRequest("/contacts", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_contact",
  "Update an existing contact",
  {
    contact_id: z.number().describe("The contact ID"),
    email: z.string().optional().describe("Contact email address"),
    first_name: z.string().optional().describe("Contact first name"),
    last_name: z.string().optional().describe("Contact last name"),
    phone: z.string().optional().describe("Contact phone number"),
    address_line1: z.string().optional().describe("Street address line 1"),
    address_line2: z.string().optional().describe("Street address line 2"),
    city: z.string().optional().describe("City"),
    state: z.string().optional().describe("State/Province"),
    zipcode: z.string().optional().describe("ZIP/Postal code"),
    country: z.string().optional().describe("Country code"),
  },
  async ({ contact_id, email, first_name, last_name, phone, address_line1, address_line2, city, state, zipcode, country }) => {
    const body = buildBody({ email, first_name, last_name, phone, address_line1, address_line2, city, state, zipcode, country });
    const result = await apiRequest(`/contacts/${contact_id}`, "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_contact",
  "Archive a contact (soft delete — recoverable via restore_contact). A 404 typically means the contact is not in this API key's scope, not a wrapper bug.",
  {
    contact_id: z.number().describe("The contact ID to archive"),
  },
  async ({ contact_id }) => {
    const result = await apiRequest(`/contacts/${contact_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "restore_contact",
  "Restore an archived contact",
  {
    contact_id: z.number().describe("The contact ID to restore"),
  },
  async ({ contact_id }) => {
    const result = await apiRequest(`/contacts/${contact_id}/restore`, "PATCH");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ CONTACT ACTIVITIES ============

// Source: docs.givebutter.com/api-reference/contact-activities/create-a-contact-activity (verified 2026-04-30)
const contactActivityTypeEnum = z.enum([
  "email", "meeting", "note", "phone_call", "sms",
  "completed_task", "volunteer_activity",
]);

server.tool(
  "list_contact_activities",
  "List all activities for a contact",
  {
    contact_id: z.number().describe("The contact ID"),
    type: contactActivityTypeEnum.optional().describe("Filter by activity type"),
  },
  async ({ contact_id, type }) => {
    const result = await apiRequest(`/contacts/${contact_id}/activities`, "GET", undefined, { type });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_contact_activity",
  "Get details of a specific contact activity",
  {
    contact_id: z.number().describe("The contact ID"),
    activity_id: z.number().describe("The activity ID"),
  },
  async ({ contact_id, activity_id }) => {
    const result = await apiRequest(`/contacts/${contact_id}/activities/${activity_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_contact_activity",
  "Log a new activity for a contact (note, meeting, call, etc.)",
  {
    contact_id: z.number().describe("The contact ID"),
    type: contactActivityTypeEnum.describe("Activity type"),
    note: z.string().max(255).optional().describe("Activity note (max 255 chars)"),
    subject: z.string().max(255).optional().describe("Activity subject (max 255 chars)"),
    occurred_at: z.string().optional().describe("When the activity occurred, ISO 8601"),
    timezone: z.string().max(255).optional().describe("Timezone for occurred_at"),
  },
  async ({ contact_id, ...fields }) => {
    const body = buildBody(fields);
    const result = await apiRequest(`/contacts/${contact_id}/activities`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_contact_activity",
  "Update an existing contact activity",
  {
    contact_id: z.number().describe("The contact ID"),
    activity_id: z.number().describe("The activity ID"),
    type: contactActivityTypeEnum.optional().describe("Activity type"),
    note: z.string().max(255).optional().describe("Activity note (max 255 chars)"),
    subject: z.string().max(255).optional().describe("Activity subject (max 255 chars)"),
    occurred_at: z.string().optional().describe("When the activity occurred, ISO 8601"),
    timezone: z.string().max(255).optional().describe("Timezone for occurred_at"),
  },
  async ({ contact_id, activity_id, ...fields }) => {
    const body = buildBody(fields);
    const result = await apiRequest(`/contacts/${contact_id}/activities/${activity_id}`, "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_contact_activity",
  "Delete a contact activity. A 404 typically means scope/permission, not a wrapper bug. May return 422 with field-level errors for validation failures.",
  {
    contact_id: z.number().describe("The contact ID"),
    activity_id: z.number().describe("The activity ID to delete"),
  },
  async ({ contact_id, activity_id }) => {
    const result = await apiRequest(`/contacts/${contact_id}/activities/${activity_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ CONTACT TAGS ============

server.tool(
  "add_contact_tags",
  "Add tags to a contact",
  {
    contact_id: z.number().describe("The contact ID"),
    tags: z.array(z.string().max(64)).min(1).describe("Array of tag strings to add"),
  },
  async ({ contact_id, tags }) => {
    const result = await apiRequest(`/contacts/${contact_id}/tags/add`, "POST", { tags });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "remove_contact_tags",
  "Remove tags from a contact",
  {
    contact_id: z.number().describe("The contact ID"),
    tags: z.array(z.string().max(64)).min(1).describe("Array of tag strings to remove"),
  },
  async ({ contact_id, tags }) => {
    const result = await apiRequest(`/contacts/${contact_id}/tags/remove`, "POST", { tags });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "sync_contact_tags",
  "Sync tags for a contact (replaces all existing tags)",
  {
    contact_id: z.number().describe("The contact ID"),
    tags: z.array(z.string().max(64)).min(1).describe("Array of tag strings to sync (replaces existing tags)"),
  },
  async ({ contact_id, tags }) => {
    const result = await apiRequest(`/contacts/${contact_id}/tags/sync`, "POST", { tags });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ TRANSACTIONS ============

// Source: docs.givebutter.com/api-reference/transactions/create-a-transaction (verified 2026-04-30)
const paymentMethodEnum = z.enum([
  "ach", "card", "cash", "check", "digital_wallet", "donor_advised_fund",
  "paypal", "venmo", "cashapp", "terminal", "stock", "in-kind",
  "property", "other", "none",
]);

const dedicationTypeEnum = z.enum(["in_memory_of", "in_honor_of"]);

const dedicationObjectSchema = z.object({
  type: dedicationTypeEnum,
  name: z.string().max(255),
  recipient_name: z.string().max(255).nullable().optional(),
  recipient_email: z.string().email().nullable().optional(),
});

server.tool(
  "list_transactions",
  "List all transactions with optional filters, sort, and pagination.",
  {
    page: z.number().optional().describe("Page number (1-indexed)"),
    per_page: z.number().int().min(1).max(100).optional().describe("Items per page (default 20, max 100)"),
    campaign_id: z.number().optional().describe("Filter by campaign ID (undocumented but historically supported)"),
    contact_id: z.number().optional().describe("Filter by contact ID (undocumented but historically supported)"),
    transactedAfter: z.string().optional().describe("Only transactions transacted at or after this ISO 8601 datetime"),
    transactedBefore: z.string().optional().describe("Only transactions transacted at or before this ISO 8601 datetime"),
    createdAfter: z.string().optional().describe("Only transactions created at or after this ISO 8601 datetime"),
    createdBefore: z.string().optional().describe("Only transactions created at or before this ISO 8601 datetime"),
    updatedAfter: z.string().optional().describe("Only transactions updated at or after this ISO 8601 datetime"),
    updatedBefore: z.string().optional().describe("Only transactions updated at or before this ISO 8601 datetime"),
    checkDepositedAfter: z.string().optional().describe("Only transactions with check_deposited_at at or after this ISO 8601 datetime"),
    checkDepositedBefore: z.string().optional().describe("Only transactions with check_deposited_at at or before this ISO 8601 datetime"),
    method: paymentMethodEnum.optional().describe("Filter by payment method"),
    scope: z.enum(["all", "benefiting", "chapters"]).optional().describe("Transaction scope: all, benefiting, chapters"),
    sortBy: z.enum(["amount", "transacted_at", "created_at", "contact_name"]).optional().describe("Sort field (ascending)"),
    sortByDesc: z.enum(["amount", "transacted_at", "created_at", "contact_name"]).optional().describe("Sort field (descending)"),
    contacts: z.string().optional().describe("Comma-separated list of contact IDs to filter by"),
  },
  async (args) => {
    const result = await apiRequest("/transactions", "GET", undefined, {
      ...args,
      campaign_id: args.campaign_id?.toString(),
      contact_id: args.contact_id?.toString(),
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_transaction",
  "Get details of a specific transaction by ID",
  {
    transaction_id: z.number().describe("The transaction ID"),
  },
  async ({ transaction_id }) => {
    const result = await apiRequest(`/transactions/${transaction_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_transaction",
  "Create a manual/offline transaction",
  {
    method: paymentMethodEnum.describe("Payment method"),
    transacted_at: z.string().describe("Transaction date in ISO 8601 format"),
    amount: z.string().describe("Transaction amount as a decimal string (e.g. '25.00')"),
    campaign_code: z.string().optional().describe("Campaign code to associate the transaction with"),
    campaign_title: z.string().max(255).optional().describe("Campaign title (creates a campaign if code not found)"),
    campaign_team_id: z.number().int().optional().describe("Campaign team ID"),
    team_member_id: z.number().int().optional().describe("Team member ID"),
    contact_id: z.number().int().optional().describe("Contact ID"),
    contact_external_id: z.string().max(255).optional().describe("External contact ID"),
    fund_code: z.string().max(255).optional().describe("Fund code"),
    mark_deposited: z.boolean().optional().describe("Mark transaction as deposited"),
    timezone: z.string().optional().describe("Timezone for the transaction"),
    acknowledged_at: z.string().optional().describe("Acknowledgement date in ISO 8601 format"),
    external_label: z.string().max(255).optional().describe("External label"),
    external_id: z.string().max(255).optional().describe("External ID"),
    contact_contact_since: z.string().optional().describe("Contact-since date in ISO 8601 format"),
    fee_covered: z.string().optional().describe("Fee covered amount as decimal string"),
    platform_fee: z.string().optional().describe("Platform fee as decimal string"),
    processing_fee: z.string().optional().describe("Processing fee as decimal string"),
    check_number: z.string().max(255).optional().describe("Check number"),
    check_deposited_at: z.string().optional().describe("Check deposited date in ISO 8601 format"),
    company: z.string().max(255).optional().describe("Donor company"),
    internal_note: z.string().max(255).optional().describe("Internal note"),
    first_name: z.string().max(255).optional().describe("Donor first name"),
    last_name: z.string().max(255).optional().describe("Donor last name"),
    email: z.string().max(255).optional().describe("Donor email"),
    phone: z.string().optional().describe("Donor phone"),
    address_1: z.string().max(255).optional().describe("Address line 1"),
    address_2: z.string().max(255).optional().describe("Address line 2"),
    city: z.string().max(255).optional().describe("City"),
    state: z.string().max(255).optional().describe("State"),
    zipcode: z.string().max(255).optional().describe("Zip / postal code"),
    country: z.string().optional().describe("Country"),
    dedication_type: dedicationTypeEnum.optional().describe("Dedication type"),
    dedication_name: z.string().max(255).optional().describe("Dedication name"),
    dedication_recipient_name: z.string().max(255).optional().describe("Dedication recipient name"),
    dedication_recipient_email: z.string().optional().describe("Dedication recipient email"),
    giving_space_message: z.string().max(65535).optional().describe("Giving space message"),
    appeal_code: z.string().max(255).optional().describe("Appeal code"),
    appeal_name: z.string().max(255).optional().describe("Appeal name"),
    appeal_status: z.string().optional().describe("Appeal status"),
  },
  async (fields) => {
    const body = buildBody(fields);
    const result = await apiRequest("/transactions", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_transaction",
  "Update an existing transaction",
  {
    transaction_id: z.string().describe("The transaction ID"),
    internal_note: z.string().max(255).optional().describe("Internal note (max 255 chars)"),
    check_number: z.string().max(255).optional().describe("Check number (max 255 chars)"),
    check_deposited_at: z.string().optional().describe("Check deposited date in ISO 8601 format"),
    team_id: z.string().optional().describe("Team ID"),
    campaign_member_id: z.string().optional().describe("Campaign member ID"),
    fund_id: z.string().optional().describe("Fund ID"),
    campaign_id: z.string().optional().describe("Campaign ID"),
    method: paymentMethodEnum.optional().describe("Payment method"),
    transacted_at: z.string().optional().describe("Transaction date in ISO 8601 format"),
    appeal_id: z.string().optional().describe("Appeal ID"),
    offline_payment_received: z.string().optional().describe("Offline payment received"),
    custom_fields: z.array(z.string()).optional().describe("Custom field values"),
    dedication: dedicationObjectSchema.optional().describe("Dedication object — all four fields required if supplied"),
  },
  async ({ transaction_id, ...fields }) => {
    const body = buildBody(fields);
    const result = await apiRequest(`/transactions/${transaction_id}`, "PUT", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ CAMPAIGN MEMBERS ============

server.tool(
  "list_campaign_members",
  "List all members of a campaign",
  {
    campaign_id: z.number().describe("The campaign ID"),
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ campaign_id, page }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/members`, "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_campaign_member",
  "Get details of a specific campaign member",
  {
    campaign_id: z.number().describe("The campaign ID"),
    member_id: z.number().describe("The member ID"),
  },
  async ({ campaign_id, member_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/members/${member_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_campaign_member",
  "Remove a member from a campaign. A 404 typically means the campaign or member is not in this API key's scope, not a wrapper bug.",
  {
    campaign_id: z.number().describe("The campaign ID"),
    member_id: z.number().describe("The member ID to remove"),
  },
  async ({ campaign_id, member_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/members/${member_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ CAMPAIGN TEAMS ============

server.tool(
  "list_campaign_teams",
  "List all teams in a campaign",
  {
    campaign_id: z.number().describe("The campaign ID"),
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ campaign_id, page }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/teams`, "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_campaign_team",
  "Get details of a specific team in a campaign",
  {
    campaign_id: z.number().describe("The campaign ID"),
    team_id: z.number().describe("The team ID"),
  },
  async ({ campaign_id, team_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/teams/${team_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_campaign_team",
  "Delete a team from a campaign. A 404 typically means the campaign or team is not in this API key's scope, not a wrapper bug.",
  {
    campaign_id: z.number().describe("The campaign ID"),
    team_id: z.number().describe("The team ID to delete"),
  },
  async ({ campaign_id, team_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/teams/${team_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ CAMPAIGN TICKETS ============

server.tool(
  "list_campaign_tickets",
  "List all tickets for a campaign",
  {
    campaign_id: z.number().describe("The campaign ID"),
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ campaign_id, page }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/items/tickets`, "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_campaign_ticket",
  "Get details of a specific campaign ticket",
  {
    campaign_id: z.number().describe("The campaign ID"),
    ticket_id: z.number().describe("The ticket ID"),
  },
  async ({ campaign_id, ticket_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/items/tickets/${ticket_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_campaign_ticket",
  "Create a new ticket for a campaign",
  {
    campaign_id: z.number().describe("The campaign ID"),
    name: z.string().max(255).describe("Ticket name"),
    price: z.number().min(0).describe("Ticket price"),
    total_quantity: z.number().min(0).optional().describe("Total quantity available"),
    subtype: z.enum(["physical", "digital", "hybrid"]).optional().describe("Ticket subtype"),
    active: z.boolean().optional().describe("Whether the ticket is active"),
    retail_price: z.number().min(0).optional().describe("Retail price"),
    description: z.string().max(5000).optional().describe("Ticket description (max 5000 chars)"),
    bundle_only: z.boolean().optional().describe("Whether the ticket is bundle-only"),
    hide_remaining: z.boolean().optional().describe("Whether to hide remaining quantity"),
    scope: z.enum(["registrant", "event"]).optional().describe("Ticket scope"),
  },
  async ({ campaign_id, name, price, ...fields }) => {
    const body: Record<string, unknown> = { name, price, ...buildBody(fields) };
    const result = await apiRequest(`/campaigns/${campaign_id}/items/tickets`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ CAMPAIGN DISCOUNT CODES ============

server.tool(
  "list_discount_codes",
  "List all discount codes for a campaign",
  {
    campaign_id: z.number().describe("The campaign ID"),
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ campaign_id, page }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/discount-codes`, "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_discount_code",
  "Get details of a specific discount code",
  {
    campaign_id: z.number().describe("The campaign ID"),
    discount_code_id: z.number().describe("The discount code ID"),
  },
  async ({ campaign_id, discount_code_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/discount-codes/${discount_code_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_discount_code",
  "Create a new discount code for a campaign",
  {
    campaign_id: z.number().describe("The campaign ID"),
    code: z.string().max(255).describe("The discount code string"),
    type: z.enum(["percentage", "fixed"]).describe("Discount type"),
    amount: z.number().min(1).describe("Discount amount"),
    active: z.boolean().describe("Whether the code is active"),
    uses: z.number().min(1).optional().describe("Maximum number of uses"),
    starts_at: z.string().optional().describe("Start date in ISO 8601 format"),
    expires_at: z.string().optional().describe("Expiry date in ISO 8601 format"),
  },
  async ({ campaign_id, code, type, amount, active, ...fields }) => {
    const body: Record<string, unknown> = { code, type, amount, active, ...buildBody(fields) };
    const result = await apiRequest(`/campaigns/${campaign_id}/discount-codes`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_discount_code",
  "Update an existing discount code",
  {
    campaign_id: z.number().describe("The campaign ID"),
    discount_code_id: z.number().describe("The discount code ID"),
    amount: z.number().min(1).max(100).describe("Discount amount (required for update)"),
    code: z.string().max(255).optional().describe("The discount code string"),
    type: z.enum(["percentage", "fixed"]).optional().describe("Discount type"),
    active: z.boolean().optional().describe("Whether the code is active"),
    uses: z.number().min(1).optional().describe("Maximum number of uses"),
    starts_at: z.string().optional().describe("Start date in ISO 8601 format"),
    expires_at: z.string().optional().describe("Expiry date in ISO 8601 format"),
  },
  async ({ campaign_id, discount_code_id, amount, ...fields }) => {
    const body: Record<string, unknown> = { amount, ...buildBody(fields) };
    const result = await apiRequest(`/campaigns/${campaign_id}/discount-codes/${discount_code_id}`, "PUT", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_discount_code",
  "Delete a discount code. Constraints: (1) the API returns 422 'Cannot delete a discount code that has been used. Please update its status to inactive.' if the code has been used — call update_discount_code with active:false instead; (2) a 404 typically means scope/permission, not a wrapper bug.",
  {
    campaign_id: z.number().describe("The campaign ID"),
    discount_code_id: z.number().describe("The discount code ID to delete"),
  },
  async ({ campaign_id, discount_code_id }) => {
    const result = await apiRequest(`/campaigns/${campaign_id}/discount-codes/${discount_code_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ HOUSEHOLDS ============

server.tool(
  "list_households",
  "List all households",
  {
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ page }) => {
    const result = await apiRequest("/households", "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_household",
  "Get details of a specific household",
  {
    household_id: z.number().describe("The household ID"),
  },
  async ({ household_id }) => {
    const result = await apiRequest(`/households/${household_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_household",
  "Create a new household",
  {
    name: z.string().max(255).describe("Household name"),
    head_contact_id: z.number().optional().describe("Head contact ID"),
    note: z.string().optional().describe("Note about the household"),
    envelope_name: z.string().max(255).optional().describe("Envelope name for mailings"),
  },
  async ({ name, ...fields }) => {
    const body: Record<string, unknown> = { name, ...buildBody(fields) };
    const result = await apiRequest("/households", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_household",
  "Update an existing household",
  {
    household_id: z.number().describe("The household ID"),
    name: z.string().max(255).optional().describe("Household name"),
    head_contact_id: z.number().optional().describe("Head contact ID"),
    note: z.string().optional().describe("Note about the household"),
    envelope_name: z.string().max(255).optional().describe("Envelope name for mailings"),
  },
  async ({ household_id, ...fields }) => {
    const body = buildBody(fields);
    const result = await apiRequest(`/households/${household_id}`, "PUT", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_household",
  "Delete a household. A 404 typically means the household is not in this API key's scope, not a wrapper bug.",
  {
    household_id: z.number().describe("The household ID to delete"),
  },
  async ({ household_id }) => {
    const result = await apiRequest(`/households/${household_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ HOUSEHOLD CONTACTS ============

server.tool(
  "list_household_contacts",
  "List all contacts associated with a household",
  {
    household_id: z.number().describe("The household ID"),
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ household_id, page }) => {
    const result = await apiRequest(`/households/${household_id}/contacts`, "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_household_contact",
  "Get a specific contact associated with a household",
  {
    household_id: z.number().describe("The household ID"),
    contact_id: z.number().describe("The contact ID"),
  },
  async ({ household_id, contact_id }) => {
    const result = await apiRequest(`/households/${household_id}/contacts/${contact_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "add_household_contact",
  "Add a contact to a household",
  {
    household_id: z.number().describe("The household ID"),
    contact_id: z.number().describe("The contact ID to add"),
  },
  async ({ household_id, contact_id }) => {
    const result = await apiRequest(`/households/${household_id}/contacts`, "POST", { contact_id });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "remove_household_contact",
  "Remove a contact from a household. Returns the updated household with its remaining contacts. A 404 typically means scope/permission, not a wrapper bug.",
  {
    household_id: z.number().describe("The household ID"),
    contact_id: z.number().describe("The contact ID to remove"),
  },
  async ({ household_id, contact_id }) => {
    const result = await apiRequest(`/households/${household_id}/contacts/${contact_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ MESSAGES ============

server.tool(
  "list_messages",
  "List all messages",
  {
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ page }) => {
    const result = await apiRequest("/messages", "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_message",
  "Get details of a specific message",
  {
    message_id: z.number().describe("The message ID"),
  },
  async ({ message_id }) => {
    const result = await apiRequest(`/messages/${message_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ WEBHOOKS ============

const webhookEventEnum = z.enum([
  "campaign.created", "campaign.updated", "ticket.created",
  "transaction.succeeded", "contact.created", "plan.canceled",
  "plan.created", "plan.paused", "plan.resumed", "plan.updated"
]);

server.tool(
  "list_webhooks",
  "List all webhooks",
  {
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ page }) => {
    const result = await apiRequest("/webhooks", "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_webhook",
  "Get details of a specific webhook",
  {
    webhook_id: z.string().describe("The webhook ID"),
  },
  async ({ webhook_id }) => {
    const result = await apiRequest(`/webhooks/${webhook_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_webhook",
  "Create a new webhook",
  {
    url: z.string().url().describe("The webhook URL to receive events"),
    events: z.array(webhookEventEnum).optional().describe("Array of event types to subscribe to"),
    event: webhookEventEnum.optional().describe("Single event type to subscribe to"),
    name: z.string().max(255).optional().describe("Webhook name"),
    enabled: z.boolean().optional().describe("Whether the webhook is enabled"),
  },
  async ({ url, events, event, name, enabled }) => {
    const body: Record<string, unknown> = { url };
    if (events !== undefined) body.events = events;
    if (event !== undefined) body.event = event;
    if (name !== undefined) body.name = name;
    if (enabled !== undefined) body.enabled = enabled;

    const result = await apiRequest("/webhooks", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_webhook",
  "Update an existing webhook",
  {
    webhook_id: z.string().describe("The webhook ID"),
    url: z.string().url().describe("The webhook URL (required for update)"),
    events: z.array(webhookEventEnum).describe("Array of event types (required for update)"),
    name: z.string().max(255).optional().describe("Webhook name"),
    enabled: z.boolean().optional().describe("Whether the webhook is enabled"),
  },
  async ({ webhook_id, url, events, name, enabled }) => {
    const body: Record<string, unknown> = { url, events };
    if (name !== undefined) body.name = name;
    if (enabled !== undefined) body.enabled = enabled;

    const result = await apiRequest(`/webhooks/${webhook_id}`, "PUT", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_webhook",
  "Delete a webhook. A 404 typically means the webhook is not in this API key's scope, not a wrapper bug.",
  {
    webhook_id: z.string().describe("The webhook ID to delete"),
  },
  async ({ webhook_id }) => {
    const result = await apiRequest(`/webhooks/${webhook_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ WEBHOOK ACTIVITIES ============

server.tool(
  "list_webhook_activities",
  "List all activities for a webhook",
  {
    webhook_id: z.string().describe("The webhook ID"),
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ webhook_id, page }) => {
    const result = await apiRequest(`/webhooks/${webhook_id}/activities`, "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_webhook_activity",
  "Get details of a specific webhook activity",
  {
    webhook_id: z.string().describe("The webhook ID"),
    activity_id: z.string().describe("The activity ID"),
  },
  async ({ webhook_id, activity_id }) => {
    const result = await apiRequest(`/webhooks/${webhook_id}/activities/${activity_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ PLEDGES ============

server.tool(
  "list_pledges",
  "List all pledges",
  {
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ page }) => {
    const result = await apiRequest("/pledges", "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_pledge",
  "Get details of a specific pledge",
  {
    pledge_id: z.number().describe("The pledge ID"),
  },
  async ({ pledge_id }) => {
    const result = await apiRequest(`/pledges/${pledge_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ TICKETS ============

server.tool(
  "list_tickets",
  "List all tickets",
  {
    page: z.number().optional().describe("Page number for pagination"),
    campaign_id: z.number().optional().describe("Filter by campaign ID"),
  },
  async ({ page, campaign_id }) => {
    const result = await apiRequest("/tickets", "GET", undefined, {
      page,
      campaign_id: campaign_id?.toString()
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_ticket",
  "Get details of a specific ticket",
  {
    ticket_id: z.number().describe("The ticket ID"),
  },
  async ({ ticket_id }) => {
    const result = await apiRequest(`/tickets/${ticket_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ PAYOUTS ============

server.tool(
  "list_payouts",
  "List all payouts",
  {
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ page }) => {
    const result = await apiRequest("/payouts", "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_payout",
  "Get details of a specific payout",
  {
    payout_id: z.number().describe("The payout ID"),
  },
  async ({ payout_id }) => {
    const result = await apiRequest(`/payouts/${payout_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ PLANS (Recurring Donations) ============

server.tool(
  "list_plans",
  "List all recurring donation plans",
  {
    page: z.number().optional().describe("Page number for pagination"),
    contact_id: z.number().optional().describe("Filter by contact ID"),
  },
  async ({ page, contact_id }) => {
    const result = await apiRequest("/plans", "GET", undefined, {
      page,
      contact_id: contact_id?.toString()
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_plan",
  "Get details of a specific recurring donation plan",
  {
    plan_id: z.number().describe("The plan ID"),
  },
  async ({ plan_id }) => {
    const result = await apiRequest(`/plans/${plan_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============ FUNDS ============

server.tool(
  "list_funds",
  "List all funds/designations",
  {
    page: z.number().optional().describe("Page number for pagination"),
  },
  async ({ page }) => {
    const result = await apiRequest("/funds", "GET", undefined, { page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_fund",
  "Get details of a specific fund",
  {
    fund_id: z.number().describe("The fund ID"),
  },
  async ({ fund_id }) => {
    const result = await apiRequest(`/funds/${fund_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "create_fund",
  "Create a new fund/designation",
  {
    name: z.string().max(255).describe("Fund name"),
    code: z.string().max(255).optional().describe("Fund code"),
  },
  async ({ name, code }) => {
    const body: Record<string, unknown> = { name };
    if (code !== undefined) body.code = code;

    const result = await apiRequest("/funds", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_fund",
  "Update an existing fund/designation",
  {
    fund_id: z.string().describe("The fund ID"),
    name: z.string().max(255).describe("Fund name (required for update)"),
    code: z.string().max(255).optional().describe("Fund code"),
  },
  async ({ fund_id, name, code }) => {
    const body: Record<string, unknown> = { name };
    if (code !== undefined) body.code = code;

    const result = await apiRequest(`/funds/${fund_id}`, "PUT", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_fund",
  "Delete a fund/designation. A 404 typically means the fund is not in this API key's scope, not a wrapper bug.",
  {
    fund_id: z.string().describe("The fund ID to delete"),
  },
  async ({ fund_id }) => {
    const result = await apiRequest(`/funds/${fund_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Givebutter MCP server running on stdio");
}

main().catch(console.error);
