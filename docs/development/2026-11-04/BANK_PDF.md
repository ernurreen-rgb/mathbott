# Банктен PDF жинағын дайындау

2026-11-04. Пайдаланушы сұрауы: банктен, мысалы, 20 есеп таңдап,
оқушыларға жіберетін **бір PDF файлын бірден жүктеу**.

## Қолдану

1. Әкімші панелінде **Тапсырмалар банкі → Белсенді** бөліміне кіріңіз.
2. Есептердің жанындағы checkbox-тарды белгілеңіз немесе **Осы беттегі есептерді
   таңдау** батырмасын басыңыз. Таңдау бет/сүзгі ауысқанда сақталады.
3. **PDF дайындау** ашып, жинақ атауын жазыңыз. Жоғары/төмен батырмаларымен
   есептердің ретін өзгертіп, керек емесін алып тастауға болады.
4. **PDF жүктеу** таңдаулы есептерді нөмірленген A4 беттеріне жинап, бір `.pdf`
   файлын жүктейді. Print dialog немесе сыртқы конвертер қажет емес.

PDF-ке есеп мәтіні, формула, сурет және answer mode-қа сәйкес жауап нұсқалары
кіреді. Дұрыс жауап, accepted answers, шешім суреті және банк metadata-сы кірмейді.
`input`, `mcq`/`mcq6`, `select`, `tf` түрлері қолдау табады. Бет нөмірлері бар.
Пайдаланушының соңғы түзетуі бойынша аты-жөні/сыныбы/күні жолы алынды; бірінші
беттің бренд жазуы және әр беттің footer-і **«Ернұр ағайдан есептер»**.

## Кейін банк интерфейсін ауыстыру

Экспорт логикасы bank page-ден бөлек:

- `web/lib/bank-worksheet.ts`: student-facing whitelist model, шек және уақытша
  `WORKSHEET_BRAND` жазуы.
- `web/lib/use-bank-worksheet-selection.ts`: аккаунтқа тиесілі, duplicate-free
  ordered selection. Account ауысқаннан қалған callback жаңа таңдауды өзгертпейді.
- `web/components/admin/BankWorksheetDocument.tsx`: paper content renderer.
- `web/lib/export-bank-worksheet.ts`: document snapshot, pagination және PDF download.
- `web/components/admin/BankWorksheetDialog.tsx`: қазіргі bank UI-дің adapter-і.

Future UI сол student model / document renderer / exporter-ді қайта пайдалана
алады. Backend PDF service немесе database migration қосылған жоқ.

## Деректердің тұтастығы және render

Export алдында әр ID қазіргі admin API-ден қайта оқылады; реттілігі сақталады.
Бір есеп қолжетімсіз, себетте немесе суреті жүктелмесе, partial файл жасалмайды.
Dialog таңдалған есептерді сақтап, қатені көрсетеді; retry жаңа render жасайды.
Account ауысқанда/терезе жабылғанда генерация тоқтатылады. Шегі — 100 есеп;
лимиттен асатын page selection жартылай қолданылмайды.

MathLive static elements viewport-тан тыс lazy render жасамайтындықтан,
формулалар explicit render арқылы дайындалып, shadow content жеке static copy-ға
көшіріледі. CSS/fonts жүктеліп, decoded same-origin images data URI ретінде
бекітіледі. React DOM өзгертілмейді; уақытша copy операция соңында алынады.

`html-to-image@1.11.13` + `pdf-lib@1.17.1` тек export кезінде динамикалық
жүктеледі. Сыртқы PDF сервисіне есеп жіберілмейді. Paper content шамамен 300 dpi
растр ретінде PDF-ке салынады: appearance/formula/font сақталады, мәтін selectable
vector text емес. Қалыпты есеп бір бетте қалады; ұзын есеп logical blocks және
ақ жолдар бойынша бөлінеді. Шектен тыс үлкен бір block анық қатемен тоқтайды.

## Тексеру

Мына acceptance checks қосылды:

- Unit: answer keys-ті nested option/subquestion-нан алып тастау; deleted task-ті
  қабылдамау; filename; ordered page selection; account isolation және limit.
- Browser: екі беттен 20 есеп таңдау, ретін өзгерту, бір нақты PDF download;
  A4 өлшемі/title/author/page image count тексеріледі. Static snapshot-та кемінде
  20 rendered formula және embedded image бар, answer key/аты-жөні жолы жоқ.
- Browser negative path: fresh task GET және image transport failure partial
  download жасамайды; selection сақталып, retry сәтті өтеді.
- Fixture суреттері уақытша DB directory ішінде сақталады.

Алғашқы толық жергілікті suite: **20/20 E2E**, **63 Jest suite / 392 test**,
**6 dependency integration test**, TypeScript, zero-warning ESLint және production
`npm audit --omit=dev --audit-level=low` — **0 vulnerabilities**. Соңғы branding
өзгерісіне арналған **4/4 PDF scenario** да қайта өтті. PDF беттері Poppler арқылы
PNG-ге render жасалып, формулалар, қазақша glyph-тер, сурет және page breaks
визуалды тексерілді. QA файлдары `tmp/pdfs/`, `output/pdf/` және
`web/output/playwright/` ішінде, Git-ке қосылмайды.

Нақты Google OAuth бұл fixture-те орындалмайды: стандарт encrypted NextAuth
test JWT + production auth/CSRF settings қолданылады. Production data-ға тест
жазбалары қосылмайды.

## CI және production release

`375cb3c` revision-ының [CI run-ы](https://github.com/ernurreen-rgb/mathbott/actions/runs/41709401297)
**success**: барлық 6 job, соның ішінде **20/20 browser E2E** өтті.
[CI evidence](evidence/bank-pdf-ci.json), [local PDF evidence](evidence/bank-pdf-local.json).
[Docker run](https://github.com/ernurreen-rgb/mathbott/actions/runs/41709401372)
да **success**: екі image build/scan gate-і және Docker Hub push өтті.

Web production build негізгі доменге жіберілместен бұрын бөлек deployment ретінде
дайындалды. Health/Auth providers/admin bank page/static assets тексерілді;
anonymous bank API 401 қайтарды. Содан кейін `qazmath.vercel.app` alias-і жаңа
`dpl_HLh9Gez6UHvVPeLpPqdynFWtNXag` deployment-ке ауыстырылды, сол checks негізгі
доменде де өтті. Құрал: [Тапсырмалар банкі](https://qazmath.vercel.app/admin/bank).

Release source: `375cb3cfe0c817e2b0afb2c1cd495247e9d0f0ab`, Node 24.x. Осы
rollout тек web-ті жариялады; backend deployment немесе schema migration
орындалған жоқ. Нақты production-да authenticated admin PDF flow автоматты түрде
орындалмады; оның толық flow-ы оқшауланған production-build E2E ішінде тексерілді.
[Sanitized production evidence](evidence/bank-pdf-production.json).

Rollback қажет болса, linked `web/` project-тен:

```sh
vercel promote dpl_GTXSkjL6tUhfrXABwQxXUWazsqLq --yes
```

Алдыңғы deployment тек web кодына қатысты; DB rollback қажет емес. Release
main-де бұрыннан бар `10b40c5` (bank picker row click) және `47604f9` (choice
answer-count hint removal) өзгерістерін де сақтайды. Олар осы толық CI-де бірге
тексерілді; банктің жалпы интерфейсін қайта жасау бұл task-қа кірмейді.
