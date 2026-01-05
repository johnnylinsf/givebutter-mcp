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

// Create MCP server
const server = new McpServer({
  name: "givebutter-mcp",
  version: "1.0.0",
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
    if (description) body.description = description;
    if (end_at) body.end_at = end_at;

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
    const body: Record<string, unknown> = {};
    if (title) body.title = title;
    if (goal !== undefined) body.goal = goal;
    if (description) body.description = description;
    if (end_at) body.end_at = end_at;

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
    city: z.string().optional().describe("City"),
    state: z.string().optional().describe("State/Province"),
    zipcode: z.string().optional().describe("ZIP/Postal code"),
    country: z.string().optional().describe("Country code"),
  },
  async ({ contact_id, email, first_name, last_name, phone, address_line1, city, state, zipcode, country }) => {
    const body: Record<string, unknown> = {};
    if (email) body.email = email;
    if (first_name) body.first_name = first_name;
    if (last_name) body.last_name = last_name;
    if (phone) body.phone = phone;
    if (address_line1) body.address_line1 = address_line1;
    if (city) body.city = city;
    if (state) body.state = state;
    if (zipcode) body.zipcode = zipcode;
    if (country) body.country = country;

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

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Givebutter MCP server running on stdio");
}

main().catch(console.error);
