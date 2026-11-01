# Аудиттен кейінгі түзетулер

2026-11-01: **11/13 мәселе түзетілді**. Түзетулер жеке commit ретінде сақталады. Deployment орындалған жоқ. Бастапқы [аудит есебі](/E:/CursorMathbot/docs/audit/2026-11-01/REPORT.md) тексерілген revision туралы тарихи жазба болып қалады.

Жұмыс тәртібі: әр Axx түзетуінің коды, regression tests, тексеру журналдары және осы файлдағы күйі жеке commit-ке біріктіріледі; тексеруден кейін `origin` remote-ына push жасалады.

| ID | Басымдық | Мәселе | Күйі |
| --- | --- | --- | --- |
| A01 | P1 | Questions жүктеу қатесі квиз мазмұнын ауыстырады | Түзетілді, тексерілді |
| A02 | P2 | Version conflict кейін ескі форма сақталады | Түзетілді, тексерілді |
| A03 | P2 | Тарихи суреттерді purge жояды | Түзетілді, тексерілді |
| A04 | P2 | Сабақ құруда nested connection/pool timeout | Түзетілді, тексерілді |
| A05 | P2 | Co-op жауап кілті ерте ашылады | Түзетілді, тексерілді |
| A06 | P2 | Student options шешім metadata-сын ашады | Түзетілді, тексерілді |
| A07 | P2 | SPA навигациясы соңғы trial draft өзгерісін жоғалтады | Түзетілді, тексерілді |
| A08 | P2 | Constant algebra/numeric жауаптары теңестірілмейді | Түзетілді, тексерілді |
| A09 | P2 | Қатар user creation UNIQUE қатесіне түседі | Түзетілді, тексерілді |
| A10 | P2 | Guest PIN lookup/join шектелмеген | Түзетілді, тексерілді |
| A11 | P2 | Metrics raw path кілттері шексіз өседі | Түзетілді, тексерілді |
| A12 | P2 | Frontend dependency security gate өтпейді | Келесі |
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

## A04

[Сабақ құру](/E:/CursorMathbot/bot/repositories/curriculum_repository.py:155) енді `BaseRepository._write_transaction()` арқылы бір connection ішінде өтеді. Сабақ пен оның төрт mini-lesson-ы бірге commit болады; mini-lesson құру қатесі сабақ пен оған дейін енгізілген бөлімдерді де rollback жасайды. Ортақ private helper connection алмайды және өздігінен commit жасамайды.

[ensure_default_mini_lessons](/E:/CursorMathbot/bot/repositories/curriculum_repository.py:180) жеке шақырылғанда да сол helper-ді бір write transaction ішінде пайдаланады. Қатар жөндеу әрекеттері writer lock арқылы реттеледі; жетіспейтін бөлімдер толтырылады, бар бөлімдердің ID, атауы және sort order-і сақталады.

[Статистикадағы төрт task lookup](/E:/CursorMathbot/bot/repositories/statistics_repository.py:100) қосымша connection алмайды. [TaskRepository.get_task_by_id](/E:/CursorMathbot/bot/repositories/task_repository.py:124) енді optional `conn` қабылдайды; берілген connection-ды commit/close жасамай оқиды. Бұрынғы `get_task_by_id(id)` шақырулары connection lifecycle-ін бұрынғыдай өздері басқарады. Pool capacity және timeout баптаулары өзгертілген жоқ.

[12 regression test](/E:/CursorMathbot/bot/tests/test_repository_pool_transactions.py) pool capacity 1 және 2 үшін алты сценарийді тексереді: алты қатар сабақ құру; үшінші mini-lesson insert-індегі failure кезінде толық rollback; қатар repair кезінде бар мазмұнды сақтау; repair failure кезінде жартылай өзгеріс қалдырмау; екі қатар статистика сұрауының барлық task тізімдерін толтыруы; borrowed connection-ның ашық және commit жасалмаған күйін сақтау. Түзетуден бұрын lesson creation сценарийлері timeout-пен құлады, ал pool 2 кезіндегі insert failure commit болған толық емес сабақ қалдырды.

- Жаңа regression suite: **12 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A04/targeted-tests.log).
- Толық backend suite: **449 passed, 5 skipped**, 84,66 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A04/backend-tests.log). Өткізілген бес test нақты PostgreSQL instance талап етеді.
- Өзгертілген Python файлдарына CI flake8 `E9,F63,F7,F82`: **0 қате, exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A04/lint.log).

Тексеру уақытша SQLite DB-де және нақты `ConnectionPool` арқылы орындалды. Нақты PostgreSQL сервері мен deployment бұл қадамда іске қосылған жоқ. `repros/domain.py` ішіндегі `nested_pool` тарихи репродукция бастапқы қате мінез-құлықты күтеді; ағымдағы source үшін regression suite пайдаланылады.

## A05

[Co-op results endpoint](/E:/CursorMathbot/bot/routes/trial_tests_coop.py:332) membership тексерісінен кейін сұраушының DB-дегі `is_finished` күйін тексереді. Аяқтамаған қатысушыға `409` және «Нәтижелерді көру үшін алдымен тестті аяқтаңыз» хабары қайтады; response ішінде нәтижелер, snapshots немесе answer key жоқ. Session owner үшін де осы шарт қолданылады; session-ның `completed` flag-і сұраушының аяқтау шартын айналып өтпейді.

Аяқтаған қатысушы session әлі `active` болса да өзінің сақталған review-ын көре алады. Екі қатысушы аяқтағанда бұрынғыдай екі нәтиже қайтады. Қатыспаған user/admin үшін `403`, жоқ session үшін `404`, production identity жоқ/қате болса `401` сақталады. Тірі workspace және оқушылардың өзара answer sync әрекеті өзгертілген жоқ; осы endpoint-тегі толық review ғана аяқтаумен шектелді.

[12 жаңа regression test](/E:/CursorMathbot/bot/tests/test_trial_coop_results_access.py) нақты HTTP routes пен қолтаңбалы production identity middleware арқылы орындалады. Тексерістер owner/peer рөлдерін, бос submit арқылы алынған answer key-дің pending user-ге ашылмауын, аяқтағаннан кейін review ашылуын, cache `no-store` болуын, finished user-дің ұпайын қайта жаза алмауын, outsider/admin шектеуін, email spoofing және invalid signatures-ті қамтиды. Негізгі екі regression түзетуден бұрын pending owner/peer үшін endpoint `200` қайтарғанын көрсетті.

- Жаңа regression suite: **12 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A05/targeted-tests.log).
- Co-op access, trial routes, review regressions, proxy, draft және middleware: **88 test өтті**, 19,03 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A05/tests.log).
- Өзгертілген Python файлдарына CI flake8 `E9,F63,F7,F82`: **0 қате, exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A05/lint.log).

Тексеру уақытша SQLite DB-де орындалды; нақты PostgreSQL, browser OAuth/E2E және deployment бұл қадамда іске қосылған жоқ. `repros/domain.py` ішіндегі `coop_answer_key` бастапқы ақауды күтетін тарихи репродукция; ағымдағы source үшін жаңа regression suite пайдаланылады.

## A06

[public_options](/E:/CursorMathbot/bot/utils/public_payload.py:34) оқушыға жіберілетін choice dict-терін string `label` және `text` өрістерімен қайта құрады. `correct`, `is_correct`, `answer`, `accepted_answers`, `solution`, белгісіз grading/teacher metadata және display өрісінің орнына берілген nested object сыртқа шықпайды. Сүзгі [lesson](/E:/CursorMathbot/bot/routes/modules.py:284), [trial details](/E:/CursorMathbot/bot/routes/trial_tests.py:154) және [legacy task](/E:/CursorMathbot/bot/routes/tasks.py:27) responses үшін қолданылады. LaTeX мәтіні, жауап нұсқаларының реті мен label-дері сақталады.

Сәйкестендіру subquestion-дары display мәтінін ғана шығарады; legacy composite сұрақтағы `choices` мәтіні де сақталады. Белгісіз қосымша өрістер сүзгіден өтпейді. Бұрынғы legacy choices contract-ін тексеретін test өзгертілген жоқ: алғашқы толық тексерісте анықталған choice мәтінінің жоғалуын сүзгіні толықтыру арқылы түзеттік. Legacy recursive solution filter `is_correct` өрісін де алып тастайды.

[Жаңа snapshot](/E:/CursorMathbot/bot/utils/public_payload.py:96) creation және ескі snapshot-тарды [оқу кезіндегі сүзу](/E:/CursorMathbot/bot/utils/public_payload.py:80) бір display schema-ны пайдаланады. Solo/co-op history GET және бұрынғы `attempt_id` бойынша submit retry response-тары да тазаланады. Бұл read-time сүзгі score, `correct_answer`, `correct_count` немесе DB-дегі тарихи жазбаларды өзгертпейді. Admin GET пен бастапқы bank options/subquestions metadata-сы сақталады; grading толық авторлық деректермен орындалады. DB backfill/migration қажет емес.

[27 жаңа regression test](/E:/CursorMathbot/bot/tests/test_public_task_payloads.py) төрт/алты нұсқалы MCQ мен сәйкестендіруді, signed student және anonymous lesson reads-ті, admin metadata сақталуын, legacy endpoint-ті, grading мен жаңа/ескі review snapshot-тарын, submit retry-ді, дұрыс жауаптар санының сақталуын және malformed display payload-тарды қамтиды. Алғашқы тоғыз HTTP regression түзетуден бұрын lesson/trial endpoint-терінен артық metadata ашылғанын растады.

- Жаңа regression және бұрынғы trial routes: **46 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A06/targeted-tests.log).
- Толық backend suite: **488 passed, 5 skipped**, 93,92 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A06/backend-tests.log). Өткізілген бес test нақты PostgreSQL instance талап етеді.
- Өзгертілген Python файлдарына CI flake8 `E9,F63,F7,F82`: **0 қате, exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A06/lint.log).

Тексеру уақытша SQLite DB және production identity middleware арқылы орындалды; нақты PostgreSQL/browser E2E/deployment бұл қадамда іске қосылған жоқ. `repros/security.py` ішіндегі options leak assertion-ы бастапқы ақауды күтеді; ағымдағы source үшін жаңа regression suite пайдаланылады.

## A07

[Ортақ flushDraft](/E:/CursorMathbot/web/app/trial-test/[id]/page.tsx:188) browser `pagehide` және SPA cleanup үшін қолданылады. Cleanup соңғы жауаптар мен ағымдағы task index snapshot-ын `keepalive` сұрауымен writable draft key өшірілмей тұрып жібереді. 800 ms debounce аяқталмай navigation жасалса да соңғы өзгеріс жіберіледі. Ағымдағы in-flight normal save қажет болса тоқтатылып, соңғы snapshot keepalive арқылы жіберіледі; бір pending keepalive pagehide/unmount кезінде екі рет қайталанбайды.

Snapshot email-і ағымдағы `useSession` identity-мен салыстырылады: identity ауысуы не sign-out render-і кезінде ескі аккаунттың жауабы жіберілмейді. Request marker және load generation кешіккен acknowledgement-тің жаңа тесттің save күйін өзгертуіне жол бермейді. Ескі submit жауабы жаңа тестке өткеннен кейін redirect/error немесе draft permission қалпына келтіру әрекетін орындамайды.

Draft load аяқталмай бос дерек жіберілмейді; өзгермеген/сақталған draft қайталанбайды. Submit сәтті расталғаннан кейін cleanup draft-ты қайта құрмайды. Submit қатесі болып, сақталған attempt табылмаса, ағымдағы жауаптар cleanup кезінде сақтауға жіберіледі. Backend API мен schema өзгертілген жоқ.

[14 жаңа regression case](/E:/CursorMathbot/web/app/trial-test/[id]/__tests__/page.test.tsx:227) SPA unmount/debounce, task index, normal save-ті keepalive-қа ауыстыру, pending keepalive deduplication, өзгертілген мәнді қайта бұрынғысына қайтару, test/account/sign-out ауысуы, кешіккен acknowledgement/submit, confirmed success және failed submit cleanup, Strict Mode hydration сценарийлерін қамтиды. Осы файлда бұрынғы он тестпен бірге 24 test бар. Негізгі regression түзетуден бұрын debounce ішіндегі unmount ешбір draft сұрауын жібермегенін көрсетті.

- Толық frontend Jest: **60 suite, 368 test өтті**, 22,881 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A07/frontend-tests.log).
- TypeScript `tsc --noEmit`: **exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A07/typecheck.log).
- Frontend ESLint, zero warnings: **exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A07/lint.log).

Тексеру React/Jest ішінде mock network арқылы орындалды; нақты browser page-close/network E2E немесе deployment бұл қадамда іске қосылған жоқ. Flush бұрынғыдай best-effort keepalive сұрауын қолданады; offline backup қосылған жоқ. `repros/audit_trial.tsx` бастапқы ақауды күтетін тарихи репродукция, ағымдағы source үшін regression tests пайдаланылады.

## A08

[canonicalize_algebraic_expression](/E:/CursorMathbot/bot/utils/math_algebra.py:427) normalize нәтижесі тұрақты рационал сан болса, numeric parser пайдаланатын `n` немесе `n/d` форматын қайтарады. Мысалы, `x-x` → `0`, `x-x+1` → `1`, `(x-x+1)/2` → `1/2`. Нөл `is not None` арқылы ажыратылады, сондықтан false-like мән ретінде түсіп қалмайды. Айнымалысы қалған өрнектердің algebra canonical форматы бұрынғыдай сақталады.

Есептеу `Fraction` арқылы дәл орындалады; float/approximate comparison қосылған жоқ. Parser grammar, expression/AST/number/power шектері және division-by-zero/unsupported-expression тексерістері өзгертілмеді. Бұрынғы рационал ықшамдау ережелері қолданылады. Жаңа біріздендіру input answer, accepted aliases, written MCQ және matching slot салыстыруларына ортақ нормализация арқылы тарайды.

[44 жаңа regression case](/E:/CursorMathbot/bot/tests/test_constant_answer_equivalence.py) equivalent жауаптарды екі бағытта, оң/теріс бөлшектерді, дәл decimal precision-ды, root және көп айнымалы cancellation-ды тексереді. Бөлек сандық мән, айнымалысы қалған өрнек, division-by-zero, unsupported/oversized expression қабылданбайтыны қамтылған. Written choice labels пен matching slot реті сақталады. Module task check, solo submit, co-op finish, quiz answer және admin preview үшін он HTTP сценарий бар. Бастапқы он equivalent-case түзетуден бұрын false-negative қайтарды.

Answer bank мазмұны, snapshot-тағы бастапқы correct answer және бұрын сақталған ұпайлар қайта жазылмайды; жаңа тексерістер жаңартылған салыстыруды қолданады. Schema/migration өзгерісі жоқ.

- Жаңа regression және бұрынғы utility suite: **101 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A08/targeted-tests.log).
- Толық backend suite: **532 passed, 5 skipped**, 98,16 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A08/backend-tests.log). Өткізілген бес test нақты PostgreSQL instance талап етеді.
- Өзгертілген Python файлдарына CI flake8 `E9,F63,F7,F82`: **0 қате, exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A08/lint.log).

Тексеру уақытша SQLite DB-де орындалды; нақты PostgreSQL/browser E2E/deployment бұл қадамда іске қосылған жоқ. `repros/runtime.py` constant-equivalence тексерісі бастапқы ақауды күтеді; ағымдағы source үшін жаңа regression suite пайдаланылады.

## A09

[create_user_by_email](/E:/CursorMathbot/bot/repositories/user_repository.py:73) енді owned write transaction ішінде орындалады. SQLite writer reservation және PostgreSQL adapter advisory lock қолданбаның қатар creation әрекеттерін реттейді. INSERT `ON CONFLICT(email) DO NOTHING` қолданады; бұрыннан бар email табылса, сол user-дің жолы қайта оқылады. Profile, role, progress, primary ID және бұрынғы telegram ID қайта жазылмайды. Admin bootstrap matching new email үшін ғана орындалады; existing user-ді get-or-create арқылы promotion/demotion жасау енгізілген жоқ.

Жаңа [synthetic telegram ID](/E:/CursorMathbot/bot/repositories/user_repository.py:24) бұрынғы negative 32-bit namespace ішінде random түрде бөлінеді және нөл болмайды. Unique ID басқа user-ге тиесілі болса, email бойынша дұрыс user пайда болғаны тексеріліп, кейін жаңа ID бес ретке дейін сыналады. Қақтығысқан басқа user ешқашан қайтарылмайды. Synthetic ID қақтығысы табылмаса, integrity error қайта көтеріледі. Retry аяқталса, transaction rollback жасалып, connection босатылады; schema немесе existing ID migration жоқ.

[36 жаңа regression case](/E:/CursorMathbot/bot/tests/test_user_creation_concurrency.py) pool-сыз және capacity 1/2 нұсқаларында қатар repository/production-signed HTTP сұрауларын тексереді. Бір email-ге 16 сұрау бір user-ді қайтарады; 16 бөлек email жеке user болып қалады. ID collisions, бес retry шегі, unrelated constraint failure, connection reuse, existing positive telegram ID/profile/role сақтау және new admin bootstrap қамтылған. HTTP сұраулары proxy-дегі replay қорғанысын шынайы модельдеу үшін әрқайсысына бөлек UUID nonce қолданады.

Бастапқы regression pool-сыз және pool 2 жағдайында `UNIQUE constraint failed: users.email` қатесін көрсетті; pool 1 сұрауларды connection арқылы кезекке қойғандықтан бастапқыда да өтетін.

- Жаңа regression suite: **36 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A09/targeted-tests.log).
- Толық backend suite: **568 passed, 5 skipped**, 99,78 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A09/backend-tests.log). Өткізілген бес test нақты PostgreSQL instance талап етеді.
- Өзгертілген Python файлдарына CI flake8 `E9,F63,F7,F82`: **0 қате, exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A09/lint.log).

Тексеру уақытша SQLite DB-де орындалды; нақты PostgreSQL/browser OAuth/E2E/deployment бұл қадамда іске қосылған жоқ. `repros/domain.py` ішіндегі `concurrent_user_creation` бастапқы race-ті күтетін тарихи репродукция; ағымдағы source үшін жаңа regression suite пайдаланылады.

## A10

[DB-backed quota](/E:/CursorMathbot/bot/repositories/quiz_entry_limits.py) бір network key үшін бір row сақтайды және барлық API worker/instance үшін ортақ. Әр aligned 60-second window ішінде default шектер:

| Backend setting | Default | Не есептеледі |
| --- | --- | --- |
| QUIZ_ENTRY_REQUESTS_PER_MINUTE | 1200 | PIN lookup және join сұраулары бірге |
| QUIZ_ENTRY_DISTINCT_PINS_PER_MINUTE | 30 | Сол желі тексерген бөлек PIN-дер, жоқ PIN-дер де |
| QUIZ_ENTRY_NEW_PARTICIPANTS_PER_MINUTE | 300 | Жаңа participant INSERT-тері; owned resume есептелмейді |
| QUIZ_MAX_PARTICIPANTS | 500 | Бір room-дағы participant саны, барлық желіге ортақ |

PIN сұрауының есебі lookup/join қатесі қайтарылғанға дейін жеке transaction-да commit болады; сондықтан 404/409 оны rollback жасамайды. Denial 429 және `Retry-After` қайтарады. PIN тізімі bounded, counter saturation тұтынуды азайтпайды; worker limit-і төмендегенде де жұмсалған counter кемімейді. Clock rollback window-ды қайта ашпайды. Row inactivity expiry — бір сағат; indexed opportunistic және maintenance cleanup қосылды. Бұл application admission budgets, provider/ingress traffic filtering орнатылған жоқ.

[join_session](/E:/CursorMathbot/bot/repositories/quiz_sessions.py) жаңа participant алдында server room cap пен new-slot quota-ны сол INSERT transaction ішінде тексереді. Қатар соңғы орынға таласқан сұраулар cap-тан асырмайды. Existing nickname token/account иелігі алдымен тексеріледі: room толса немесе new-slot quota бітсе де valid resume жұмыс істейді; nickname-ді білу жеткіліксіз. Client session settings server cap-ты көтермейді, бұрыннан бар over-capacity participant-тар жойылмайды.

[Web proxy](/E:/CursorMathbot/web/lib/quiz-entry-identity.ts) ingress-owned IP-ден HMAC network key жасайды; IPv4-mapped IPv6 бір IPv4 key-ге, басқа IPv6 /64 желіге нормализацияланады. Quota table raw IP сақтамайды. Vercel-де platform-owned `x-vercel-forwarded-for` пайдаланылады ([ресми header contract](https://vercel.com/docs/headers/request-headers)); self-hosting үшін `TRUSTED_CLIENT_IP_HEADER` тек ingress өзі overwrite жасайтын header-ге қойылады және Next.js-ке direct access жабылуы тиіс. Generic browser XFF default-та сенімді деп саналмайды.

Network claim MAC-і timestamp, nonce және request V2 signature-ге байланған; browser жіберген claim/MAC proxy-де алынып тасталады. Production entry valid proxy V2 provenance талап етеді, Google login guest үшін міндетті емес. Unsigned direct backend entry — 401; invalid/tampered MAC — 401. Encoded-slash catchall path backend-пен бірдей классификацияланады. Missing/invalid ingress identity және metadata-сы жоқ ескі signed V2 proxy бір shared, bounded fallback bucket қолданады; бұл rollout кезінде жұмыс істеуге мүмкіндік береді, бірақ network isolation төмендейді.

DB quota бөлігі мен migration-дарды қосымша агент орындады; бөлек security review encoded-slash классификациясын тексерді. Root review counter limit төмендегендегі saturation regression-ын қосты. Соңғы **42 жаңа backend case** quota persistence/restart, bad probes, NAT fairness, concurrent cap, owned resume, signatures, fallback және cleanup-ты қамтиды; **19 жаңа frontend case** IP normalization, header provenance, MAC binding және encoded-slash path-ты қамтиды. 200 student бір желіден бір PIN-ге 400 lookup/join request жасап сәтті қосылатыны нақты HTTP fixture-мен тексерілді; бұл production load-capacity кепілдігі емес.

- Толық backend suite: **610 passed, 5 skipped**, 121,91 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A10/backend-tests.log).
- Толық frontend Jest: **61 suite, 387 test өтті**, 45,695 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A10/frontend-tests.log).
- Нысаналы frontend proxy/identity: **40 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A10/targeted-frontend.log).
- Production build: **exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A10/build.log).
- TypeScript және frontend ESLint: **exit 0** — [typecheck](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A10/typecheck.log), [lint](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A10/frontend-lint.log).
- CI backend flake8 `E9,F63,F7,F82`: **0 қате** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A10/backend-lint.log).

Алғашқы full backend run кезінде host ұзақ үзіліп, бір request қолтаңбасы 8 сағаттан кейін тексеріліп TTL қатесін қайтарды. TTL/auth шарттары әлсіретілген жоқ; сол үш параметрлік case бөлек қайта өтті, кейін full suite жоғарыдағы нәтижемен толық өтті.

**Deployment алдында schema migration қажет:** SQLite Alembic `0013_quiz_entry_limits`, PostgreSQL `0006_quiz_entry_limits.sql`. Hosted ортада `bot/` ішінен configured migration URL-мен `python scripts/migrate_to_neon.py --schema-only` орындау керек; кейін API, содан кейін web deploy жасалады. [Толық release нұсқаулығы](/E:/CursorMathbot/deploy/NEON_VERCEL.md). Production DB migration/deployment бұл қадамда орындалған жоқ. Нақты PostgreSQL integration-дің бес opt-in тесті өткізілді; browser OAuth/E2E іске қосылған жоқ.

## A11

[MetricsMiddleware](/E:/CursorMathbot/bot/middleware/metrics_middleware.py) енді routing аяқталғаннан кейін route template-ті оқиды: мысалы, нақты email орнына `GET /users/{email}` сақталады. Сәйкес маршрут табылмаған барлық URL `<unmatched>` тобына, стандартты емес HTTP method-тар `OTHER` тобына біріктіріледі. Raw path, query string және Host метрика кілті ретінде қолданылмайды. Matched 404/422 және handler exception үшін route template сақталады; exception қайта көтеріледі. Request cancellation метрика қатесімен алмастырылмайды және аяқталған сұрау ретінде есептелмейді.

[MetricsCollector](/E:/CursorMathbot/bot/utils/metrics.py) қосымша hard budgets қолданады: default бойынша endpoint counters үшін 512, error counters үшін 2048 кілт, әр input label үшін 256 таңба. Шектер overflow үшін ортақ `<other>` кілтін де қамтиды; ұзын label сақталмайды. Бұрын жиналған counter-лер өшірілмейді: шектен асқан жаңа белгілер біріктіріліп, сұраулар мен қателердің жиынтық саны сақталады. Label ring buffer-ге кірмей тұрып нормализацияланады. Events бұрынғыдай соңғы 10 000 сұраумен шектелген; rolling latency және 5xx error-rate есебі өзгерген жоқ. Metrics process-local болып қалады.

[15 жаңа regression case](/E:/CursorMathbot/bot/tests/test_metrics_cardinality.py) dynamic email/query privacy, жүздеген unknown path/method, matched 404/422/500, timing header, malformed Host, cancellation, 20 000 бөлек label/status кезіндегі hard caps пен totals, oversized label, reset және invalid budget-ті қамтиды. Негізгі route-template regression түзетуден бұрын email-дер жеке кілт ретінде сақталғанын көрсетіп құлады.

- Жаңа regression және бұрынғы metrics/middleware/ops suite: **41 test өтті** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A11/targeted-tests.log).
- Толық backend suite: **625 passed, 5 skipped**, 165,31 с — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A11/backend-tests.log). Өткізілген бес test нақты PostgreSQL instance талап етеді.
- Өзгертілген Python файлдарына CI flake8 `E9,F63,F7,F82`: **0 қате, exit 0** — [журнал](/E:/CursorMathbot/docs/audit/2026-11-01/fixes/A11/lint.log).

Schema/migration және frontend source өзгерісі жоқ. `repros/runtime.py` ішіндегі 20 000 unbounded key күтуі бастапқы ақауды сипаттайтын тарихи репродукция; ағымдағы source үшін жаңа regression suite пайдаланылады. Deployment бұл қадамда орындалған жоқ.
