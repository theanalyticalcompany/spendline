const fs = require("fs");

const base = "http://127.0.0.1:4173";
let cookie = "";

async function req(path, options = {}) {
  const request = {
    redirect: "manual",
    ...options,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
  };
  const response = await fetch(`${base}${path}`, request);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return response;
}

function form(data) {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data),
  };
}

async function main() {
  await req("/login", form({ email: "demo@local.test", password: "demo1234" }));

  const db = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const user = db.users.find((item) => item.email === "demo@local.test");
  const incoming = db.transactions
    .filter((item) => item.userId === user.id && item.direction === "incoming")
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
    .slice(0, 2);

  if (incoming.length < 2) throw new Error("Test needs at least two incoming demo transactions.");

  for (const tx of incoming) {
    await req("/transactions/action", form({ id: tx.id, action: "salary" }));
  }

  const response = await req("/transactions?filter=salary");
  const html = await response.text();
  const kept = incoming.every((tx) => html.includes(`tx-${tx.id}`));

  console.log(JSON.stringify({
    status: response.status,
    markedSalaryCount: incoming.length,
    allMarkedRowsVisible: kept,
  }, null, 2));

  if (!kept) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
