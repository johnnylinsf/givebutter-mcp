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

  // Handle 204 No Content
  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
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
    page: z.number().optional().describe("Page number for pagination"),
    scope: z.enum(["owned", "beneficiary", "chapter"]).optional().describe("Filter by campaign scope"),
  },
  async ({ page, scope }) => {
    const result = await apiRequest("/campaigns", "GET", undefined, { page, scope });
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

server.tool(
  "create_campaign",
  "Create a new campaign",
  {
    title: z.string().describe("Campaign title"),
    type: z.enum(["standard", "event", "sweepstakes", "p2p"]).describe("Campaign type - affects pricing tier"),
    goal: z.number().optional().describe("Fundraising goal in cents"),
    description: z.string().optional().describe("Campaign description"),
    end_at: z.string().optional().describe("End date in ISO 8601 format"),
  },
  async ({ title, type, goal, description, end_at }) => {
    const body: Record<string, unknown> = { title, type };
    if (goal !== undefined) body.goal = goal;
    if (description !== undefined) body.description = description;
    if (end_at !== undefined) body.end_at = end_at;

    const result = await apiRequest("/campaigns", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_campaign",
  "Update an existing campaign",
  {
    campaign_id: z.number().describe("The campaign ID"),
    title: z.string().optional().describe("Campaign title"),
    goal: z.number().optional().describe("Fundraising goal in cents"),
    description: z.string().optional().describe("Campaign description"),
    end_at: z.string().optional().describe("End date in ISO 8601 format"),
  },
  async ({ campaign_id, title, goal, description, end_at }) => {
    const body = buildBody({ title, goal, description, end_at });
    const result = await apiRequest(`/campaigns/${campaign_id}`, "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "delete_campaign",
  "Delete a campaign",
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
  "Archive a contact (soft delete)",
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

server.tool(
  "list_contact_activities",
  "List all activities for a contact",
  {
    contact_id: z.number().describe("The contact ID"),
    type: z.enum([
      "archived", "campaign.joined", "email", "email.subscribed", "email.unsubscribed",
      "letter", "meeting", "note", "phone_call", "recurring_plan.canceled",
      "recurring_plan.created", "recurring_plan.activated", "signup_form.submitted",
      "sms", "sms.subscribed", "sms.unsubscribed", "subscription_form.submitted",
      "completed_task", "ticket.issued", "transaction.recieved", "transaction.succeeded",
      "transaction.acknowledged", "transaction.unacknowledged", "unarchived",
      "volunteer_activity", "soft_credited"
    ]).optional().describe("Filter by activity type"),
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
  "delete_contact_activity",
  "Delete a contact activity",
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

server.tool(
  "list_transactions",
  "List all transactions",
  {
    page: z.number().optional().describe("Page number for pagination"),
    campaign_id: z.number().optional().describe("Filter by campaign ID"),
    contact_id: z.number().optional().describe("Filter by contact ID"),
  },
  async ({ page, campaign_id, contact_id }) => {
    const result = await apiRequest("/transactions", "GET", undefined, {
      page,
      campaign_id: campaign_id?.toString(),
      contact_id: contact_id?.toString()
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
    method: z.string().optional().describe("Payment method"),
    transacted_at: z.string().optional().describe("Transaction date"),
    appeal_id: z.string().optional().describe("Appeal ID"),
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
  "Remove a member from a campaign",
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
  "Delete a team from a campaign",
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
  "Delete a discount code (cannot delete codes already used - deactivate instead)",
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
  "Delete a household",
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
  "Remove a contact from a household",
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
  "Delete a webhook",
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
  "Delete a fund/designation",
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
