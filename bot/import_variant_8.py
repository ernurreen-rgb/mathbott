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
        "text": r"\bar{q}(i; -2j; -k), \bar{m}(2i; j; -k), \bar{n}(-i; 2k) векторлары берілген. \bar{q} + 3\bar{m} - \bar{n} мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(6; -1; -2)"},
            {"label": "B", "text": "(8; 1; -6)"},
            {"label": "C", "text": "(7; 0; -5)"},
            {"label": "D", "text": "(5; -2; 3)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Векторлар", "Геометрия", "Кеңістіктегі векторлар"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"\left(-(-\sqrt{2})^2\right)^3 есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": r"\sqrt{2}^3"},
            {"label": "D", "text": "-8"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Дәрежелер", "Арифметика"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"f(x) = \cos 4x функциясының екінші ретті туындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-8\cos 4x"},
            {"label": "B", "text": r"4\sin 4x"},
            {"label": "C", "text": r"-16\cos 4x"},
            {"label": "D", "text": r"8\sin 4x"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Тригонометрия"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"2\cos\left(\frac{\pi}{2} + x\right) + \sqrt{2} = 0 теңдеуді шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x = (-1)^n \frac{\pi}{4} + \pi n, n \in \mathbb{Z}"},
            {"label": "B", "text": r"x = (-1)^n \frac{\pi}{4} + 2\pi n, n \in \mathbb{Z}"},
            {"label": "C", "text": r"x = (-1)^n \frac{\pi}{2} + \pi n, n \in \mathbb{Z}"},
            {"label": "D", "text": r"x = (-1)^{n-1} \frac{\pi}{4} + \pi n, n \in \mathbb{Z}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер", "Теңдеу"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"Егер (x_0; y_0) \begin{cases} 2^{\frac{x+y}{3}} + 2^{\frac{x+y}{6}} - 6 = 0 \\ x - 5y = 7 \end{cases} теңдеулер жүйесінің шешімі болса, x_0 + y_0 мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "7"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "5"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"2 + 0,18 + 0,0018 + 0,000018 + \dots қосындысының мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\frac{4}{9}"},
            {"label": "B", "text": r"2\frac{2}{99}"},
            {"label": "C", "text": r"2\frac{4}{11}"},
            {"label": "D", "text": r"2\frac{2}{11}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"\begin{cases} \sqrt{x} + \sqrt{y} = 5 \\ 2x + y + 2\sqrt{xy} = 34 \end{cases} теңдеулер жүйесінің түбірлерін тауып, \frac{x+y}{13} өрнегінің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "13"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңдеулер", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"Табанының ауданы 36\text{ см}^2 дұрыс төртбұрышты пирамиданың биіктігі бүйір қабырғасынан 3\text{ см}-ге кем. Пирамиданың биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1,5"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "4,5"},
            {"label": "D", "text": "1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"f(x) = x^3, g(x) = \sin 2x. f(g(x)) функциясының туындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"3\sin x \sin 4x"},
            {"label": "B", "text": r"6\sin 2x \cos 4x"},
            {"label": "C", "text": r"6\sin x \sin 4x"},
            {"label": "D", "text": r"3\sin 2x \sin 4x"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Күрделі функция туындысы"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"\begin{cases} x^2 + y^2 = 10 \\ \lg(x+y) - \lg(x-y) = \lg 3 \end{cases} теңдеулер жүйесін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(2\sqrt{2}; \sqrt{2})"},
            {"label": "B", "text": r"(2\sqrt{2}; \sqrt{2}), (-2\sqrt{2}; -\sqrt{2})"},
            {"label": "C", "text": r"(\sqrt{2}; 2\sqrt{2})"},
            {"label": "D", "text": r"(-\sqrt{2}; 2\sqrt{2})"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"2^{x^2 - 2} - 3^{x^2 - 1} > 3^{x^2 - 2} - 2^{x^2 + 1} теңсіздігін қанағаттандыратын ең кіші бүтін санды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-2"},
            {"label": "B", "text": "-1"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "1"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер", "Теңсіздік"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"y = 3^x - 1 және y = -x^2 функциялары қанша нүктеде қиылысады",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "қиылыспайды"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар", "Графиктердің қиылысуы"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"\int \left(6x^7 + \frac{5}{2\sqrt{x}}\right) dx",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3x^8}{8} + 5\sqrt{x} + C"},
            {"label": "B", "text": r"\frac{3x^8}{4} + \sqrt{x} + C"},
            {"label": "C", "text": r"\frac{3x^8}{4} + 5\sqrt{x} + C"},
            {"label": "D", "text": r"\frac{x^8}{4} + 5\sqrt{x} + C"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Интеграл", "Анықталмаған интеграл"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"2^{x^2 + 4x + 3} < 2 теңсіздіктің шешімін қанағаттандыратын ең үлкен бүтін санды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "-2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер", "Квадрат теңсіздік"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Координаталық жазықтықта f(x) = ax^2 + bx + c функциясының графигі берілген. Сурет бойынша a, b және c коэффициенттерін анықтап, a \cdot b \cdot c мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "80"},
            {"label": "B", "text": "-80"},
            {"label": "C", "text": "60"},
            {"label": "D", "text": "-60"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадраттық функция", "Парабола", "Функция графигі"],
        "image_filename": "v8_q15_parabola.png",
    },
    # 16
    {
        "slot_index": 16,
        "text": r"\frac{1}{2} < \frac{2x+7}{x^2+2x+1} \le 3 теңсіздігін қанағаттандыратын ең үлкен бүтін санды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Бөлшек-рационал теңсіздіктер", "Теңсіздіктер жүйесі"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Теңдеулер жүйесін шешіңіз: \begin{cases} \sin x \cdot \cos y = \frac{\sqrt{2}}{4} \\ x + y = \frac{\pi}{4} \end{cases}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left(\frac{\pi}{4} + \pi n; \pi n\right), n \in \mathbb{Z}"},
            {"label": "B", "text": r"\left(\frac{\pi}{4} + 2\pi n; \frac{\pi}{2} - 2\pi n\right), n \in \mathbb{Z}"},
            {"label": "C", "text": r"\left(\frac{\pi}{2} + \frac{\pi n}{2}; \frac{\pi}{4} - \frac{\pi n}{2}\right), n \in \mathbb{Z}"},
            {"label": "D", "text": r"\left(\frac{\pi}{8} + \frac{\pi n}{2}; \frac{\pi}{8} - \frac{\pi n}{2}\right), n \in \mathbb{Z}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер жүйесі", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"2\sin^2 x + 5\sin x - 3 = 0 теңдеуді шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x = (-1)^n \frac{\pi}{3} + \pi n"},
            {"label": "B", "text": r"x = (-1)^n \frac{\pi}{6} + 2\pi n"},
            {"label": "C", "text": r"x = (-1)^n \frac{\pi}{6} + \pi n"},
            {"label": "D", "text": r"x = (-1)^n \frac{\pi}{3} + 2\pi n"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"Тікбұрышты үшбұрыштың гипотенузасы 25, ал катеттерінің бірі 10. Екінші катеттің гипотенузадағы проекциясын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "21"},
            {"label": "C", "text": "24"},
            {"label": "D", "text": "8"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш", "Проекция"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\operatorname{tg}\left(\arcsin\frac{3}{5}\right) есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,5"},
            {"label": "B", "text": "0,25"},
            {"label": "C", "text": "0,75"},
            {"label": "D", "text": "0,65"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар", "Арксинус"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Егер (x_0; y_0) \begin{cases} 4^{1 + \log_4(x+y)} = 20 \\ \log_3(x+y) + \log_3(x-y) = \log_3 20 \end{cases} теңдеулер жүйесінің шешімі болса, x_0 + y_0 мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "6"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"(a^2 - 1)\left(\frac{a}{a-1} - \frac{1}{a+1} + 1\right) өрнегін ықшамдап, a = -2 болғандағы мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-8"},
            {"label": "B", "text": "-4"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "8"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Рационал бөлшектер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"Суретте қай функцияның графигі бейнеленгенін анықтаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = 2\sin\frac{x}{2}"},
            {"label": "B", "text": r"y = 2\sin 2x"},
            {"label": "C", "text": r"y = \sin\frac{x}{2}"},
            {"label": "D", "text": r"y = \sin 2x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функция графигі", "Синусоида"],
        "image_filename": "v8_q23_sin_graph.png",
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\cos t \ge \frac{1}{2} теңсіздігінің шешімі көрсетілген суретті көрсетіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "A"},
            {"label": "B", "text": "B"},
            {"label": "C", "text": "C"},
            {"label": "D", "text": "D"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңсіздіктер", "Бірлік шеңбер"],
        "image_filename": "v8_q24_trig_circles.png",
    },
    # 25
    {
        "slot_index": 25,
        "text": r"Шеңберге іштей сызылған алтыбұрыштың ауданы 45, осы шеңберге іштей сызылған он екі бұрыштың ауданын есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"30\sqrt{3}"},
            {"label": "B", "text": r"45\sqrt{2}"},
            {"label": "C", "text": r"30\sqrt{2}"},
            {"label": "D", "text": "51"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Дұрыс көпбұрыштар", "Аудан"],
        "image_filename": None,
    },
    # 26 (Контекст: Шатыр)
    {
        "slot_index": 26,
        "text": r"Шатыр. Трапеция тәріздес жағының биіктігі",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": r"6\sqrt{2}"},
            {"label": "D", "text": r"3\sqrt{2}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Шатыр", "Трапеция"],
        "image_filename": "v8_q26_roof.png",
    },
    # 27 (Контекст: Шатыр)
    {
        "slot_index": 27,
        "text": r"Шатыр. Шатырдың биіктігі",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{26}"},
            {"label": "B", "text": r"\sqrt{23}"},
            {"label": "C", "text": r"\sqrt{25}"},
            {"label": "D", "text": r"\sqrt{29}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Шатыр"],
        "image_filename": "v8_q26_roof.png",
    },
    # 28 (Контекст: Шатыр)
    {
        "slot_index": 28,
        "text": r"Шатыр. Үшбұрыш тәріздес жағы табанымен қандай бұрыш жасайды",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\arccos\frac{3\sqrt{2}}{8}"},
            {"label": "B", "text": r"\arcsin\frac{3\sqrt{2}}{6}"},
            {"label": "C", "text": r"\arcsin\frac{3\sqrt{2}}{8}"},
            {"label": "D", "text": r"\arccos\frac{3\sqrt{2}}{4}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Шатыр", "Бұрыш"],
        "image_filename": "v8_q26_roof.png",
    },
    # 29 (Контекст: Шатыр)
    {
        "slot_index": 29,
        "text": r"Шатыр. Шатырдың бүйір бетінің ауданы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"343\text{ м}^2"},
            {"label": "B", "text": r"334\text{ м}^2"},
            {"label": "C", "text": r"336\text{ м}^2"},
            {"label": "D", "text": r"328\text{ м}^2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Шатыр", "Бүйір бетінің ауданы"],
        "image_filename": "v8_q26_roof.png",
    },
    # 30 (Контекст: Шатыр)
    {
        "slot_index": 30,
        "text": r"Шатыр. Дүкеннен шатырдың материалын сатып алу қажет. 1\text{ м}^2 = 2800\text{ тг}. Егерде шатырды жабуға 5\% шығын кетсе барлығын қаптауға қанша тг керек?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "971860 тг"},
            {"label": "B", "text": "891660 тг"},
            {"label": "C", "text": "971980 тг"},
            {"label": "D", "text": "981960 тг"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Мәтіндік есептер", "Шатыр", "Пайыз"],
        "image_filename": "v8_q26_roof.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"y = \cos^2 x - 4 функциясының ең кіші мәні мен ең үлкен мәнін тауып, сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-5"},
            {"label": "B", "text": "-4"},
            {"label": "C", "text": "-3"},
            {"label": "D", "text": "-2"},
        ],
        "subquestions": [
            {"text": "ең кіші мәні", "correct": "B"},
            {"text": "ең үлкен мәні", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Тригонометрия", "Функцияның мәндер жиыны"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"x^2 + y^2 + z^2 - 2x + 4y + 8z + 5 = 0 теңдеуімен берілген сфераның центрінің координаталары мен радиусын сан мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "(-1; 2; 4)"},
            {"label": "B", "text": "(1; -2; -4)"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "5"},
        ],
        "subquestions": [
            {"text": "O", "correct": "B"},
            {"text": "R", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Сфера теңдеуі"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"Шексіз кемімелі геометриялық прогрессияның қосындысы 15, олардың квадраттарының қосындысы 150. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": r"\frac{1}{5}"},
            {"label": "D", "text": r"\frac{1}{3}"},
        ],
        "subquestions": [
            {"text": r"b_1", "correct": "A"},
            {"text": r"q", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"Биіктігі 8 см цилиндрге іштей сфера сызылған. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"\frac{512\pi}{3}\text{ см}^3"},
            {"label": "B", "text": r"\frac{256\pi}{3}\text{ см}^3"},
            {"label": "C", "text": r"\frac{2}{3}"},
            {"label": "D", "text": r"\frac{4}{3}"},
        ],
        "subquestions": [
            {"text": "Сфера көлемі", "correct": "B"},
            {"text": "Сфера көлемінің цилиндр көлеміне қатынасы", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Цилиндр", "Сфера"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"KM қабырғасы ортақ болатын KMN және KML үшбұрыштары берілген. KMN - теңқабырғалы, периметрі 54 см; KML - теңбүйірлі, периметрі 44 см. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "18"},
            {"label": "D", "text": "12"},
        ],
        "subquestions": [
            {"text": "KM ұзындығы", "correct": "C"},
            {"text": "LM ұзындығы", "correct": "B"},
        ],
        "answer": '["C", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Үшбұрыштар"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Цилиндрдің бүйір бетінің ауданы мен табандарының аудандарының қосындысы тең болса, биіктігінің диаметріне қатынасын табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "0,2"},
            {"label": "B", "text": "1,2"},
            {"label": "C", "text": "0,5"},
            {"label": "D", "text": "2"},
            {"label": "E", "text": "1,5"},
            {"label": "F", "text": "1,6"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Аудан"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\frac{x^3 + y^3}{x^2 - xy + y^2} : \left(\frac{2x}{(x-y)^2} - \frac{1}{x-y}\right) өрнегін ықшамдаңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"x^2 - xy + y^2"},
            {"label": "B", "text": r"(x + y)^2 - xy"},
            {"label": "C", "text": r"x^2 + xy + y^2"},
            {"label": "D", "text": r"x^2 - 2xy + y^2"},
            {"label": "E", "text": r"(x - y)^2 + xy"},
            {"label": "F", "text": r"x^2 - y^2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Рационал өрнектер", "Өрнекті ықшамдау", "Қысқаша көбейту формулалары"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"\begin{cases} a_1 + a_3 + a_5 = 39 \\ a_1 \cdot a_3 \cdot a_5 = 1365 \end{cases} арифметикалық прогрессия бірінші мүшесін және айырымын табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\pm 2"},
            {"label": "B", "text": "21"},
            {"label": "C", "text": "7"},
            {"label": "D", "text": r"\pm 4"},
            {"label": "E", "text": "5"},
            {"label": "F", "text": r"\pm 3"},
        ],
        "answer": '["B", "D", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"2\left(x^2 + \frac{1}{x^2}\right) + 9 = 7\left(x + \frac{1}{x}\right) теңдеуінің түбірлері x_1 < x_2 шартын қанағаттандырса, x_1 және x_2 мәндерін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"x_1 = 0,5"},
            {"label": "B", "text": r"x_2 = -0,5"},
            {"label": "C", "text": r"x_1 = 2"},
            {"label": "D", "text": r"x_2 = 1"},
            {"label": "E", "text": r"x_2 = 2"},
            {"label": "F", "text": r"x_1 = -2"},
        ],
        "answer": '["A", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер", "Қайтымды теңдеулер"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Төмендегі жауаптар арасынан радиус векторы екінші ширекке тиісті бұрыштар",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"-\frac{5\pi}{4}"},
            {"label": "B", "text": r"\frac{7\pi}{6}"},
            {"label": "C", "text": r"\frac{5\pi}{3}"},
            {"label": "D", "text": r"\frac{2\pi}{3}"},
            {"label": "E", "text": r"-\frac{5\pi}{6}"},
            {"label": "F", "text": r"\frac{9\pi}{4}"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық дөңгелек", "Бұрыштар", "Ширектер"],
        "image_filename": None,
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

    test_title = "8-нұсқа: Шатыр"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 8-нұсқа математика тапсырмалары (Контекст: Шатыр)",
            sort_order=8,
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
                    source="ubt_import_v8",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 8 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
