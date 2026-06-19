# Spendline local MVP

Lokalni prototyp webove aplikace pro rizeni provoznich osobnich financi podle vyplatniho cyklu.

## Spusteni

Aplikace pouziva Node.js a vestaveny HTTP server. Z korene projektu:

```powershell
node app\server.js
```

V tomto Codex prostredi lze pouzit bundled Node runtime:

```powershell
& "C:\Users\ivan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" app\server.js
```

Aplikace bezi na:

```text
http://127.0.0.1:4173
```

Nespoustej ji pres `cmd /c start`. Pro lokalni test ji spust interaktivne v terminalu a po testu ukonci `Ctrl+C`.

## Prvni pruchod

1. Zaregistruj prvni ucet. Prvni registrovany uzivatel dostane roli admin.
2. V Nastaveni nastav pevnou mesicni castku a pridej vlastni ucty.
3. V Importu nahraj `outputs/demo-transakce.csv`.
4. Zkontroluj mapovani sloupcu a potvrd import.
5. V Transakcich oznac prichozi vyplatu jako mzdu.
6. V Pravidelnych platbach potvrd navrzene pravidelne platby.
7. V Dashboardu uvidis denni spend, dovoleny denni spend, budgety a predikci.

## Bezpecnost

Do repozitare nepatri lokalni data, bankovni exporty, databaze ani sifrovaci klice. Lokalni adresar `work/` je ignorovany a neni soucasti publikovaneho zdrojoveho kodu.

## CSV encoding

Import rozlisuje UTF-8, UTF-8 s BOM a Windows-1250. Bankovni exporty s ceskou diakritikou se maji zobrazit bez rozbite znakove sady.

## Testy

Kdyz server bezi, lze spoustet cilene testy z adresare projektu:

```powershell
node app\smoke-test.js
node app\salary-persistence-test.js
node app\filter-range-test.js
node app\regular-from-transaction-test.js
node app\budget-mode-test.js
```

Plna regrese je dostupna, ale nepousti se pri kazde male iteraci:

```powershell
node app\full-regression-test.js
```
