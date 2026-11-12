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
        "text": r"\arcsin(\sin 60^\circ) есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\pi}{6}"},
            {"label": "B", "text": r"\frac{2\pi}{3}"},
            {"label": "C", "text": r"\frac{\pi}{3}"},
            {"label": "D", "text": r"\frac{\pi}{2}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"3^{18} санына тең санды көрсетіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(27^4)^3"},
            {"label": "B", "text": r"(9^2)^3"},
            {"label": "C", "text": r"(27^2)^3"},
            {"label": "D", "text": r"(81^2)^2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Дәрежелер"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"s(t) = \frac{2}{3}t^3 + \frac{3}{2}t^2 + 8t - 3 заңымен қозғалатын материалдық нүктенің t_0 = 4 секунд мезетіндегі үдеуін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"19\text{ м/с}^2"},
            {"label": "B", "text": r"13\text{ м/с}^2"},
            {"label": "C", "text": r"16\text{ м/с}^2"},
            {"label": "D", "text": r"18\text{ м/с}^2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Туындының физикалық мағынасы"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"Радиусы 3 см, биіктігі 5 см болатын цилиндрдің толық бетінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"33\pi"},
            {"label": "B", "text": r"39\pi"},
            {"label": "C", "text": r"48\pi"},
            {"label": "D", "text": r"44\pi"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Толық бетінің ауданы"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"((x^7 - 8y^4)(8y^4 + x^7) + 63y^8)^2 - x^{14}(-2y^8 + x^{14}) өрнегін ықшамдаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y^{16}"},
            {"label": "B", "text": r"4x^{14}y^8"},
            {"label": "C", "text": r"2x^{14}y^8"},
            {"label": "D", "text": r"x^{28}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Қысқаша көбейту формулалары", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"Геометриялық прогрессияның бірінші және екінші мүшелерінің қосындысы 6, үшінші мүшесі 8. Еселіктерінің қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\frac{2}{3}"},
            {"label": "B", "text": r"1\frac{2}{3}"},
            {"label": "C", "text": r"2\frac{1}{3}"},
            {"label": "D", "text": r"1\frac{1}{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"Тақ функцияның графигін көрсетіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "I"},
            {"label": "B", "text": "II"},
            {"label": "C", "text": "III"},
            {"label": "D", "text": "IV"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар", "Функция қасиеттері", "Функция графигі"],
        "image_filename": "v12_q07_graphs.png",
    },
    # 8
    {
        "slot_index": 8,
        "text": r"y = \frac{2-x}{3} түзудің бұрыштық коэффициентін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": r"-\frac{1}{3}"},
            {"label": "C", "text": r"\frac{2}{3}"},
            {"label": "D", "text": r"-\frac{2}{3}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Сызықтық функция", "Бұрыштық коэффициент"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"AH = 2, HB-ның ұзындығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"4 - 2\sqrt{3}"},
            {"label": "B", "text": r"4 + 2\sqrt{3}"},
            {"label": "C", "text": r"6 - 3\sqrt{3}"},
            {"label": "D", "text": r"4 - 3\sqrt{3}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш", "Тригонометриялық қатынастар"],
        "image_filename": "v12_q09_triangle.png",
    },
    # 10
    {
        "slot_index": 10,
        "text": r"Шеңбердің бойындағы A нүктесі арқылы ұзындықтары радиусқа тең хорда мен жанама жүргізілді. Олардың арасындағы бұрышты табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"30^\circ"},
            {"label": "B", "text": r"60^\circ"},
            {"label": "C", "text": r"50^\circ"},
            {"label": "D", "text": r"45^\circ"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Жанама және хорда"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"Боялған бөліктің шешімдер жиынын анықтайтын теңсіздікті табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"yx \le 0"},
            {"label": "B", "text": r"y - x^2 \le 0"},
            {"label": "C", "text": r"y - x^2 \ge 0"},
            {"label": "D", "text": r"y + x^2 \le 0"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Функция графигі", "Парабола"],
        "image_filename": "v12_q11_parabola.png",
    },
    # 12
    {
        "slot_index": 12,
        "text": r"Арифметикалық прогрессияның алғашқы жиырма мүшесінің қосындысы кейінгі жиырма мүшесінің қосындысынан 20-ға артық. Арифметикалық прогрессияның айырымын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-0,02"},
            {"label": "B", "text": "-0,07"},
            {"label": "C", "text": "-0,05"},
            {"label": "D", "text": "-0,03"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"\sqrt[3]{x+1} \le -3 теңсіздігін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; -10]"},
            {"label": "B", "text": r"(-\infty; -26]"},
            {"label": "C", "text": r"(-\infty; -28]"},
            {"label": "D", "text": r"[-10; +\infty)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Иррационал теңсіздіктер"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"\frac{2\log_3^2 x - 1}{\log_3^2 x + 2\log_3 x - 2} = \log_3 3 теңдеуді шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "0"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер", "Логарифмдік теңдеулер"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"f(x) = \log_2(x - 1) функциясының x_0 = 2 нүктесіндегі туындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{2\ln 2}"},
            {"label": "B", "text": r"\frac{1}{\ln 2}"},
            {"label": "C", "text": r"\ln 4"},
            {"label": "D", "text": r"\frac{2}{\ln 2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Логарифмдік функцияның туындысы"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"Кеңістіктегі М нүктесінен \alpha жазықтығына жүргізілген көлбеудің ұзындығы 12. Көлбеу мен жазықтық арасындағы бұрыш 30^\circ. Көлбеудің жазықтықтағы проекциясын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"6\sqrt{2}"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": r"3\sqrt{2}"},
            {"label": "D", "text": r"6\sqrt{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Көлбеу мен проекция"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"\log_2 x = 3 + \log_2 5 - \log_2 10 теңдеуінің түбірі жататын аралық",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-2; 4)"},
            {"label": "B", "text": r"(-4; 0)"},
            {"label": "C", "text": r"(6; 10)"},
            {"label": "D", "text": r"(3; 6)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік теңдеулер"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"150-ден аспайтын 4-ке еселі натурал сандардың қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2756"},
            {"label": "B", "text": "2836"},
            {"label": "C", "text": "2812"},
            {"label": "D", "text": "2688"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"Қиық конустың табандарының радиусы 4 см және 12 см, биіктігі 3 см. Қиық конустың жасаушысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{73}"},
            {"label": "B", "text": r"\sqrt{89}"},
            {"label": "C", "text": r"\sqrt{79}"},
            {"label": "D", "text": r"\sqrt{67}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Қиық конус"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"Төмендегі график бойынша функцияны анықтаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = 3^{x-1} - 2"},
            {"label": "B", "text": r"y = 3^{x+1} - 1"},
            {"label": "C", "text": r"y = 3^{x-1} + 2"},
            {"label": "D", "text": r"y = 2^{x+1} + 1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар", "Көрсеткіштік функция", "Функция графигі"],
        "image_filename": "v12_q20_graph.png",
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Цилиндрдің осьтік қимасының диагоналі 5\sqrt{13}. Биіктігі мен табанының диаметрінің қатынасы 3:2. Цилиндрдің биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "7,5"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "10"},
            {"label": "D", "text": "15"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Осьтік қима"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\sin\frac{\pi}{12} - \sin\frac{5\pi}{12} есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{6}}{4}"},
            {"label": "B", "text": r"-\frac{1}{2}"},
            {"label": "C", "text": r"-\frac{\sqrt{2}}{2}"},
            {"label": "D", "text": r"\frac{\sqrt{3}}{4}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық өрнектер"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\text{Егер } (x_0; y_0) \begin{cases} \sqrt{x} - \sqrt{y} = 32 \\ \sqrt[4]{x} + \sqrt[4]{y} = 8 \end{cases} \text{ теңдеулер жүйесінің шешімі болса, } \frac{x_0}{y_0} \text{ мәнін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "72"},
            {"label": "B", "text": "81"},
            {"label": "C", "text": "78"},
            {"label": "D", "text": "93"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"f(x) = 2e^{2x} + 6x^2 функциясы үшін графигі (0; 3) нүктесі арқылы өтетін алғашқы функцияны табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"F(x) = 2e^{2x} + 2x^3 + 1"},
            {"label": "B", "text": r"F(x) = e^x + 2x^3 - 1"},
            {"label": "C", "text": r"F(x) = e^x + 3x^3 - 1"},
            {"label": "D", "text": r"F(x) = e^{2x} + 2x^3 + 2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Алғашқы функция"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"\sqrt[3]{21 + \sqrt{18\sqrt[4]{16}}} есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": r"\sqrt[3]{15}"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": r"3\sqrt[3]{3}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Түбірлер", "Арифметикалық түбір"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": r"**Қорап**" + "\n\n" + r"Өлшемдері 50 см, 50 см, 50 см болатын кіші текшелерден қорап жасалған." + "\n\n" + r"1-ші суретте барлығы неше текше бар",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "64"},
            {"label": "B", "text": "48"},
            {"label": "C", "text": "72"},
            {"label": "D", "text": "56"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Текше"],
        "image_filename": "v12_context_cubes.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": r"**Қорап**" + "\n\n" + r"Өлшемдері 50 см, 50 см, 50 см болатын кіші текшелерден қорап жасалған." + "\n\n" + r"1-ші суреттегі үлкен текшенің толық бетінің ауданы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"36\text{ м}^2"},
            {"label": "B", "text": r"27\text{ м}^2"},
            {"label": "C", "text": r"24\text{ м}^2"},
            {"label": "D", "text": r"32\text{ м}^2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Толық бетінің ауданы"],
        "image_filename": "v12_context_cubes.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": r"**Қорап**" + "\n\n" + r"Өлшемдері 50 см, 50 см, 50 см болатын кіші текшелерден қорап жасалған." + "\n\n" + r"2-ші суреттегі қорапқа жетіспейтін текшелердің саны",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "51"},
            {"label": "B", "text": "45"},
            {"label": "C", "text": "48"},
            {"label": "D", "text": "43"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Көлем және кеңістіктік ойлау"],
        "image_filename": "v12_context_cubes.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": r"**Қорап**" + "\n\n" + r"Өлшемдері 50 см, 50 см, 50 см болатын кіші текшелерден қорап жасалған." + "\n\n" + r"Егер биіктігі 3 м, ұзындығы 2,5 м, ені 2 м параллелепипед тәрізді қорапқа өлшемдері 50 см, 50 см, 50 см текшелерді орналастырсақ, қажетті текшенің саны",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "150"},
            {"label": "B", "text": "120"},
            {"label": "C", "text": "140"},
            {"label": "D", "text": "100"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Параллелепипед көлемі"],
        "image_filename": "v12_context_cubes.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": r"**Қорап**" + "\n\n" + r"Өлшемдері 50 см, 50 см, 50 см болатын кіші текшелерден қорап жасалған." + "\n\n" + r"3-ші суреттегі қорапты 1-суреттегідей қорапқа толтыру үшін қажетті кубтардың көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"6\text{ м}^3"},
            {"label": "B", "text": r"4\text{ м}^3"},
            {"label": "C", "text": r"3\text{ м}^3"},
            {"label": "D", "text": r"5\text{ м}^3"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Көлем"],
        "image_filename": "v12_context_cubes.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"|x^2 + 5x| = 6x теңдеуі берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-11"},
            {"label": "D", "text": "-10"},
        ],
        "subquestions": [
            {"text": r"теңдеудің ең кіші түбірі", "correct": "A"},
            {"text": r"түбірлерінің қосындысы", "correct": "B"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Модульдік теңдеулер"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"60^\circ-қа тең сектордың ауданы 6\pi\text{ см}^2 болса, осы дөңгелекке сырттай және іштей сызылған шаршылардың аудандарын табыңыз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "121"},
            {"label": "B", "text": "144"},
            {"label": "C", "text": "81"},
            {"label": "D", "text": "72"},
        ],
        "subquestions": [
            {"text": r"сырттай сызылған шаршы ауданы", "correct": "B"},
            {"text": r"іштей сызылған шаршы ауданы", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Шеңбер", "Шаршы"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"194; 175; 156; \dots арифметикалық прогрессия құрайтын сан қатары берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "23"},
            {"label": "D", "text": "4"},
        ],
        "subquestions": [
            {"text": r"он бірінші мүшесі", "correct": "D"},
            {"text": r"екі таңбалы мүшелерінің саны", "correct": "B"},
        ],
        "answer": '["D", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"6^x = 5^{x^2} теңдеуі берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": r"\log_5 6"},
            {"label": "D", "text": r"\log_6 5"},
        ],
        "subquestions": [
            {"text": r"теңдеудің түбірлерінің қосындысы", "correct": "C"},
            {"text": r"теңдеудің түбірлерінің көбейтіндісі", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Көрсеткіштік теңдеулер", "Логарифм"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"Функцияларды зерттеп, дұрыс жауаптарымен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"Жұп функция"},
            {"label": "B", "text": r"Координаталар бас нүктесінен өтеді"},
            {"label": "C", "text": r"I, II, III ширекте жатады"},
            {"label": "D", "text": r"Кемімелі функция"},
        ],
        "subquestions": [
            {"text": r"y = 4x", "correct": "B"},
            {"text": r"y = \frac{1}{2}x^2 + 3", "correct": "A"},
        ],
        "answer": '["B", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функциялар", "Функция қасиеттері"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Геометриялық прогрессиясының алғашқы сегіз мүшесінің қосындысы \frac{85}{64}, еселігі \left(-\frac{1}{2}\right). Осы геометриялық прогрессияның мүшесі бола алатын сандар",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "0,5"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "-4"},
            {"label": "E", "text": "2"},
            {"label": "F", "text": "-2"},
        ],
        "answer": '["B", "C", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"f(x) = \int \cos x dx функциясында F(\pi) = 0 болса, F\left(\frac{\pi}{2}\right) және F\left(\frac{\pi}{6}\right) мәндерін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "-1"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": r"0,5\sqrt{3}"},
            {"label": "E", "text": "-0,5"},
            {"label": "F", "text": "0,5"},
        ],
        "answer": '["C", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Алғашқы функция", "Тригонометрия"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"y = a(x - m)^2 функциясының графигі берілген. m-нің мәні мен a коэффициентінің таңбасын анықтаңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"a > 0"},
            {"label": "B", "text": r"m = -2"},
            {"label": "C", "text": r"a < 0"},
            {"label": "D", "text": r"m = 2"},
            {"label": "E", "text": r"m = 0"},
            {"label": "F", "text": r"m = 4"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар", "Квадраттық функция", "Функция графигі"],
        "image_filename": "v12_q38_parabola.png",
    },
    # 39
    {
        "slot_index": 39,
        "text": r"y = 3x^2 - \ln x функциясына x_0 = 1 нүктесінде жүргізілген жанама теңдеуін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"y = 5x - 2"},
            {"label": "B", "text": r"y = 5x - 3"},
            {"label": "C", "text": r"y = x"},
            {"label": "D", "text": r"5x - y - 3 = 0"},
            {"label": "E", "text": r"y = -x"},
            {"label": "F", "text": r"5x - y - 2 = 0"},
        ],
        "answer": '["A", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Жанама теңдеуі"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Суреттегі мәліметтер бойынша, судың көлемін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"648\sqrt{3}"},
            {"label": "B", "text": r"972\sqrt{3}"},
            {"label": "C", "text": r"1042\sqrt{3}"},
            {"label": "D", "text": r"1944\sqrt{3}"},
            {"label": "E", "text": "964"},
            {"label": "F", "text": "982"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Көлем"],
        "image_filename": "v12_q40_container.png",
    },
]

async def import_variant():
    db_url = get_db_url()
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

    test_title = "12-нұсқа: Қорап"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 12-нұсқа математика тапсырмалары (Контекст: Қорап)",
            sort_order=12,
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
                    source="ubt_import_v12",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 12 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
