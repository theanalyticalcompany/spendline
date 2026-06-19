const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "work", "local-app-data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SECRET_FILE = path.join(DATA_DIR, "secret.key");
const MAIL_LOG = path.join(DATA_DIR, "mailbox.log");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
fs.mkdirSync(DATA_DIR, { recursive: true });

function initialDb() {
  return {
    users: [],
    sessions: [],
    passwordResetTokens: [],
    settings: [],
    accounts: [],
    importBatches: [],
    pendingImports: [],
    transactions: [],
    regularPayments: [],
    budgets: [],
    plannedExpenses: [],
  };
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return initialDb();
  return { ...initialDb(), ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function getSecret() {
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("base64"), "utf8");
  }
  return Buffer.from(fs.readFileSync(SECRET_FILE, "utf8").trim(), "base64");
}

const SECRET = getSecret();
const BUDGET_COLORS = [
  { value: "#eaf2ff", label: "Pastelova modra" },
  { value: "#eef0ff", label: "Perletova modra" },
  { value: "#f4ecff", label: "Levandulova" },
  { value: "#ffeaf4", label: "Ruzova" },
  { value: "#ffeceb", label: "Merunkova" },
  { value: "#eaf7ff", label: "Ledova modra" },
  { value: "#f2eaff", label: "Fialova" },
  { value: "#fbeafd", label: "Malinova" },
];

function id() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function encrypt(value) {
  const text = String(value || "");
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decrypt(value) {
  if (!value) return "";
  try {
    const [ivRaw, tagRaw, encryptedRaw] = String(value).split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", SECRET, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function normalizeBudgetColor(value) {
  const raw = String(value || "").toLowerCase();
  return BUDGET_COLORS.some((item) => item.value === raw) ? raw : "";
}

function firstAvailableBudgetColor(db, userId, excludeBudgetId = "") {
  const used = new Set(db.budgets
    .filter((budget) => budget.userId === userId && budget.isActive !== false && budget.id !== excludeBudgetId)
    .map((budget) => normalizeBudgetColor(budget.color))
    .filter(Boolean));
  return BUDGET_COLORS.find((item) => !used.has(item.value))?.value || BUDGET_COLORS[0].value;
}

function chooseBudgetColor(db, userId, requested, budgetId = "") {
  const normalized = normalizeBudgetColor(requested);
  const usedByOther = normalized && db.budgets.some((budget) => budget.userId === userId
    && budget.isActive !== false
    && budget.id !== budgetId
    && normalizeBudgetColor(budget.color) === normalized);
  if (normalized && !usedByOther) return normalized;
  const current = db.budgets.find((budget) => budget.id === budgetId && budget.userId === userId);
  const currentColor = normalizeBudgetColor(current?.color);
  if (currentColor) return currentColor;
  return firstAvailableBudgetColor(db, userId, budgetId);
}

function ensureBudgetColors(db, userId) {
  const used = new Set();
  let changed = false;
  for (const budget of db.budgets.filter((item) => item.userId === userId && item.isActive !== false)) {
    const color = normalizeBudgetColor(budget.color);
    if (color && !used.has(color)) {
      if (budget.color !== color) {
        budget.color = color;
        changed = true;
      }
      used.add(color);
      continue;
    }
    const replacement = BUDGET_COLORS.find((item) => !used.has(item.value))?.value || BUDGET_COLORS[0].value;
    budget.color = replacement;
    budget.updatedAt = nowIso();
    used.add(replacement);
    changed = true;
  }
  if (changed) saveDb(db);
}

function budgetColorSelect(db, userId, selected = "", budgetId = "") {
  const used = new Set(db.budgets
    .filter((budget) => budget.userId === userId && budget.isActive !== false && budget.id !== budgetId)
    .map((budget) => normalizeBudgetColor(budget.color))
    .filter(Boolean));
  const selectedColor = normalizeBudgetColor(selected) || firstAvailableBudgetColor(db, userId, budgetId);
  return `<select name="color" class="color-select">${BUDGET_COLORS.map((color) => {
    const disabled = used.has(color.value);
    return `<option value="${color.value}" ${color.value === selectedColor ? "selected" : ""} ${disabled ? "disabled" : ""}>${escapeHtml(color.label)}</option>`;
  }).join("")}</select>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("cs-CZ").format(d);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAccount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  const match = compact.match(/^((\d{1,6})-)?(\d{2,10})\/?(\d{4})?$/);
  if (!match) return compact;
  const prefix = match[2] ? `${Number(match[2])}-` : "";
  const number = String(Number(match[3]));
  const bank = match[4] || "";
  return `${prefix}${number}${bank ? `/${bank}` : ""}`;
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(raw.split(";").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("=") || "")];
  }).filter(([key]) => key));
}

function isSameOriginRequest(req) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return true;
  const host = req.headers.host;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  try {
    if (origin) return new URL(origin).host === host;
    if (referer) return new URL(referer).host === host;
  } catch {
    return false;
  }
  return true;
}

function redirect(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    ...headers,
  });
  res.end(body);
}

function sendText(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Soubor je příliš velký."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseForm(buffer) {
  return Object.fromEntries(new URLSearchParams(buffer.toString("utf8")));
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return {};
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const body = buffer.toString("binary");
  const parts = body.split(boundary).slice(1, -1);
  const fields = {};

  for (const rawPart of parts) {
    const clean = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const splitAt = clean.indexOf("\r\n\r\n");
    if (splitAt === -1) continue;
    const rawHeaders = clean.slice(0, splitAt);
    let content = clean.slice(splitAt + 4);
    content = content.replace(/\r\n$/, "");
    const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const fileMatch = rawHeaders.match(/filename="([^"]*)"/i);
    const name = nameMatch[1];
    if (fileMatch) {
      fields[name] = {
        filename: fileMatch[1],
        content: Buffer.from(content, "binary"),
      };
    } else {
      fields[name] = Buffer.from(content, "binary").toString("utf8");
    }
  }

  return fields;
}

function textQualityScore(text) {
  const replacement = (text.match(/�/g) || []).length;
  const mojibake = (text.match(/[ĂĹÄ]/g) || []).length;
  const czech = (text.match(/[ěščřžýáíéúůťďňĚŠČŘŽÝÁÍÉÚŮŤĎŇ]/g) || []).length;
  return { replacement, mojibake, czech, penalty: replacement * 10 + mojibake * 3 - czech };
}

function decodeCsvBuffer(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return {
      text: new TextDecoder("utf-8").decode(bytes.slice(3)),
      encoding: "utf-8-bom",
    };
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let windows1250 = "";
  try {
    windows1250 = new TextDecoder("windows-1250", { fatal: false }).decode(bytes);
  } catch {
    windows1250 = utf8;
  }

  const utf8Score = textQualityScore(utf8);
  const windows1250Score = textQualityScore(windows1250);
  if (windows1250Score.penalty < utf8Score.penalty) {
    return { text: windows1250, encoding: "windows-1250" };
  }
  return { text: utf8, encoding: "utf-8" };
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((item) => item !== "")) rows.push(row);
  }
  return { delimiter, rows };
}

function detectDelimiter(text) {
  const first = text.split(/\r?\n/).find(Boolean) || "";
  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: first.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function detectMapping(headers) {
  const aliases = {
    date: ["datum", "datum transakce", "datum zauctovani", "datum zaúčtování", "date"],
    amount: ["castka", "částka", "amount", "suma", "objem"],
    currency: ["mena", "měna", "currency"],
    direction: ["smer", "směr", "typ", "type"],
    description: ["popis", "zprava", "zpráva", "ucel", "účel", "poznamka", "poznámka"],
    category: ["kategorie", "category", "typ vydaje", "typ výdaje"],
    ownAccount: ["ucet", "účet", "cislo uctu", "číslo účtu", "muj ucet", "můj účet"],
    counterpartyAccount: ["protiucet", "protiúčet", "ucet protistrany", "účet protistrany", "cislo uctu protistrany"],
    counterpartyName: ["protistrana", "nazev protistrany", "název protistrany", "partner", "nazev"],
    variableSymbol: ["vs", "variabilni symbol", "variabilní symbol"],
  };
  const mapping = {};
  headers.forEach((header, index) => {
    const norm = normalizeText(header);
    Object.entries(aliases).forEach(([field, names]) => {
      if (mapping[field] !== undefined) return;
      if (names.map(normalizeText).some((name) => norm === name || norm.includes(name))) {
        mapping[field] = String(index);
      }
    });
  });
  return mapping;
}

function parseAmount(value) {
  const raw = String(value || "")
    .replace(/\s/g, "")
    .replace(/[^\d,.\-+]/g, "")
    .replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const cz = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (cz) return `${cz[3]}-${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}`;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return "";
}

function addMonths(dateText, count) {
  const d = new Date(`${dateText}T00:00:00`);
  d.setMonth(d.getMonth() + count);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const one = new Date(`${a}T00:00:00`).getTime();
  const two = new Date(`${b}T00:00:00`).getTime();
  return Math.round((two - one) / 86400000);
}

function getDbUser(db, req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const session = db.sessions.find((item) => item.id === sid && new Date(item.expiresAt) > new Date());
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId && user.status !== "deleted") || null;
}

function createSession(db, userId) {
  const session = {
    id: id(),
    userId,
    csrfToken: crypto.randomBytes(32).toString("hex"),
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  };
  db.sessions.push(session);
  return session.id;
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, derived] = String(stored || "").split(":");
  if (!salt || !derived) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(derived, "hex"));
}

function layout({ title, user, flash = "", body, pageClass = "" }) {
  let currentBudgetMode = "simple";
  if (user) {
    const layoutDb = loadDb();
    const settings = layoutDb.settings.find((item) => item.userId === user.id);
    currentBudgetMode = settings?.budgetMode === "budget" ? "budget" : "simple";
  }
  const modeToggle = user ? `
    <form method="post" action="/settings/toggle-budget-mode" class="mode-form">
      <button class="mode-badge ${currentBudgetMode === "budget" ? "active" : ""}" title="Přepnout režim aplikace">
        ${currentBudgetMode === "budget" ? "Budget mode" : "Simple mode"}
      </button>
    </form>` : "";
  const nav = user ? `
    <nav class="nav">
      <a href="/dashboard">Dashboard</a>
      <a href="/transactions">Transakce</a>
      <a href="/import">Import</a>
      <a href="/regular-payments">Pravidelné platby</a>
      <a href="/budgets">Budgety</a>
      <a href="/settings">Nastavení</a>
      ${user.role === "admin" ? '<a href="/admin/users">Admin</a>' : ""}
      <form method="post" action="/logout"><button class="link-button">Odhlásit</button></form>
    </nav>` : "";

  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Spendline</title>
  <link rel="stylesheet" href="/style.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <header class="topbar">
    <div class="brand-row">
      <a class="brand" href="${user ? "/dashboard" : "/login"}">
        <span class="brand-mark"></span>
        <span>Spendline</span>
      </a>
      ${modeToggle}
    </div>
    ${nav}
  </header>
  <main class="page${pageClass ? ` ${escapeHtml(pageClass)}` : ""}">
    ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ""}
    ${body}
  </main>
</body>
</html>`;
}

function requireUser(db, req, res) {
  const user = getDbUser(db, req);
  if (!user) {
    redirect(res, "/login");
    return null;
  }
  return user;
}

function userSettings(db, userId) {
  let settings = db.settings.find((item) => item.userId === userId);
  let changed = false;
  if (!settings) {
    settings = {
      id: id(),
      userId,
      fixedMonthlyAmount: 0,
      currency: "CZK",
      expectedSalaryDate: "",
      budgetMode: "simple",
      chartHiddenSegments: [],
      lastImportMapping: {},
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.settings.push(settings);
    changed = true;
  }
  if (!("fixedMonthlyAmount" in settings)) {
    settings.fixedMonthlyAmount = 0;
    changed = true;
  }
  if (!settings.currency) {
    settings.currency = "CZK";
    changed = true;
  }
  if (!("expectedSalaryDate" in settings)) {
    settings.expectedSalaryDate = "";
    changed = true;
  }
  if (!settings.budgetMode) {
    settings.budgetMode = "simple";
    changed = true;
  }
  if (!Array.isArray(settings.chartHiddenSegments)) {
    settings.chartHiddenSegments = [];
    changed = true;
  }
  if (!settings.lastImportMapping || typeof settings.lastImportMapping !== "object" || Array.isArray(settings.lastImportMapping)) {
    settings.lastImportMapping = {};
    changed = true;
  }
  if (settings.budgetMode !== "budget" && settings.budgetMode !== "simple") {
    settings.budgetMode = "simple";
    changed = true;
  }
  if (changed) {
    settings.updatedAt = nowIso();
    saveDb(db);
  }
  return settings;
}

function ownAccountHashes(db, userId) {
  return new Set(db.accounts.filter((item) => item.userId === userId && item.isActive).map((item) => item.accountHash));
}

function decryptTransaction(tx) {
  return {
    ...tx,
    ownAccount: decrypt(tx.ownAccountEncrypted),
    counterpartyAccount: decrypt(tx.counterpartyAccountEncrypted),
    counterpartyName: decrypt(tx.counterpartyNameEncrypted),
    description: decrypt(tx.descriptionEncrypted),
    category: decrypt(tx.categoryEncrypted),
    note: decrypt(tx.noteEncrypted),
    variableSymbol: decrypt(tx.variableSymbolEncrypted),
    budgetFlow: tx.budgetFlow === "fund" ? "fund" : (tx.budgetId ? "spend" : ""),
  };
}

function userTransactions(db, userId) {
  return db.transactions
    .filter((tx) => tx.userId === userId)
    .map(decryptTransaction)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.createdAt.localeCompare(a.createdAt));
}

function userBudgets(db, userId) {
  ensureBudgetColors(db, userId);
  let changed = false;
  for (const budget of db.budgets.filter((item) => item.userId === userId && item.isActive !== false)) {
    if (!["regular", "envelope"].includes(budget.budgetType)) {
      budget.budgetType = "regular";
      changed = true;
    }
    if (!("openingBalance" in budget)) {
      budget.openingBalance = 0;
      changed = true;
    }
  }
  if (changed) saveDb(db);
  return db.budgets
    .filter((budget) => budget.userId === userId && budget.isActive !== false)
    .sort((a, b) => decrypt(a.nameEncrypted).localeCompare(decrypt(b.nameEncrypted), "cs"));
}

function userPlannedExpenses(db, userId) {
  return db.plannedExpenses
    .filter((expense) => expense.userId === userId && expense.isActive !== false)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function variableSpendTransactions(txs) {
  return txs.filter((tx) => tx.direction === "outgoing"
    && !tx.isExcluded
    && !["own_transfer", "regular_payment", "ignored_savings"].includes(tx.classification));
}

function budgetTransactions(txs) {
  return txs.filter((tx) => tx.direction === "outgoing"
    && tx.budgetId
    && !tx.isExcluded
    && !["own_transfer", "regular_payment", "ignored_savings"].includes(tx.classification));
}

function classifyOwnTransfer(db, userId, ownAccount, counterpartyAccount) {
  const hashes = ownAccountHashes(db, userId);
  const ownHash = hash(normalizeAccount(ownAccount));
  const counterHash = hash(normalizeAccount(counterpartyAccount));
  return Boolean((ownAccount && hashes.has(ownHash) && counterpartyAccount && hashes.has(counterHash))
    || (counterpartyAccount && hashes.has(counterHash)));
}

function makeFingerprint(userId, item) {
  return hash([
    userId,
    item.transactionDate,
    item.amount,
    item.currency,
    item.direction,
    normalizeAccount(item.ownAccount),
    normalizeAccount(item.counterpartyAccount),
    normalizeText(item.description),
    normalizeText(item.variableSymbol),
  ].join("|"));
}

function getField(row, mapping, field) {
  const index = mapping[field];
  if (index === undefined || index === "") return "";
  return row[Number(index)] || "";
}

function normalizeImportedRow(row, mapping) {
  const date = parseDate(getField(row, mapping, "date"));
  let amount = parseAmount(getField(row, mapping, "amount"));
  const directionRaw = normalizeText(getField(row, mapping, "direction"));
  let direction = amount < 0 ? "outgoing" : "incoming";
  if (["odchozi", "odchozí", "debet", "vydaj", "výdaj", "platba"].some((word) => directionRaw.includes(normalizeText(word)))) direction = "outgoing";
  if (["prichozi", "příchozí", "kredit", "prijem", "příjem"].some((word) => directionRaw.includes(normalizeText(word)))) direction = "incoming";
  amount = Math.abs(amount);
  return {
    transactionDate: date,
    amount,
    currency: (getField(row, mapping, "currency") || "CZK").toUpperCase(),
    direction,
    ownAccount: normalizeAccount(getField(row, mapping, "ownAccount")),
    counterpartyAccount: normalizeAccount(getField(row, mapping, "counterpartyAccount")),
    counterpartyName: getField(row, mapping, "counterpartyName"),
    description: getField(row, mapping, "description"),
    category: getField(row, mapping, "category"),
    variableSymbol: getField(row, mapping, "variableSymbol"),
  };
}

function inferNextSalaryDate(transactions, latestSalary, settings) {
  if (settings.expectedSalaryDate && settings.expectedSalaryDate > latestSalary.transactionDate) {
    return settings.expectedSalaryDate;
  }
  const salaries = transactions
    .filter((tx) => tx.classification === "salary")
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
  if (salaries.length >= 2) {
    const prev = salaries[salaries.length - 2].transactionDate;
    const last = salaries[salaries.length - 1].transactionDate;
    const diff = Math.max(25, Math.min(35, daysBetween(prev, last)));
    const d = new Date(`${last}T00:00:00`);
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  return addMonths(latestSalary.transactionDate, 1);
}

function cyclePlannedExpenses(db, userId, startDate, endDate) {
  return userPlannedExpenses(db, userId).filter((expense) => expense.dueDate >= startDate && expense.dueDate < endDate);
}

function previousCycleRange(txs, currentStartDate) {
  const salaries = txs
    .filter((tx) => tx.classification === "salary" && tx.direction === "incoming" && tx.transactionDate < currentStartDate)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  if (!salaries.length) return null;
  return { startDate: salaries[0].transactionDate, endDate: currentStartDate };
}

function budgetCarryover(db, userId, txs, budget, currentStartDate) {
  if (budget.carryoverMode !== "carryover") return 0;
  const previous = previousCycleRange(txs, currentStartDate);
  if (!previous) return 0;
  const previousTxs = budgetTransactions(txs)
    .filter((tx) => tx.budgetId === budget.id && tx.transactionDate >= previous.startDate && tx.transactionDate < previous.endDate);
  const previousFunded = previousTxs
    .filter((tx) => tx.budgetFlow === "fund")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const previousSpent = previousTxs
    .filter((tx) => tx.budgetFlow !== "fund")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const previousPlanned = cyclePlannedExpenses(db, userId, previous.startDate, previous.endDate)
    .filter((expense) => expense.budgetId === budget.id)
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return Math.max(0, Number(budget.monthlyAmount || 0) + previousFunded - previousPlanned - previousSpent);
}

function budgetStatuses(db, userId, txs, startDate, endDate, daysRemaining, actualEndDate = endDate) {
  const budgets = userBudgets(db, userId);
    const planned = cyclePlannedExpenses(db, userId, startDate, endDate);
  const assignedTxs = budgetTransactions(txs)
    .filter((tx) => tx.transactionDate >= startDate && tx.transactionDate <= actualEndDate && tx.transactionDate < endDate);

  return budgets.map((budget) => {
    const budgetType = budget.budgetType === "envelope" ? "envelope" : "regular";
    if (budgetType === "envelope") {
      const historyTxs = budgetTransactions(txs)
        .filter((tx) => tx.budgetId === budget.id && tx.transactionDate <= actualEndDate);
      const periodTxs = assignedTxs.filter((tx) => tx.budgetId === budget.id);
      const historyFunded = historyTxs
        .filter((tx) => tx.budgetFlow === "fund")
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const historySpent = historyTxs
        .filter((tx) => tx.budgetFlow !== "fund")
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const funded = periodTxs
        .filter((tx) => tx.budgetFlow === "fund")
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const spent = periodTxs
        .filter((tx) => tx.budgetFlow !== "fund")
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const openingBalance = Number(budget.openingBalance || 0);
      const remaining = openingBalance + historyFunded - historySpent;
      const usedPercent = openingBalance + historyFunded > 0
        ? Math.max(0, Math.min(999, (historySpent / (openingBalance + historyFunded)) * 100))
        : 0;
      return {
        id: budget.id,
        type: "envelope",
        name: decrypt(budget.nameEncrypted),
        color: normalizeBudgetColor(budget.color) || BUDGET_COLORS[0].value,
        monthlyAmount: 0,
        openingBalance,
        carryoverMode: "carryover",
        carryover: 0,
        funded,
        plannedTotal: 0,
        spent,
        startAmount: openingBalance,
        availableAfterPlanned: remaining,
        remaining,
        usedPercent,
        dailyLimit: 0,
      };
    }
    const carryover = budgetCarryover(db, userId, txs, budget, startDate);
    const plannedTotal = planned
      .filter((expense) => expense.budgetId === budget.id)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const funded = assignedTxs
      .filter((tx) => tx.budgetId === budget.id && tx.budgetFlow === "fund")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const spent = assignedTxs
      .filter((tx) => tx.budgetId === budget.id && tx.budgetFlow !== "fund")
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const startAmount = Number(budget.monthlyAmount || 0) + carryover;
    const availableAfterPlanned = startAmount + funded - plannedTotal;
    const remaining = availableAfterPlanned - spent;
    const usedPercent = availableAfterPlanned > 0
      ? Math.max(0, Math.min(999, (spent / availableAfterPlanned) * 100))
      : 0;
    return {
      id: budget.id,
      type: "regular",
      name: decrypt(budget.nameEncrypted),
      color: normalizeBudgetColor(budget.color) || BUDGET_COLORS[0].value,
      monthlyAmount: Number(budget.monthlyAmount || 0),
      openingBalance: Number(budget.openingBalance || 0),
      carryoverMode: budget.carryoverMode || "reset",
      carryover,
      funded,
      plannedTotal,
      spent,
      startAmount,
      availableAfterPlanned,
      remaining,
      usedPercent,
      dailyLimit: remaining / Math.max(1, daysRemaining),
    };
  });
}

function dashboardData(db, user, options = {}) {
  const settings = userSettings(db, user.id);
  const txs = userTransactions(db, user.id);
  const salaries = txs.filter((tx) => tx.classification === "salary" && tx.direction === "incoming");
  const defaultSalary = salaries[0];
  if (!defaultSalary) return { settings, hasSalary: false, txs };

  const requestedStartDate = parseDate(options.cycleStartDate || "");
  const requestedEndDate = parseDate(options.cycleEndDate || "");
  const hasValidRequestedPeriod = requestedStartDate && requestedEndDate && requestedEndDate > requestedStartDate;
  let cycleStartDate = hasValidRequestedPeriod ? requestedStartDate : defaultSalary.transactionDate;
  const salaryInPeriod = hasValidRequestedPeriod
    ? salaries.find((tx) => tx.transactionDate >= cycleStartDate && tx.transactionDate < requestedEndDate)
    : null;
  const latestSalary = salaryInPeriod || salaries.find((tx) => tx.transactionDate <= cycleStartDate) || defaultSalary;
  if (!hasValidRequestedPeriod) cycleStartDate = latestSalary.transactionDate;

  const nextSalaryDate = hasValidRequestedPeriod ? requestedEndDate : inferNextSalaryDate(txs, latestSalary, settings);
  const cycleTxs = txs.filter((tx) => tx.transactionDate >= cycleStartDate && tx.transactionDate < nextSalaryDate);
  const today = new Date().toISOString().slice(0, 10);
  const effectiveToday = today < cycleStartDate ? cycleStartDate : (today >= nextSalaryDate ? nextSalaryDate : today);
  const actualCycleTxs = cycleTxs.filter((tx) => tx.transactionDate <= effectiveToday);
  const regularTotal = db.regularPayments
    .filter((item) => item.userId === user.id && item.status === "confirmed")
    .reduce((sum, item) => sum + Number(item.expectedAmount || 0), 0);
  const additionalIncomeTxs = actualCycleTxs
    .filter((tx) => tx.direction === "incoming" && tx.classification !== "salary" && tx.classification !== "own_transfer" && !tx.isExcluded && tx.increasesFreeSpend);
  const additionalIncome = additionalIncomeTxs
    .reduce((sum, tx) => sum + tx.amount, 0);
  const freeSpendTxs = variableSpendTransactions(actualCycleTxs).filter((tx) => !tx.budgetId);
  const actualVariableSpend = freeSpendTxs
    .reduce((sum, tx) => sum + tx.amount, 0);
  const fixed = Number(settings.fixedMonthlyAmount || 0);
  const cycleFreeSpend = fixed + additionalIncome - regularTotal;
  const remainingFreeSpend = cycleFreeSpend - actualVariableSpend;
  const daysElapsed = Math.max(1, daysBetween(cycleStartDate, effectiveToday) + 1);
  const totalCycleDays = Math.max(1, daysBetween(cycleStartDate, nextSalaryDate));
  const daysRemaining = Math.max(1, daysBetween(effectiveToday, nextSalaryDate));
  const periodElapsedPercent = Math.max(0, Math.min(100, (daysElapsed / totalCycleDays) * 100));
  const actualAvgDailySpend = actualVariableSpend / daysElapsed;
  const allowedAvgDailySpend = remainingFreeSpend / daysRemaining;
  const projectedVariableSpend = actualAvgDailySpend * totalCycleDays;
  const projectedEndBalance = cycleFreeSpend - projectedVariableSpend;
  const budgets = budgetStatuses(db, user.id, txs, cycleStartDate, nextSalaryDate, daysRemaining, effectiveToday);
  const unassignedVariableSpend = freeSpendTxs.reduce((sum, tx) => sum + tx.amount, 0);

  return {
    settings,
    hasSalary: true,
    latestSalary,
    cycleStartDate,
    nextSalaryDate,
    effectiveToday,
    cycleTxs,
    actualCycleTxs,
    additionalIncomeTxs,
    freeSpendTxs,
    regularTotal,
    additionalIncome,
    actualVariableSpend,
    cycleFreeSpend,
    remainingFreeSpend,
    daysElapsed,
    totalCycleDays,
    daysRemaining,
    periodElapsedPercent,
    actualAvgDailySpend,
    allowedAvgDailySpend,
    projectedEndBalance,
    budgets,
    unassignedVariableSpend,
  };
}

function dashboardPeriodOptions(url) {
  return {
    cycleStartDate: url.searchParams.get("cycleStartDate") || "",
    cycleEndDate: url.searchParams.get("cycleEndDate") || "",
  };
}

function dashboardPeriodQuery(data) {
  return new URLSearchParams({
    cycleStartDate: data.cycleStartDate,
    cycleEndDate: data.nextSalaryDate,
  }).toString();
}

function addDaysIso(dateText, days) {
  const d = new Date(`${dateText}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function chartAmount(value) {
  const amount = Number(value || 0);
  if (amount >= 1000000) return `${Math.round(amount / 100000) / 10} mil.`;
  if (amount >= 1000) return `${Math.round(amount / 1000)} tis.`;
  return String(Math.round(amount));
}

function chartSegmentForTransaction(tx, budgetById) {
  const budget = tx.budgetId ? budgetById.get(tx.budgetId) : null;
  if (budget) {
    return {
      direction: "outgoing",
      label: tx.budgetFlow === "fund" ? `Dobití budgetu: ${budget.name}` : `Budget: ${budget.name}`,
      color: budget.color,
    };
  }
  if (tx.direction === "incoming") {
    if (tx.classification === "salary") return { direction: "incoming", label: "Mzda", color: "#f4cf64" };
    if (tx.classification === "ignored_savings" || tx.isExcluded) return { direction: "incoming", label: "Příchozí mimo evidenci", color: "#cfeede" };
    if (tx.classification === "own_transfer") return { direction: "incoming", label: "Vlastní převod příchozí", color: "#d7dee8" };
    if (tx.classification === "additional_income" && tx.increasesFreeSpend) return { direction: "incoming", label: "Navýší spend", color: "#8bd7a8" };
    return { direction: "incoming", label: "Ostatní příchozí", color: "#a7dbc0" };
  }
  if (tx.isExcluded || tx.classification === "ignored_savings") return { direction: "outgoing", label: "Odchozí mimo evidenci", color: "#dfe4e2" };
  if (tx.classification === "regular_payment") return { direction: "outgoing", label: "Pravidelné platby", color: "#c9cfcd" };
  if (tx.classification === "own_transfer") return { direction: "outgoing", label: "Vlastní převod odchozí", color: "#d7dee8" };
  if (tx.classification === "variable_spend") return { direction: "outgoing", label: "Volný spend", color: "#e9a39d" };
  return { direction: "outgoing", label: "Ostatní odchozí", color: "#d6bbb6" };
}

function chartSegmentForTransaction(tx, budgetById) {
  const budget = tx.budgetId ? budgetById.get(tx.budgetId) : null;
  if (budget) {
    const budgetType = budget.type === "envelope" ? "envelope" : "regular";
    const flow = tx.budgetFlow === "fund" ? "fund" : "spend";
    return {
      direction: "outgoing",
      key: `${budgetType}_${flow}_${budget.id}`,
      label: flow === "fund" ? `Dobití budgetu: ${budget.name}` : `Budget: ${budget.name}`,
      color: budget.color,
    };
  }
  if (tx.direction === "incoming") {
    if (tx.classification === "salary") return { direction: "incoming", key: "salary", label: "Mzda", color: "#f4cf64" };
    if (tx.classification === "ignored_savings" || tx.isExcluded) return { direction: "incoming", key: "incoming_ignored", label: "Příchozí mimo evidenci", color: "#cfeede" };
    if (tx.classification === "own_transfer") return { direction: "incoming", key: "incoming_own_transfer", label: "Vlastní převod příchozí", color: "#d7dee8" };
    if (tx.classification === "additional_income" && tx.increasesFreeSpend) return { direction: "incoming", key: "additional_income", label: "Navýší spend", color: "#8bd7a8" };
    return { direction: "incoming", key: "incoming_other", label: "Ostatní příchozí", color: "#a7dbc0" };
  }
  if (tx.isExcluded || tx.classification === "ignored_savings") return { direction: "outgoing", key: "outgoing_ignored", label: "Odchozí mimo evidenci", color: "#dfe4e2" };
  if (tx.classification === "regular_payment") return { direction: "outgoing", key: "regular_payment", label: "Pravidelné platby", color: "#c9cfcd" };
  if (tx.classification === "own_transfer") return { direction: "outgoing", key: "outgoing_own_transfer", label: "Vlastní převod odchozí", color: "#d7dee8" };
  if (tx.classification === "variable_spend") return { direction: "outgoing", key: "variable_spend", label: "Volný spend", color: "#e9a39d" };
  return { direction: "outgoing", key: "outgoing_other", label: "Ostatní odchozí", color: "#d6bbb6" };
}

function cashflowChart(data) {
  const budgetsById = new Map(data.budgets.map((budget) => [budget.id, budget]));
  const dayCount = Math.max(1, daysBetween(data.cycleStartDate, data.nextSalaryDate));
  const days = Array.from({ length: dayCount }, (_, index) => addDaysIso(data.cycleStartDate, index));
  const byDay = new Map(days.map((day) => [day, { incoming: new Map(), outgoing: new Map() }]));
  const legends = new Map();
  const hiddenSegments = new Set(Array.isArray(data.settings.chartHiddenSegments) ? data.settings.chartHiddenSegments : []);

  for (const tx of data.cycleTxs) {
    const bucket = byDay.get(tx.transactionDate);
    if (!bucket) continue;
    const segment = chartSegmentForTransaction(tx, budgetsById);
    const stack = bucket[segment.direction];
    const current = stack.get(segment.key) || { amount: 0, color: segment.color, label: segment.label, key: segment.key };
    current.amount += Number(tx.amount || 0);
    stack.set(segment.key, current);
    legends.set(segment.key, { label: segment.label, color: segment.color });
  }

  const incomingMax = Math.max(1, ...days.map((day) => [...byDay.get(day).incoming.values()].reduce((sum, item) => sum + item.amount, 0)));
  const outgoingMax = Math.max(1, ...days.map((day) => [...byDay.get(day).outgoing.values()].reduce((sum, item) => sum + item.amount, 0)));
  const width = 1180;
  const height = 440;
  const left = 92;
  const right = 34;
  const top = 48;
  const baseline = 196;
  const incomingHeight = 128;
  const outgoingHeight = 128;
  const plotWidth = width - left - right;
  const step = plotWidth / Math.max(1, days.length);
  const barWidth = Math.max(4, Math.min(24, step * 0.62));
  const labelEvery = Math.max(1, Math.ceil(days.length / 9));
  const incomingScale = incomingHeight / incomingMax;
  const outgoingScale = outgoingHeight / outgoingMax;

  const bars = days.map((day, index) => {
    const x = left + index * step + (step - barWidth) / 2;
    const bucket = byDay.get(day);
    let incomingY = baseline;
    let outgoingY = baseline;
    const incomingRects = [...bucket.incoming.entries()].map(([label, item]) => {
      const rectHeight = Math.max(1, item.amount * incomingScale);
      incomingY -= rectHeight;
      return `<rect x="${x.toFixed(2)}" y="${incomingY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${rectHeight.toFixed(2)}" fill="${escapeHtml(item.color)}" stroke="#ffffff" stroke-width="0.7"><title>${escapeHtml(`${shortDate(day)} · ${label}: ${money(item.amount)}`)}</title></rect>`;
    }).join("");
    const outgoingRects = [...bucket.outgoing.entries()].map(([label, item]) => {
      const rectHeight = Math.max(1, item.amount * outgoingScale);
      const rect = `<rect x="${x.toFixed(2)}" y="${outgoingY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${rectHeight.toFixed(2)}" fill="${escapeHtml(item.color)}" stroke="#ffffff" stroke-width="0.7"><title>${escapeHtml(`${shortDate(day)} · ${label}: ${money(item.amount)}`)}</title></rect>`;
      outgoingY += rectHeight;
      return rect;
    }).join("");
    const label = index % labelEvery === 0 || index === days.length - 1
      ? `<text x="${(x + barWidth / 2).toFixed(2)}" y="378" text-anchor="middle" class="chart-axis-label">${shortDate(day).replace(/\s/g, "")}</text>`
      : "";
    return `${incomingRects}${outgoingRects}${label}`;
  }).join("");

  const legend = [...legends.entries()].map(([label, color]) => `
    <span><i style="background:${escapeHtml(color)}"></i>${escapeHtml(label)}</span>`).join("");

  return `<div class="chart-scroll">
    <svg class="cashflow-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Denní příchozí a odchozí transakce v období">
      <line x1="${left}" y1="${top}" x2="${left}" y2="${baseline}" class="chart-axis incoming-axis"></line>
      <line x1="${width - right}" y1="${baseline}" x2="${width - right}" y2="${baseline + outgoingHeight}" class="chart-axis outgoing-axis"></line>
      <line x1="${left}" y1="${baseline}" x2="${width - right}" y2="${baseline}" class="chart-baseline"></line>
      <text x="16" y="${top + 4}" class="chart-axis-title incoming-axis-text">Příchozí</text>
      <text x="${width - 18}" y="${baseline + outgoingHeight}" text-anchor="end" class="chart-axis-title outgoing-axis-text">Odchozí</text>
      <text x="${left - 10}" y="${top + 4}" text-anchor="end" class="chart-axis-label">${chartAmount(incomingMax)}</text>
      <text x="${left - 10}" y="${baseline + 4}" text-anchor="end" class="chart-axis-label">0</text>
      <text x="${width - right + 10}" y="${baseline + 4}" class="chart-axis-label">0</text>
      <text x="${width - right + 10}" y="${baseline + outgoingHeight}" class="chart-axis-label">${chartAmount(outgoingMax)}</text>
      ${bars}
    </svg>
  </div>
  <div class="chart-legend">${legend || '<span class="muted-text">V období nejsou žádné transakce.</span>'}</div>`;
}

function cashflowChart(data) {
  const budgetsById = new Map(data.budgets.map((budget) => [budget.id, budget]));
  const dayCount = Math.max(1, daysBetween(data.cycleStartDate, data.nextSalaryDate));
  const days = Array.from({ length: dayCount }, (_, index) => addDaysIso(data.cycleStartDate, index));
  const byDay = new Map(days.map((day) => [day, { incoming: new Map(), outgoing: new Map() }]));
  const legends = new Map();
  const hiddenSegments = new Set(Array.isArray(data.settings.chartHiddenSegments) ? data.settings.chartHiddenSegments : []);

  for (const tx of data.cycleTxs) {
    const bucket = byDay.get(tx.transactionDate);
    if (!bucket) continue;
    const segment = chartSegmentForTransaction(tx, budgetsById);
    const stack = bucket[segment.direction];
    const current = stack.get(segment.key) || { amount: 0, color: segment.color, label: segment.label };
    current.amount += Number(tx.amount || 0);
    stack.set(segment.key, current);
    legends.set(segment.key, { label: segment.label, color: segment.color });
  }

  const incomingMax = Math.max(1, ...days.map((day) => [...byDay.get(day).incoming.values()].reduce((sum, item) => sum + item.amount, 0)));
  const outgoingMax = Math.max(1, ...days.map((day) => [...byDay.get(day).outgoing.values()].reduce((sum, item) => sum + item.amount, 0)));
  const width = 1180;
  const height = 440;
  const left = 92;
  const right = 34;
  const top = 48;
  const baseline = 196;
  const incomingHeight = 128;
  const outgoingHeight = 128;
  const plotWidth = width - left - right;
  const step = plotWidth / Math.max(1, days.length);
  const barWidth = Math.max(4, Math.min(24, step * 0.62));
  const labelEvery = Math.max(1, Math.ceil(days.length / 9));
  const incomingScale = incomingHeight / incomingMax;
  const outgoingScale = outgoingHeight / outgoingMax;

  const bars = days.map((day, index) => {
    const x = left + index * step + (step - barWidth) / 2;
    const bucket = byDay.get(day);
    let incomingY = baseline;
    let outgoingY = baseline;
    const incomingRects = [...bucket.incoming.entries()].map(([key, item]) => {
      const rectHeight = Math.max(1, item.amount * incomingScale);
      incomingY -= rectHeight;
      return `<rect data-chart-key="${escapeHtml(key)}" style="${hiddenSegments.has(key) ? "display:none" : ""}" x="${x.toFixed(2)}" y="${incomingY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${rectHeight.toFixed(2)}" fill="${escapeHtml(item.color)}" stroke="#ffffff" stroke-width="0.7"><title>${escapeHtml(`${shortDate(day)} - ${item.label}: ${money(item.amount)}`)}</title></rect>`;
    }).join("");
    const outgoingRects = [...bucket.outgoing.entries()].map(([key, item]) => {
      const rectHeight = Math.max(1, item.amount * outgoingScale);
      const rect = `<rect data-chart-key="${escapeHtml(key)}" style="${hiddenSegments.has(key) ? "display:none" : ""}" x="${x.toFixed(2)}" y="${outgoingY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${rectHeight.toFixed(2)}" fill="${escapeHtml(item.color)}" stroke="#ffffff" stroke-width="0.7"><title>${escapeHtml(`${shortDate(day)} - ${item.label}: ${money(item.amount)}`)}</title></rect>`;
      outgoingY += rectHeight;
      return rect;
    }).join("");
    const label = index % labelEvery === 0 || index === days.length - 1
      ? `<text x="${(x + barWidth / 2).toFixed(2)}" y="378" text-anchor="middle" class="chart-axis-label">${shortDate(day).replace(/\s/g, "")}</text>`
      : "";
    return `${incomingRects}${outgoingRects}${label}`;
  }).join("");

  const legend = [...legends.entries()].map(([key, item]) => `
    <label><input type="checkbox" value="${escapeHtml(key)}" data-chart-filter ${hiddenSegments.has(key) ? "" : "checked"}><i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.label)}</label>`).join("");

  return `<div class="chart-scroll">
    <svg class="cashflow-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Denní útrata podle typů transakcí">
      <line x1="${left}" y1="${top}" x2="${left}" y2="${baseline}" class="chart-axis incoming-axis"></line>
      <line x1="${left}" y1="${baseline}" x2="${left}" y2="${baseline + outgoingHeight}" class="chart-axis outgoing-axis"></line>
      <line x1="${left}" y1="${baseline}" x2="${width - right}" y2="${baseline}" class="chart-baseline"></line>
      <text x="${left}" y="${top - 18}" class="chart-axis-title incoming-axis-text">Příchozí</text>
      <text x="${left}" y="${baseline + outgoingHeight + 30}" class="chart-axis-title outgoing-axis-text">Odchozí</text>
      <text x="${left - 10}" y="${top + 4}" text-anchor="end" class="chart-axis-label">${chartAmount(incomingMax)}</text>
      <text x="${left - 10}" y="${baseline + 4}" text-anchor="end" class="chart-axis-label">0</text>
      <text x="${left - 10}" y="${baseline + outgoingHeight}" text-anchor="end" class="chart-axis-label">${chartAmount(outgoingMax)}</text>
      ${bars}
    </svg>
  </div>
  <div class="chart-legend">${legend || '<span class="muted-text">V období nejsou žádné transakce.</span>'}</div>`;
}

function detailTransactionsTable(txs, amountMode = "signed") {
  const total = txs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const displayAmount = (tx) => `${amountMode === "outgoing" ? "-" : (tx.direction === "incoming" ? "+" : "-")}${money(tx.amount)}`;
  const displayTotal = amountMode === "outgoing" ? `-${money(total)}` : money(total);
  return `<table class="detail-table">
    <thead><tr><th>Datum</th><th>Směr</th><th>Částka</th><th>Popis</th><th>Kategorie</th><th>Poznámka</th></tr></thead>
    <tbody>
      ${txs.map((tx) => `<tr>
        <td>${shortDate(tx.transactionDate)}</td>
        <td>${tx.direction === "incoming" ? "Příchozí" : "Odchozí"}</td>
        <td class="${tx.direction === "incoming" ? "amount-in" : "amount-out"}">${displayAmount(tx)}</td>
        <td><strong>${escapeHtml(tx.counterpartyName || "")}</strong><br><span class="muted-text">${escapeHtml(tx.description || "")}</span></td>
        <td>${tx.category ? escapeHtml(tx.category) : '<span class="muted-text">-</span>'}</td>
        <td>${tx.note ? escapeHtml(tx.note) : '<span class="muted-text">-</span>'}</td>
      </tr>`).join("") || '<tr><td colspan="6" class="empty">Žádné položky.</td></tr>'}
      <tr class="sum-row"><td colspan="2">Součet</td><td>${displayTotal}</td><td colspan="3"></td></tr>
    </tbody>
  </table>`;
}

function regularPaymentsDetailTable(items) {
  const total = items.reduce((sum, item) => sum + Number(item.expectedAmount || 0), 0);
  return `<table class="detail-table">
    <thead><tr><th>Název</th><th>Částka</th><th>Den</th><th>Poznámka</th></tr></thead>
    <tbody>
      ${items.map((item) => `<tr>
        <td>${escapeHtml(decrypt(item.nameEncrypted))}</td>
        <td>-${money(item.expectedAmount)}</td>
        <td>${escapeHtml(item.expectedDay)}. den</td>
        <td>${decrypt(item.noteEncrypted) ? escapeHtml(decrypt(item.noteEncrypted)) : '<span class="muted-text">-</span>'}</td>
      </tr>`).join("") || '<tr><td colspan="4" class="empty">Žádné položky.</td></tr>'}
      <tr class="sum-row"><td>Součet</td><td>-${money(total)}</td><td colspan="2"></td></tr>
    </tbody>
  </table>`;
}

function breakdownTable(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return `<table class="detail-table">
    <thead><tr><th>Položka</th><th>Částka</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.amount < 0 ? "-" : ""}${money(Math.abs(row.amount))}</td></tr>`).join("")}
      <tr class="sum-row"><td>Součet</td><td>${total < 0 ? "-" : ""}${money(Math.abs(total))}</td></tr>
    </tbody>
  </table>`;
}

function transactionBadge(tx) {
  if (tx.isExcluded) return '<span class="badge muted">Mimo evidenci</span>';
  const labels = {
    salary: "Mzda",
    regular_payment: "Pravidelná",
    own_transfer: "Vlastní převod",
    additional_income: "Navýší spend",
    variable_spend: "Volný spend",
    budget_transaction: "Budget",
    ignored_savings: "Mimo evidenci",
    unclassified: "Nezařazeno",
  };
  const label = labels[tx.classification] || tx.classification;
  return `<span class="badge">${escapeHtml(label)}</span>`;
}

function isOutOfEvidence(tx) {
  return Boolean(tx.isExcluded || tx.classification === "ignored_savings");
}

function transactionRowClass(tx, budget = null) {
  if (budget && tx.budgetFlow === "fund") return "budget-fund-row";
  if (budget) return "budget-spend-row";
  if (tx.classification === "salary") return "salary-row";
  if (tx.isExcluded && tx.direction === "outgoing") return "excluded-outgoing-row";
  if (tx.direction === "incoming" && tx.classification === "ignored_savings") return "ignored-income-row";
  if (tx.direction === "incoming") return "incoming-row";
  if (tx.classification === "regular_payment") return "regular-row";
  return "";
}

function matchesTransactionFilter(tx, filter, constraints = {}) {
  const minAmount = Number(constraints.minAmount || 0);
  const maxAmount = Number(constraints.maxAmount || 0);
  const dateFrom = constraints.dateFrom || "";
  const dateTo = constraints.dateTo || "";
  if (filter) {
    if (filter.startsWith("budget:") && tx.budgetId !== filter.slice("budget:".length)) return false;
    if (filter === "excluded" && !isOutOfEvidence(tx)) return false;
    if (filter === "incoming" && tx.direction !== "incoming") return false;
    if (!filter.startsWith("budget:") && !["excluded", "incoming"].includes(filter) && tx.classification !== filter) return false;
  }
  if (minAmount > 0 && Number(tx.amount || 0) < minAmount) return false;
  if (maxAmount > 0 && Number(tx.amount || 0) > maxAmount) return false;
  if (dateFrom && tx.transactionDate < dateFrom) return false;
  if (dateTo && tx.transactionDate > dateTo) return false;
  return true;
}

function transactionsUrl(filter = "", constraints = {}) {
  const params = new URLSearchParams();
  if (filter) params.set("filter", filter);
  if (constraints.minAmountInput) params.set("minAmount", constraints.minAmountInput);
  if (constraints.maxAmountInput) params.set("maxAmount", constraints.maxAmountInput);
  if (constraints.dateFrom) params.set("dateFrom", constraints.dateFrom);
  if (constraints.dateTo) params.set("dateTo", constraints.dateTo);
  const query = params.toString();
  return `/transactions${query ? `?${query}` : ""}`;
}

function applyTransactionAction(db, userId, tx, action) {
  if (!tx || tx.userId !== userId) return false;
  if (action === "salary" && tx.direction === "incoming") {
    tx.classification = "salary";
    tx.increasesFreeSpend = false;
  } else if (action === "incomeSpend" && tx.direction === "incoming") {
    tx.classification = "additional_income";
    tx.increasesFreeSpend = true;
  } else if (action === "incomeIgnored" && tx.direction === "incoming") {
    tx.classification = "ignored_savings";
    tx.increasesFreeSpend = false;
  } else if (action === "variableSpend" && tx.direction === "outgoing") {
    tx.classification = "variable_spend";
  } else if (action === "ignore") {
    if (tx.direction === "incoming") {
      tx.classification = "ignored_savings";
      tx.increasesFreeSpend = false;
      tx.isExcluded = false;
    } else {
      tx.isExcluded = true;
    }
  } else if (action === "unignore") {
    if (tx.direction === "incoming" && tx.classification === "ignored_savings") {
      tx.classification = "additional_income";
      tx.increasesFreeSpend = true;
    }
    tx.isExcluded = false;
  } else if (action === "exclude") {
    tx.isExcluded = true;
  } else if (action === "unexclude") {
    tx.isExcluded = false;
  } else {
    return false;
  }
  tx.updatedAt = nowIso();
  return true;
}

function getAction(reqUrl) {
  const parsed = new URL(reqUrl, "http://localhost");
  return parsed.pathname;
}

function detectRegularCandidates(db, userId) {
  const txs = userTransactions(db, userId)
    .filter((tx) => tx.direction === "outgoing" && !tx.isExcluded && !["own_transfer", "regular_payment"].includes(tx.classification));
  if (!txs.length) return [];
  const months = new Set(txs.map((tx) => tx.transactionDate.slice(0, 7)));
  const required = Math.ceil(months.size * 0.8);
  const groups = new Map();
  for (const tx of txs) {
    const amountBucket = Math.round(tx.amount);
    const key = [
      normalizeText(tx.counterpartyAccount || tx.counterpartyName || tx.description).slice(0, 50),
      amountBucket,
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  return [...groups.entries()].map(([key, items]) => {
    const itemMonths = new Set(items.map((tx) => tx.transactionDate.slice(0, 7)));
    const days = items.map((tx) => Number(tx.transactionDate.slice(8, 10)));
    const avgDay = Math.round(days.reduce((sum, day) => sum + day, 0) / days.length);
    const maxDayVariance = Math.max(...days.map((day) => Math.abs(day - avgDay)));
    const amounts = items.map((tx) => tx.amount);
    const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const maxAmountVariance = Math.max(...amounts.map((amount) => Math.abs(amount - avgAmount)));
    const amountOk = maxAmountVariance <= Math.max(20, avgAmount * 0.03);
    if (itemMonths.size < required || maxDayVariance > 4 || !amountOk) return null;
    const first = items[0];
    return {
      signature: hash(`${userId}|${key}`),
      key,
      txIds: items.map((tx) => tx.id),
      name: first.counterpartyName || first.description || first.counterpartyAccount || "Pravidelná platba",
      description: first.description,
      counterpartyAccount: first.counterpartyAccount,
      expectedAmount: Math.round(avgAmount),
      expectedDay: avgDay,
      months: itemMonths.size,
      occurrences: items.length,
    };
  }).filter(Boolean);
}

function findSimilarRegularTransactions(db, userId, sourceTx) {
  const source = decryptTransaction(sourceTx);
  const sourceDescription = normalizeText(source.description);
  const sourceDay = Number(source.transactionDate.slice(8, 10));
  const sourceAmount = Number(source.amount || 0);

  if (!sourceDescription || source.direction !== "outgoing") return [];

  return db.transactions.filter((candidate) => {
    if (candidate.userId !== userId || candidate.direction !== "outgoing" || candidate.isExcluded) return false;
    const candidateReadable = decryptTransaction(candidate);
    const candidateDay = Number(candidateReadable.transactionDate.slice(8, 10));
    return Number(candidateReadable.amount || 0) === sourceAmount
      && Math.abs(candidateDay - sourceDay) <= 5
      && normalizeText(candidateReadable.description) === sourceDescription;
  });
}

function createRegularPaymentFromTransaction(db, userId, sourceTx) {
  const source = decryptTransaction(sourceTx);
  if (!source || source.direction !== "outgoing") return null;

  const similar = findSimilarRegularTransactions(db, userId, sourceTx);
  const name = source.counterpartyName || source.description || source.counterpartyAccount || "Trvalá platba";
  const expectedDay = Number(source.transactionDate.slice(8, 10));
  const counterpartyAccount = normalizeAccount(source.counterpartyAccount || "");
  const descriptionPattern = normalizeText(source.description || "");
  const existing = db.regularPayments.find((item) => item.userId === userId
    && item.status === "confirmed"
    && Number(item.expectedAmount || 0) === Number(source.amount || 0)
    && Number(item.expectedDay || 0) === expectedDay
    && item.descriptionPatternHash === hash(descriptionPattern));

  const payment = existing || {
    id: id(),
    userId,
    nameEncrypted: encrypt(name),
    counterpartyAccountHash: counterpartyAccount ? hash(counterpartyAccount) : "",
    descriptionPatternHash: hash(descriptionPattern),
    expectedAmount: Number(source.amount || 0),
    expectedDay,
    status: "confirmed",
    txIds: [],
    isManual: true,
    createdFromTransactionId: sourceTx.id,
    noteEncrypted: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const similarIds = new Set([...(payment.txIds || []), ...similar.map((tx) => tx.id)]);
  payment.txIds = [...similarIds];
  payment.updatedAt = nowIso();

  if (!existing) db.regularPayments.push(payment);

  db.transactions.filter((tx) => similarIds.has(tx.id) && tx.userId === userId).forEach((tx) => {
    tx.classification = "regular_payment";
    tx.updatedAt = nowIso();
  });

  return payment;
}

async function handle(req, res) {
  const db = loadDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathName = url.pathname;
  const user = getDbUser(db, req);

  if (!isSameOriginRequest(req)) {
    return send(res, 403, layout({
      title: "Požadavek zamítnut",
      user,
      body: "<h1>Požadavek zamítnut</h1><p>Formulářový požadavek nepřišel ze stejného původu.</p>",
    }));
  }

  if (pathName === "/style.css") {
    const css = fs.readFileSync(path.join(PUBLIC_DIR, "style.css"), "utf8");
    return sendText(res, 200, css, { "Content-Type": "text/css; charset=utf-8" });
  }

  if (pathName === "/app.js") {
    const js = fs.readFileSync(path.join(PUBLIC_DIR, "app.js"), "utf8");
    return sendText(res, 200, js, { "Content-Type": "application/javascript; charset=utf-8" });
  }

  if (pathName === "/") return redirect(res, user ? "/dashboard" : "/login");

  if (pathName === "/register" && req.method === "GET") {
    return send(res, 200, layout({
      title: "Registrace",
      user,
      body: `<section class="auth-card">
        <h1>Registrace</h1>
        <form method="post" class="stack">
          <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
          <label>Heslo<input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
          <button class="primary">Vytvořit účet</button>
        </form>
        <p class="small">Už účet máš? <a href="/login">Přihlásit se</a></p>
      </section>`,
    }));
  }

  if (pathName === "/register" && req.method === "POST") {
    const form = parseForm(await readBody(req));
    const email = String(form.email || "").trim().toLowerCase();
    if (!email || !form.password) return redirect(res, "/register");
    if (db.users.some((item) => item.email === email)) {
      return send(res, 409, layout({ title: "Registrace", user, flash: "Účet s tímto e-mailem už existuje.", body: '<a href="/register">Zpět</a>' }));
    }
    const newUser = {
      id: id(),
      email,
      passwordHash: passwordHash(form.password),
      role: db.users.length === 0 ? "admin" : "user",
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastLoginAt: nowIso(),
    };
    db.users.push(newUser);
    userSettings(db, newUser.id);
    const sid = createSession(db, newUser.id);
    saveDb(db);
    res.writeHead(303, { Location: "/dashboard", "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; Path=/; SameSite=Strict` });
    return res.end();
  }

  if (pathName === "/login" && req.method === "GET") {
    return send(res, 200, layout({
      title: "Přihlášení",
      user,
      body: `<section class="auth-card">
        <h1>Přihlášení</h1>
        <form method="post" class="stack">
          <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
          <label>Heslo<input name="password" type="password" required autocomplete="current-password"></label>
          <button class="primary">Přihlásit</button>
        </form>
        <p class="small"><a href="/password/forgot">Zapomenuté heslo</a> · <a href="/register">Vytvořit účet</a></p>
      </section>`,
    }));
  }

  if (pathName === "/login" && req.method === "POST") {
    const form = parseForm(await readBody(req));
    const found = db.users.find((item) => item.email === String(form.email || "").trim().toLowerCase() && item.status === "active");
    if (!found || !verifyPassword(form.password || "", found.passwordHash)) {
      return send(res, 401, layout({ title: "Přihlášení", user, flash: "Přihlášení se nepovedlo.", body: '<a href="/login">Zkusit znovu</a>' }));
    }
    found.lastLoginAt = nowIso();
    const sid = createSession(db, found.id);
    saveDb(db);
    res.writeHead(303, { Location: "/dashboard", "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; Path=/; SameSite=Strict` });
    return res.end();
  }

  if (pathName === "/logout" && req.method === "POST") {
    const sid = parseCookies(req).sid;
    const next = { ...db, sessions: db.sessions.filter((item) => item.id !== sid) };
    saveDb(next);
    res.writeHead(303, { Location: "/login", "Set-Cookie": "sid=; Max-Age=0; Path=/; SameSite=Lax" });
    return res.end();
  }

  if (pathName === "/password/forgot" && req.method === "GET") {
    return send(res, 200, layout({
      title: "Reset hesla",
      user,
      body: `<section class="auth-card"><h1>Reset hesla</h1>
        <form method="post" class="stack">
          <label>E-mail<input name="email" type="email" required></label>
          <button class="primary">Poslat odkaz</button>
        </form>
      </section>`,
    }));
  }

  if (pathName === "/password/forgot" && req.method === "POST") {
    const form = parseForm(await readBody(req));
    const found = db.users.find((item) => item.email === String(form.email || "").trim().toLowerCase());
    if (found) {
      const token = crypto.randomBytes(24).toString("hex");
      db.passwordResetTokens.push({
        id: id(),
        userId: found.id,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        usedAt: "",
        createdAt: nowIso(),
      });
      fs.appendFileSync(MAIL_LOG, `[${nowIso()}] Reset hesla pro ${found.email}: http://${HOST}:${PORT}/password/reset?token=${token}\n`, "utf8");
      saveDb(db);
    }
    return send(res, 200, layout({ title: "Reset hesla", user, flash: "Pokud účet existuje, reset odkaz je v lokálním mail logu.", body: `<p>Lokální e-maily se ukládají do <code>${escapeHtml(MAIL_LOG)}</code>.</p>` }));
  }

  if (pathName === "/password/reset" && req.method === "GET") {
    const token = url.searchParams.get("token") || "";
    return send(res, 200, layout({
      title: "Nové heslo",
      user,
      body: `<section class="auth-card"><h1>Nové heslo</h1>
        <form method="post" class="stack">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <label>Nové heslo<input name="password" type="password" minlength="6" required></label>
          <button class="primary">Uložit heslo</button>
        </form>
      </section>`,
    }));
  }

  if (pathName === "/password/reset" && req.method === "POST") {
    const form = parseForm(await readBody(req));
    const record = db.passwordResetTokens.find((item) => item.tokenHash === hash(form.token) && !item.usedAt && new Date(item.expiresAt) > new Date());
    if (!record) return send(res, 400, layout({ title: "Nové heslo", user, flash: "Reset odkaz je neplatný nebo expirovaný.", body: '<a href="/password/forgot">Vyžádat nový</a>' }));
    const found = db.users.find((item) => item.id === record.userId);
    found.passwordHash = passwordHash(form.password);
    found.updatedAt = nowIso();
    record.usedAt = nowIso();
    saveDb(db);
    return redirect(res, "/login");
  }

  if (pathName === "/dashboard/detail") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const data = dashboardData(db, current, dashboardPeriodOptions(url));
    if (!data.hasSalary) return redirect(res, "/dashboard");
    const periodQuery = dashboardPeriodQuery(data);
    const kind = url.searchParams.get("kind") || "";
    const regularItems = db.regularPayments
      .filter((item) => item.userId === current.id && item.status === "confirmed")
      .sort((a, b) => Number(a.expectedDay || 0) - Number(b.expectedDay || 0)
        || decrypt(a.nameEncrypted).localeCompare(decrypt(b.nameEncrypted), "cs"));
    const salaryTxs = [data.latestSalary];
    const details = {
      salary: {
        title: "Mzdy",
        amount: money(salaryTxs.reduce((sum, tx) => sum + tx.amount, 0)),
        table: detailTransactionsTable(salaryTxs),
      },
      additionalIncome: {
        title: "Další příjmy započtené do volného spendu",
        amount: `+${money(data.additionalIncome)}`,
        table: detailTransactionsTable(data.additionalIncomeTxs),
      },
      regularPayments: {
        title: "Pravidelné platby",
        amount: `-${money(data.regularTotal)}`,
        table: regularPaymentsDetailTable(regularItems),
        after: '<div class="actions"><a class="button" href="/regular-payments">Spravovat pravidelné platby</a></div>',
      },
      cycleFreeSpend: {
        title: "Volný spend na začátku období",
        amount: money(data.cycleFreeSpend),
        table: breakdownTable([
          { label: "Provozní rámec", amount: Number(data.settings.fixedMonthlyAmount || 0) },
          { label: "Další příjmy", amount: Number(data.additionalIncome || 0) },
          { label: "Pravidelné platby", amount: -Number(data.regularTotal || 0) },
        ]),
      },
      variableSpend: {
        title: "Průběžné volné platby od výplaty",
        amount: `-${money(data.actualVariableSpend)}`,
        table: detailTransactionsTable(data.freeSpendTxs, "outgoing"),
      },
      remainingFreeSpend: {
        title: "Aktuální volná částka",
        amount: money(data.remainingFreeSpend),
        table: breakdownTable([
          { label: "Volný spend na začátku období", amount: Number(data.cycleFreeSpend || 0) },
          { label: "Průběžné volné platby od výplaty", amount: -Number(data.actualVariableSpend || 0) },
        ]),
      },
    };
    const detail = details[kind];
    if (!detail) return redirect(res, "/dashboard");
    return send(res, 200, layout({
      title: detail.title,
      user: current,
      body: `<section class="page-head">
        <div><p class="eyebrow">Detail dashboardu</p><h1>${escapeHtml(detail.title)}</h1></div>
        <a class="button" href="/dashboard?${periodQuery}">Zpět na dashboard</a>
      </section>
      <section class="metric-grid single">
        <article class="metric accent"><span>Součet</span><strong>${detail.amount}</strong></article>
      </section>
      <section class="panel">
        <div class="table-scroll">${detail.table}</div>
        ${detail.after || ""}
      </section>`,
    }));
  }

  if (pathName === "/dashboard") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const data = dashboardData(db, current, dashboardPeriodOptions(url));
    if (!data.hasSalary) {
      return send(res, 200, layout({
        title: "Dashboard",
        user: current,
        body: `<section class="hero-panel">
          <h1>Nejdřív označ mzdu</h1>
          <p>Importuj CSV a v transakcích označ hlavní příjem. Pak se dashboard přepočítá podle výplatního cyklu.</p>
          <div class="actions"><a class="button primary" href="/import">Importovat CSV</a><a class="button" href="/settings">Nastavení</a></div>
        </section>`,
      }));
    }
    const dashboardFlash = url.searchParams.get("dateUpdated")
      ? "Datum další výplaty bylo upraveno."
      : (url.searchParams.get("dateError") === "beforeSalary"
        ? "Datum další výplaty musí být po poslední označené mzdě."
        : (url.searchParams.get("dateError") === "invalid" ? "Zadej platné datum další výplaty." : ""));
    const periodQuery = dashboardPeriodQuery(data);
    const detailUrl = (kind) => `/dashboard/detail?kind=${kind}&${periodQuery}`;
    const regularBudgets = data.budgets.filter((budget) => budget.type !== "envelope");
    const envelopeBudgets = data.budgets.filter((budget) => budget.type === "envelope");
    const budgetCards = (items) => items.map((budget) => `<article class="budget-status-card ${budget.remaining < 0 ? "over" : ""}" style="--budget-color:${escapeHtml(budget.color)}">
            <div>
              <span class="muted-text">${budget.type === "envelope" ? "Obálka" : escapeHtml(budget.carryoverMode === "carryover" ? "Přenáší zůstatek" : (budget.carryoverMode === "savings" ? "Zbytek jde do úspor" : "Resetuje zůstatek"))}</span>
              <h3>${escapeHtml(budget.name)}</h3>
            </div>
            <dl class="compact-rows">
              ${budget.type === "envelope" ? `
                <div><dt>Počáteční balance</dt><dd>${money(budget.openingBalance)}</dd></div>
                ${budget.funded ? `<div><dt>Nabito v období</dt><dd>+${money(budget.funded)}</dd></div>` : ""}
                <div><dt>Vybráno v období</dt><dd>-${money(budget.spent)}</dd></div>
                <div><dt>Čerpáno</dt><dd>${Math.round(budget.usedPercent)} %</dd></div>
                <div><dt>Aktuální balance</dt><dd>${money(budget.remaining)}</dd></div>
              ` : `
                <div><dt>Budget cyklu</dt><dd>${money(budget.monthlyAmount)}</dd></div>
                ${budget.carryover ? `<div><dt>Přenesený zůstatek</dt><dd>+${money(budget.carryover)}</dd></div>` : ""}
                ${budget.funded ? `<div><dt>Nabito</dt><dd>+${money(budget.funded)}</dd></div>` : ""}
                <div><dt>Plánované výdaje</dt><dd>-${money(budget.plannedTotal)}</dd></div>
                <div><dt>Utraceno</dt><dd>-${money(budget.spent)}</dd></div>
                <div><dt>Čerpáno</dt><dd>${Math.round(budget.usedPercent)} %</dd></div>
                <div><dt>Zbývá</dt><dd>${money(budget.remaining)}</dd></div>
                <div><dt>Denní limit</dt><dd>${money(budget.dailyLimit)} / den</dd></div>
              `}
            </dl>
          </article>`).join("");
    return send(res, 200, layout({
      title: "Dashboard",
      user: current,
      flash: dashboardFlash,
      body: `<section class="page-head">
        <div>
          <p class="eyebrow">Aktuální výplatní cyklus</p>
          <h1>${shortDate(data.cycleStartDate)} → ${shortDate(data.nextSalaryDate)}</h1>
        </div>
        <form method="get" action="/dashboard" class="inline-form cycle-form">
          <label>Začátek cyklu <input type="date" name="cycleStartDate" value="${escapeHtml(data.cycleStartDate)}"></label>
          <label>Konec cyklu <input type="date" name="cycleEndDate" value="${escapeHtml(data.nextSalaryDate)}"></label>
          <button class="primary">Přepočítat</button>
          <a class="button" href="/dashboard">Aktuální cyklus</a>
        </form>
      </section>
      <section class="panel cashflow-panel">
        <h2>Výpočet volného spendu</h2>
        <div class="cashflow-steps">
          <a class="cashflow-step reference" href="${detailUrl("salary")}">
            <span>Poslední výplata</span>
            <strong>${money(data.latestSalary.amount)}</strong>
            <small>${shortDate(data.latestSalary.transactionDate)}</small>
          </a>
          <a class="cashflow-step accent" href="/settings">
            <span>Provozní rámec, ve kterém se chceš pohybovat</span>
            <strong>${money(data.settings.fixedMonthlyAmount)}</strong>
            <small>Nastaveno ručně</small>
          </a>
          ${data.additionalIncome ? `<a class="cashflow-step plus" href="${detailUrl("additionalIncome")}">
            <span>Další příjmy započtené do volného spendu</span>
            <strong>+${money(data.additionalIncome)}</strong>
            <small>Příchozí transakce označené jako navýšení spendu</small>
          </a>` : ""}
          <a class="cashflow-step minus" href="${detailUrl("regularPayments")}">
            <span>Pravidelné platby</span>
            <strong>-${money(data.regularTotal)}</strong>
            <small>Potvrzené a ručně přidané pravidelné platby</small>
          </a>
          <a class="cashflow-step subtotal" href="${detailUrl("cycleFreeSpend")}">
            <span>Volný spend na začátku období</span>
            <strong>${money(data.cycleFreeSpend)}</strong>
            <small>Provozní rámec po odečtení pravidelných plateb</small>
          </a>
          <a class="cashflow-step minus" href="${detailUrl("variableSpend")}">
            <span>Průběžné volné platby od výplaty</span>
            <strong>-${money(data.actualVariableSpend)}</strong>
            <small>Od ${shortDate(data.cycleStartDate)} do ${shortDate(data.effectiveToday)}</small>
          </a>
          <a class="cashflow-step result" href="${detailUrl("remainingFreeSpend")}">
            <span>Aktuální volná částka</span>
            <strong>${money(data.remainingFreeSpend)}</strong>
            <small>Z toho se počítá denní limit do další výplaty</small>
          </a>
        </div>
      </section>
      <section class="metric-grid">
        <article class="metric accent"><span>Aktuální volná částka</span><strong>${money(data.remainingFreeSpend)}</strong></article>
        <article class="metric"><span>Průměrný spend od výplaty</span><strong>${money(data.actualAvgDailySpend)} / den</strong></article>
        <article class="metric"><span>Ještě si můžeš dovolit</span><strong>${money(data.allowedAvgDailySpend)} / den</strong></article>
        <article class="metric ${data.projectedEndBalance >= 0 ? "positive" : "negative"}"><span>Predikce konce cyklu</span><strong>${data.projectedEndBalance >= 0 ? "+" : ""}${money(data.projectedEndBalance)}</strong></article>
      </section>
      <section class="panel flow-chart-panel">
        <div class="section-title-row">
          <h2>Denní útrata podle typů transakcí</h2>
          <span class="muted-text">${shortDate(data.cycleStartDate)} - ${shortDate(addDaysIso(data.nextSalaryDate, -1))}</span>
        </div>
        ${cashflowChart(data)}
      </section>
      <section class="panel tempo-panel">
        <h2>Tempo</h2>
        <dl class="rows tempo-grid">
          <div><dt>Dní od začátku období</dt><dd>${data.daysElapsed}</dd></div>
          <div><dt>Dní do konce období</dt><dd>${data.daysRemaining}</dd></div>
          <div><dt>Uběhlo z období</dt><dd>${Math.round(data.periodElapsedPercent)} %</dd></div>
          <div><dt>Predikce</dt><dd>${data.projectedEndBalance >= 0 ? "Vycházíš s rezervou." : "Aktuální tempo je nad plánem."}</dd></div>
        </dl>
      </section>
      ${data.settings.budgetMode === "budget" ? `<section class="panel budget-status-panel">
        <div class="section-title-row">
          <h2>Stav budgetů</h2>
          <a class="button" href="/budgets">Spravovat budgety</a>
        </div>
        ${regularBudgets.length || envelopeBudgets.length ? `
          ${regularBudgets.length ? `<h3>Pravidelné budgety</h3><div class="budget-status-grid">${budgetCards(regularBudgets)}</div>` : ""}
          ${envelopeBudgets.length ? `<h3>Obálky</h3><div class="budget-status-grid">${budgetCards(envelopeBudgets)}</div>` : ""}
        ` : '<p class="muted-text">Budget režim je zapnutý, ale zatím nemáš vytvořený žádný budget.</p>'}
        ${data.unassignedVariableSpend ? `<p class="budget-note">Výdaje v cyklu, které nejsou v budgetech: <strong>${money(data.unassignedVariableSpend)}</strong></p>` : ""}
      </section>` : ""}`,
    }));
  }

  if (pathName === "/cycles/expected-salary-date" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const expectedSalaryDate = parseDate(form.expectedSalaryDate);
    if (!expectedSalaryDate) return redirect(res, "/dashboard?dateError=invalid");
    const latestSalary = userTransactions(db, current.id).find((tx) => tx.classification === "salary" && tx.direction === "incoming");
    if (latestSalary && expectedSalaryDate <= latestSalary.transactionDate) {
      return redirect(res, "/dashboard?dateError=beforeSalary");
    }
    const settings = userSettings(db, current.id);
    settings.expectedSalaryDate = expectedSalaryDate;
    settings.updatedAt = nowIso();
    saveDb(db);
    return redirect(res, "/dashboard?dateUpdated=1");
  }

  if (pathName === "/settings" && req.method === "GET") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const settings = userSettings(db, current.id);
    const accounts = db.accounts.filter((item) => item.userId === current.id && item.isActive);
    const transactionsCount = db.transactions.filter((item) => item.userId === current.id).length;
    const settingsFlash = url.searchParams.get("transactionsDeleted") ? "Všechny transakce byly smazány." : "";
    return send(res, 200, layout({
      title: "Nastavení",
      user: current,
      flash: settingsFlash,
      body: `<section class="page-head"><div><p class="eyebrow">Nastavení</p><h1>Rozpočet a vlastní účty</h1></div></section>
      <section class="two-col">
        <article class="panel">
          <h2>Pevná měsíční částka</h2>
          <form method="post" action="/settings" class="stack">
            <label>Částka pro provozní život<input name="fixedMonthlyAmount" type="number" step="1" min="0" value="${escapeHtml(settings.fixedMonthlyAmount)}"></label>
            <label>Režim aplikace<select name="budgetMode">
              <option value="simple" ${settings.budgetMode !== "budget" ? "selected" : ""}>Jednoduchý volný spend</option>
              <option value="budget" ${settings.budgetMode === "budget" ? "selected" : ""}>Budgety a volitelná kategorizace</option>
            </select></label>
            <button class="primary">Uložit</button>
          </form>
        </article>
        <article class="panel">
          <h2>Přidat vlastní účet</h2>
          <form method="post" action="/settings/accounts" class="stack">
            <label>Název<input name="displayName" placeholder="Běžný účet"></label>
            <label>Číslo účtu<input name="account" placeholder="123456789/0100" required></label>
            <label>Typ<select name="accountType"><option value="current">Běžný</option><option value="savings">Spořicí</option></select></label>
            <button class="primary">Přidat účet</button>
          </form>
        </article>
      </section>
      <section class="panel">
        <h2>Moje účty</h2>
        <table><thead><tr><th>Název</th><th>Účet</th><th>Typ</th><th></th></tr></thead><tbody>
          ${accounts.map((account) => `<tr>
            <td>${escapeHtml(decrypt(account.displayNameEncrypted) || "Účet")}</td>
            <td>${escapeHtml(decrypt(account.accountEncrypted))}</td>
            <td>${account.accountType === "savings" ? "Spořicí" : "Běžný"}</td>
            <td><form method="post" action="/settings/accounts/delete"><input type="hidden" name="id" value="${account.id}"><button class="ghost">Smazat</button></form></td>
          </tr>`).join("") || '<tr><td colspan="4" class="empty">Zatím žádné účty.</td></tr>'}
        </tbody></table>
      </section>
      <section class="panel danger-panel">
        <h2>Smazat transakce</h2>
        <p class="muted-text">Smaže se ${transactionsCount} transakcí, rozpracované importy a historie importních dávek pro tento účet. Nastavení, účty, budgety a potvrzené pravidelné platby zůstanou zachované.</p>
        <form method="post" action="/settings/transactions/delete-all" data-confirm="Opravdu smazat všechny transakce tohoto uživatele? Tato akce nejde vrátit.">
          <button class="danger" ${transactionsCount ? "" : "disabled"}>Smazat všechny transakce</button>
        </form>
      </section>`,
    }));
  }

  if (pathName === "/settings" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const settings = userSettings(db, current.id);
    settings.fixedMonthlyAmount = Number(form.fixedMonthlyAmount || 0);
    settings.budgetMode = form.budgetMode === "budget" ? "budget" : "simple";
    settings.updatedAt = nowIso();
    saveDb(db);
    return redirect(res, "/settings");
  }

  if (pathName === "/settings/toggle-budget-mode" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const settings = userSettings(db, current.id);
    settings.budgetMode = settings.budgetMode === "budget" ? "simple" : "budget";
    settings.updatedAt = nowIso();
    saveDb(db);
    const referer = req.headers.referer || "";
    let target = "/dashboard";
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === req.headers.host) {
        target = `${refererUrl.pathname}${refererUrl.search}`;
      }
    } catch {
      target = "/dashboard";
    }
    return redirect(res, target);
  }

  if (pathName === "/dashboard/chart-filters" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const params = new URLSearchParams((await readBody(req)).toString("utf8"));
    const settings = userSettings(db, current.id);
    settings.chartHiddenSegments = params.getAll("hiddenSegments")
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 100);
    settings.updatedAt = nowIso();
    saveDb(db);
    return sendText(res, 200, "OK");
  }

  if (pathName === "/settings/accounts" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const normalized = normalizeAccount(form.account);
    db.accounts.push({
      id: id(),
      userId: current.id,
      accountType: form.accountType === "savings" ? "savings" : "current",
      accountEncrypted: encrypt(normalized),
      accountHash: hash(normalized),
      bankCodeHash: hash(String(normalized).split("/")[1] || ""),
      displayNameEncrypted: encrypt(form.displayName || ""),
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    saveDb(db);
    return redirect(res, "/settings");
  }

  if (pathName === "/settings/accounts/delete" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const account = db.accounts.find((item) => item.id === form.id && item.userId === current.id);
    if (account) account.isActive = false;
    saveDb(db);
    return redirect(res, "/settings");
  }

  if (pathName === "/settings/transactions/delete-all" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    await readBody(req);
    db.transactions = db.transactions.filter((item) => item.userId !== current.id);
    db.importBatches = db.importBatches.filter((item) => item.userId !== current.id);
    db.pendingImports = db.pendingImports.filter((item) => item.userId !== current.id);
    db.regularPayments
      .filter((item) => item.userId === current.id)
      .forEach((item) => {
        item.txIds = [];
        item.updatedAt = nowIso();
      });
    saveDb(db);
    return redirect(res, "/settings?transactionsDeleted=1");
  }

  if (pathName === "/budgets" && req.method === "GET") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const settings = userSettings(db, current.id);
    const budgets = userBudgets(db, current.id);
    const planned = userPlannedExpenses(db, current.id);
    const budgetOptions = budgets.map((budget) => `<option value="${budget.id}">${escapeHtml(decrypt(budget.nameEncrypted))}</option>`).join("");
    const createColorSelect = budgetColorSelect(db, current.id);
    return send(res, 200, layout({
      title: "Budgety",
      user: current,
      body: `<section class="page-head"><div><p class="eyebrow">Budgety</p><h1>Obálky a plánované výdaje</h1></div><a class="button" href="/settings">Režim: ${settings.budgetMode === "budget" ? "Budgety" : "Jednoduchý"}</a></section>
      <section class="two-col">
        <article class="panel">
          <h2>Přidat budget</h2>
          <form method="post" action="/budgets/create" class="stack">
            <label>Název<input name="name" required placeholder="Jídlo, děti, domácnost"></label>
            <label>Typ<select name="budgetType"><option value="regular">Pravidelný budget</option><option value="envelope">Obálka</option></select></label>
            <label>Částka na cyklus<input name="monthlyAmount" type="number" min="0" step="1" value="0"></label>
            <label>Počáteční balance obálky<input name="openingBalance" type="number" min="0" step="1" value="0"></label>
            <label>Barva${createColorSelect}</label>
            <label>Zůstatek na konci cyklu<select name="carryoverMode">
              <option value="reset">Resetovat</option>
              <option value="carryover">Přenést do dalšího cyklu</option>
              <option value="savings">Přesunout do úspor</option>
            </select></label>
            <button class="primary">Přidat budget</button>
          </form>
        </article>
        <article class="panel">
          <h2>Plánovaný jednorázový výdaj</h2>
          <form method="post" action="/planned-expenses/create" class="stack">
            <label>Název<input name="name" required placeholder="Servis auta, škola v přírodě"></label>
            <label>Částka<input name="amount" type="number" min="1" step="1" required></label>
            <label>Datum<input name="dueDate" type="date" required></label>
            <label>Budget<select name="budgetId"><option value="">Bez budgetu</option>${budgetOptions}</select></label>
            <button class="primary">Přidat výdaj</button>
          </form>
        </article>
      </section>
      <section class="panel">
        <h2>Aktivní budgety</h2>
        <table><thead><tr><th>Název</th><th>Typ</th><th>Částka</th><th>Počáteční balance</th><th>Barva</th><th>Zůstatek</th><th>Akce</th></tr></thead><tbody>
          ${budgets.map((budget) => `<tr>
            <form method="post" action="/budgets/update">
              <input type="hidden" name="id" value="${budget.id}">
              <td><input name="name" value="${escapeHtml(decrypt(budget.nameEncrypted))}"></td>
              <td><select name="budgetType"><option value="regular" ${(budget.budgetType || "regular") !== "envelope" ? "selected" : ""}>Pravidelný budget</option><option value="envelope" ${budget.budgetType === "envelope" ? "selected" : ""}>Obálka</option></select></td>
              <td><input name="monthlyAmount" type="number" min="0" step="1" value="${escapeHtml(budget.monthlyAmount || 0)}"></td>
              <td><input name="openingBalance" type="number" min="0" step="1" value="${escapeHtml(budget.openingBalance || 0)}"></td>
              <td>${budgetColorSelect(db, current.id, budget.color, budget.id)}</td>
              <td><select name="carryoverMode">
                <option value="reset" ${(budget.carryoverMode || "reset") === "reset" ? "selected" : ""}>Resetovat</option>
                <option value="carryover" ${budget.carryoverMode === "carryover" ? "selected" : ""}>Přenést</option>
                <option value="savings" ${budget.carryoverMode === "savings" ? "selected" : ""}>Do úspor</option>
              </select></td>
              <td><button>Uložit</button> <button name="delete" value="1" class="ghost">Smazat</button></td>
            </form>
          </tr>`).join("") || '<tr><td colspan="7" class="empty">Zatím žádné budgety.</td></tr>'}
        </tbody></table>
      </section>
      <section class="panel">
        <h2>Plánované jednorázové výdaje</h2>
        <table><thead><tr><th>Název</th><th>Částka</th><th>Datum</th><th>Budget</th><th>Akce</th></tr></thead><tbody>
          ${planned.map((expense) => {
            const selectedBudget = budgets.find((budget) => budget.id === expense.budgetId);
            return `<tr>
              <form method="post" action="/planned-expenses/update">
                <input type="hidden" name="id" value="${expense.id}">
                <td><input name="name" value="${escapeHtml(decrypt(expense.nameEncrypted))}"></td>
                <td><input name="amount" type="number" min="1" step="1" value="${escapeHtml(expense.amount)}"></td>
                <td><input name="dueDate" type="date" value="${escapeHtml(expense.dueDate)}"></td>
                <td><select name="budgetId"><option value="">Bez budgetu</option>${budgets.map((budget) => `<option value="${budget.id}" ${budget.id === expense.budgetId ? "selected" : ""}>${escapeHtml(decrypt(budget.nameEncrypted))}</option>`).join("")}</select><span class="muted-text">${selectedBudget ? "" : " "}</span></td>
                <td><button>Uložit</button> <button name="delete" value="1" class="ghost">Smazat</button></td>
              </form>
            </tr>`;
          }).join("") || '<tr><td colspan="5" class="empty">Zatím žádné plánované výdaje.</td></tr>'}
        </tbody></table>
      </section>`,
    }));
  }

  if (pathName === "/budgets/create" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const name = String(form.name || "").trim();
    const budgetType = form.budgetType === "envelope" ? "envelope" : "regular";
    const monthlyAmount = Math.max(0, Math.round(parseAmount(form.monthlyAmount)));
    const openingBalance = Math.max(0, Math.round(parseAmount(form.openingBalance)));
    if (name && (budgetType === "envelope" || monthlyAmount > 0)) {
      db.budgets.push({
        id: id(),
        userId: current.id,
        nameEncrypted: encrypt(name),
        budgetType,
        monthlyAmount: budgetType === "envelope" ? 0 : monthlyAmount,
        openingBalance: budgetType === "envelope" ? openingBalance : 0,
        color: chooseBudgetColor(db, current.id, form.color),
        carryoverMode: budgetType === "envelope" ? "carryover" : (["reset", "carryover", "savings"].includes(form.carryoverMode) ? form.carryoverMode : "reset"),
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      saveDb(db);
    }
    return redirect(res, "/budgets");
  }

  if (pathName === "/budgets/update" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const budget = db.budgets.find((item) => item.id === form.id && item.userId === current.id);
    if (budget) {
      if (form.delete) {
        budget.isActive = false;
      } else {
        budget.nameEncrypted = encrypt(form.name || "");
        budget.budgetType = form.budgetType === "envelope" ? "envelope" : "regular";
        budget.monthlyAmount = budget.budgetType === "envelope" ? 0 : Math.max(0, Math.round(parseAmount(form.monthlyAmount)));
        budget.openingBalance = budget.budgetType === "envelope" ? Math.max(0, Math.round(parseAmount(form.openingBalance))) : 0;
        budget.color = chooseBudgetColor(db, current.id, form.color, budget.id);
        budget.carryoverMode = budget.budgetType === "envelope" ? "carryover" : (["reset", "carryover", "savings"].includes(form.carryoverMode) ? form.carryoverMode : "reset");
      }
      budget.updatedAt = nowIso();
      saveDb(db);
    }
    return redirect(res, "/budgets");
  }

  if (pathName === "/planned-expenses/create" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const name = String(form.name || "").trim();
    const amount = Math.max(0, Math.round(parseAmount(form.amount)));
    const dueDate = parseDate(form.dueDate);
    const budgetId = db.budgets.some((budget) => budget.id === form.budgetId && budget.userId === current.id) ? form.budgetId : "";
    if (name && amount > 0 && dueDate) {
      db.plannedExpenses.push({
        id: id(),
        userId: current.id,
        nameEncrypted: encrypt(name),
        amount,
        dueDate,
        budgetId,
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      saveDb(db);
    }
    return redirect(res, "/budgets");
  }

  if (pathName === "/planned-expenses/update" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const expense = db.plannedExpenses.find((item) => item.id === form.id && item.userId === current.id);
    if (expense) {
      if (form.delete) {
        expense.isActive = false;
      } else {
        expense.nameEncrypted = encrypt(form.name || "");
        expense.amount = Math.max(0, Math.round(parseAmount(form.amount)));
        expense.dueDate = parseDate(form.dueDate) || expense.dueDate;
        expense.budgetId = db.budgets.some((budget) => budget.id === form.budgetId && budget.userId === current.id) ? form.budgetId : "";
      }
      expense.updatedAt = nowIso();
      saveDb(db);
    }
    return redirect(res, "/budgets");
  }

  if (pathName === "/import" && req.method === "GET") {
    const current = requireUser(db, req, res);
    if (!current) return;
    return send(res, 200, layout({
      title: "Import",
      user: current,
      body: `<section class="page-head"><div><p class="eyebrow">Import</p><h1>Nahrát CSV výpis</h1></div></section>
      <section class="panel narrow">
        <form method="post" action="/import/preview" enctype="multipart/form-data" class="stack">
          <label>Banka<select name="sourceBank"><option value="auto">Rozpoznat automaticky</option><option value="moneta">Moneta Money Bank</option><option value="mbank">mBank</option></select></label>
          <label>CSV soubor<input type="file" name="csv" accept=".csv,text/csv,text/plain" required></label>
          <button class="primary">Pokračovat na mapování</button>
        </form>
      </section>`,
    }));
  }

  if (pathName === "/import/preview" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const parts = parseMultipart(await readBody(req), req.headers["content-type"]);
    if (!parts.csv || !parts.csv.content) return redirect(res, "/import");
    const decoded = decodeCsvBuffer(parts.csv.content);
    const text = decoded.text.replace(/^\uFEFF/, "");
    const parsed = parseCsv(text);
    const headers = parsed.rows[0] || [];
    const rows = parsed.rows.slice(1).filter((row) => row.length);
    const settings = userSettings(db, current.id);
    const savedMapping = settings.lastImportMapping || {};
    const detectedMapping = detectMapping(headers);
    const mapping = { ...detectedMapping };
    Object.entries(savedMapping).forEach(([field, index]) => {
      if (index !== "" && Number(index) >= 0 && Number(index) < headers.length) {
        mapping[field] = String(index);
      }
    });
    const pending = {
      id: id(),
      userId: current.id,
      sourceBank: parts.sourceBank || "auto",
      originalFileNameEncrypted: encrypt(parts.csv.filename || "import.csv"),
      headers,
      rows,
      delimiter: parsed.delimiter,
      encoding: decoded.encoding,
      mapping,
      createdAt: nowIso(),
    };
    db.pendingImports = db.pendingImports.filter((item) => item.userId !== current.id);
    db.pendingImports.push(pending);
    saveDb(db);
    return redirect(res, `/import/map?id=${pending.id}`);
  }

  if (pathName === "/import/map" && req.method === "GET") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const pending = db.pendingImports.find((item) => item.id === url.searchParams.get("id") && item.userId === current.id);
    if (!pending) return redirect(res, "/import");
    const fields = [
      ["date", "Datum"],
      ["amount", "Částka"],
      ["currency", "Měna"],
      ["direction", "Směr"],
      ["description", "Popis"],
      ["category", "Kategorie"],
      ["ownAccount", "Můj účet"],
      ["counterpartyAccount", "Protiúčet"],
      ["counterpartyName", "Protistrana"],
      ["variableSymbol", "Variabilní symbol"],
    ];
    const options = (selected) => `<option value="">Nepoužít</option>${pending.headers.map((header, index) => `<option value="${index}" ${String(index) === String(selected ?? "") ? "selected" : ""}>${escapeHtml(header || `Sloupec ${index + 1}`)}</option>`).join("")}`;
    return send(res, 200, layout({
      title: "Mapování CSV",
      user: current,
      body: `<section class="page-head"><div><p class="eyebrow">Import</p><h1>Mapování sloupců</h1></div></section>
      <p class="import-meta">Rozpoznané kódování: <strong>${escapeHtml(pending.encoding || "utf-8")}</strong>, oddělovač: <strong>${escapeHtml(pending.delimiter === "\t" ? "TAB" : pending.delimiter)}</strong>, počet sloupců: <strong>${pending.headers.length}</strong></p>
      <form method="post" action="/import/confirm">
        <input type="hidden" name="id" value="${pending.id}">
        <section class="mapping-grid">
          ${fields.map(([field, label]) => `<label>${label}<select name="${field}">${options(pending.mapping[field])}</select></label>`).join("")}
        </section>
        <div class="actions"><button class="primary">Importovat transakce</button><a class="button" href="/import">Zrušit</a></div>
      </form>
      <section class="panel">
        <h2>Náhled</h2>
        <div class="table-scroll"><table><thead><tr>${pending.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>
          ${pending.rows.slice(0, 6).map((row) => `<tr>${pending.headers.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div>
      </section>`,
    }));
  }

  if (pathName === "/import/confirm" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const pending = db.pendingImports.find((item) => item.id === form.id && item.userId === current.id);
    if (!pending) return redirect(res, "/import");
    const mapping = {
      date: form.date,
      amount: form.amount,
      currency: form.currency,
      direction: form.direction,
      description: form.description,
      category: form.category,
      ownAccount: form.ownAccount,
      counterpartyAccount: form.counterpartyAccount,
      counterpartyName: form.counterpartyName,
      variableSymbol: form.variableSymbol,
    };
    const settings = userSettings(db, current.id);
    settings.lastImportMapping = mapping;
    settings.updatedAt = nowIso();
    const batch = {
      id: id(),
      userId: current.id,
      sourceBank: pending.sourceBank,
      originalFileNameEncrypted: pending.originalFileNameEncrypted,
      status: "completed",
      rowsTotal: pending.rows.length,
      rowsImported: 0,
      rowsDuplicate: 0,
      rowsFailed: 0,
      createdAt: pending.createdAt,
      completedAt: nowIso(),
    };
    for (const row of pending.rows) {
      const item = normalizeImportedRow(row, mapping);
      if (!item.transactionDate || !item.amount) {
        batch.rowsFailed += 1;
        continue;
      }
      const fingerprint = makeFingerprint(current.id, item);
      if (db.transactions.some((tx) => tx.userId === current.id && tx.fingerprintHash === fingerprint)) {
        batch.rowsDuplicate += 1;
        continue;
      }
      const isOwnTransfer = classifyOwnTransfer(db, current.id, item.ownAccount, item.counterpartyAccount);
      const classification = isOwnTransfer ? "own_transfer" : (item.direction === "incoming" ? "additional_income" : "variable_spend");
      db.transactions.push({
        id: id(),
        userId: current.id,
        importBatchId: batch.id,
        transactionDate: item.transactionDate,
        amount: item.amount,
        currency: item.currency || "CZK",
        direction: item.direction,
        ownAccountHash: hash(normalizeAccount(item.ownAccount)),
        counterpartyAccountHash: hash(normalizeAccount(item.counterpartyAccount)),
        counterpartyBankCodeHash: hash(String(item.counterpartyAccount).split("/")[1] || ""),
        ownAccountEncrypted: encrypt(item.ownAccount),
        counterpartyAccountEncrypted: encrypt(item.counterpartyAccount),
        counterpartyNameEncrypted: encrypt(item.counterpartyName),
        descriptionEncrypted: encrypt(item.description),
        categoryEncrypted: encrypt(item.category),
        noteEncrypted: "",
        variableSymbolEncrypted: encrypt(item.variableSymbol),
        constantSymbolEncrypted: "",
        specificSymbolEncrypted: "",
        fingerprintHash: fingerprint,
        classification,
        budgetFlow: "",
        isExcluded: false,
        increasesFreeSpend: item.direction === "incoming" && !isOwnTransfer,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      batch.rowsImported += 1;
    }
    db.importBatches.push(batch);
    db.pendingImports = db.pendingImports.filter((item) => item.id !== pending.id);
    saveDb(db);
    return send(res, 200, layout({
      title: "Import dokončen",
      user: current,
      flash: `Import dokončen: ${batch.rowsImported} nových, ${batch.rowsDuplicate} duplicit, ${batch.rowsFailed} chyb.`,
      body: `<div class="actions"><a class="button primary" href="/transactions">Zobrazit transakce</a><a class="button" href="/dashboard">Dashboard</a></div>`,
    }));
  }

  if (pathName === "/transactions" && req.method === "GET") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const settings = userSettings(db, current.id);
    const budgets = userBudgets(db, current.id);
    const showBudgetColumn = settings.budgetMode === "budget";
    const budgetSelectOptions = (selectedId = "") => `<option value="">Bez budgetu</option>${budgets.map((budget) => `<option value="${budget.id}" ${budget.id === selectedId ? "selected" : ""}>${escapeHtml((budget.budgetType === "envelope" ? "Obálka: " : "Budget: ") + decrypt(budget.nameEncrypted))}</option>`).join("")}`;
    const filter = url.searchParams.get("filter") || "";
    const minAmountInput = url.searchParams.get("minAmount") || "";
    const maxAmountInput = url.searchParams.get("maxAmount") || "";
    const dateFrom = parseDate(url.searchParams.get("dateFrom") || "");
    const dateTo = parseDate(url.searchParams.get("dateTo") || "");
    const minAmount = parseAmount(minAmountInput);
    const maxAmount = parseAmount(maxAmountInput);
    const constraints = { minAmount, maxAmount, dateFrom, dateTo, minAmountInput, maxAmountInput };
    let txs = userTransactions(db, current.id);
    txs = txs.filter((tx) => matchesTransactionFilter(tx, filter, constraints));
    const filterItems = [
      ["", "Vše"],
      ["incoming", "Všechny kladné"],
      ["excluded", "Mimo evidenci"],
      ["salary", "Mzda"],
      ["regular_payment", "Pravidelné"],
      ["own_transfer", "Vlastní převody"],
      ["variable_spend", "Volný spend"],
      ["additional_income", "Navýší spend"],
      ...budgets.map((budget) => [`budget:${budget.id}`, `Budget: ${decrypt(budget.nameEncrypted)}`]),
    ];
    const budgetById = new Map(budgets.map((budget) => [budget.id, budget]));
    const txRows = txs.map((tx) => {
      const txBudget = tx.budgetId ? budgetById.get(tx.budgetId) : null;
      const rowStyle = txBudget ? ` style="--budget-color:${escapeHtml(normalizeBudgetColor(txBudget.color) || BUDGET_COLORS[0].value)}"` : "";
      const spendFlowLabel = txBudget?.budgetType === "envelope" ? "Vybrat" : "Čerpat";
      const fundFlowLabel = txBudget?.budgetType === "envelope" ? "Nabít" : "Dobít";
      const budgetCell = showBudgetColumn ? `<td>${tx.direction === "outgoing" && !["regular_payment", "own_transfer"].includes(tx.classification)
        ? `<form method="post" action="/transactions/budget" class="inline-select-form budget-assign-form" data-preserve-scroll>
            <input type="hidden" name="id" value="${tx.id}">
            <select name="budgetId" data-auto-submit>${budgetSelectOptions(tx.budgetId || "")}</select>
            ${tx.budgetId ? `<div class="budget-flow-actions">
              <button name="budgetFlow" value="spend" class="${tx.budgetFlow !== "fund" ? "primary" : ""}">${spendFlowLabel}</button>
              <button name="budgetFlow" value="fund" class="${tx.budgetFlow === "fund" ? "primary" : ""}">${fundFlowLabel}</button>
            </div>` : ""}
          </form>`
        : '<span class="muted-text">-</span>'}</td>` : "";
      return `<tr id="tx-${tx.id}" class="${transactionRowClass(tx, txBudget)}"${rowStyle}>
            <td>${shortDate(tx.transactionDate)}</td>
            <td class="${tx.direction === "incoming" ? "amount-in" : "amount-out"}">${tx.direction === "incoming" ? "+" : "-"}${money(tx.amount)}</td>
            <td><strong>${escapeHtml(tx.counterpartyName || "")}</strong><br><span class="muted-text">${escapeHtml(tx.description || "")}</span></td>
            <td>${escapeHtml(tx.counterpartyAccount || "")}</td>
            <td><input class="note-input" data-note-input data-transaction-id="${tx.id}" value="${escapeHtml(tx.note || "")}" placeholder="Poznámka"></td>
            ${budgetCell}
            <td>${transactionBadge(tx)}</td>
            <td><div class="actions-cell">
              ${txBudget ? '<span class="muted-text">-</span>' : `
              ${tx.direction === "incoming" ? `
                <form method="post" action="/transactions/action" data-preserve-scroll><input type="hidden" name="id" value="${tx.id}"><input type="hidden" name="action" value="salary"><button class="${tx.classification === "salary" ? "primary" : ""}">Mzda</button></form>
                <form method="post" action="/transactions/action" data-preserve-scroll><input type="hidden" name="id" value="${tx.id}"><input type="hidden" name="action" value="incomeSpend"><button class="${tx.classification === "additional_income" && tx.increasesFreeSpend ? "primary" : ""}">Navýší spend</button></form>
              ` : ""}
              ${tx.direction === "outgoing" ? `<form method="post" action="/transactions/action" data-preserve-scroll><input type="hidden" name="id" value="${tx.id}"><input type="hidden" name="action" value="makeRegular"><button class="${tx.classification === "regular_payment" ? "primary" : ""}">Trvalá</button></form>` : ""}
              <form method="post" action="/transactions/action" data-preserve-scroll><input type="hidden" name="id" value="${tx.id}"><input type="hidden" name="action" value="${isOutOfEvidence(tx) ? "unignore" : "ignore"}"><button class="${isOutOfEvidence(tx) ? "primary" : ""}">${isOutOfEvidence(tx) ? "Vrátit do evidence" : "Mimo evidenci"}</button></form>
              `}
            </div></td>
          </tr>`;
    }).join("") || `<tr><td colspan="${showBudgetColumn ? 8 : 7}" class="empty">Zatím žádné transakce.</td></tr>`;
    return send(res, 200, layout({
      title: "Transakce",
      user: current,
      pageClass: "wide-page",
      body: `<section class="page-head"><div><p class="eyebrow">Transakce</p><h1>Výpis a označení</h1></div></section>
      <div class="tabs">
        ${filterItems.map(([item, label]) => `<a class="${filter === item ? "active" : ""}" href="${transactionsUrl(item, constraints)}">${escapeHtml(label)}</a>`).join("")}
      </div>
      <section class="bulk-tools" id="bulk-tools">
        <form method="get" action="/transactions" class="transaction-tools-form">
          <div class="filter-fields">
            <input type="hidden" name="filter" value="${escapeHtml(filter)}">
            <label>Částka od<input name="minAmount" type="number" min="0" step="1" value="${escapeHtml(minAmountInput)}" placeholder="např. 10000"></label>
            <label>Částka do<input name="maxAmount" type="number" min="0" step="1" value="${escapeHtml(maxAmountInput)}" placeholder="např. 50000"></label>
            <label>Datum od<input name="dateFrom" type="date" value="${escapeHtml(dateFrom)}"></label>
            <label>Datum do<input name="dateTo" type="date" value="${escapeHtml(dateTo)}"></label>
          </div>
          <div class="filter-actions">
            <button class="primary" formnovalidate>Použít filtr</button>
            <a class="button" href="${transactionsUrl(filter, {})}">Zrušit rozmezí</a>
          </div>
          <div class="bulk-action-row">
            <label>Hromadná akce na zobrazené<select name="action" required>
              <option value="">Vyber akci</option>
              <option value="ignore">Mimo evidenci</option>
              <option value="unignore">Vrátit do evidence</option>
              <option value="salary">Označit jako mzdu (jen příchozí)</option>
              <option value="incomeSpend">Navýší spend (jen příchozí)</option>
              <option value="variableSpend">Volný spend (jen odchozí)</option>
            </select></label>
            <button formaction="/transactions/bulk-action" formmethod="post" ${txs.length ? "" : "disabled"}>Použít na ${txs.length} zobrazených</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <div class="table-scroll"><table class="transactions-table"><colgroup>
          <col class="col-date">
          <col class="col-amount">
          <col class="col-description">
          <col class="col-account">
          <col class="col-note">
          ${showBudgetColumn ? '<col class="col-budget">' : ""}
          <col class="col-status">
          <col class="col-actions">
        </colgroup><thead><tr><th>Datum</th><th>Částka</th><th>Popis</th><th>Protiúčet</th><th>Poznámka</th>${showBudgetColumn ? "<th>Budget</th>" : ""}<th>Stav</th><th>Akce</th></tr></thead><tbody>
          ${txRows}
        </tbody></table></div>
      </section>`,
    }));
  }

  if (pathName === "/transactions/action" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const tx = db.transactions.find((item) => item.id === form.id && item.userId === current.id);
    if (tx) {
      if (form.action === "makeRegular") {
        createRegularPaymentFromTransaction(db, current.id, tx);
      } else {
        applyTransactionAction(db, current.id, tx, form.action);
      }
      saveDb(db);
    }
    return redirect(res, req.headers.referer ? new URL(req.headers.referer).pathname + (new URL(req.headers.referer).search || "") : "/transactions");
  }

  if (pathName === "/transactions/note" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const tx = db.transactions.find((item) => item.id === form.id && item.userId === current.id);
    if (tx) {
      tx.noteEncrypted = encrypt(String(form.note || "").trim());
      tx.updatedAt = nowIso();
      saveDb(db);
    }
    return redirect(res, req.headers.referer ? new URL(req.headers.referer).pathname + (new URL(req.headers.referer).search || "") : "/transactions");
  }

  if (pathName === "/transactions/budget" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const tx = db.transactions.find((item) => item.id === form.id && item.userId === current.id);
    const budget = db.budgets.find((item) => item.id === form.budgetId && item.userId === current.id && item.isActive !== false);
    const budgetId = budget ? budget.id : "";
    if (tx && tx.direction === "outgoing" && !["regular_payment", "own_transfer"].includes(tx.classification)) {
      tx.budgetId = budgetId;
      if (budgetId) {
        tx.classification = "budget_transaction";
        tx.isExcluded = false;
        tx.budgetFlow = form.budgetFlow === "fund" ? "fund" : "spend";
        tx.categoryEncrypted = encrypt(decrypt(budget.nameEncrypted));
      } else {
        tx.classification = "variable_spend";
        tx.budgetFlow = "";
        tx.categoryEncrypted = "";
      }
      tx.updatedAt = nowIso();
      saveDb(db);
    }
    return redirect(res, req.headers.referer ? new URL(req.headers.referer).pathname + (new URL(req.headers.referer).search || "") : "/transactions");
  }

  if (pathName === "/transactions/bulk-action" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const filter = String(form.filter || "");
    const minAmountInput = String(form.minAmount || "");
    const maxAmountInput = String(form.maxAmount || "");
    const dateFrom = parseDate(form.dateFrom || "");
    const dateTo = parseDate(form.dateTo || "");
    const minAmount = parseAmount(minAmountInput);
    const maxAmount = parseAmount(maxAmountInput);
    const constraints = { minAmount, maxAmount, dateFrom, dateTo, minAmountInput, maxAmountInput };
    const action = String(form.action || "");
    let changed = 0;

    if (action && (filter || minAmount > 0 || maxAmount > 0 || dateFrom || dateTo)) {
      for (const tx of db.transactions.filter((item) => item.userId === current.id)) {
        if (matchesTransactionFilter(tx, filter, constraints) && applyTransactionAction(db, current.id, tx, action)) {
          changed += 1;
        }
      }
      if (changed > 0) saveDb(db);
    }

    const targetUrl = `${transactionsUrl(filter, constraints)}#bulk-tools`;
    return redirect(res, targetUrl);
  }

  if (pathName === "/regular-payments" && req.method === "GET") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const candidates = detectRegularCandidates(db, current.id);
    const confirmed = db.regularPayments
      .filter((item) => item.userId === current.id && item.status === "confirmed")
      .sort((a, b) => Number(a.expectedDay || 0) - Number(b.expectedDay || 0)
        || decrypt(a.nameEncrypted).localeCompare(decrypt(b.nameEncrypted), "cs"));
    return send(res, 200, layout({
      title: "Pravidelné platby",
      user: current,
      body: `<section class="page-head"><div><p class="eyebrow">Pravidelné platby</p><h1>Detekce z historie</h1></div></section>
      <section class="panel">
        <h2>Navržení kandidáti</h2>
        <table><thead><tr><th>Název</th><th>Částka</th><th>Den</th><th>Výskyty</th><th></th></tr></thead><tbody>
          ${candidates.map((candidate) => `<tr>
            <td>${escapeHtml(candidate.name)}<br><span class="muted-text">${escapeHtml(candidate.description || candidate.counterpartyAccount || "")}</span></td>
            <td>${money(candidate.expectedAmount)}</td>
            <td>${candidate.expectedDay}. den</td>
            <td>${candidate.occurrences} transakcí / ${candidate.months} měsíců</td>
            <td><form method="post" action="/regular-payments/confirm"><input type="hidden" name="signature" value="${candidate.signature}"><button class="primary">Potvrdit</button></form></td>
          </tr>`).join("") || '<tr><td colspan="5" class="empty">Žádní kandidáti. Potřebuješ delší historii nebo stabilní platby.</td></tr>'}
        </tbody></table>
      </section>
      <section class="panel">
        <h2>Přidat vlastní pravidelnou platbu</h2>
        <form method="post" action="/regular-payments/create" class="manual-payment-form">
          <label>Název<input name="name" required placeholder="Nájem, pojištění, paušál"></label>
          <label>Částka<input name="expectedAmount" type="number" min="1" step="1" required></label>
          <label>Den v měsíci<input name="expectedDay" type="number" min="1" max="31" required></label>
          <label>Protiúčet<input name="counterpartyAccount" placeholder="volitelné"></label>
          <label>Popis<input name="description" placeholder="volitelné"></label>
          <button class="primary">Přidat platbu</button>
        </form>
      </section>
      <section class="panel">
        <h2>Potvrzené platby</h2>
        <table><thead><tr><th>Název</th><th>Částka</th><th>Den</th><th>Poznámka</th><th>Akce</th></tr></thead><tbody>
          ${confirmed.map((item) => `<tr>
            <form method="post" action="/regular-payments/update">
              <input type="hidden" name="id" value="${item.id}">
              <td><input name="name" value="${escapeHtml(decrypt(item.nameEncrypted))}"></td>
              <td><input name="expectedAmount" type="number" value="${escapeHtml(item.expectedAmount)}"></td>
              <td><input name="expectedDay" type="number" min="1" max="31" value="${escapeHtml(item.expectedDay)}"></td>
              <td><input name="note" value="${escapeHtml(decrypt(item.noteEncrypted))}" placeholder="Poznámka"></td>
              <td><button>Uložit</button> <button name="delete" value="1" class="ghost">Smazat</button></td>
            </form>
          </tr>`).join("") || '<tr><td colspan="5" class="empty">Zatím nic potvrzeného.</td></tr>'}
        </tbody></table>
      </section>`,
    }));
  }

  if (pathName === "/regular-payments/confirm" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const candidate = detectRegularCandidates(db, current.id).find((item) => item.signature === form.signature);
    if (candidate) {
      db.regularPayments.push({
        id: id(),
        userId: current.id,
        nameEncrypted: encrypt(candidate.name),
        counterpartyAccountHash: hash(normalizeAccount(candidate.counterpartyAccount)),
        descriptionPatternHash: hash(normalizeText(candidate.description)),
        expectedAmount: candidate.expectedAmount,
        expectedDay: candidate.expectedDay,
        status: "confirmed",
        txIds: candidate.txIds,
        noteEncrypted: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      db.transactions.filter((tx) => candidate.txIds.includes(tx.id) && tx.userId === current.id).forEach((tx) => {
        tx.classification = "regular_payment";
        tx.updatedAt = nowIso();
      });
      saveDb(db);
    }
    return redirect(res, "/regular-payments");
  }

  if (pathName === "/regular-payments/create" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const name = String(form.name || "").trim();
    const expectedAmount = Math.max(0, Math.round(parseAmount(form.expectedAmount)));
    const expectedDay = Math.max(1, Math.min(31, Number(form.expectedDay || 1)));
    const counterpartyAccount = normalizeAccount(form.counterpartyAccount || "");
    const description = String(form.description || "").trim();

    if (name && expectedAmount > 0) {
      db.regularPayments.push({
        id: id(),
        userId: current.id,
        nameEncrypted: encrypt(name),
        counterpartyAccountHash: counterpartyAccount ? hash(counterpartyAccount) : "",
        descriptionPatternHash: description ? hash(normalizeText(description)) : "",
        expectedAmount,
        expectedDay,
        status: "confirmed",
        txIds: [],
        isManual: true,
        noteEncrypted: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      saveDb(db);
    }

    return redirect(res, "/regular-payments");
  }

  if (pathName === "/regular-payments/update" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current) return;
    const form = parseForm(await readBody(req));
    const item = db.regularPayments.find((entry) => entry.id === form.id && entry.userId === current.id);
    if (item) {
      if (form.delete) {
        item.status = "deleted";
      } else {
        item.nameEncrypted = encrypt(form.name || "");
        item.expectedAmount = Number(form.expectedAmount || 0);
        item.expectedDay = Number(form.expectedDay || 1);
        item.noteEncrypted = encrypt(String(form.note || "").trim());
        item.updatedAt = nowIso();
      }
      saveDb(db);
    }
    return redirect(res, "/regular-payments");
  }

  if (pathName === "/admin/users" && req.method === "GET") {
    const current = requireUser(db, req, res);
    if (!current) return;
    if (current.role !== "admin") return send(res, 403, "Forbidden");
    return send(res, 200, layout({
      title: "Admin",
      user: current,
      body: `<section class="page-head"><div><p class="eyebrow">Admin</p><h1>Uživatelé</h1></div></section>
      <section class="panel"><table><thead><tr><th>E-mail</th><th>Role</th><th>Stav</th><th>Registrace</th><th>Transakcí</th><th>Akce</th></tr></thead><tbody>
      ${db.users.filter((item) => item.status !== "deleted").map((item) => `<tr>
        <td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.status)}</td><td>${shortDate(item.createdAt.slice(0, 10))}</td>
        <td>${db.transactions.filter((tx) => tx.userId === item.id).length}</td>
        <td><div class="actions-cell">
          <form method="post" action="/admin/users/reset"><input type="hidden" name="id" value="${item.id}"><button>Reset hesla</button></form>
          ${item.id !== current.id ? `<form method="post" action="/admin/users/delete"><input type="hidden" name="id" value="${item.id}"><button class="ghost">Smazat</button></form>` : ""}
        </div></td>
      </tr>`).join("")}
      </tbody></table></section>`,
    }));
  }

  if (pathName === "/admin/users/reset" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current || current.role !== "admin") return;
    const form = parseForm(await readBody(req));
    const target = db.users.find((item) => item.id === form.id && item.status !== "deleted");
    if (target) {
      const token = crypto.randomBytes(24).toString("hex");
      db.passwordResetTokens.push({ id: id(), userId: target.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000).toISOString(), usedAt: "", createdAt: nowIso() });
      fs.appendFileSync(MAIL_LOG, `[${nowIso()}] Admin reset pro ${target.email}: http://${HOST}:${PORT}/password/reset?token=${token}\n`, "utf8");
      saveDb(db);
    }
    return send(res, 200, layout({ title: "Admin", user: current, flash: "Reset odkaz je v lokálním mail logu.", body: `<p><code>${escapeHtml(MAIL_LOG)}</code></p><a class="button" href="/admin/users">Zpět</a>` }));
  }

  if (pathName === "/admin/users/delete" && req.method === "POST") {
    const current = requireUser(db, req, res);
    if (!current || current.role !== "admin") return;
    const form = parseForm(await readBody(req));
    const target = db.users.find((item) => item.id === form.id && item.id !== current.id);
    if (target) {
      target.status = "deleted";
      db.sessions = db.sessions.filter((item) => item.userId !== target.id);
      db.settings = db.settings.filter((item) => item.userId !== target.id);
      db.accounts = db.accounts.filter((item) => item.userId !== target.id);
      db.importBatches = db.importBatches.filter((item) => item.userId !== target.id);
      db.pendingImports = db.pendingImports.filter((item) => item.userId !== target.id);
      db.transactions = db.transactions.filter((item) => item.userId !== target.id);
      db.regularPayments = db.regularPayments.filter((item) => item.userId !== target.id);
      db.budgets = db.budgets.filter((item) => item.userId !== target.id);
      db.plannedExpenses = db.plannedExpenses.filter((item) => item.userId !== target.id);
      saveDb(db);
    }
    return redirect(res, "/admin/users");
  }

  send(res, 404, layout({ title: "Nenalezeno", user, body: "<h1>404</h1><p>Stránka neexistuje.</p>" }));
}

http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    send(res, 500, `<h1>Chyba</h1><pre>${escapeHtml(error.stack || error.message)}</pre>`);
  });
}).listen(PORT, HOST, () => {
  console.log(`Spendline běží na http://${HOST}:${PORT}`);
});
