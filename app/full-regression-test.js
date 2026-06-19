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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function register(email, password) {
  const response = await req("/register", form({ email, password }));
  assert([303, 409].includes(response.status), "Registration failed");
  if (response.status === 409) {
    const login = await req("/login", form({ email, password }));
    assert(login.status === 303, "Login failed");
  }
}

async function importDemoCsv() {
  const upload = new FormData();
  upload.append("sourceBank", "auto");
  upload.append("csv", new Blob([fs.readFileSync("outputs/demo-transakce.csv")], { type: "text/csv" }), "demo-transakce.csv");
  const preview = await req("/import/preview", { method: "POST", body: upload });
  const location = preview.headers.get("location");
  assert(preview.status === 303 && location, "CSV preview did not redirect to mapping");
  const pendingId = new URL(`${base}${location}`).searchParams.get("id");
  const confirm = await req("/import/confirm", form({
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
  assert(confirm.status === 200, "CSV confirm failed");
}

async function run() {
  const email = `regression-${Date.now()}@local.test`;
  const password = "test1234";
  const results = [];

  await register(email, password);
  results.push(["AUTH-01", "Registrace a přihlášení", true]);

  let response = await req("/settings", form({ fixedMonthlyAmount: "42000" }));
  assert(response.status === 303, "Saving settings failed");
  await req("/settings/accounts", form({ displayName: "Běžný", account: "123456789/0100", accountType: "current" }));
  await req("/settings/accounts", form({ displayName: "Spořicí", account: "987654321/0100", accountType: "savings" }));
  results.push(["SET-01", "Nastavení pevné částky a vlastních účtů", true]);

  await importDemoCsv();
  response = await req("/transactions");
  let html = await response.text();
  assert(response.status === 200 && html.includes("Mzda cerven"), "Imported transactions not visible");
  results.push(["IMP-01", "CSV import a zobrazení transakcí", true]);

  const db = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const user = db.users.find((item) => item.email === email);
  const incoming = db.transactions
    .filter((item) => item.userId === user.id && item.direction === "incoming")
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  assert(incoming.length > 0, "No incoming transactions after import");
  response = await req("/transactions/action", form({ id: incoming[0].id, action: "salary" }));
  assert(response.status === 303, "Mark salary failed");
  response = await req("/transactions?filter=salary");
  html = await response.text();
  assert(html.includes(`tx-${incoming[0].id}`), "Salary row not visible in salary filter");
  response = await req("/transactions/action", form({ id: incoming[1].id, action: "ignore" }));
  assert(response.status === 303, "Mark ignored income failed");
  response = await req("/transactions?filter=ignored_savings");
  html = await response.text();
  assert(html.includes(`tx-${incoming[1].id}`) && html.includes("ignored-income-row"), "Ignored income row is not striped");
  results.push(["TRN-01", "Označení mzdy a filtr Mzda", true]);

  response = await req("/regular-payments/create", form({
    name: "Ruční testovací platba",
    expectedAmount: "1234",
    expectedDay: "12",
    counterpartyAccount: "",
    description: "regression",
  }));
  assert(response.status === 303, "Manual regular payment create failed");
  response = await req("/regular-payments");
  html = await response.text();
  assert(html.includes("Ruční testovací platba"), "Manual regular payment not visible");
  let dbAfterManualRegular = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const manualRegular = dbAfterManualRegular.regularPayments.find((item) => item.userId === user.id && item.expectedAmount === 1234);
  assert(manualRegular, "Manual regular payment not found in db");
  response = await req("/regular-payments/update", form({
    id: manualRegular.id,
    name: "Ruční testovací platba",
    expectedAmount: "1234",
    expectedDay: "12",
    note: "Poznamka trvale platby",
  }));
  assert(response.status === 303, "Regular payment note update failed");
  response = await req("/regular-payments");
  html = await response.text();
  assert(html.includes("Poznamka trvale platby"), "Regular payment note not visible");
  results.push(["REG-01", "Ruční pravidelná platba", true]);

  const dbAfterRegularCreate = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const sourceRegular = dbAfterRegularCreate.transactions.find((item) => item.userId === user.id && item.direction === "outgoing" && item.amount === 18500);
  assert(sourceRegular, "Source outgoing transaction for regular payment not found");
  await req("/transactions/action", form({ id: sourceRegular.id, action: "makeRegular" }));
  const dbAfterMakeRegular = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const matchedRegularRows = dbAfterMakeRegular.transactions.filter((item) => item.userId === user.id && item.classification === "regular_payment" && item.amount === 18500);
  assert(matchedRegularRows.length >= 2, "Similar regular payments were not matched in history");
  response = await req("/transactions?filter=regular_payment");
  html = await response.text();
  assert(html.includes("regular-row"), "Regular payment rows are not styled/visible");
  response = await req("/regular-payments");
  html = await response.text();
  const day12Index = html.indexOf('value="12"');
  const day16Index = html.indexOf('value="16"');
  assert(day12Index >= 0 && day16Index >= 0 && day12Index < day16Index, "Confirmed regular payments are not sorted by day");
  results.push(["REG-03", "Označení odchozí platby jako trvalé a dohledání historie", true]);

  response = await req("/cycles/expected-salary-date", form({ expectedSalaryDate: "2026-12-20" }));
  assert(response.status === 303, "Expected salary date update failed");
  response = await req("/dashboard?dateUpdated=1");
  html = await response.text();
  assert(html.includes("Datum") && html.includes("upraveno"), "Dashboard update feedback missing");
  assert(
    html.includes("Výpočet volného spendu")
      && html.includes("Provozní rámec")
      && html.includes("Volný spend na začátku období")
      && html.includes("Průběžné volné platby"),
    "Dashboard cashflow steps missing",
  );
  results.push(["DASH-01", "Úprava data další výplaty na dashboardu", true]);

  response = await req("/dashboard/detail?kind=salary");
  html = (await response.text()).replace(/\u00a0/g, " ");
  assert(response.status === 200 && html.includes("62 000 Kč"), "Salary dashboard detail does not match latest salary");
  response = await req("/dashboard/detail?kind=regularPayments");
  html = (await response.text()).replace(/\u00a0/g, " ");
  assert(response.status === 200 && html.includes("18 500 Kč") && html.includes("1 234 Kč"), "Regular payments dashboard detail is incomplete");
  response = await req("/dashboard/detail?kind=variableSpend");
  html = (await response.text()).replace(/\u00a0/g, " ");
  assert(response.status === 200 && html.includes("0 Kč") && !html.includes("FiberNet") && !html.includes("Potraviny"), "Variable spend detail includes transactions outside the current actual period");
  results.push(["DASH-02", "Detaily dashboardu a součty metrik", true]);

  response = await req("/dashboard?cycleStartDate=2026-06-15&cycleEndDate=2026-06-17");
  html = await response.text();
  assert(
    response.status === 200
      && html.includes('name="cycleStartDate" value="2026-06-15"')
      && html.includes('name="cycleEndDate" value="2026-06-17"')
      && (html.includes("cycleStartDate=2026-06-15&amp;cycleEndDate=2026-06-17")
        || html.includes("cycleStartDate=2026-06-15&cycleEndDate=2026-06-17")),
    "Dashboard custom cycle period is not reflected in the page",
  );
  response = await req("/dashboard/detail?kind=variableSpend&cycleStartDate=2026-06-15&cycleEndDate=2026-06-17");
  html = (await response.text()).replace(/\u00a0/g, " ");
  assert(response.status === 200 && html.includes("0 Kč") && !html.includes("FiberNet"), "Dashboard detail does not keep the selected cycle period");
  results.push(["DASH-03", "Volba období dashboardu", true]);

  response = await req("/transactions?filter=variable_spend&minAmount=1000&maxAmount=4000&dateFrom=2026-01-01&dateTo=2026-12-31");
  html = await response.text();
  assert(html.includes("Částka od") && html.includes("Částka do") && html.includes("Datum od") && html.includes("Datum do"), "Range filters not visible");
  results.push(["FLT-01", "Filtr podle částky a data", true]);

  response = await req("/transactions/bulk-action", form({
    filter: "variable_spend",
    minAmount: "1000",
    maxAmount: "4000",
    dateFrom: "2026-01-01",
    dateTo: "2026-12-31",
    action: "ignore",
  }));
  assert(response.status === 303, "Bulk action did not redirect");
  response = await req("/transactions?filter=excluded&minAmount=1000&maxAmount=4000&dateFrom=2026-01-01&dateTo=2026-12-31");
  html = await response.text();
  assert(html.includes("Mimo evidenci") && html.includes("<tr id="), "Bulk ignore did not persist");
  assert(html.includes("excluded-outgoing-row"), "Outgoing exceptions are not striped");
  results.push(["BULK-01", "Hromadná akce na filtrovaný výběr", true]);

  response = await req("/import/preview", {
    method: "POST",
    body: (() => {
      const upload = new FormData();
      upload.append("sourceBank", "auto");
      upload.append("csv", new Blob([fs.readFileSync("outputs/demo-transakce.csv")], { type: "text/csv" }), "demo-transakce.csv");
      return upload;
    })(),
  });
  const duplicateLocation = response.headers.get("location");
  assert(duplicateLocation, "Duplicate import preview failed");
  const duplicateId = new URL(`${base}${duplicateLocation}`).searchParams.get("id");
  response = await req("/import/confirm", form({
    id: duplicateId,
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
  html = await response.text();
  assert(html.includes("duplicit"), "Duplicate import summary missing");
  results.push(["IMP-02", "Opakovaný import bez duplicit", true]);

  response = await req("/settings/transactions/delete-all", form({}));
  assert(response.status === 303, "Confirmed delete-all did not redirect");
  const dbAfterDelete = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  assert(!dbAfterDelete.transactions.some((item) => item.userId === user.id), "User transactions were not deleted");
  assert(!dbAfterDelete.importBatches.some((item) => item.userId === user.id), "User import batches were not deleted");
  results.push(["SET-02", "Smazání všech transakcí uživatele", true]);

  console.log(JSON.stringify({ email, results }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
