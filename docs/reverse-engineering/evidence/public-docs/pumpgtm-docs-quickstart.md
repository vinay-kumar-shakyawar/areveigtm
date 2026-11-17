# PumpGTM Quickstart: API Key, First Request, Connect an AI Agent

Canonical URL: https://pumpgtm.com/docs/quickstart

[PumpGTM](/) / [Developer docs](/docs)

# Quickstart: your first PumpGTM API and MCP calls

Five minutes from a workspace key to your first API response and your first MCP tool call. Copy and paste, nothing to install.

Updated September 23, 2026 · [View as Markdown](/markdown/pages/docs/quickstart.md)

Everything PumpGTM does is available to code and to AI agents. This page gets you from zero to a working call. You need a PumpGTM workspace (7 day trial at [app.pumpgtm.com/onboarding](https://app.pumpgtm.com/onboarding)) and one connected LinkedIn account.

## 1. Get your workspace key

Sign in at [app.pumpgtm.com](https://app.pumpgtm.com), open MCP in the left nav, and copy the workspace key. It starts with eve_mcp_ . One key is one workspace: it can read and act on that workspace's leads, sequences and replies and nothing else. Keep it server side.

export PUMPGTM_KEY = "eve_mcp_..."

## 2. First REST call: what happened this week

curl -s "https://app.pumpgtm.com/api/v1/progress?sinceDays=7" \
-H "Authorization: Bearer $PUMPGTM_KEY "

You get the funnel (invited, accepted, messaged, replied, meetings booked), the queue depth, and every connected LinkedIn account with today's connection-request budget. Full shape in the [REST API reference](/docs/api).

Three more calls worth trying:

# Every sequence with its steps, status and lead count
curl -s https://app.pumpgtm.com/api/v1/sequences -H "Authorization: Bearer $PUMPGTM_KEY "

# Connection requests sent in the last 7 days (read `count`)
curl -s "https://app.pumpgtm.com/api/v1/activity?action=invite&outcome=ok&sinceDays=7&limit=1" -H "Authorization: Bearer $PUMPGTM_KEY "

# Replies waiting for a human, each with a drafted answer
curl -s "https://app.pumpgtm.com/api/v1/replies?limit=5" -H "Authorization: Bearer $PUMPGTM_KEY "

Generating a typed client: the spec is at [pumpgtm.com/openapi.json](/openapi.json) (OpenAPI 3.1).

## 3. First MCP call: connect an agent

The MCP server is hosted at https://mcp.pumpgtm.com/mcp (Streamable HTTP). AI apps sign in to it with OAuth, so no key goes in their config.

Claude Code:

claude mcp add --transport http pumpgtm https://mcp.pumpgtm.com/mcp && claude mcp login pumpgtm

Codex:

codex mcp add pumpgtm --url https://mcp.pumpgtm.com/mcp && codex mcp login pumpgtm

Cursor, Claude (web, desktop), ChatGPT and Grok (grok.com/connectors, New Connector, Custom): add the URL and sign in. Your own agent or an MCP SDK client sends the workspace key as an Authorization: Bearer header.

Then, in the agent:

Call get_workspace and tell me what is waiting on me.

get_workspace returns setup state, sequences, unfinished reviews and pending replies, plus a next hint for the following call. Every tool is listed in the [MCP reference](/docs/mcp), with the live schema at [pumpgtm.com/mcp/tools.json](/mcp/tools.json).

## 4. A first real workflow, safely

Nothing reaches LinkedIn until a person approves it, so you can run this end to end without contacting anyone (how the connected account stays safe is in [how to automate LinkedIn safely](/blog/is-linkedin-automation-safe-pumpgtm-account-protection)):

- find_people with targeting and confirmed: false . It saves a Play and returns the targeting summary.

- find_people with the returned playId and confirmed: true . It runs discovery and returns candidates.

- review_people with decisions and finish: true . Good fits are queued into a sequence. Still nothing sent.

- save_sequence_draft to write the steps, set_sequence_status approved with the exact revision, then active . Now outreach starts, paced inside LinkedIn's limits.

- Replies freeze the lead. Read them with list_pending_replies or GET /api/v1/replies , decide with decide_reply or POST /api/v1/replies/{id}/decide .

## 5. Building on top of PumpGTM

- Your own dashboard: poll /api/v1/progress , /api/v1/reports/funnel , /api/v1/leads and /api/v1/activity . Counts are exact and every timestamp is UTC.

- Your own reply handling: subscribe a webhook to reply.received ( POST /api/v1/webhooks ), or poll GET /api/v1/replies ; decide is the action. The same code runs behind the in-app buttons, so a human and your integration can pick up where the other left off.

- Agencies and platforms with many client workspaces: one partner key, one MCP URL per end user, usage and caps by API. See the [Partner API](/docs/api#partners-run-pumpgtm-for-your-clients) and [pumpgtm.com/mcp/platforms](/mcp/platforms).

- Anything an agent reads here is also plain Markdown: add .md under /markdown/pages/docs/ or request any page with Accept: text/markdown . The site index for agents is [llms.txt](/llms.txt).

Questions or a missing endpoint: [support@pumpgtm.com](mailto:support@pumpgtm.com).

Questions or a missing endpoint: [support@pumpgtm.com](mailto:support@pumpgtm.com).
