/**
 * Live API smoke test.
 *
 * Refuses to run without GIVEBUTTER_API_KEY. Each test creates resources
 * with a unique "mcp-smoke-{ts}" prefix and deletes them in `finally`.
 *
 * Run: npm run smoke
 *
 * The create_transaction case is skipped by default — transactions cannot
 * be deleted on production, so set GIVEBUTTER_ALLOW_TRANSACTIONS=1 only
 * against a sandbox account. The transaction is tagged with a sentinel
 * internal_note for manual cleanup if needed.
 */

const apiKey = process.env.GIVEBUTTER_API_KEY;
if (!apiKey) {
  console.error("GIVEBUTTER_API_KEY is required");
  process.exit(1);
}

const BASE = "https://api.givebutter.com/v1";
const TS = Date.now();
const PREFIX = `mcp-smoke-${TS}`;

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${res.statusText} :: ${text}`);
  return text.length === 0 ? null : JSON.parse(text);
}

function ok(label: string) {
  console.log(`  ok  ${label}`);
}

async function testCampaign(): Promise<void> {
  console.log("[campaigns]");
  const created = await api("/campaigns", {
    method: "POST",
    body: JSON.stringify({ type: "fundraise", title: `${PREFIX}-campaign` }),
  });
  const id = created.data?.id ?? created.id;
  ok(`create_campaign → id ${id}`);
  try {
    await api(`/campaigns/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: `${PREFIX}-campaign`,
        type: "event",
        subtitle: "smoke subtitle",
      }),
    });
    ok("update_campaign (PUT) with subtitle");
  } finally {
    await api(`/campaigns/${id}`, { method: "DELETE" });
    ok(`delete_campaign ${id}`);
  }
}

async function testContactActivity(): Promise<void> {
  console.log("[contact-activities]");
  const contact = await api("/contacts", {
    method: "POST",
    body: JSON.stringify({
      email: `${PREFIX}@example.com`,
      first_name: "Smoke",
      last_name: "Test",
    }),
  });
  const cid = contact.data?.id ?? contact.id;
  ok(`create_contact → id ${cid}`);
  try {
    const activity = await api(`/contacts/${cid}/activities`, {
      method: "POST",
      body: JSON.stringify({ type: "note", note: `${PREFIX}-note` }),
    });
    const aid = activity.data?.id ?? activity.id;
    ok(`create_contact_activity → id ${aid}`);
    try {
      await api(`/contacts/${cid}/activities/${aid}`, {
        method: "PATCH",
        body: JSON.stringify({ note: `${PREFIX}-note-updated` }),
      });
      ok("update_contact_activity");
    } finally {
      await api(`/contacts/${cid}/activities/${aid}`, { method: "DELETE" });
      ok(`delete_contact_activity ${aid}`);
    }
  } finally {
    await api(`/contacts/${cid}`, { method: "DELETE" });
    ok(`delete_contact ${cid}`);
  }
}

async function testTransaction(): Promise<void> {
  console.log("[transactions]");
  if (process.env.GIVEBUTTER_ALLOW_TRANSACTIONS !== "1") {
    console.log("  skip  create_transaction (set GIVEBUTTER_ALLOW_TRANSACTIONS=1 to enable)");
    return;
  }
  const txn = await api("/transactions", {
    method: "POST",
    body: JSON.stringify({
      method: "check",
      transacted_at: new Date().toISOString(),
      amount: "1.00",
      first_name: "Smoke",
      last_name: "Test",
      email: `${PREFIX}@example.com`,
      internal_note: `${PREFIX}-DO-NOT-DEPOSIT`,
      check_number: "0",
    }),
  });
  const tid = txn.data?.id ?? txn.id;
  ok(`create_transaction → id ${tid} (manual cleanup required: ${PREFIX})`);
}

async function main() {
  console.log(`smoke run ${PREFIX}`);
  await testCampaign();
  await testContactActivity();
  await testTransaction();
  console.log("\nall ok");
}

main().catch((err) => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
