# Givebutter MCP Server

A Model Context Protocol (MCP) server that provides integration with the [Givebutter](https://givebutter.com) fundraising platform API. This allows AI assistants like Claude to interact with your Givebutter account to manage campaigns, contacts, transactions, and more.

## Features

- **Campaigns**: List, create, update, and delete fundraising campaigns
- **Contacts**: Manage donor contacts and their information
- **Transactions**: View donation transactions and their details
- **Campaign Members**: Manage peer-to-peer fundraising members
- **Campaign Teams**: View and manage fundraising teams
- **Tickets**: Access event ticket information
- **Payouts**: View payout history
- **Plans**: Manage recurring donation plans
- **Funds**: View fund designations

## Installation

```bash
git clone https://github.com/johnnylinsf/givebutter-mcp.git
cd givebutter-mcp
npm install
npm run build
```

## Configuration

### Get Your Givebutter API Key

1. Log in to your [Givebutter account](https://givebutter.com)
2. Go to **Settings** > **Integrations** > **API**
3. Generate a new API key or copy your existing one

### Configure with Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "givebutter": {
      "command": "node",
      "args": ["/path/to/givebutter-mcp/dist/index.js"],
      "env": {
        "GIVEBUTTER_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Configure with Claude Code

```bash
claude mcp add givebutter -e GIVEBUTTER_API_KEY=your-api-key -- node /path/to/givebutter-mcp/dist/index.js
```

## Available Tools

### Campaigns

| Tool | Description |
|------|-------------|
| `list_campaigns` | List all campaigns with optional filtering by scope |
| `get_campaign` | Get details of a specific campaign |
| `create_campaign` | Create a new campaign |
| `update_campaign` | Update an existing campaign |
| `delete_campaign` | Delete a campaign |

### Contacts

| Tool | Description |
|------|-------------|
| `list_contacts` | List all contacts with optional email filter |
| `get_contact` | Get details of a specific contact |
| `create_contact` | Create a new contact |
| `update_contact` | Update an existing contact |
| `delete_contact` | Archive a contact (soft delete) |
| `restore_contact` | Restore an archived contact |

### Transactions

| Tool | Description |
|------|-------------|
| `list_transactions` | List transactions with optional campaign/contact filter |
| `get_transaction` | Get details of a specific transaction |

### Campaign Members

| Tool | Description |
|------|-------------|
| `list_campaign_members` | List all members of a campaign |
| `get_campaign_member` | Get details of a specific member |
| `delete_campaign_member` | Remove a member from a campaign |

### Campaign Teams

| Tool | Description |
|------|-------------|
| `list_campaign_teams` | List all teams in a campaign |
| `get_campaign_team` | Get details of a specific team |

### Tickets

| Tool | Description |
|------|-------------|
| `list_tickets` | List all tickets with optional campaign filter |
| `get_ticket` | Get details of a specific ticket |

### Payouts

| Tool | Description |
|------|-------------|
| `list_payouts` | List all payouts |
| `get_payout` | Get details of a specific payout |

### Plans (Recurring Donations)

| Tool | Description |
|------|-------------|
| `list_plans` | List all recurring donation plans |
| `get_plan` | Get details of a specific plan |

### Funds

| Tool | Description |
|------|-------------|
| `list_funds` | List all funds/designations |
| `get_fund` | Get details of a specific fund |

## Example Usage

Once configured, you can ask Claude questions like:

- "How many donors do we have for our end-of-year campaign?"
- "Show me the top donors this month"
- "List all our active campaigns"
- "What's the total raised for campaign ID 12345?"
- "Create a new campaign called 'Spring Fundraiser' with a goal of $10,000"
- "Show me the transaction details for donation #67890"

## API Documentation

For more information about the Givebutter API, see the [official API documentation](https://docs.givebutter.com).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- For issues with this MCP server, please [open an issue](https://github.com/johnnylinsf/givebutter-mcp/issues)
- For Givebutter API questions, contact [Givebutter Support](https://givebutter.com/support)
