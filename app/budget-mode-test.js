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
  const email = `budget-${Date.now()}@local.test`;
  const password = "test1234";
  await req("/register", form({ email, password }));

  let transactions = await req("/transactions");
  let transactionsHtml = await transactions.text();
  const simpleModeVisible = transactionsHtml.includes("Simple mode") && !transactionsHtml.includes("<th>Budget</th>");

  await req("/settings/toggle-budget-mode", form({}));
  await req("/settings", form({ fixedMonthlyAmount: "42000", budgetMode: "budget" }));
  await req("/budgets/create", form({ name: "Jidlo", monthlyAmount: "12000", carryoverMode: "carryover" }));

  let db = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const user = db.users.find((item) => item.email === email);
  const budget = db.budgets.find((item) => item.userId === user.id);
  if (!budget) throw new Error("Budget was not created.");

  await req("/planned-expenses/create", form({ name: "Jednorazovy test", amount: "2000", dueDate: "2026-06-20", budgetId: budget.id }));
  await importDemoCsv();

  db = JSON.parse(fs.readFileSync("work/local-app-data/db.json", "utf8"));
  const latestIncome = db.transactions
    .filter((item) => item.userId === user.id && item.direction === "incoming")
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))[0];
  await req("/transactions/action", form({ id: latestIncome.id, action: "salary" }));

  const outgoing = db.transactions.find((item) => item.userId === user.id
    && item.direction === "outgoing"
    && item.amount === 18500
    && item.transactionDate >= latestIncome.transactionDate);
  if (!outgoing) throw new Error("Current-cycle outgoing transaction was not found.");
  await req("/transactions/budget", form({ id: outgoing.id, budgetId: budget.id }));
  await req("/transactions/note", form({ id: outgoing.id, note: "Test note" }));

  const funding = db.transactions.find((item) => item.userId === user.id
    && item.direction === "outgoing"
    && item.amount === 1250
    && item.transactionDate >= latestIncome.transactionDate);
  if (!funding) throw new Error("Current-cycle funding transaction was not found.");
  await req("/transactions/budget", form({ id: funding.id, budgetId: budget.id, budgetFlow: "fund" }));

  transactions = await req("/transactions");
  transactionsHtml = await transactions.text();
  const budgetFiltered = await req(`/transactions?filter=${encodeURIComponent(`budget:${budget.id}`)}`);
  const budgetFilteredHtml = await budgetFiltered.text();
  const dashboard = await req("/dashboard");
  const dashboardHtml = await dashboard.text();
  const normalizedDashboardHtml = dashboardHtml.replace(/\u00a0/g, " ");
  const budgetsPage = await req("/budgets");
  const budgetsHtml = await budgetsPage.text();

  const result = {
    transactionsStatus: transactions.status,
    dashboardStatus: dashboard.status,
    budgetsStatus: budgetsPage.status,
    simpleModeVisible,
    modeToggleWorks: transactionsHtml.includes("Budget mode"),
    budgetColumnVisible: transactionsHtml.includes("<th>Budget</th>"),
    compactTransactionColumnsVisible: !transactionsHtml.includes("<th>Kategorie</th>") && !transactionsHtml.includes("<th>Směr</th>") && transactionsHtml.includes("<th>Poznámka</th>"),
    budgetAssignmentVisible: transactionsHtml.includes(`value="${budget.id}" selected`),
    budgetFilterTabVisible: transactionsHtml.includes(`filter=budget%3A${budget.id}`) && transactionsHtml.includes("Budget: Jidlo"),
    budgetFilterWorksForSpendAndFund: budgetFilteredHtml.includes(`tx-${outgoing.id}"`) && budgetFilteredHtml.includes(`tx-${funding.id}"`),
    budgetFlowControlsVisible: transactionsHtml.includes('value="spend"') && transactionsHtml.includes('value="fund"'),
    budgetSpendRowVisible: transactionsHtml.includes(`tx-${outgoing.id}" class="budget-spend-row"`),
    budgetFundRowVisible: transactionsHtml.includes(`tx-${funding.id}" class="budget-fund-row"`),
    categoryInheritedFromBudget: transactionsHtml.includes("Jidlo"),
    noteVisible: transactionsHtml.includes("Test note"),
    salaryRowHighlighted: transactionsHtml.includes(`tx-${latestIncome.id}" class="salary-row"`),
    dashboardBudgetVisible: dashboardHtml.includes("budget-status-panel") && dashboardHtml.includes("Jidlo"),
    dashboardBudgetSpendUpdated: normalizedDashboardHtml.includes("18 500"),
    futureBudgetFundExcludedFromCurrentDashboard: !normalizedDashboardHtml.includes("1 250"),
    plannedExpenseVisible: budgetsHtml.includes("Jednorazovy test"),
    dailyLimitVisible: dashboardHtml.includes("/ den"),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!Object.values(result).every(Boolean)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
