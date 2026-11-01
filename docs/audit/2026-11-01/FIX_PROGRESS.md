# Аудиттен кейінгі түзетулер

2026-11-01: **3/13 мәселе түзетілді**. Түзетулер жеке commit ретінде сақталады. Deployment орындалған жоқ. Бастапқы [аудит есебі](/E:/CursorMathbot/docs/audit/2026-11-01/REPORT.md) тексерілген revision туралы тарихи жазба болып қалады.

Жұмыс тәртібі: әр Axx түзетуінің коды, regression tests, тексеру журналдары және осы файлдағы күйі жеке commit-ке біріктіріледі; тексеруден кейін `origin` remote-ына push жасалады.

| ID | Басымдық | Мәселе | Күйі |
| --- | --- | --- | --- |
| A01 | P1 | Questions жүктеу қатесі квиз мазмұнын ауыстырады | Түзетілді, тексерілді |
| A02 | P2 | Version conflict кейін ескі форма сақталады | Түзетілді, тексерілді |
| A03 | P2 | Тарихи суреттерді purge жояды | Түзетілді, тексерілді |
| A04 | P2 | Сабақ құруда nested connection/pool timeout | Келесі |
| A05 | P2 | Co-op жауап кілті ерте ашылады | Ашық |
| A06 | P2 | Student options шешім metadata-сын ашады | Ашық |
| A07 | P2 | SPA навигациясы соңғы trial draft өзгерісін жоғалтады | Ашық |
| A08 | P2 | Constant algebra/numeric жауаптары теңестірілмейді | Ашық |
| A09 | P2 | Қатар user creation UNIQUE қатесіне түседі | Ашық |
| A10 | P2 | Guest PIN lookup/join шектелмеген | Ашық |
| A11 | P2 | Metrics raw path кілттері шексіз өседі | Ашық |
| A12 | P2 | Frontend dependency security gate өтпейді | Ашық |
| A13 | P3 | Rollback text_scale қалпына келтірмейді | Ашық |

## A01

[EditQuizPage](/E:/CursorMathbot/web/app/quizzes/[id]/edit/page.tsx:65) енді quiz metadata және questions тізімі екеуі де сәтті келгенде ғана редакторды ашады. Questions API қатесі, жоқ payload немесе массив емес payload қатені көрсетеді; сақтау әрекеті қолжетімсіз. «Қайта жүктеу» екі сұрауды да қайталап, толық сұрақтар келгенше loading күйін сақтайды. Сәтті жүктелген бос `[]` тізімі жарамды квиз ретінде ашылады.

[Регрессия тесттері](/E:/CursorMathbot/web/app/quizzes/[id]/edit/__tests__/page.test.tsx:68) бес сценарийді қамтиды: API failure, null payload, malformed payload, retry кезінде күту және барлық сұрақты бірге сақтау, жарамды бос квиз. Түзетуден бұрын бастапқы үш regression сценарийі құлады; түзетуден кейін барлық нысаналы тексеріс өтті.

- Quiz edit, QuizEditor және quiz create: **3 suite, 16 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A01/tests.log).
- TypeScript `tsc --noEmit`: **exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A01/typecheck.log).
- Frontend ESLint, zero warnings: **exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A01/lint.log).

Браузер E2E және жаңа production build бұл қадамда орындалған жоқ. Backend source өзгертілген жоқ. `repros/audit_edit.tsx` бастапқы ақаудың бар екенін assert ететін тарихи репродукция; A01 түзетілген соң оның AUDIT тексерісінің құлауы күтіледі. Ағымдағы дұрыс мінез-құлық source ішіндегі regression tests арқылы тексеріледі.

## A02

[Bank editor](/E:/CursorMathbot/web/app/admin/bank/page.tsx:326) conflict жауабынан алынған version token-ін ескі формаға көшірмейді. Пайдаланушының мәтіні формада қалады, ал Save және тікелей form submit бұғатталады. Duplicate confirmation арқылы сақтау conflict-ке түссе, modal жабылады және дәл сол қорғаныс іске қосылады.

[Conflict хабарламасы](/E:/CursorMathbot/web/app/admin/bank/_components/BankTaskForm.tsx:77) жаңа нұсқаны жүктеу сақталмаған өзгерістерді алмастыратынын түсіндіреді. «Жаңа нұсқаны жүктеу» task detail-ды [cache қолданбай](/E:/CursorMathbot/web/lib/api/admin-bank.ts:238) алады; мәтін, жауап, опциялар, metadata және version бірге жаңарғаннан кейін ғана Save қолжетімді болады. Жүктеу қатесі, жоқ task, қате task ID, version-ның болмауы немесе trash күйі блокты алмайды. Қалыпты network save қатесін бұрынғы version token-мен қайта орындауға болады.

Async save/reload жауаптары форманың ашылған сессиясымен байланыстырылды: пайдаланушы форманы жапса немесе басқа task ашса, бұрынғы кешіккен жауап ағымдағы форманы алмастырмайды.

[UI regression tests](/E:/CursorMathbot/web/app/admin/bank/__tests__/page.test.tsx) 11 сценарийді, [API freshness test](/E:/CursorMathbot/web/lib/__tests__/admin-bank-api.test.ts) қатар жасалған екі detail сұрауының жаңа version/content қайтаратынын тексереді. Негізгі regression тесті түзетуден бұрын ескі формаға жаңа token көшірілгенін көрсетіп құлады.

- Bank editor/API және admin composition/actions/API client: **5 suite, 55 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A02/tests.log).
- TypeScript `tsc --noEmit`: **exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A02/typecheck.log).
- Frontend ESLint, zero warnings: **exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A02/lint.log).

Backend source, browser E2E және deployment бұл қадамда өзгертілген/орындалған жоқ. `repros/audit_bank.tsx` бастапқы ақауды сипаттайтын тарихи репродукция болып қалады; ол қазіргі source үшін сәтті regression test ретінде пайдаланылмайды.

## A03

[Automatic cleanup](/E:/CursorMathbot/bot/repositories/bank/crud.py:594) пен [manual permanent delete](/E:/CursorMathbot/bot/routes/admin/bank.py:798) енді bank task жойылғанда оның суретін өшірмейді. Тапсырма жолдары мен тиісті DB cleanup бұрынғыдай орындалады; committed media тарихи және ортақ сілтемелер үшін сақталады. Нұсқа қақтығысы кезінде DB-ге бекітілмеген жаңа upload-ты жою бұрынғыдай жұмыс істейді.

Бұл қадамда жалпы asset reference registry немесе garbage collector қосылған жоқ. Қауіпсіз сақтау саясаты барлық committed bank image-ке қолданылады, сондықтан сілтемесіз қалған суреттер де сақталады. Оларды бос орын үшін жою live tasks, task versions, solo/co-op results және quiz snapshots сілтемелерін ескеретін бөлек GC арқылы орындалуы тиіс. Осы талап [file deletion helper](/E:/CursorMathbot/bot/utils/file_storage.py:177) құжаттамасына енгізілді. Бұрын өшіп кеткен суреттер бұл өзгеріспен қалпына келмейді.

[18 regression test](/E:/CursorMathbot/bot/tests/test_bank_image_retention.py) екі жою жолын local filesystem және in-memory S3 арқылы тексереді. Solo/co-op сақталған нәтижесі, frozen quiz snapshot және басқа bank task-тің ескі нұсқасы filename-ға сілтегенде, бастапқы task жойылса да `/api/images/{filename}` бұрынғы байттарды қайтарады. Жақында trash-ке түскен task пен оның суреті retention мерзімі бітпей сақталады; cleanup қайта шақырылғанда дұрыс count қайтарылады. Негізгі regression түзетуден бұрын saved result қалғанымен image endpoint `404` қайтарғанын көрсетті.

- Image retention/update, admin deletion/version/audit/roles, hosted contracts, trial және quiz review: **110 backend test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A03/tests.log).
- Өзгертілген Python файлдарына CI flake8 `E9,F63,F7,F82`: **0 қате, exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A03/lint.log).

Тексеру уақытша SQLite DB және S3 эмуляциясымен орындалды; нақты PostgreSQL/S3 немесе deployment бұл қадамда іске қосылған жоқ. `repros/domain.py` ішіндегі `cleanup_image_history` бастапқы ақауды assert етеді; түзетуден кейін бұл тарихи репродукцияның сол assert-і құлауы күтіледі.
