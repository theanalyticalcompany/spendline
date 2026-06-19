# Business analyza: Webova aplikace pro rizeni provoznich osobnich financi

## 1. Shrnutí

Cilem aplikace je pomoct uzivateli ridit provozni osobni finance v cyklu od vyplaty do vyplaty. Aplikace nema byt klasicky rozpoctovy nastroj s kategoriemi, ale prakticky denni ukazatel toho, kolik si uzivatel muze dovolit utratit do dalsi vyplaty.

Zakladni filozofie produktu:

- penize prichazeji typicky jednou hlavni vyplatou,
- uzivatel ma pevne stanovenou mesicni castku, kterou je ochoten pouzit na provozni zivot,
- vse nad tuto pevnou castku se povazuje za uspory,
- z pevne castky se odectou pravidelne povinne platby,
- zbytek je volny spend, ktery muze uzivatel ovlivnit,
- volny spend se prepocita na denni limit do dalsi vyplaty,
- pokud uzivatel utrati mene, nevycerpana cast se prenasi do dalsich dni,
- na konci vyplatniho cyklu se zbyvajici castka resetuje a bere se jako uspora.

Aplikace bude urcena pro vice uzivatelu, pricemz zadny uzivatel nesmi videt data jineho uzivatele.

## 2. Cile produktu

### 2.1 Business cile

- Zjednodusit kontrolu provoznich vydaju mezi vyplatami.
- Dat uzivateli jasnou odpoved na otazku: "Kolik jeste muzu denne utratit, abych do dalsi vyplaty vysel?"
- Automaticky oddelit provozni utraty od uspor, vlastnich prevodu, pravidelnych plateb a vyjimecnych transakci.
- Minimalizovat rucni praci pri importu a vyhodnoceni bankovnich transakci.
- Zachovat jednoduchy model bez kategorii, aby aplikace podporovala rozhodovani, ne detailni ucetnictvi.

### 2.2 Uzivatelske cile

- Nahrat vypis transakci z banky ve formatu CSV.
- Oznacit vlastni ucty, mzdu, pravidelne platby a vyjimky.
- Videt velikost posledni vyplaty.
- Videt prumerny denni spend od posledni vyplaty.
- Videt prumerny denni spend, ktery si uzivatel muze dovolit do dalsi vyplaty.
- Videt predikci, zda pri aktualnim tempu skonci uzivatel v plusu nebo minusu.
- Mit moznost rucne opravit klasifikaci transakci.

## 3. Rozsah MVP

### 3.1 Soucasti MVP

MVP bude obsahovat:

- prihlaseni a oddeleni dat jednotlivych uzivatelu,
- rucni import CSV souboru s bankovnimi transakcemi,
- detekci a odstraneni duplicit pri opakovanem importu,
- evidenci vlastnich uctu uzivatele ve formatu obvyklem pro CR,
- oznaceni hlavni mzdy,
- detekci pravdepodobneho dne prichodu mzdy z delsi historie,
- vypocet vyplatniho cyklu od vyplaty do vyplaty,
- detekci pravidelnych plateb z historie,
- rucni potvrzeni a editaci pravidelnych plateb,
- vylouceni prevodu mezi vlastnimi ucty z provozni evidence,
- rucni oznaceni vyjimecnych transakci,
- navrhovani potencialne vyjimecnych transakci,
- zobrazeni transakci vcetne oznaceni jejich typu/stavu,
- dashboard s hlavni metrikou spendu,
- predikci vysledku do dalsi vyplaty.

### 3.2 Mimo rozsah MVP

MVP nebude obsahovat:

- kategorizaci transakci,
- porovnani vice cyklu mezi sebou,
- automaticke napojeni na PSD2 API,
- mobilni aplikaci jako nativni aplikaci,
- investice,
- majetek,
- dluhy a uvery jako samostatny modul,
- planovani dlouhodobych financnich cilu,
- sdileni dat mezi uzivateli,
- vicenasobne hlavni prijmy pro jednoho uzivatele.

## 4. Cíloví uživatelé

### 4.1 Primarni uzivatel

Jednotlivec, ktery:

- ma jeden hlavni pravidelny prijem,
- muze mit vice beznych a sporicich uctu,
- chce rizeni provoznich vydaju podle vyplatniho cyklu,
- nechce resit detailni kategorie vydaju,
- chce rychle videt, jestli utraci udrzitelnym tempem.

### 4.2 Sekundarni uzivatel

Jednotlivec s mirne slozitejsim tokem penez:

- ma vice vlastnich uctu,
- posila penize mezi beznym a sporicim uctem,
- obcas ma dalsi prichozi transakce mimo mzdu,
- potrebuje vyloucit vyjimecne transakce z vypoctu.

## 5. Zakladni pojmy

### 5.1 Vyplatni cyklus

Obdobi od jedne rozpoznane nebo rucne oznacene mzdy do dalsi mzdy. Aplikace se neridi kalendarnim mesicem, ale realnym tokem penez.

### 5.2 Hlavni prijem

Mzda nebo obdobny pravidelny prijem, ktery urcuje zacatek vyplatniho cyklu. Uzivatel muze mzdu rucne oznacit. Aplikace muze z delsi historie odhadnout pravdepodobny den prichodu mzdy.

### 5.3 Pevna mesicni castka

Rucne zadana castka, kterou si uzivatel dovoli v kazdem cyklu pouzit na provozni zivot. Tato castka je stejna pro vsechny cykly, dokud ji uzivatel sam nezmeni.

### 5.4 Uspora

Vse, co presahuje pevnou mesicni castku, se povazuje za uspory. Prevod na sporici ucet je mimo provozni evidenci.

### 5.5 Pravidelna platba

Odchozi platba, ktera se v nahranem historickem obdobi vyskytla alespon v 80 % mesicu a ma podobne datum, podobnou castku a podobny popis/protistranu. Platby s kolisajici castkou se v MVP nemaji povazovat za pravidelne platby.

### 5.6 Volny spend

Cast provozniho rozpoctu, kterou uzivatel muze ovlivnit. Vypocte se jako pevna mesicni castka minus potvrzene pravidelne platby v danem cyklu, pripadne plus relevantni dodatecne prichozi transakce, ktere nejsou prevedeny na sporeni.

### 5.7 Vyjimecna transakce

Transakce, kterou uzivatel rucne vyjme z vypoctu, nebo kterou aplikace navrhne k vyjmuti. Ve vypisu zustava zobrazena, ale je oznacena jako vyjimka.

## 6. Business pravidla

### 6.1 Oddeleni dat uzivatelu

BR-001: Kazdy uzivatel vidi pouze sva data.

BR-002: Transakce, ucty, importy, pravidla, oznaceni vyjimek a vypocty musi byt vzdy vazane na konkretniho uzivatele.

### 6.2 Import transakci

BR-003: MVP podporuje rucni import CSV souboru.

BR-004: Import musi byt schopen rozpoznat duplicitni transakce a zamezit jejich opakovanemu ulozeni.

BR-005: Pokud CSV neobsahuje stabilni identifikator transakce, aplikace vytvori technicky fingerprint napr. z data, castky, meny, cisla uctu protistrany, popisu, variabilniho symbolu a smeru transakce.

BR-006: Importovane transakce musi zustat dohledatelne ve vypisu i tehdy, pokud jsou pozdeji vylouceny z vypoctu.

### 6.3 Vlastni ucty

BR-007: Uzivatel muze zadat vice vlastnich uctu ve formatu beznem v CR.

BR-008: Prevod mezi vlastnimi ucty je mimo provozni evidenci.

BR-009: Prevod z bezneho uctu na sporici a zpet se stale povazuje za pohyb vlastnich penez a nema navysovat volny spend.

BR-010: Penize odeslane na sporeni jsou mimo provozni evidenci.

### 6.4 Hlavni prijem a vyplatni cyklus

BR-011: Uzivatel muze rucne oznacit transakci jako hlavni prijem.

BR-012: Aplikace muze z historie alespon 6 mesicu navrhnout pravdepodobny den prichodu mzdy.

BR-013: Vyplatni cyklus zacina dnem prijeti mzdy.

BR-014: Vyplatni cyklus konci den pred dalsi mzdou.

BR-015: Pokud dalsi mzda jeste neni znama, aplikace odhaduje datum dalsi mzdy podle historickeho vzoru.

### 6.5 Pevna mesicni castka

BR-016: Pevnou mesicni castku zadava uzivatel pouze manualne.

BR-017: Pevna mesicni castka plati pro vsechny cykly, dokud ji uzivatel nezmeni.

BR-018: Cast prijmu nad pevnou mesicni castku se povazuje za uspory.

### 6.6 Dalsi prichozi transakce

BR-019: Dalsi prichozi transakce nejsou automaticky povazovane za hlavni prijem.

BR-020: Dalsi prichozi transakce mohou navysit volny spend, pokud nejsou prevedeny na sporeni a nejsou oznaceny jako vyjimka.

BR-021: Uzivatel musi mit moznost rucne upravit, zda konkretni prichozi transakce navysuje volny spend.

### 6.7 Pravidelne platby

BR-022: Aplikace detekuje kandidaty na pravidelne platby z historie.

BR-023: Kandidat na pravidelnou platbu musi byt potvrzen uzivatelem.

BR-024: Uzivatel muze pravidelnou platbu editovat nebo zrusit jeji oznaceni.

BR-025: Pravidelna platba je kandidat, pokud se vyskytuje alespon v 80 % mesicu v nahranem obdobi.

BR-026: Pravidelna platba musi mit podobne datum, podobnou castku a podobny popis/protistranu.

BR-027: Platby s kolisajici castkou se v MVP nemaji automaticky povazovat za pravidelne platby.

### 6.8 Volny spend a denni limit

BR-028: Volny spend je jedna spolecna castka bez kategorii.

BR-029: Volny spend pro cyklus se vypocte z pevne mesicni castky, potvrzenych pravidelnych plateb a relevantnich dalsich prichozich transakci.

BR-030: Denní povoleny spend se vypocte jako zbyvajici volny spend deleno poctem dni do dalsi vyplaty.

BR-031: Pokud uzivatel utrati mene nez povoleny denni spend, zbytek se prenasi do dalsich dni v ramci stejneho cyklu.

BR-032: Na konci cyklu se nevycerpany zbytek resetuje a povazuje se za uspory.

### 6.9 Vyjimecne transakce

BR-033: Uzivatel muze libovolnou transakci rucne oznacit jako vyjimecnou.

BR-034: Vyjimecna transakce se nezahrnuje do vypoctu spendu.

BR-035: Vyjimecna transakce zustava zobrazena ve vypisu transakci.

BR-036: Aplikace muze navrhovat transakce k vyrazeni, napr. podle neobvykle vysoke castky nebo nestandardniho vzoru.

### 6.10 Dashboard

BR-037: Dashboard zobrazuje prumerny spend od posledni vyplaty.

BR-038: Dashboard zobrazuje prumerny spend, ktery si uzivatel muze dovolit do dalsi vyplaty.

BR-039: Dashboard zobrazuje velikost posledni vyplaty.

BR-040: Dashboard zobrazuje predikci: pokud bude uzivatel pokracovat aktualnim tempem, skonci vuci planu v plusu nebo minusu o konkretni castku.

## 7. Vypocty

### 7.1 Zakladni vstupy

- `salary_amount` = castka posledni oznacene mzdy
- `fixed_monthly_amount` = rucne nastavena pevna mesicni castka
- `regular_payments_total` = soucet potvrzenych pravidelnych plateb v aktualnim cyklu
- `additional_spend_income` = dalsi prichozi transakce, ktere navysuji volny spend
- `excluded_transactions_total` = vyjimecne transakce mimo vypocet
- `actual_variable_spend` = soucet relevantnich ovlivnitelnych odchozich transakci od posledni vyplaty
- `days_elapsed` = pocet dni od zacatku aktualniho cyklu vcetne/bez dnesniho dne podle zvolene metodiky
- `days_remaining` = pocet dni do dalsi ocekavane vyplaty

### 7.2 Provozni rozpocet cyklu

```text
cycle_operating_budget = fixed_monthly_amount + additional_spend_income
```

Poznamka: castka mzdy nad pevnou mesicni castku se povazuje za uspory a nevstupuje do provozniho rozpoctu.

### 7.3 Volny spend cyklu

```text
cycle_free_spend = cycle_operating_budget - regular_payments_total
```

### 7.4 Zbyvajici volny spend

```text
remaining_free_spend = cycle_free_spend - actual_variable_spend
```

### 7.5 Prumerny denni spend od vyplaty

```text
actual_avg_daily_spend = actual_variable_spend / days_elapsed
```

### 7.6 Denní spend, ktery si uzivatel muze dovolit

```text
allowed_avg_daily_spend = remaining_free_spend / days_remaining
```

### 7.7 Predikce konce cyklu

```text
projected_variable_spend = actual_avg_daily_spend * total_cycle_days
projected_end_balance = cycle_free_spend - projected_variable_spend
```

Interpretace:

- pokud `projected_end_balance > 0`, uzivatel pravdepodobne skonci v plusu,
- pokud `projected_end_balance < 0`, uzivatel pri soucasnem tempu prekroci dostupny spend,
- pokud `projected_end_balance = 0`, uzivatel je presne na planu.

## 8. Funkcni pozadavky

### 8.1 Sprava uzivatele

FR-001: Uzivatel se muze prihlasit do aplikace.

FR-002: Uzivatel vidi pouze sva data.

FR-003: Aplikace uklada nastaveni uzivatele, vcetne pevne mesicni castky a vlastnich uctu.

### 8.2 Nastaveni vlastnich uctu

FR-004: Uzivatel muze pridat vlastni bezny nebo sporici ucet.

FR-005: Uzivatel muze vlastni ucet upravit nebo odebrat.

FR-006: Aplikace rozpozna prevody mezi vlastnimi ucty a oznaci je jako mimo evidenci.

### 8.3 Import CSV

FR-007: Uzivatel muze nahrat CSV soubor s transakcemi.

FR-008: Aplikace zobrazi vysledek importu: pocet novych transakci, pocet duplicit, pocet problematickych radku.

FR-009: Aplikace nesmi vytvorit duplicity pri opakovanem importu stejneho souboru.

FR-010: Aplikace ulozi importovane transakce ve standardizovanem internim formatu.

### 8.4 Oznacovani transakci

FR-011: Uzivatel muze oznacit transakci jako hlavni prijem.

FR-012: Uzivatel muze oznacit transakci jako vyjimecnou.

FR-013: Uzivatel muze zrusit oznaceni vyjimecne transakce.

FR-014: Uzivatel muze rozhodnout, zda prichozi transakce mimo mzdu navysuje volny spend.

FR-015: Aplikace zobrazuje stav transakce ve vypisu.

### 8.5 Detekce mzdy

FR-016: Aplikace umi na zaklade alespon 6 mesicu historie navrhnout pravdepodobny den prichodu mzdy.

FR-017: Uzivatel musi mit moznost navrh potvrdit nebo zmenit.

FR-018: Pokud mzda neni oznacena, aplikace upozorni, ze nelze spolehlive vytvorit vyplatni cyklus.

### 8.6 Detekce pravidelnych plateb

FR-019: Aplikace analyzuje historicke odchozi transakce.

FR-020: Aplikace navrhne kandidaty na pravidelne platby podle pravidla 80 % mesicu.

FR-021: Kandidat musi mit podobny den, castku a popis/protistranu.

FR-022: Uzivatel muze kandidata potvrdit jako pravidelnou platbu.

FR-023: Uzivatel muze pravidelnou platbu editovat.

FR-024: Uzivatel muze oznaceni pravidelne platby zrusit.

### 8.7 Detekce vyjimek

FR-025: Aplikace muze navrhnout transakce k vyrazeni z vypoctu.

FR-026: Navrzene vyjimky musi byt viditelne a odlisene od potvrzenych vyjimek.

FR-027: Uzivatel rozhoduje o finalnim vyrazeni transakce.

### 8.8 Dashboard

FR-028: Dashboard zobrazuje velikost posledni vyplaty.

FR-029: Dashboard zobrazuje prumerny spend od posledni vyplaty.

FR-030: Dashboard zobrazuje prumerny denni spend, ktery si uzivatel muze dovolit.

FR-031: Dashboard zobrazuje predikci konce cyklu.

FR-032: Dashboard zobrazuje aktualni stav vuci planu jako plus/minus castku.

### 8.9 Vypis transakci

FR-033: Uzivatel vidi seznam importovanych transakci.

FR-034: U kazde transakce je videt datum, castka, smer, popis, protiucet a stav klasifikace.

FR-035: Transakce mimo evidenci, vyjimky, mzda a pravidelne platby jsou vizualne oznacene.

FR-036: Uzivatel muze filtrovat transakce podle stavu.

## 9. Nefunkcni pozadavky

### 9.1 Bezpecnost a soukromi

NFR-001: Data jednotlivych uzivatelu musi byt izolovana.

NFR-002: Bankovni transakce jsou citliva data a musi byt chranena proti neopravnenemu pristupu.

NFR-003: Pristup k datům musi byt autorizovan pres identitu uzivatele.

NFR-004: Aplikace by mela logovat importy a zmeny klasifikace, ale bez zbytecneho vystavovani citlivych detailu.

### 9.2 Spolehlivost

NFR-005: Opakovany import stejneho CSV nesmi menit vysledky ani vytvaret duplicity.

NFR-006: Vypocty dashboardu musi byt reprodukovatelne ze zdrojovych transakci a uzivatelskych nastaveni.

### 9.3 Pouzitelnost

NFR-007: Hlavni dashboard musi byt srozumitelny bez znalosti ucetnictvi.

NFR-008: Uživatel musi umet opravit automatickou klasifikaci transakce.

NFR-009: Aplikace nesmi vyzadovat kategorie transakci.

### 9.4 Vykon

NFR-010: Import nekolika tisic transakci by mel probehnout v radu sekund.

NFR-011: Dashboard by se mel nacitat bez citelne prodlevy.

## 10. Navrh datoveho modelu

### 10.1 User

- `id`
- `email`
- `password_hash` nebo externi identita
- `created_at`

### 10.2 UserSettings

- `user_id`
- `fixed_monthly_amount`
- `currency`
- `created_at`
- `updated_at`

### 10.3 Account

- `id`
- `user_id`
- `account_number`
- `bank_code`
- `account_type` = current/savings
- `name`
- `is_active`

### 10.4 ImportBatch

- `id`
- `user_id`
- `file_name`
- `imported_at`
- `rows_total`
- `rows_imported`
- `rows_duplicate`
- `rows_failed`

### 10.5 Transaction

- `id`
- `user_id`
- `import_batch_id`
- `transaction_date`
- `amount`
- `currency`
- `direction` = incoming/outgoing
- `account_number`
- `counterparty_account_number`
- `counterparty_bank_code`
- `counterparty_name`
- `description`
- `variable_symbol`
- `constant_symbol`
- `specific_symbol`
- `fingerprint`
- `classification`
- `is_excluded`
- `is_own_transfer`
- `increases_free_spend`
- `created_at`
- `updated_at`

### 10.6 RegularPayment

- `id`
- `user_id`
- `name`
- `counterparty_account_number`
- `counterparty_name`
- `description_pattern`
- `expected_amount`
- `expected_day`
- `status` = suggested/confirmed/rejected
- `created_at`
- `updated_at`

### 10.7 PayrollMarker

- `id`
- `user_id`
- `transaction_id`
- `cycle_start_date`
- `salary_amount`
- `is_manual`

### 10.8 Cycle

- `id`
- `user_id`
- `start_date`
- `expected_end_date`
- `actual_end_date`
- `salary_transaction_id`
- `salary_amount`
- `fixed_monthly_amount_snapshot`

Poznamka: U cyklu je vhodne ulozit snapshot pevne mesicni castky, aby zmena nastaveni v budoucnu nerozbila historicke vypocty.

## 11. Uzivatelske scenare

### US-001: Prvni nastaveni

Jako uzivatel chci zadat sve vlastni ucty a pevnou mesicni castku, aby aplikace dokazala odlisit provozni penize od uspor a vlastnich prevodu.

Akceptacni kriteria:

- uzivatel zada alespon jeden vlastni ucet,
- uzivatel zada pevnou mesicni castku,
- aplikace ulozi nastaveni pouze pro daneho uzivatele.

### US-002: Import transakci

Jako uzivatel chci nahrat CSV s bankovnimi transakcemi, aby aplikace mohla vypocitat muj provozni spend.

Akceptacni kriteria:

- aplikace prijme CSV soubor,
- aplikace zobrazi vysledek importu,
- duplicitni transakce se neulozi podruhe,
- nove transakce jsou dostupne ve vypisu.

### US-003: Oznaceni mzdy

Jako uzivatel chci oznacit transakci jako hlavni prijem, aby aplikace vedela, odkud zacina vyplatni cyklus.

Akceptacni kriteria:

- uzivatel muze oznacit prichozi transakci jako mzdu,
- aplikace vytvori nebo aktualizuje vyplatni cyklus,
- dashboard zacne pocitat hodnoty od oznacene mzdy.

### US-004: Potvrzeni pravidelnych plateb

Jako uzivatel chci videt navrzene pravidelne platby a potvrdit je, aby se odecitaly od provozniho rozpoctu.

Akceptacni kriteria:

- aplikace navrhne kandidaty podle historie,
- uzivatel muze kandidata potvrdit, upravit nebo odmitnout,
- potvrzene pravidelne platby vstupuji do vypoctu volneho spendu.

### US-005: Vyrazeni vyjimecne transakce

Jako uzivatel chci oznacit transakci jako vyjimecnou, aby nezkreslovala muj bezny provozni spend.

Akceptacni kriteria:

- uzivatel muze oznacit libovolnou transakci jako vyjimku,
- transakce zustane viditelna ve vypisu,
- transakce se nezahrne do vypoctu spendu.

### US-006: Kontrola dashboardu

Jako uzivatel chci na dashboardu videt, kolik denne skutecne utracim a kolik si jeste muzu dovolit, abych do dalsi vyplaty vysel.

Akceptacni kriteria:

- dashboard zobrazuje velikost posledni vyplaty,
- dashboard zobrazuje skutecny prumerny denni spend,
- dashboard zobrazuje povoleny prumerny denni spend,
- dashboard zobrazuje predikci konce cyklu.

## 12. Hlavni obrazovky

### 12.1 Dashboard

Obsah:

- posledni vyplata,
- datum posledni vyplaty,
- odhad dalsi vyplaty,
- dny do dalsi vyplaty,
- skutecny prumerny denni spend,
- povoleny prumerny denni spend,
- zbyvajici volny spend,
- predikovany konec cyklu v plusu/minusu.

### 12.2 Import

Obsah:

- nahrani CSV,
- vysledek importu,
- seznam chyb/problemovych radku,
- informace o duplicitach.

### 12.3 Transakce

Obsah:

- seznam transakci,
- filtrovani podle stavu,
- oznaceni mzdy,
- oznaceni vyjimky,
- nastaveni, zda prichozi transakce navysuje spend,
- zobrazeni vlastnich prevodu mimo evidenci.

### 12.4 Pravidelne platby

Obsah:

- navrzeni kandidati,
- potvrzene pravidelne platby,
- editace pravidla,
- odmitnuti kandidata.

### 12.5 Nastaveni

Obsah:

- pevna mesicni castka,
- vlastni ucty,
- typ uctu: bezny/sporici,
- zakladni nastaveni meny.

## 13. Logika detekce

### 13.1 Detekce duplicit

Preferovane poradi:

1. Pouzit unikatni ID transakce z CSV, pokud existuje.
2. Pokud neexistuje, vytvorit fingerprint.
3. Fingerprint stavet z kombinace:
   - datum transakce,
   - castka,
   - mena,
   - smer,
   - cislo uctu,
   - protiucet,
   - popis,
   - symboly platby.

### 13.2 Detekce mzdy

Navrh detekce:

- analyzovat prichozi transakce za alespon 6 mesicu,
- hledat podobnou castku nebo podobneho odesilatele,
- hledat pravidelny vyskyt kolem stejneho dne v mesici,
- navrhnout kandidata uzivateli,
- finalni potvrzeni nechat na uzivateli.

### 13.3 Detekce pravidelnych plateb

Navrh detekce:

- seskupit odchozi transakce podle protistrany, popisu a podobne castky,
- vyhodnotit vyskyt v jednotlivych mesicich,
- kandidat musi byt alespon v 80 % mesicu,
- kandidat musi mit podobne datum v mesici,
- kandidat nesmi mit vyrazne kolisajici castku,
- kandidat musi potvrdit uzivatel.

### 13.4 Navrhovani vyjimek

Mozne signaly:

- castka vyrazne nad bezny provozni spend,
- neobvykla protistrana,
- jednorazovy velky vydaj,
- transakce mimo bezny rytmus uzivatele.

Navrh vyjimky nesmi transakci automaticky vyradit. Finalni rozhodnuti dela uzivatel.

## 14. Akceptacni kriteria MVP

MVP lze povazovat za splnene, pokud:

- uzivatel se prihlasi a vidi pouze svoje data,
- uzivatel zada pevnou mesicni castku,
- uzivatel zada vlastni ucty,
- uzivatel nahraje CSV s transakcemi,
- aplikace neimportuje duplicity,
- uzivatel oznaci mzdu,
- aplikace vytvori aktualni vyplatni cyklus,
- aplikace navrhne pravidelne platby podle historie,
- uzivatel pravidelne platby potvrdi nebo upravi,
- aplikace ignoruje prevody mezi vlastnimi ucty,
- uzivatel oznaci vyjimecne transakce,
- vyjimky zustanou ve vypisu, ale nevstoupi do vypoctu,
- dashboard ukaze posledni vyplatu,
- dashboard ukaze skutecny prumerny denni spend,
- dashboard ukaze povoleny prumerny denni spend,
- dashboard ukaze predikci konce cyklu.

## 15. Rizika a otevrene body

### 15.1 Rizika

- Ruzne banky mohou mit odlisne CSV formaty.
- Bez stabilniho ID transakce muze byt deduplikace mene presna.
- Detekce mzdy muze byt nespolehliva u odmen, bonusu nebo nepravidelnych vyplat.
- Pravidlo pro pravidelne platby muze minout platby s kolisajici castkou, coz je v MVP zamerne rozhodnuti.
- Uzivatel muze spatne oznacit vlastni ucty, cimz zkresli vypocty.
- Pokud uzivatel importuje kratkou historii, aplikace nemusi umet spolehlive navrhnout mzdu a pravidelne platby.

### 15.2 Otevrene body pro dalsi rozhodnuti

- Presny CSV format pro prvni podporovanou banku.
- Presna tolerance pro "podobne datum" u pravidelnych plateb.
- Presna tolerance pro "podobnou castku" u pravidelnych plateb.
- Zda se do `days_elapsed` pocita aktualni den.
- Jak zobrazovat situaci, kdy je `days_remaining = 0`.
- Jak zachazet s vratkami plateb a refundacemi.
- Jestli ma byt historie pevne mesicni castky verzovana od data zmeny.

## 16. Doporucena dalsi faze

Dalsim krokem by mela byt produktova specifikace MVP:

1. Definovat presny CSV format prvni podporovane banky.
2. Navrhnout obrazovky a UX flow.
3. Zpresnit vypocet dni v cyklu.
4. Popsat importni mapovani sloupcu.
5. Definovat tolerancni pravidla pro detekci mzdy a pravidelnych plateb.
6. Pripravit technicky navrh datoveho modelu a API.

