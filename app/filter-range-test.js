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

async function main() {
  await req("/login", form({ email: "demo@local.test", password: "demo1234" }));
  const response = await req("/transactions?filter=variable_spend&minAmount=1000&maxAmount=4000&dateFrom=2026-01-01&dateTo=2026-12-31");
  const html = await response.text();
  const result = {
    status: response.status,
    hasControls: html.includes("Částka od")
      && html.includes("Částka do")
      && html.includes("Datum od")
      && html.includes("Datum do"),
    keepsParams: html.includes('name="maxAmount" value="4000"')
      && html.includes('name="dateFrom" value="2026-01-01"')
      && html.includes('name="dateTo" value="2026-12-31"'),
    hasBulk: html.includes("Hromadná akce na zobrazené") && html.includes("Použít na"),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.hasControls || !result.keepsParams || !result.hasBulk) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
