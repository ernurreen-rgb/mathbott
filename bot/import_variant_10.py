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
        "text": r"y = \frac{x^3 - 2x + 4}{\sqrt{\frac{1}{4} - x^2}} \text{ функциясының анықталу облысына тиісті санды тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,25"},
            {"label": "B", "text": "0,7"},
            {"label": "C", "text": "-0,9"},
            {"label": "D", "text": "-0,7"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Анықталу облысы"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"\arcsin\left(\frac{x}{4} - 1\right) = \frac{\pi}{6} \text{ теңдеудің түбірі бойынша берілген өрнектің мәнін тап: } x^2 - 14x + 49",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "1"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар", "Теңдеу"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"Жалпы түрдегі функцияның графигін анықта",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "A"},
            {"label": "B", "text": "B"},
            {"label": "C", "text": "C"},
            {"label": "D", "text": "D"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Функцияның графигі", "Жұп және тақ функциялар"],
        "image_filename": "v10_q03_graphs.png",
    },
    # 4
    {
        "slot_index": 4,
        "text": r"y = \operatorname{ctg}\left(2x - \frac{\pi}{3}\right) + \sin\left(5x + \frac{\pi}{4}\right) \text{ функцияның ең кіші оң периодын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\pi"},
            {"label": "B", "text": r"\frac{3\pi}{4}"},
            {"label": "C", "text": r"\frac{\pi}{2}"},
            {"label": "D", "text": r"3\pi"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функцияның периоды"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"\text{Есепте: } \frac{\left(64^{\log_8 2} - 3\log_{15} 3 + 3\log_{15} 45\right)^{2\log_7 12}}{6}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": "48"},
            {"label": "D", "text": "20"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Дәреже"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"Табан радиусы 3 см, биіктігі 8 см цилиндрге сырттай сызылған сфера бетінің ауданын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"50\pi"},
            {"label": "B", "text": r"80\pi"},
            {"label": "C", "text": r"100\pi"},
            {"label": "D", "text": r"60\pi"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера", "Цилиндр"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"a_{n+1} = 2a_n - 0,(3) \text{ рекуренттік тәсілмен берілген тізбектің төртінші мүшесін есепте, мұндағы } a_1 = \frac{2}{3}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Тізбектер", "Рекуррентті тізбек"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"\text{Теңдеудің түбірлерінің көбейтіндісін есепте: } x + 1 = 3\sqrt{x - 1}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "10"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"P(x) = 2x^5 - 3x^3 + 13x^2 + 15x - 20 \text{ көпмүшесін } x - 1\text{-екімүшеге бөлгендегі қалдықты тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көпмүшелер", "Безу теоремасы"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"\text{Сүйір бұрышы } 30^\circ\text{-қа тең тікбұрышты трапеция пішіндес жер телімінің периметрі 12 м. Жер телімі ауданының ең үлкен мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "48"},
            {"label": "B", "text": "12"},
            {"label": "C", "text": "24"},
            {"label": "D", "text": "6"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Трапеция", "Ең үлкен мән"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\begin{cases} x^{\frac{1}{y}} = 0,1 \\ \frac{1}{y} + \lg x = 0 \end{cases} \text{ теңдеулер жүйесін шешіп, } x_1 \cdot x_2 + y_1 \cdot y_2 \text{ өрнегінің мәнін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "-1"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Логарифмдік теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"Үшбұрыштың екі қабырғасы 7 см және 9 см. Үшінші қабырғасының ұзындығы бола алатын сан аралығы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(2; 16)"},
            {"label": "B", "text": "(7; 10)"},
            {"label": "C", "text": "(1; 17)"},
            {"label": "D", "text": "(7; 9)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Үшбұрыш", "Үшбұрыш теңсіздігі"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"\text{Есепте: } \sin\left(2\pi + \operatorname{arctg}\frac{3}{4}\right)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,5"},
            {"label": "B", "text": "0,6"},
            {"label": "C", "text": "0,8"},
            {"label": "D", "text": "-0,7"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар", "Келтіру формулалары"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"\text{Теңсіздікті шеш: } |\operatorname{ctg} x| \le 1",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left(\frac{\pi}{4} + 2\pi n; \frac{3\pi}{4} + 2\pi n\right)"},
            {"label": "B", "text": r"\left[\pi n; \frac{\pi}{4} + \pi n\right]"},
            {"label": "C", "text": r"\left[\frac{\pi}{4} + \pi n; \frac{3\pi}{4} + \pi n\right]"},
            {"label": "D", "text": r"\left[\frac{3\pi}{4} + \pi n; \pi + \pi n\right]"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңсіздіктер"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Дұрыс алтыбұрышты пирамидаға іштей және сырттай сызылған конустардың көлемдерінің қатынасын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4:3"},
            {"label": "B", "text": "2:1"},
            {"label": "C", "text": "5:4"},
            {"label": "D", "text": "3:2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Конус"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"6^{2^{3^2}} + 5^{3^{2^3}} \text{ қосынды қандай цифрмен аяқталады?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Сандар теориясы", "Соңғы цифр"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Катеттері 5 см және 12 см тікбұрышты үшбұрышты гипотенузадан айналдырғанда пайда болған дененің көлемін есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"91\pi"},
            {"label": "B", "text": r"93\pi"},
            {"label": "C", "text": r"92\pi"},
            {"label": "D", "text": r"90\pi"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Конус"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"ABCDEFGHIJKL \text{ дұрыс алтыбұрышты призмасының табан қабырғалары } 2\text{ см, бүйір қыры } 3\text{ см-ге тең. } BGK \text{ жазықтығынан } E \text{ төбесіне дейінгі қашықтықты есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "h = 2"},
            {"label": "B", "text": "h = 3"},
            {"label": "C", "text": "h = 4"},
            {"label": "D", "text": r"h = 2\sqrt{3}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Нүктеден жазықтыққа дейінгі қашықтық"],
        "image_filename": "v10_q18_prism.png",
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\text{Егер } \frac{\sin x + \cos x}{2\cos x - 3\sin x} = 2 \text{ болса, } \operatorname{tg} x \text{ - мәнін есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{2}{5}"},
            {"label": "B", "text": r"\frac{4}{9}"},
            {"label": "C", "text": r"\frac{3}{7}"},
            {"label": "D", "text": r"\frac{4}{7}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"x - 2y + z - 4 = 0 \text{ жазықтығы мен } x - 2y + z - 7 = 0 \text{ жазықтықтарының арақашықтығын есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": r"\frac{\sqrt{6}}{2}"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "1"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Кеңістіктегі аналитикалық геометрия", "Жазықтықтар арасындағы қашықтық"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"y = \frac{x-1}{x+2} \text{ функциясына кері функцияны тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \frac{2x-1}{x-1}"},
            {"label": "B", "text": r"y = \frac{2x+1}{x-1}"},
            {"label": "C", "text": r"y = -\frac{2x-1}{x+1}"},
            {"label": "D", "text": r"y = -\frac{2x+1}{x-1}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Кері функция"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\text{Егер } \lg 5 = a, \ \lg 2 = b \text{ болса, онда } \log_{25} 16\text{-ны өрнекте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{2b}{a}"},
            {"label": "B", "text": r"\frac{b}{4a}"},
            {"label": "C", "text": r"\frac{2a}{b}"},
            {"label": "D", "text": r"\frac{a}{5b}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\vec{a} = -2\vec{i} + 3\vec{j} - \vec{k} \text{ және } \vec{b} = \vec{i} + 2\vec{j} + \vec{k} \text{ векторларының скаляр көбейтіндісін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "3"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Векторлар", "Скаляр көбейтінді", "Стереометрия"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\left[ \begin{array}{l} x^2 - x - 6 \le 0 \\ x^2 + 3x - 4 < 0 \end{array} \right. \text{ теңсіздіктер жиынтығын шеш}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(-4; 3)"},
            {"label": "B", "text": "(-4; 3]"},
            {"label": "C", "text": "[-4; 3]"},
            {"label": "D", "text": "(-2; 1)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жиынтығы", "Квадрат теңсіздік"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"a\text{-ның қандай мәнінде } y = x^2 - 2x + 1 \text{ функциясы мен } y = a \text{ түзуінің екі ортақ нүктесі болады?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "a > 0"},
            {"label": "B", "text": "a < 0"},
            {"label": "C", "text": r"a \ge 0"},
            {"label": "D", "text": r"a \le 0"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Парабола", "Параметрлі есептер"],
        "image_filename": None,
    },
    # 26 (Context: Өрт шелегі)
    {
        "slot_index": 26,
        "text": "Контекст «Өрт шелегі»\nҰста темірден суретте көрсетілгендей шелек дайындады. Шелек сабы жарты шеңбер тектес, ал өзегі конус тектес. (\\pi \\approx 3)\n\nҰста шелек сабына неше сантиметр сым қолданды?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "16 см"},
            {"label": "B", "text": "24 см"},
            {"label": "C", "text": "36 см"},
            {"label": "D", "text": "48 см"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Шеңбер", "Шеңбер ұзындығы"],
        "image_filename": "v10_context_bucket.png",
    },
    # 27 (Context: Өрт шелегі)
    {
        "slot_index": 27,
        "text": "Контекст «Өрт шелегі»\nҰста темірден суретте көрсетілгендей шелек дайындады. Шелек сабы жарты шеңбер тектес, ал өзегі конус тектес. (\\pi \\approx 3)\n\nШелек аузының ауданын есептеңіз.",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"384\text{ см}^2"},
            {"label": "B", "text": r"256\text{ см}^2"},
            {"label": "C", "text": r"768\text{ см}^2"},
            {"label": "D", "text": r"750\text{ см}^2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Дөңгелек", "Дөңгелек ауданы"],
        "image_filename": "v10_context_bucket.png",
    },
    # 28 (Context: Өрт шелегі)
    {
        "slot_index": 28,
        "text": "Контекст «Өрт шелегі»\nҰста темірден суретте көрсетілгендей шелек дайындады. Шелек сабы жарты шеңбер тектес, ал өзегі конус тектес. (\\pi \\approx 3)\n\nҰста шелектің өзегін жасау үшін неше метр квадрат қалың темір қолданды?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"0,0544\text{ м}^2"},
            {"label": "B", "text": r"0,1632\text{ м}^2"},
            {"label": "C", "text": r"16,32\text{ м}^2"},
            {"label": "D", "text": r"5,44\text{ м}^2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Конус", "Бүйір бетінің ауданы"],
        "image_filename": "v10_context_bucket.png",
    },
    # 29 (Context: Өрт шелегі)
    {
        "slot_index": 29,
        "text": "Контекст «Өрт шелегі»\nҰста темірден суретте көрсетілгендей шелек дайындады. Шелек сабы жарты шеңбер тектес, ал өзегі конус тектес. (\\pi \\approx 3)\n\nШелекке ең көп дегенде неше литр су сияды? (бүтінге дейін жуықтаңыз)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "7"},
            {"label": "D", "text": "8"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Конус", "Көлем"],
        "image_filename": "v10_context_bucket.png",
    },
    # 30 (Context: Өрт шелегі)
    {
        "slot_index": 30,
        "text": "Контекст «Өрт шелегі»\nҰста темірден суретте көрсетілгендей шелек дайындады. Шелек сабы жарты шеңбер тектес, ал өзегі конус тектес. (\\pi \\approx 3)\n\nШелек өзегінің жазбасының бұрышын табыңыз.",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"165^\circ"},
            {"label": "B", "text": r"169^\circ"},
            {"label": "C", "text": r"171^\circ"},
            {"label": "D", "text": r"173^\circ"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Конус", "Конус жазбасы"],
        "image_filename": "v10_context_bucket.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"Шеңберге іштей сызылған шаршының периметрі 8 см. Осы шеңберге сырттай сызылған шаршының ауданы мен периметрін оның сан мәнімен сәйкестендір",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": r"8\sqrt{2}"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": r"6\sqrt{2}"},
        ],
        "subquestions": [
            {"text": "шаршының ауданы", "correct": "A"},
            {"text": "шаршының периметрі", "correct": "B"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Шаршы", "Шеңбер"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"\sin\alpha + \sin^2\alpha + \sin^3\alpha + \dots = 1 \text{ Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"\sqrt{3}"},
            {"label": "B", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "C", "text": r"\frac{\sqrt{3}}{2}"},
            {"label": "D", "text": r"\frac{1}{2}"},
        ],
        "subquestions": [
            {"text": r"\operatorname{ctg}\alpha", "correct": "A"},
            {"text": r"\cos\alpha", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Тригонометрия", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"(x - 3)^8 \text{ биномы бойынша сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "256"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": "128"},
            {"label": "D", "text": "9"},
        ],
        "subquestions": [
            {"text": "биномның қосылғыштар саны", "correct": "D"},
            {"text": "биномның коэффициенттерінің қосындысын есепте", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Ньютон биномы"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"y = \frac{2x - 1}{x + 3} \text{ функциясының анықталу облысы мен мәндер жиынын сан аралықтарымен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"(-\infty; 3) \cup (3; +\infty)"},
            {"label": "B", "text": r"(-\infty; -2) \cup (-2; +\infty)"},
            {"label": "C", "text": r"(-\infty; -3) \cup (-3; +\infty)"},
            {"label": "D", "text": r"(-\infty; 2) \cup (2; +\infty)"},
        ],
        "subquestions": [
            {"text": "анықталу облысы", "correct": "C"},
            {"text": "мәндер жиыны", "correct": "D"},
        ],
        "answer": '["C", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция", "Анықталу облысы", "Мәндер жиыны"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"y = f(x) \text{ функциясына тиісті } A(x; y) \text{ нүктесі бойынша функцияға түрлендіру жасағанда көшетін нүктелердің координаталарын сәйкестендір}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "C(6; 4)"},
            {"label": "B", "text": "B(3; 8)"},
            {"label": "C", "text": "D(5; 4)"},
            {"label": "D", "text": "E(0; 4)"},
        ],
        "subquestions": [
            {"text": r"y = f(x + 3)", "correct": "D"},
            {"text": r"y = 2f(x)", "correct": "B"},
        ],
        "answer": '["D", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция", "График", "Функция графигін түрлендіру"],
        "image_filename": "v10_q35_parabola.png",
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Арифметикалық прогрессия құрайтын сандар тізбегі графиктік тәсілмен берілген. a_7 = ?",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": r"\sqrt{196}"},
            {"label": "C", "text": r"\sqrt{144}"},
            {"label": "D", "text": "14"},
            {"label": "E", "text": r"\sqrt{25}"},
            {"label": "F", "text": "5"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия", "График"],
        "image_filename": "v10_q36_progression_graph.png",
    },
    # 37
    {
        "slot_index": 37,
        "text": r"Тікбұрышты үшбұрыштың катеттері 6 см мен 12 см. Гипотенузаға жүргізілген биссектрисаның ұзындығы",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"8\sqrt{2}\text{ см}"},
            {"label": "B", "text": r"\sqrt{72}\text{ см}"},
            {"label": "C", "text": r"\sqrt{32}\text{ см}"},
            {"label": "D", "text": r"6\sqrt{2}\text{ см}"},
            {"label": "E", "text": r"4\sqrt{2}\text{ см}"},
            {"label": "F", "text": r"7\sqrt{2}\text{ см}"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Үшбұрыш", "Биссектриса"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"\begin{cases} y - x^2 = 1 \\ y + x = p \end{cases} \text{ теңдеулер жүйесінің бір ғана шешімі болатындай } p \text{ - параметрінің мәндерін тап}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "0,75"},
            {"label": "B", "text": "0,625"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": r"\frac{3}{4}"},
            {"label": "E", "text": r"\frac{6}{5}"},
            {"label": "F", "text": r"\frac{5}{8}"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Параметрлі есептер"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"y = \operatorname{arctg}(5x^2 - 30x) \text{ функциясы берілген. Функцияның сындық нүктелерін тап}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\sqrt[3]{64}"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": r"\sqrt{16}"},
            {"label": "E", "text": r"\sqrt{9}"},
            {"label": "F", "text": r"\sqrt[3]{27}"},
        ],
        "answer": '["B", "E", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Сындық нүктелер", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Центрі C(4; -2; 1) нүктесінде және координаталар басы арқылы өтетін сфера теңдеуін тап",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"(x - 4)^2 + (y + 2)^2 + (z - 1)^2 = 21"},
            {"label": "B", "text": r"(x + 4)^2 + (y - 2)^2 + (z + 1)^2 = 21"},
            {"label": "C", "text": r"x^2 + y^2 + z^2 = 21"},
            {"label": "D", "text": r"x^2 + y^2 + z^2 - 8x + 4y - 2z = 0"},
            {"label": "E", "text": r"x^2 + y^2 + z^2 + 8x - 4y + 2z = 0"},
            {"label": "F", "text": r"x^2 + y^2 + z^2 - 21 = 0"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера теңдеуі", "Кеңістіктегі аналитикалық геометрия"],
        "image_filename": None,
    },
]

async def import_variant():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()
    
    # Check folder 11
    folders = await db.trial_tests.get_trial_test_folders(include_empty=True)
    ubt_folder = next((f for f in folders if f['name'] == 'ҰБТ есептері'), None)
    if not ubt_folder:
        print("Creating folder ҰБТ есептері...", flush=True)
        ubt_folder = await db.trial_tests.create_trial_test_folder(name='ҰБТ есептері', sort_order=1)
    
    folder_id = ubt_folder['id']
    print(f"Target folder ID: {folder_id}", flush=True)

    test_title = "10-нұсқа: Өрт шелегі"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 10-нұсқа математика тапсырмалары (Контекст: Өрт шелегі)",
            sort_order=10,
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
                    source="ubt_import_v10",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 10 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
