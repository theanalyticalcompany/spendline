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
  const email = "demo@local.test";
  const password = "demo1234";

  let response = await req("/register", form({ email, password }));
  if (response.status === 409) {
    response = await req("/login", form({ email, password }));
  }

  await req("/settings", form({ fixedMonthlyAmount: "42000" }));
  await req("/settings/accounts", form({ displayName: "Bezny", account: "123456789/0100", accountType: "current" }));
  await req("/settings/accounts", form({ displayName: "Sporici", account: "987654321/0100", accountType: "savings" }));

  const upload = new FormData();
  upload.append("sourceBank", "auto");
  upload.append(
    "csv",
    new Blob([fs.readFileSync("outputs/demo-transakce.csv")], { type: "text/csv" }),
    "demo-transakce.csv",
  );

  response = await req("/import/preview", { method: "POST", body: upload });
  const location = response.headers.get("location");
  if (location) {
    const pendingId = new URL(`${base}${location}`).searchParams.get("id");
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

  const db = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const user = db.users.find((item) => item.email === email);
  const latestIncome = db.transactions
    .filter((item) => item.userId === user.id && item.direction === "incoming")
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))[0];

  if (latestIncome) {
    await req("/transactions/action", form({ id: latestIncome.id, action: "salary" }));
  }

  response = await req("/regular-payments");
  const regularHtml = await response.text();
  const signatures = [...regularHtml.matchAll(/name="signature" value="([^"]+)"/g)].map((match) => match[1]);
  for (const signature of signatures) {
    await req("/regular-payments/confirm", form({ signature }));
  }

  response = await req("/dashboard");
  const dashboardHtml = await response.text();

  console.log(JSON.stringify({
    email,
    password,
    dashboardStatus: response.status,
    hasSalaryMetric: dashboardHtml.includes("Poslední výplata"),
    confirmedRegularPayments: signatures.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
