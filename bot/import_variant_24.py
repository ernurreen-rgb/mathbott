import asyncio
import json
import sys
from pathlib import Path

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

from database import Database

def get_db_url():
    with open(bot_dir / '.env.prod.test', 'r') as f:
        for line in f:
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"Өрнекті ықшамдаңыз: \left(\frac{m^2 - 4m + 4}{m^2 + 4m + 4} : \frac{m-2}{m+2} + 1\right) \cdot \frac{m+2}{4m}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "0,5"},
            {"label": "D", "text": "m"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Рационал өрнектер", "Бөлшектерді ықшамдау"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"Тікбұрышты үшбұрышты бір катетінен айналдырғанда қандай фигура пайда болады?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "призма"},
            {"label": "B", "text": "цилиндр"},
            {"label": "C", "text": "қиық конус"},
            {"label": "D", "text": "конус"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Конус"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"f(x) = |x - 3|, g(x) = 3 функция графиктерімен шектелген фигура ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "8"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Функциялар", "Интеграл", "Фигура ауданы"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"ABCD тіктөртбұрышының қабырғалары AD = 40, AB = 60. Диагональдары O нүктесінде қиылысады. \left|\vec{AO} + \frac{1}{2}\vec{AD}\right| есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "50"},
            {"label": "B", "text": "30"},
            {"label": "C", "text": r"20\sqrt{13}"},
            {"label": "D", "text": "20"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Тіктөртбұрыш"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"y = 5^{\sin x \cdot \cos x + \operatorname{tg}x \cdot \operatorname{ctg}x} функциясының мәндер жиынын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"[1; \sqrt{5}]"},
            {"label": "B", "text": r"[\sqrt{5}; 5\sqrt{5}]"},
            {"label": "C", "text": r"[\sqrt{5}; 5]"},
            {"label": "D", "text": r"[5; 5\sqrt{5}]"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функциялар", "Мәндер жиыны"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\alpha = 0,6\text{ рад} бұрыштың градуспен алынған жуық мәнін есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"17^\circ"},
            {"label": "B", "text": r"25^\circ"},
            {"label": "C", "text": r"34^\circ"},
            {"label": "D", "text": r"40^\circ"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Бұрыш өлшемдері", "Радиан"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"36^x - 6^{x+1} > 6^x - 6 теңсіздікті шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(1; 6)"},
            {"label": "B", "text": r"(-\infty; 1) \cup (6; \infty)"},
            {"label": "C", "text": r"(-\infty; 0) \cup (1; \infty)"},
            {"label": "D", "text": "(0; 1)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер", "Теңсіздіктер"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"Есептеңіз: \sqrt{16 - 6\sqrt{7}} + \sqrt{11 + 4\sqrt{7}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{5}}{2}"},
            {"label": "B", "text": r"2\sqrt{5}"},
            {"label": "C", "text": "2,5"},
            {"label": "D", "text": "5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал сандар", "Түбірлерді ықшамдау"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"Табанының диаметрі 6-ға тең цилиндрдің осіне перпендикуляр қимасының ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "36"},
            {"label": "B", "text": r"36\pi"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": r"9\pi"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Қималар"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"EABCD дұрыс төртбұрышты пирамида берілген. \vec{AB} векторымен компланар емес векторды көрсетіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\vec{EB}"},
            {"label": "B", "text": r"\vec{ED}"},
            {"label": "C", "text": r"\vec{EA}"},
            {"label": "D", "text": r"\vec{DC}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Стереометрия", "Векторлар", "Компланар векторлар", "Пирамида"],
        "image_filename": "v24_q10_pyramid.png",
    },
    # 11
    {
        "slot_index": 11,
        "text": r"Есептеңіз: \int_0^{\frac{\pi}{2}} 2x \cos x\, dx",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\pi"},
            {"label": "B", "text": r"\pi - 2"},
            {"label": "C", "text": r"\pi + 2"},
            {"label": "D", "text": r"\pi + 1"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Интеграл", "Анықталған интеграл", "Бөліктеп интегралдау"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"Суретте берілген функцияға координаталар басы арқылы жүргізілген жанама теңдеуін жазыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "y = 8x"},
            {"label": "B", "text": "y = x + 8"},
            {"label": "C", "text": "y = x - 8"},
            {"label": "D", "text": "y = -8x"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Функциялар", "Туынды", "Жанама теңдеуі"],
        "image_filename": "v24_q12_graph.png",
    },
    # 13
    {
        "slot_index": 13,
        "text": r"Есептеңіз: 36^2 - 35^2 + 34^2 - 33^2 + 32^2 - 31^2 + \dots + 2^2 - 1",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "600"},
            {"label": "B", "text": "606"},
            {"label": "C", "text": "666"},
            {"label": "D", "text": "690"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Қысқаша көбейту формулалары", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"Қабырғасы 4 см ромбтың бір бұрышының тангенсінің мәні \sqrt{3}-ке тең. Ромбтың ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"16\sqrt{3}"},
            {"label": "B", "text": r"4\sqrt{3}"},
            {"label": "C", "text": r"8\sqrt{3}"},
            {"label": "D", "text": r"10\sqrt{3}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Ромб", "Ромб ауданы"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Өрнекті ықшамдаңыз: \frac{\sin x}{1 - \cos^2 \frac{x}{2}} \cdot \frac{\sin\frac{x}{4}\cdot\cos\frac{x}{4}}{\sin^2\frac{x}{4} - \cos^2\frac{x}{4}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": r"\operatorname{tg}\frac{x}{2}"},
            {"label": "C", "text": r"\operatorname{ctg}\frac{x}{2}"},
            {"label": "D", "text": "-1"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық формулалар", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"\lg x + \frac{1}{3}\lg x + \frac{1}{9}\lg x + \frac{1}{27}\lg x + \dots = 0{,}75 теңдеудің түбірінің квадратын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "10"},
            {"label": "D", "text": "100"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеулер", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Теңдеуді шешіңіз: \sin x = 2 - \sqrt{3}\cos x",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x = \frac{\pi}{3} + \pi n, n \in \mathbb{Z}"},
            {"label": "B", "text": r"x = \frac{\pi}{6} + \pi n, n \in \mathbb{Z}"},
            {"label": "C", "text": r"x = \frac{\pi}{3} + 2\pi n, n \in \mathbb{Z}"},
            {"label": "D", "text": r"x = \frac{\pi}{6} + 2\pi n, n \in \mathbb{Z}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер", "Қосымша бұрыш енгізу"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\vec{a}(9; 3; -12) векторын өзара компланар емес \vec{b}(2; -1; 4), \vec{c}(-1; 3; 0), \vec{d}(1; 2; -5) векторлары арқылы жіктеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\vec{a} = \vec{b} - 2\vec{c} - 6\vec{d}"},
            {"label": "B", "text": r"\vec{a} = 3\vec{b} + 2\vec{c} - \vec{d}"},
            {"label": "C", "text": r"\vec{a} = -3\vec{b} - 2\vec{c} + 3\vec{d}"},
            {"label": "D", "text": r"\vec{a} = 2\vec{b} - \vec{c} + 4\vec{d}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Векторлар", "Кеңістіктегі векторлар", "Векторды жіктеу"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"Шеңберге сырттай сызылған шаршының ауданы 16\text{ см}^2. Шеңберге іштей сызылған алтыбұрыштың периметрін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "15"},
            {"label": "D", "text": "10"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Дұрыс алтыбұрыш"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\begin{cases} x^2 + 8x + 7 < 0 \\ |x - 4| \ge 1 \end{cases} теңсіздіктер жүйесін қанағаттандыратын бүтін сандардың саны",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "7"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жүйесі", "Бүтін шешімдер"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"f(x) = \cos 2025x \cos 2024x + \sin 2025x \sin 2024x + 2\sin\frac{x}{4}\cos\frac{x}{4} функцияның периодын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\pi"},
            {"label": "B", "text": r"4\pi"},
            {"label": "C", "text": r"0{,}5\pi"},
            {"label": "D", "text": r"0{,}4\pi"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функциялар", "Функцияның периоды"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"Қиық конустың табан аудандары 1:16 қатынасындай. Жасаушысы 12 см және ол табанымен 60^\circ бұрыш жасайды. Қиық конустың бүйір бетінің ауданын табыңыз (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "520"},
            {"label": "B", "text": "480"},
            {"label": "C", "text": "360"},
            {"label": "D", "text": "240"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Қиық конус", "Бүйір бетінің ауданы"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"200-ден аспайтын 6-ға еселі сандардың қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3366"},
            {"label": "B", "text": "3636"},
            {"label": "C", "text": "3663"},
            {"label": "D", "text": "3666"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Арифметикалық прогрессия", "Бөлінгіштік"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\vec{a}(2; 3; -1), \vec{b}(4; 2; 1), \vec{c}(12; 5; 0) векторлары берілген. 2\vec{a} - \vec{b} және \vec{c} векторларының арасындағы бұрыштың косинусын есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{4}{13}"},
            {"label": "B", "text": r"\frac{4}{11}"},
            {"label": "C", "text": r"\frac{5}{12}"},
            {"label": "D", "text": r"\frac{7}{13}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Векторлар", "Скаляр көбейтінді", "Векторлар арасындағы бұрыш"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"y = \frac{2}{x} функциясын абсцисса осіне қатысты айналдырғанда пайда болған дененің x = 1 және x = 3 аралығындағы көлемін есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{7\pi}{3}"},
            {"label": "B", "text": r"\frac{4\pi}{3}"},
            {"label": "C", "text": r"\frac{5\pi}{3}"},
            {"label": "D", "text": r"\frac{8\pi}{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Интеграл", "Айналу денесінің көлемі", "Анықталған интеграл қолданылуы"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": r"Биіктігі 3,2 м, қалыңдығы 3 см 16 басқышы бар баспалдақ берілген. Суретте баспалдақ және оның үстінен қарағандағы дөңгелек тәрізді бейнесі берілген. Радиусы 1,2 м (\pi \approx 3{,}14)." + "\n\n" + r"Баспалдақтардың арақашықтығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,3 м"},
            {"label": "B", "text": "0,17 м"},
            {"label": "C", "text": "0,19 м"},
            {"label": "D", "text": "0,23 м"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Практикалық есептер", "Геометрия", "Кеңістіктік денелер"],
        "image_filename": "v24_q26_staircase.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": r"Биіктігі 3,2 м, қалыңдығы 3 см 16 басқышы бар баспалдақ берілген. Суретте баспалдақ және оның үстінен қарағандағы дөңгелек тәрізді бейнесі берілген. Радиусы 1,2 м (\pi \approx 3{,}14)." + "\n\n" + r"Бір баспалдақты құрайтын сектордың бұрышын радианмен есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\pi}{8}"},
            {"label": "B", "text": r"\frac{\pi}{16}"},
            {"label": "C", "text": r"\frac{\pi}{4}"},
            {"label": "D", "text": r"\frac{\pi}{12}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Тригонометрия", "Бұрыш өлшемдері", "Дөңгелек сектор"],
        "image_filename": "v24_q26_staircase.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": r"Биіктігі 3,2 м, қалыңдығы 3 см 16 басқышы бар баспалдақ берілген. Суретте баспалдақ және оның үстінен қарағандағы дөңгелек тәрізді бейнесі берілген. Радиусы 1,2 м (\pi \approx 3{,}14)." + "\n\n" + r"Бірінші баспалдақты 180^\circ-қа бұрғанда нешінші баспалдаққа сәйкес келетінін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "11"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Бұру", "Симметрия"],
        "image_filename": "v24_q26_staircase.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": r"Биіктігі 3,2 м, қалыңдығы 3 см 16 басқышы бар баспалдақ берілген. Суретте баспалдақ және оның үстінен қарағандағы дөңгелек тәрізді бейнесі берілген. Радиусы 1,2 м (\pi \approx 3{,}14)." + "\n\n" + r"Бір баспалдақтың бетінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"270\text{ см}^2"},
            {"label": "B", "text": r"0,27\text{ м}^2"},
            {"label": "C", "text": r"282{,}6\text{ см}^2"},
            {"label": "D", "text": r"0,2826\text{ м}^2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Планиметрия", "Сектор ауданы", "Дөңгелек"],
        "image_filename": "v24_q26_staircase.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": r"Биіктігі 3,2 м, қалыңдығы 3 см 16 басқышы бар баспалдақ берілген. Суретте баспалдақ және оның үстінен қарағандағы дөңгелек тәрізді бейнесі берілген. Радиусы 1,2 м (\pi \approx 3{,}14)." + "\n\n" + r"Бір баспалдаққа кеткен тақтайдың көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"0,08478\text{ м}^3"},
            {"label": "B", "text": r"8,478\text{ дм}^3"},
            {"label": "C", "text": r"847{,}8\text{ см}^3"},
            {"label": "D", "text": r"8478\text{ м}^3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Көлем", "Өлшем бірліктер"],
        "image_filename": "v24_q26_staircase.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"|x - 1|^{\lg^2 x - \lg x^2} = |x - 1|^3. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "200"},
            {"label": "C", "text": "100"},
            {"label": "D", "text": "0,1"},
        ],
        "subquestions": [
            {"text": "теңдеудің түбірлерінің көбейтіндісі", "correct": "B"},
            {"text": "теңдеудің ең кіші түбірі", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Логарифмдік теңдеулер", "Көрсеткіштік теңдеулер"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"Қабырғасының ұзындығы 4 см және оған іргелес бұрыштарының қосындысы 150^\circ болатын үшбұрыш берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"8\pi"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": r"4\pi"},
            {"label": "D", "text": "4"},
        ],
        "subquestions": [
            {"text": "үшбұрышқа сырттай сызылған шеңбер радиусы", "correct": "D"},
            {"text": "үшбұрышқа сырттай сызылған шеңбердің ұзындығы", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Синустар теоремасы", "Сырттай сызылған шеңбер"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"Геометриялық прогрессияның екінші және бірінші мүшелерінің айырмасы 18-ге тең, төртінші және үшінші мүшелерінің айырмасы 162-ге тең. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "12"},
        ],
        "subquestions": [
            {"text": "бірінші мүшесі", "correct": "C"},
            {"text": "еселігі", "correct": "B"},
        ],
        "answer": '["C", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Геометриялық прогрессия", "Прогрессия еселігі"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"\begin{cases} \sin x \sin y = -0{,}25 \\ \cos(x - y) + \cos(x + y) = -1{,}5 \end{cases}. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-0,5"},
            {"label": "D", "text": "0,25"},
        ],
        "subquestions": [
            {"text": r"\cos(x + y)", "correct": "C"},
            {"text": r"\cos(x - y)", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Тригонометрия", "Тригонометриялық теңдеулер жүйесі", "Тригонометриялық формулалар"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"y = x^2 + 2x функциясының [-2; 2] кесіндісіндегі ең үлкен және ең кіші мәнін табыңыз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "-2"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "8"},
        ],
        "subquestions": [
            {"text": "ең үлкен мәні", "correct": "D"},
            {"text": "ең кіші мәні", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функцияның ең үлкен және ең кіші мәндері", "Парабола"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Тақ функцияларды көрсетіңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"f(x) = \frac{\sin 2x}{\sin x}"},
            {"label": "B", "text": r"f(x) = x^2\operatorname{tg}x"},
            {"label": "C", "text": r"f(x) = \frac{\cos x}{x}"},
            {"label": "D", "text": r"f(x) = \operatorname{tg}x\operatorname{ctg}x + x"},
            {"label": "E", "text": r"f(x) = \operatorname{ctg}4x\sin 4x"},
            {"label": "F", "text": r"f(x) = \frac{\sin x}{x^2}"},
        ],
        "answer": '["B", "C", "F"]',
        "topics": ["ҰБТ есебі", "Функциялар", "Жұп және тақ функциялар", "Тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"Екі таңбалы санның цифрларының қосындысы 12-ге тең. Егер осы санға 36-ны қосса, онда алғашқы санның цифрлары алмасқан сан шығады. Алғашқы берілген санды және санның цифрларының көбейтіндісін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "75"},
            {"label": "B", "text": "93"},
            {"label": "C", "text": "48"},
            {"label": "D", "text": "57"},
            {"label": "E", "text": "27"},
            {"label": "F", "text": "32"},
        ],
        "answer": '["C", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Мәтінді есептер", "Сандар теориясы", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"Абсцисса осіне параллель болатын y = x^2 - 4x функциясының графигіне жүргізілген жанаманың теңдеуін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "y = -2"},
            {"label": "B", "text": "y = x - 4"},
            {"label": "C", "text": "y = -4x"},
            {"label": "D", "text": "y = -4x + 1"},
            {"label": "E", "text": "y = 2x - 4"},
            {"label": "F", "text": "y = -4"},
        ],
        "answer": "F",
        "topics": ["ҰБТ есебі", "Функциялар", "Туынды", "Жанама теңдеуі"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"\operatorname{tg}606^\circ ең кіші оң таңбалы аргументке келтіріңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{\sin 24^\circ}{\cos 24^\circ}"},
            {"label": "B", "text": r"\operatorname{ctg}24^\circ"},
            {"label": "C", "text": r"\frac{\cos 56^\circ}{\sin 56^\circ}"},
            {"label": "D", "text": r"\frac{\cos 24^\circ}{\sin 24^\circ}"},
            {"label": "E", "text": r"\frac{1}{\operatorname{tg}24^\circ}"},
            {"label": "F", "text": r"\operatorname{ctg}56^\circ"},
        ],
        "answer": '["B", "D", "E"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Келтіру формулалары", "Бұрыш өлшемдері"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Цилиндрдің осьтік қимасының диагоналі 16 см және ол жасаушысымен 30^\circ бұрыш жасайды. Цилиндрдің толық бетінің ауданы X\pi(1 + 2\sqrt{3})\text{ см}^2 болса, онда X - тің жай бөлгіш(тер)ін көрсетіңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "11"},
            {"label": "D", "text": "2"},
            {"label": "E", "text": "7"},
            {"label": "F", "text": "19"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Толық бетінің ауданы"],
        "image_filename": None,
    },
]

async def import_variant():
    db_url = get_db_url()
    if not db_url:
        print("DATABASE_URL not found!")
        return

    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    # Check folder 11
    folder = await db.trial_tests.get_trial_test_folders(include_empty=True)
    ubt_folder = next((f for f in folder if f['name'] == 'ҰБТ есептері'), None)
    if not ubt_folder:
        print("Creating folder ҰБТ есептері...", flush=True)
        ubt_folder = await db.trial_tests.create_trial_test_folder(name='ҰБТ есептері', sort_order=1)

    folder_id = ubt_folder['id']
    print(f"Target folder ID: {folder_id}", flush=True)

    test_title = "24-нұсқа: Баспалдақ"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 24-нұсқа математика тапсырмалары (Контекст: Баспалдақ)",
            sort_order=24,
            expected_tasks_count=40,
            category="ҰБТ есептері",
            folder_id=folder_id
        )
        test_id = test['id']
        filled_slots = set()
        print(f"Created test ID: {test_id} ({test_title})", flush=True)
    else:
        test_id = target_test['id']
        existing_tasks = await db.trial_tests.get_trial_test_tasks(test_id)
        filled_slots = {int(t['sort_order']) + 1 for t in existing_tasks}
        print(f"Reusing test ID: {test_id} ({test_title}), already filled slots: {sorted(list(filled_slots))}", flush=True)

    # Import each task
    for item in tasks_data:
        slot_idx = item['slot_index']
        if slot_idx in filled_slots:
            print(f"Slot {slot_idx:02d} already filled, skipping.", flush=True)
            continue

        q_type = item['question_type']
        q_text = item['text']
        opts = item['options']
        subqs = item.get('subquestions')
        ans = item['answer']
        topcs = item['topics']
        img = item['image_filename']

        for attempt in range(3):
            try:
                # 1. Create bank task
                bank_task = await db.bank_tasks.create_task(
                    text=q_text,
                    answer=ans,
                    question_type=q_type,
                    answer_mode="choices",
                    accepted_answers=None,
                    text_scale="md",
                    difficulty="B",
                    topics=topcs,
                    options=opts,
                    subquestions=subqs,
                    image_filename=img,
                    solution_filename=None,
                    source="ubt_import_v24",
                )
                bank_task_id = bank_task['id']

                # 2. Placement into slot
                await db.trial_tests.upsert_trial_test_slot(
                    trial_test_id=test_id,
                    slot_index=slot_idx,
                    bank_task_id=bank_task_id,
                    created_by=None,
                )
                print(f"Slot {slot_idx:02d}: bank_task_id={bank_task_id}, type={q_type}, img={img}", flush=True)
                break
            except Exception as e:
                print(f"Slot {slot_idx:02d} attempt {attempt+1} failed: {e}. Reconnecting...", flush=True)
                await asyncio.sleep(2)
                db = Database(db_url, use_pool=True, auto_migrate=False)
                await db.init()

    print("\n--- ALL 40 TASKS FOR VARIANT 24 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
