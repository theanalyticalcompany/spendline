# Testovací scénáře: Spendline MVP

## Rozsah

Scénáře vycházejí z business analýzy, IT analýzy a dodatečně implementovaných funkcí lokálního MVP.

## Scénáře

| ID | Oblast | Scénář | Očekávaný výsledek | Automatizace |
| --- | --- | --- | --- | --- |
| AUTH-01 | Uživatelé | Registrace nového uživatele a přihlášení | Uživatel je vytvořen, dostane session a vidí vlastní dashboard | Ano |
| SEC-01 | Izolace dat | Uživatel vidí pouze vlastní transakce | Dotazy i změny jsou vázané na `user_id` | Částečně |
| SET-01 | Nastavení | Uživatel nastaví pevnou měsíční částku a vlastní účty | Nastavení se uloží a vlastní převody se mohou ignorovat | Ano |
| IMP-01 | Import | Import demo CSV s mapováním sloupců | Transakce se uloží a zobrazí ve výpisu | Ano |
| IMP-02 | Import | Opakovaný import stejného CSV | Duplicitní transakce se neuloží znovu | Ano |
| IMP-03 | Encoding | CSV ve Windows-1250 s českými hlavičkami | Diakritika se zobrazí správně, např. `Účet`, `Částka` | Částečně |
| TRN-01 | Transakce | Označení příchozí transakce jako mzda | Transakce zůstane ve filtru `Mzda` i po návratu na stránku | Ano |
| TRN-02 | Transakce | Označení transakce jako výjimka | Transakce zůstane ve výpisu, ale má stav `Výjimka` | Ano přes bulk |
| TRN-03 | Transakce | Příchozí transakce: mzda / navýší spend / mimo evidenci | Stav se uloží a aktivní volba je zvýrazněná | Částečně |
| TRN-04 | Transakce | Vizuální rozlišení transakcí | Příchozí transakce jsou světle zelené, pravidelné platby lehce šedé a odchozí výjimky šedobíle šrafované; akční tlačítka nerozbíjí zarovnání tabulky | Částečně |
| REG-01 | Pravidelné platby | Ruční přidání pravidelné platby | Platba se uloží jako potvrzená a započítá se do dashboardu | Ano |
| REG-02 | Pravidelné platby | Potvrzení detekované pravidelné platby | Platba se přesune mezi potvrzené a transakce dostanou stav pravidelné platby | Ano v smoke testu |
| REG-03 | Pravidelné platby | Označení odchozí platby jako trvalé přímo z výpisu | Vznikne potvrzená pravidelná platba a historie dohledá podobné platby podle stejné částky, stejného popisu a dne v měsíci ±5 | Ano |
| DASH-01 | Dashboard | Úprava očekávaného data další výplaty | Datum se uloží nebo se zobrazí validační chyba | Ano |
| DASH-02 | Dashboard | Výpočet hlavních metrik a logických kroků | Dashboard ukáže poslední výplatu, provozní rámec, pravidelné platby, volný spend na začátku období, průběžné volné platby, aktuální volnou částku, reálný spend, dovolený spend a predikci | Ano |
| FLT-01 | Filtrování | Filtr podle částky od/do a data od/do | Zobrazí se jen odpovídající řádky a hodnoty se zachovají v bulk formuláři | Ano |
| BULK-01 | Hromadné akce | Hromadná akce nad filtrovaným výběrem | Akce se uloží na všechny odpovídající zobrazené transakce | Ano |
| BUD-01 | Budget režim | Zapnutí budget režimu, vytvoření budgetu, plánovaný výdaj a přiřazení transakce | Transakční výpis zobrazí sloupec Budget a dashboard ukáže stav budgetů včetně plánovaných výdajů a denního limitu | Ano |
| ADM-01 | Admin | Admin vidí technické informace o uživatelích | Admin nevidí finanční detail transakcí | Částečně |
| PWD-01 | Hesla | Reset hesla | Reset link vznikne v lokálním mail logu | Ručně |

## Spouštěné automatizované testy

Automatizované testy jsou lokální HTTP testy proti běžícímu serveru:

- `app/smoke-test.js`
- `app/salary-persistence-test.js`
- `app/filter-range-test.js`
- `app/full-regression-test.js`

## Výsledek posledního běhu

Poslední regresní běh proti dočasnému lokálnímu portu prošel:

| ID | Výsledek |
| --- | --- |
| AUTH-01 | OK |
| SET-01 | OK |
| IMP-01 | OK |
| TRN-01 | OK |
| TRN-04 | OK |
| REG-01 | OK |
| REG-03 | OK |
| DASH-01 | OK |
| DASH-02 | OK |
| FLT-01 | OK |
| BULK-01 | OK |
| IMP-02 | OK |
| BUD-01 | OK |

Ověřená oprava: hromadná akce nad filtrovaným výběrem (`filter`, částka od/do, datum od/do) se skutečně uloží a změněné transakce jsou po návratu viditelné ve výsledném filtru.

## Poznámky

Testy používají demo CSV v `outputs/demo-transakce.csv`. Reálné bankovní CSV se nepoužívá pro automatizované regresní testy, aby nedošlo k nechtěnému ukládání nebo vypisování citlivých dat.
