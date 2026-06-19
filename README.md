# Spendline local MVP

Lokální prototyp webové aplikace pro řízení provozních osobních financí podle výplatního cyklu.

## Spuštění

V tomto Codex prostředí použij bundled Node runtime:

```powershell
& "C:\Users\ivan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" app\server.js
```

Aplikace poběží na:

```text
http://127.0.0.1:4173
```

Nespouštěj ji přes `cmd /c start`. Pokud ji chceš testovat, spusť ji interaktivně v terminálu a po testu ji ukonči `Ctrl+C`.

## První průchod

1. Zaregistruj první účet. První registrovaný uživatel dostane roli admin.
2. V Nastavení nastav pevnou měsíční částku a přidej vlastní účty.
3. V Importu nahraj `outputs/demo-transakce.csv`.
4. Zkontroluj mapování sloupců a potvrď import.
5. V Transakcích označ příchozí výplatu jako mzdu.
6. V Pravidelných platbách potvrď navržené pravidelné platby.
7. V Dashboardu uvidíš denní spend, dovolený denní spend a predikci.

## Aktuální lokální demo data

Po smoke testu je připravený demo uživatel:

```text
demo@local.test
demo1234
```

Admin účet vytvořený při prvním testovacím průchodu:

```text
test-253318656@local.test
test1234
```

## Smoke test

Když server běží, lze ověřit základní flow příkazem:

```powershell
& "C:\Users\ivan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" app\smoke-test.js
```

Ověření, že více historických výplat zůstane uložených jako `Mzda`:

```powershell
& "C:\Users\ivan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" app\salary-persistence-test.js
```

Ověření filtrů transakcí podle částky a data:

```powershell
& "C:\Users\ivan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" app\filter-range-test.js
```

Ověření vytvoření trvalé platby z odchozí transakce a dohledání historie:

```powershell
& "C:\Users\ivan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" app\regular-from-transaction-test.js
```

Ověření budget režimu, obálek, plánovaného výdaje a přiřazení transakce k budgetu:

```powershell
& "C:\Users\ivan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" app\budget-mode-test.js
```

Plná regrese hlavních MVP scénářů:

```powershell
& "C:\Users\ivan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" app\full-regression-test.js
```

## CSV encoding

Import automaticky rozlišuje UTF-8, UTF-8 s BOM a Windows-1250. Reálné bankovní exporty s českou diakritikou, například hlavičkami typu `#Účet` a `#Částka`, se mají zobrazit bez rozbité znakové sady.

## Lokální data

Data se ukládají do:

```text
work/local-app-data/db.json
```

Citlivá pole transakcí jsou v lokálním úložišti šifrovaná. Šifrovací klíč je v:

```text
work/local-app-data/secret.key
```

Lokální reset hesla a systémové e-maily se zapisují do:

```text
work/local-app-data/mailbox.log
```
