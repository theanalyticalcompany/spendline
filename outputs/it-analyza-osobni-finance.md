# IT analýza: Webová aplikace pro řízení provozních osobních financí

## 1. Kontext a technické zadání

Aplikace bude webová aplikace pro více uživatelů, primárně pro osobní použití a testování jedním vlastníkem. Každý uživatel má oddělená data a nesmí vidět data ostatních. Aplikace bude zpracovávat bankovní CSV exporty z Moneta Money Bank a mBank, počítat provozní spend v cyklu od výplaty do výplaty a zobrazovat dashboard s predikcí.

Preferovaný cílový hosting je Endora.cz, tarif Fun, subdoména:

```text
finance.ivanjelinek.cz
```

Podle veřejných parametrů Endory tarif Fun nabízí zejména PHP hosting s MySQL/MariaDB, 3 GB prostoru, 2 databázemi, PHP 8+, CRONem, WebSSH, 512 MB `memory_limit`, 256 MB `upload_max_filesize` a 256 MB `post_max_size`.

Zdroj: https://www.endora.cz/

Z toho plyne základní technické omezení: aplikace má být navržená jako klasická PHP aplikace běžící na sdíleném hostingu, bez požadavku na Node.js server, Docker v produkci, background workers nebo vlastní aplikační proces.

## 2. Doporučený technický směr

### 2.1 Doporučení

Pro MVP doporučuji:

- backend: PHP 8.2+,
- framework: Nette,
- šablony: Latte,
- databáze: MySQL nebo MariaDB,
- databázový přístup: Nette Database Explorer nebo lehký repository layer nad PDO,
- frontend: server-rendered HTML s malým množstvím JavaScriptu,
- CSS: jednoduchý vlastní CSS nebo Bootstrap 5,
- lokální vývoj: Docker Compose nebo lokální PHP + MariaDB,
- e-maily: SMTP přes e-mailovou schránku na Endoře,
- deploy: SFTP/FTPS + Composer build lokálně, případně WebSSH podle reálných možností hostingu.

### 2.2 Proč Nette

Nette je pro tento typ aplikace vhodnější než těžší stack, protože:

- dobře sedí na český PHP hosting,
- je lehčí než Laravel,
- nevyžaduje složitý runtime,
- dobře funguje se server-rendered HTML,
- má rozumné zabezpečení formulářů, routingu a šablon,
- dá se dobře nasadit i na sdílený hosting,
- je dostatečně robustní pro přihlášení, formuláře, import CSV, dashboard a administraci.

Laravel by byl také možný, ale pro Endora Fun a jednoduchou aplikaci je to větší provozní a vývojový aparát, než je potřeba.

## 3. Jednodušší vs robustnější varianta

### 3.1 Jednodušší varianta, doporučená pro MVP

Jednodušší varianta znamená:

- jedna PHP aplikace,
- jedna databáze,
- server-rendered obrazovky,
- výpočty dashboardu při načtení stránky,
- import CSV zpracovaný synchronně při uploadu,
- žádné fronty,
- žádné samostatné API pro frontend,
- žádný samostatný Node.js build proces jako nutná produkční závislost,
- žádné PSD2 napojení,
- žádná auditní historie,
- minimum administračních funkcí.

Praktický dopad:

- rychlejší vývoj,
- méně komponent,
- jednodušší lokální testování,
- jednodušší nasazení na Endoru,
- méně provozních problémů,
- levnější údržba,
- vhodné pro první funkční verzi.

Nevýhody:

- horší škálování při větším počtu uživatelů,
- méně komfortní frontend než SPA,
- delší import velkého souboru může držet HTTP request,
- složitější budoucí přechod na real-time automatizace.

### 3.2 Robustnější varianta

Robustnější varianta by znamenala například:

- oddělený backend a frontend,
- REST/JSON API,
- SPA frontend v Reactu/Vue/Svelte,
- background joby pro importy,
- frontu pro zpracování souborů,
- auditní log změn,
- pokročilé role a oprávnění,
- verzování výpočtů,
- automatické testy na více úrovních,
- CI/CD pipeline,
- monitoring,
- pokročilé zálohování,
- možnost budoucího PSD2 napojení.

Praktický dopad pro vývoj:

- vývoj by byl pomalejší,
- nasazení by bylo složitější,
- Endora Fun by byla méně vhodná,
- pravděpodobně by dával větší smysl VPS nebo moderní PaaS hosting,
- aplikace by byla připravenější na veřejnou službu pro více cizích uživatelů.

Pro aktuální zadání robustnější varianta nedává smysl jako první krok. Doporučení je postavit jednoduché MVP, ale navrhnout databázi a služby tak, aby šly později rozšiřovat.

## 4. Cílová architektura MVP

### 4.1 Logické vrstvy

```text
Browser
  |
  v
PHP/Nette aplikace
  |
  +-- Auth modul
  +-- Import modul
  +-- Transaction modul
  +-- Classification modul
  +-- Dashboard modul
  +-- Admin modul
  |
  v
MySQL/MariaDB databáze
```

### 4.2 Produkční prostředí

```text
Endora Fun hosting
  |
  +-- Apache/Nginx + PHP 8+
  +-- MySQL/MariaDB
  +-- SMTP e-mail
  +-- CRON
  +-- SFTP/FTPS nebo WebSSH deploy
```

### 4.3 Lokální prostředí

Doporučené lokální prostředí:

```text
Docker Compose
  |
  +-- PHP + Apache/Nginx
  +-- MariaDB
  +-- Mailpit/Mailhog pro test e-mailů
  +-- phpMyAdmin/Adminer volitelně
```

Alternativa bez Dockeru:

- lokální PHP,
- lokální MariaDB/MySQL,
- Composer,
- vestavěný PHP server pro vývoj.

Docker je vhodnější, protože usnadní opakovatelné testovací prostředí.

## 5. Technologický stack

### 5.1 Backend

- PHP 8.2 nebo novější podle dostupnosti na Endoře.
- Nette Framework.
- Latte šablony.
- Nette Forms.
- Nette Security.
- Nette Database.
- Composer pro správu závislostí.

### 5.2 Frontend

Pro MVP:

- HTML generované na serveru,
- Latte šablony,
- Bootstrap 5 nebo jednoduchý vlastní CSS,
- minimum JavaScriptu pouze pro komfortní UI, např. potvrzení akcí, dynamické mapování CSV sloupců.

Není doporučeno stavět MVP jako SPA. Aplikace je datově formulářová, nevyžaduje real-time rozhraní a server-rendered přístup zjednoduší provoz.

### 5.3 Databáze

- MySQL nebo MariaDB.
- InnoDB tabulky.
- UTF-8 / `utf8mb4`.
- Část citlivých polí šifrovaná na aplikační vrstvě.

### 5.4 E-mail

- SMTP účet na Endoře.
- Použití pro:
  - reset hesla,
  - potvrzení registrace, pokud bude zapnuto,
  - systémové zprávy uživateli.

### 5.5 Šifrování citlivých dat

Doporučení:

- šifrovat citlivé bankovní údaje na aplikační vrstvě,
- použít `libsodium`, pokud je dostupné,
- fallback AES-256-GCM přes OpenSSL,
- šifrovací klíč držet mimo databázi v konfiguračním souboru nebo environment proměnné,
- hashovat fingerprinty transakcí pro deduplikaci.

Citlivá pole:

- čísla účtů,
- protiúčty,
- jména protistran,
- popisy transakcí,
- symboly plateb,
- případně název importovaného souboru.

Pole potřebná pro výpočty, například datum, směr a částka, mohou zůstat nešifrovaná, protože se nad nimi často filtruje a počítá. I tato data jsou ale citlivá a musí být chráněna aplikační autorizací.

## 6. Uživatelské role a oprávnění

### 6.1 Role User

Běžný uživatel může:

- registrovat se,
- přihlásit se,
- spravovat vlastní nastavení,
- zadat vlastní účty,
- importovat CSV,
- mapovat CSV sloupce,
- zobrazit vlastní transakce,
- označit mzdu,
- označit výjimky,
- potvrdit pravidelné platby,
- upravit očekávané datum další výplaty,
- zobrazit vlastní dashboard,
- smazat vlastní účet, pokud bude tato funkce dostupná i mimo admina.

Běžný uživatel nesmí:

- vidět jiného uživatele,
- vidět cizí transakce,
- spravovat jiné účty.

### 6.2 Role Admin

Admin může:

- zobrazit seznam uživatelů,
- vidět technické informace o uživatelských účtech,
- resetovat heslo,
- mazat uživatele,
- blokovat uživatele, pokud bude tato funkce implementována.

Admin nesmí:

- vidět transakce uživatelů,
- vidět bankovní účty uživatelů,
- vidět dashboard uživatelů,
- číst importovaná finanční data.

Technické informace viditelné adminovi:

- ID uživatele,
- e-mail / přihlašovací jméno,
- datum registrace,
- datum posledního přihlášení,
- počet importů,
- počet transakcí jako agregované číslo,
- stav účtu.

## 7. Autentizace a správa účtu

### 7.1 Registrace

Uživatel se může registrovat sám.

Doporučená pole:

- e-mail,
- heslo,
- potvrzení hesla.

Uživatel uvedl "přihlášení jménem a heslem". Prakticky doporučuji použít e-mail jako přihlašovací jméno, protože:

- je potřeba pro reset hesla,
- je unikátní,
- snižuje počet údajů v registraci.

### 7.2 Hesla

Požadavky:

- ukládat pouze hash hesla,
- použít `password_hash()` s algoritmem `PASSWORD_DEFAULT`,
- ověřovat přes `password_verify()`,
- nikdy neposílat heslo e-mailem.

### 7.3 Reset hesla

Flow:

1. Uživatel zadá e-mail.
2. Aplikace vytvoří jednorázový token.
3. Token se uloží zahashovaný v databázi.
4. Uživatel dostane e-mail s odkazem.
5. Po použití token expirovat a zneplatnit.

## 8. Import CSV

### 8.1 Podporované banky v MVP

MVP má primárně podporovat:

- Moneta Money Bank,
- mBank.

Protože přesné CSV struktury se mohou lišit podle exportu, aplikace musí mít import s mapováním sloupců.

### 8.2 Importní flow

1. Uživatel nahraje CSV soubor.
2. Aplikace načte hlavičku a prvních několik řádků.
3. Aplikace se pokusí rozpoznat známý formát.
4. Pokud formát pozná, předvyplní mapování.
5. Pokud formát nepozná, uživatel ručně namapuje sloupce.
6. Aplikace zobrazí preview normalizovaných transakcí.
7. Uživatel import potvrdí.
8. Aplikace uloží transakce.
9. Aplikace odstraní původní CSV soubor.
10. Aplikace zobrazí výsledek importu.

### 8.3 Povinná mapovaná pole

Minimální povinná pole:

- datum transakce,
- částka,
- měna nebo implicitní CZK,
- směr transakce nebo znaménko částky,
- popis transakce.

Doporučená volitelná pole:

- účet uživatele,
- protiúčet,
- kód banky protiúčtu,
- název protistrany,
- variabilní symbol,
- konstantní symbol,
- specifický symbol,
- ID transakce z banky, pokud existuje.

### 8.4 Deduplikace

Postup:

1. Pokud CSV obsahuje stabilní ID transakce, použít ho.
2. Pokud ne, vytvořit fingerprint.
3. Fingerprint vytvořit z normalizovaných hodnot.
4. Ukládat hash fingerprintu, ne nutně původní concat údajů.

Fingerprint může obsahovat:

- datum,
- částku,
- měnu,
- směr,
- účet,
- protiúčet,
- popis,
- symboly.

Deduplikační unikátní klíč:

```text
user_id + transaction_fingerprint_hash
```

### 8.5 Mazání CSV

Původní CSV se po dokončení importu smaže.

Doporučení:

- soubor ukládat pouze do dočasné složky mimo veřejný web root,
- po úspěšném i neúspěšném zpracování jej odstranit,
- do databáze ukládat pouze technický záznam importu.

## 9. Klasifikace transakcí

### 9.1 Typy klasifikace

Navržené hodnoty:

- `unclassified`,
- `salary`,
- `regular_payment`,
- `own_transfer`,
- `excluded`,
- `variable_spend`,
- `additional_income`,
- `ignored_savings`.

### 9.2 Vlastní účty

Uživatel zadává vlastní účty ve formátu obvyklém v ČR.

Doporučená interní normalizace:

```text
prefix-account_number/bank_code
```

Příklady:

```text
123456789/0100
19-123456789/0800
```

Při ukládání:

- uchovat normalizovanou podobu,
- citlivou čitelnou podobu šifrovat,
- pro porovnávání ukládat hash normalizovaného čísla účtu.

### 9.3 Převody mezi vlastními účty

Pokud je účet i protiúčet mezi vlastními účty uživatele, transakce se označí jako `own_transfer` a nevstupuje do provozní evidence.

Platí i pro pohyb:

```text
běžný účet -> spořicí účet -> běžný účet
```

Tento pohyb nesmí navýšit volný spend.

### 9.4 Mzda

Mzdu lze:

- ručně označit,
- navrhnout z historie.

Pro MVP je ruční označení rozhodující. Automatická detekce je pomocná.

### 9.5 Výjimky

Uživatel může označit libovolnou transakci jako výjimku.

Výjimka:

- zůstane zobrazena ve výpisu,
- nevstoupí do výpočtů,
- je vizuálně označena.

Aplikace může navrhovat výjimky, ale nesmí je automaticky potvrdit.

## 10. Dashboard a výpočty

### 10.1 Přepočet

Dashboard se přepočítává:

- při každém načtení dashboardu,
- po změně označení transakce,
- po změně očekávaného data další výplaty,
- po importu.

V MVP není nutné ukládat předpočítané agregace. Výpočty lze provádět dotazem nad databází, protože očekávaný objem dat bude nízký.

### 10.2 Ruční úprava očekávané výplaty

Uživatel může upravit očekávané datum další výplaty.

Doporučení:

- ukládat ruční override na aktuálním cyklu,
- u výpočtů dát ručnímu datu přednost před odhadem,
- zobrazit, že datum bylo upraveno ručně.

### 10.3 Hlavní metriky

Dashboard zobrazí:

- velikost poslední výplaty,
- průměrný spend od výplaty,
- průměrný spend, který si uživatel může dovolit,
- predikci konce cyklu ve formě plus/minus částky.

## 11. Databázový model

### 11.1 `users`

```text
id
email
password_hash
role
status
created_at
updated_at
last_login_at
```

### 11.2 `password_reset_tokens`

```text
id
user_id
token_hash
expires_at
used_at
created_at
```

### 11.3 `user_settings`

```text
id
user_id
fixed_monthly_amount
currency
created_at
updated_at
```

### 11.4 `accounts`

```text
id
user_id
account_type
account_encrypted
account_hash
bank_code_hash
display_name_encrypted
is_active
created_at
updated_at
```

### 11.5 `import_batches`

```text
id
user_id
source_bank
original_file_name_encrypted
status
rows_total
rows_imported
rows_duplicate
rows_failed
created_at
completed_at
```

### 11.6 `transactions`

```text
id
user_id
import_batch_id
transaction_date
amount
currency
direction
own_account_hash
counterparty_account_hash
counterparty_bank_code_hash
own_account_encrypted
counterparty_account_encrypted
counterparty_name_encrypted
description_encrypted
variable_symbol_encrypted
constant_symbol_encrypted
specific_symbol_encrypted
fingerprint_hash
classification
is_excluded
increases_free_spend
created_at
updated_at
```

Indexy:

```text
user_id + transaction_date
user_id + fingerprint_hash unique
user_id + classification
user_id + direction
```

### 11.7 `regular_payments`

```text
id
user_id
name_encrypted
counterparty_account_hash
description_pattern_hash
expected_amount
expected_day
status
created_at
updated_at
```

### 11.8 `cycles`

```text
id
user_id
salary_transaction_id
start_date
expected_next_salary_date
expected_next_salary_date_is_manual
salary_amount
fixed_monthly_amount_snapshot
created_at
updated_at
```

### 11.9 `schema_migrations`

```text
version
executed_at
```

## 12. Routy / obrazovky

### 12.1 Veřejné routy

```text
GET  /login
POST /login
GET  /register
POST /register
GET  /password/forgot
POST /password/forgot
GET  /password/reset/{token}
POST /password/reset/{token}
POST /logout
```

### 12.2 Uživatelská část

```text
GET  /dashboard
GET  /transactions
POST /transactions/{id}/mark-salary
POST /transactions/{id}/mark-excluded
POST /transactions/{id}/unmark-excluded
POST /transactions/{id}/set-income-behavior
GET  /imports
GET  /imports/new
POST /imports/upload
POST /imports/map
POST /imports/confirm
GET  /regular-payments
POST /regular-payments/{id}/confirm
POST /regular-payments/{id}/reject
POST /regular-payments/{id}/update
GET  /settings
POST /settings
POST /settings/accounts
POST /settings/accounts/{id}/delete
POST /cycles/{id}/expected-salary-date
```

### 12.3 Admin část

```text
GET  /admin/users
GET  /admin/users/{id}
POST /admin/users/{id}/reset-password
POST /admin/users/{id}/delete
POST /admin/users/{id}/block
POST /admin/users/{id}/unblock
```

Admin routy nesmí zobrazovat transakční data.

## 13. Bezpečnostní požadavky

### 13.1 Izolace dat

Každý dotaz nad uživatelskými daty musí filtrovat podle `user_id`.

Zakázané:

- načíst transakci jen podle `id`,
- provádět update bez ověření vlastníka,
- zobrazovat agregace bez vazby na uživatele.

Správný princip:

```text
WHERE id = :id AND user_id = :current_user_id
```

### 13.2 CSRF

Všechny změnové formuláře musí mít CSRF ochranu.

### 13.3 XSS

Všechny hodnoty z bankovních transakcí jsou nedůvěryhodný vstup. Šablonovací systém musí escapovat výstup.

### 13.4 Upload souborů

Požadavky:

- povolit jen CSV/textové soubory,
- kontrolovat velikost,
- ukládat mimo public adresář,
- mazat po zpracování,
- neukládat původní CSV dlouhodobě.

### 13.5 Šifrovací klíče

Požadavky:

- šifrovací klíč nesmí být v databázi,
- nesmí být commitnutý do Gitu,
- v lokálu bude v `.env`,
- na Endoře v konfiguračním souboru mimo public root nebo v dostupném mechanismu prostředí.

### 13.6 E-mail

Požadavky:

- reset hesla přes jednorázový token,
- token ukládat pouze jako hash,
- token expiruje,
- po použití se zneplatní.

## 14. Deployment

### 14.1 Lokální vývoj

Doporučený postup:

1. Spustit Docker Compose.
2. Spustit migrace.
3. Spustit lokální web.
4. Testovat import na vzorových CSV.
5. Testovat e-maily přes Mailpit/Mailhog.

### 14.2 Příprava buildu pro Endoru

1. Nainstalovat Composer závislosti lokálně.
2. Připravit produkční konfiguraci.
3. Nahrát aplikaci přes SFTP/FTPS nebo WebSSH.
4. Nastavit document root na `www` nebo `public`.
5. Nastavit databázi.
6. Spustit migrace.
7. Nastavit SMTP.
8. Ověřit registraci, login, import a dashboard.

### 14.3 Doporučená adresářová struktura

```text
app/
config/
database/
public/
temp/
vendor/
www/ nebo public/
```

Veřejný web root musí mířit pouze na `public/` nebo `www/`. Konfigurace, šifrovací klíče, dočasné uploady a zdrojové soubory nesmí být veřejně dostupné.

## 15. Testování

### 15.1 Minimální testy MVP

Testovací scénáře:

- registrace uživatele,
- přihlášení,
- reset hesla,
- import CSV Moneta,
- import CSV mBank,
- ruční mapování neznámého CSV,
- opakovaný import stejného CSV bez duplicit,
- zadání vlastních účtů,
- rozpoznání převodu mezi vlastními účty,
- označení mzdy,
- vytvoření výplatního cyklu,
- označení výjimky,
- potvrzení pravidelné platby,
- výpočet dashboardu,
- admin reset hesla,
- admin smazání uživatele včetně dat.

### 15.2 Technické testy

Doporučené:

- unit testy pro výpočty dashboardu,
- unit testy pro deduplikaci,
- unit testy pro normalizaci účtů,
- integrační test importu CSV,
- ruční end-to-end test před nasazením.

## 16. Rizika a omezení

### 16.1 Hostingová rizika

- Endora Fun je sdílený hosting, ne aplikační platforma pro dlouho běžící procesy.
- Import musí proběhnout v limitu HTTP requestu.
- Nelze spoléhat na background workery.
- Produkční Docker není na tomto typu hostingu vhodný.

### 16.2 Datová rizika

- CSV formáty bank se mohou měnit.
- Exporty z různých bank nemusí obsahovat stejné sloupce.
- Deduplikace bez bankovního ID nemusí být stoprocentní.
- Šifrování omezuje možnosti fulltextového vyhledávání v popisech.

### 16.3 Bezpečnostní rizika

- Bankovní transakce jsou vysoce citlivá data.
- Admin nesmí mít přístup k transakcím, což musí být vynucené technicky, ne jen UI.
- Ztráta šifrovacího klíče znamená ztrátu schopnosti číst šifrovaná data.
- Únik šifrovacího klíče znamená riziko odhalení citlivých polí.

## 17. Doporučený MVP backlog

### Fáze 1: Technický základ

- založení Nette projektu,
- lokální Docker prostředí,
- databázové migrace,
- registrace,
- login,
- reset hesla,
- role user/admin.

### Fáze 2: Uživatelská nastavení

- pevná měsíční částka,
- vlastní účty,
- šifrování citlivých polí,
- normalizace českých čísel účtů.

### Fáze 3: Import

- upload CSV,
- detekce známých formátů,
- ruční mapování sloupců,
- preview,
- deduplikace,
- smazání CSV po importu.

### Fáze 4: Transakce a klasifikace

- výpis transakcí,
- označení mzdy,
- označení výjimky,
- detekce vlastních převodů,
- další příchozí transakce a jejich vliv na volný spend.

### Fáze 5: Pravidelné platby

- návrh pravidelných plateb z historie,
- potvrzení,
- odmítnutí,
- editace.

### Fáze 6: Dashboard

- poslední výplata,
- průměrný spend od výplaty,
- dovolený průměrný spend,
- predikce konce cyklu,
- ruční úprava očekávaného data další výplaty.

### Fáze 7: Admin

- seznam uživatelů,
- technický detail uživatele,
- reset hesla,
- mazání uživatele včetně všech dat.

## 18. Otevřené technické otázky

Před vývojem je ještě vhodné rozhodnout:

1. Má být přihlašovací jméno samostatné, nebo použijeme e-mail jako login?
2. Má mít registrace potvrzení e-mailem?
3. Jaké přesné CSV exporty z Monety a mBank použijeme jako první vzorky?
4. Má být Bootstrap 5 přijatelný pro UI, nebo chceš vlastní střídmější vzhled?
5. Bude mazání uživatele dostupné i samotnému uživateli, nebo jen adminovi?
6. Má se šifrovat i název pravidelné platby, který si uživatel ručně zadá?
7. Jak často chceš zálohovat databázi při lokálním vývoji, když nechceš automatické zálohy na hostingu?

## 19. Závěrečné doporučení

Pro první verzi doporučuji stavět jednoduchou server-rendered PHP aplikaci v Nette s MySQL/MariaDB. Tento návrh dobře odpovídá Endora Fun, umožní lokální vývoj a testování, nevyžaduje složitý provoz a zároveň ponechává dost prostoru pro pozdější rozšíření.

Nejdůležitější technická rozhodnutí pro MVP:

- použít e-mail jako login,
- CSV po importu mazat,
- citlivá textová a bankovní pole šifrovat,
- částky a data ponechat čitelné kvůli výpočtům,
- adminovi nezpřístupnit finanční data,
- dashboard počítat při načtení,
- import řešit přes mapování sloupců,
- produkčně cílit na PHP/MySQL hosting Endora Fun.

