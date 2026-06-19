const fs = require("fs");

const base = `http://127.0.0.1:${process.env.PORT || "4173"}`;
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

async function importDemoCsv() {
  const upload = new FormData();
  upload.append("sourceBank", "auto");
  upload.append("csv", new Blob([fs.readFileSync("outputs/demo-transakce.csv")], { type: "text/csv" }), "demo-transakce.csv");
  const preview = await req("/import/preview", { method: "POST", body: upload });
  const pendingId = new URL(`${base}${preview.headers.get("location")}`).searchParams.get("id");
  await req("/import/confirm", form({
    id: pendingId,
    date: "0",
    amount: "1",
    currency: "2",
    direction: "3",
    description: "4",
    ownAccount: "5",
    counterpartyAccount: "6",
    counterpartyName: "7",
    variableSymbol: "8",
  }));
}

async function main() {
  const email = `regular-from-tx-${Date.now()}@local.test`;
  const password = "test1234";
  await req("/register", form({ email, password }));
  await importDemoCsv();

  const dbBefore = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const user = dbBefore.users.find((item) => item.email === email);
  const source = dbBefore.transactions.find((tx) => tx.userId === user.id && tx.direction === "outgoing" && tx.amount === 18500);
  if (!source) throw new Error("Source outgoing transaction not found.");

  await req("/transactions/action", form({ id: source.id, action: "makeRegular" }));

  const dbAfter = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const regularRows = dbAfter.transactions.filter((tx) => tx.userId === user.id && tx.classification === "regular_payment" && tx.amount === 18500);
  const payment = dbAfter.regularPayments.find((item) => item.userId === user.id && item.status === "confirmed" && item.expectedAmount === 18500);
  const page = await req("/transactions?filter=regular_payment");
  const html = await page.text();

  const result = {
    createdPayment: Boolean(payment),
    matchedRows: regularRows.length,
    regularRowsVisible: html.includes("regular-row"),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.createdPayment || result.matchedRows < 2 || !result.regularRowsVisible) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
