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
        "text": r"Бөлшектің бөлімін иррационалдықтан арылтыңыз: \frac{2}{\sqrt{5}-\sqrt{3}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": r"\sqrt{5} - \sqrt{3}"},
            {"label": "C", "text": r"\sqrt{5} + \sqrt{3}"},
            {"label": "D", "text": r"2(\sqrt{5} + \sqrt{3})"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал сандар", "Бөлшектер"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"Өрнекті ықшамдаңыз: \left(\frac{49}{x^3+27} - \frac{x+3}{x^2+9-3x}\right) \cdot \frac{x(x^3+27)}{16-x^2} + \frac{4-9x-x^2}{x+4}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x^2 - 4"},
            {"label": "B", "text": "x"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "-1"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Өрнекті ықшамдау", "Бөлшек-рационал өрнектер"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"\lg 5 = a, \lg 3 = b арқылы \log_{90} 16-ны өрнектеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{4(1+a)}{2b-1}"},
            {"label": "B", "text": r"\frac{2(1-a)}{2b-1}"},
            {"label": "C", "text": r"\frac{2(1+a)}{2b+1}"},
            {"label": "D", "text": r"\frac{4(1-a)}{2b+1}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"\begin{cases} \sin x \cdot \sin y = \frac{1}{4} \\ x + y = \frac{\pi}{3} \end{cases} теңдеулер жүйесінің шешімі бойынша x - y = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\pi n, n \in \mathbb{Z}"},
            {"label": "B", "text": r"2\pi n, n \in \mathbb{Z}"},
            {"label": "C", "text": r"\frac{\pi}{6} - \pi n, n \in \mathbb{Z}"},
            {"label": "D", "text": r"\frac{\pi}{6} + \pi n, n \in \mathbb{Z}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"ABCDA_1B_1C_1D_1 кубы берілген. \vec{AD} векторымен коллинеар векторды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\vec{B_1 D_1}"},
            {"label": "B", "text": r"\vec{B_1 C_1}"},
            {"label": "C", "text": r"\vec{A_1 C}"},
            {"label": "D", "text": r"\vec{A_1 B_1}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Векторлар", "Куб"],
        "image_filename": "v23_q05_cube.png",
    },
    # 6
    {
        "slot_index": 6,
        "text": r"Суретте берілген шеңберлердің радиустары 4 см және 8 см. Егер BC = 12 болса, AC = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "18"},
            {"label": "B", "text": "20"},
            {"label": "C", "text": "24"},
            {"label": "D", "text": "12"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Жанама"],
        "image_filename": "v23_q06_circles.png",
    },
    # 7
    {
        "slot_index": 7,
        "text": r"Бірінші мүшесі \cos^2 x-қа, екінші мүшесі \cos^3 x-қа тең шексіз кемімелі геометриялық прогрессия берілген. x = \frac{\pi}{3} болғанда прогрессияның қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,5"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "0,4"},
            {"label": "D", "text": "0,25"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия", "Тригонометрия"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"(x^2 + 2x - 8) \cdot \sqrt{x^2 + 2x - 3} \le 0 теңсіздікті қанағаттандыратын барлық бүтін сандардың көбейтіндісін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-12"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "-24"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Иррационал теңсіздіктер"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"f(x) = 3 + 2\sin x функциясының координаталар басы арқылы өтетін алғашқы функциясын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"F(x) = 3x + 2\cos x - 2"},
            {"label": "B", "text": r"F(x) = 3x - 2\cos x - 2"},
            {"label": "C", "text": r"F(x) = 3x + 2\cos x + 2"},
            {"label": "D", "text": r"F(x) = 3x - 2\cos x + 2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Интеграл", "Алғашқы функция"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"\sin x - \sqrt{3}\cos x = 2 теңдеуін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x = \frac{5\pi}{2} + 2\pi n, n \in \mathbb{Z}"},
            {"label": "B", "text": r"x = \frac{2\pi}{3} + 2\pi n, n \in \mathbb{Z}"},
            {"label": "C", "text": r"x = \frac{5\pi}{6} + 2\pi n, n \in \mathbb{Z}"},
            {"label": "D", "text": r"x = \frac{\pi}{2} + 2\pi n, n \in \mathbb{Z}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\int (x - 3)e^{2x} dx интегралды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{e^{2x}}{2} - \frac{(x-3)e^{2x}}{4} + C"},
            {"label": "B", "text": r"\frac{(x-3)e^{2x}}{2} - \frac{e^{2x}}{4} + C"},
            {"label": "C", "text": r"-\frac{e^{2x}}{2} + \frac{(x-3)e^{2x}}{4} + C"},
            {"label": "D", "text": r"-\frac{(x-3)e^{2x}}{2} + \frac{e^{2x}}{4} + C"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Интеграл", "Бөліктеп интегралдау"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"Центрі O нүктесі, радиусы 4 см шеңберге AB хордасы жүргізілді. Егер OA және OB радиустарының арасындағы бұрыш 120^\circ болса, AB хордасы арқылы пайда болған кіші сегменттің ауданын табыңыз (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"8 - 2\sqrt{3}"},
            {"label": "B", "text": r"12 - 3\sqrt{3}"},
            {"label": "C", "text": r"15 - 3\sqrt{3}"},
            {"label": "D", "text": r"16 - 4\sqrt{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Сегмент"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"\log_{y+2}(3y^2 - 12) = 2 теңдеудің түбірін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-2"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік теңдеулер"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"8^{x-3} < 3^{2x-6} теңсіздікті қанағаттандыратын ең кіші бүтін санды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"ABCDA_1B_1C_1D_1 кубы берілген. \vec{AC_1} векторын компланар емес \vec{AA_1}, \vec{AB}, \vec{AD} векторлары арқылы өрнектеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\vec{AA_1} + \vec{AB} - \vec{AD}"},
            {"label": "B", "text": r"\vec{AA_1} - \vec{AB} + \vec{AD}"},
            {"label": "C", "text": r"\vec{AA_1} + \vec{AB} + \vec{AD}"},
            {"label": "D", "text": r"\vec{AA_1} - \vec{AB} - \vec{AD}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Векторлар", "Куб"],
        "image_filename": "v23_q15_cube.png",
    },
    # 16
    {
        "slot_index": 16,
        "text": r"Суретте функция туындысының f'(x)-тің графигі берілген. Функцияның x_{\max} табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-0,5"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "0,5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Экстремум", "График"],
        "image_filename": "v23_q16_derivative_graph.png",
    },
    # 17
    {
        "slot_index": 17,
        "text": r"\vec{d}(-1; 3; 4) векторын ұштары A(4; 5; 3), B(2; 1; 5), C(3; -2; 1) болатын \vec{AB} және \vec{AC} компланар векторлары арқылы өрнектеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{2}\vec{AB} + \vec{AC}"},
            {"label": "B", "text": r"-\vec{AB} + \frac{1}{2}\vec{AC}"},
            {"label": "C", "text": r"\vec{AB} + \vec{AC}"},
            {"label": "D", "text": r"\vec{AB} - \vec{AC}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Векторлар", "Кеңістіктегі векторлар", "Стереометрия"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"Тікбұрышты трапецияны қысқа бүйір қабырғасынан айналдырғанда пайда болатын фигура?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "конус"},
            {"label": "B", "text": "қиық пирамида"},
            {"label": "C", "text": "цилиндр"},
            {"label": "D", "text": "қиық конус"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Конус"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\frac{x}{3} + \frac{y}{2} + \frac{z}{1} = 1 және 2x + 3y + 6z - 8 = 0 жазықтықтарының арақашықтығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": r"\frac{2}{7}"},
            {"label": "C", "text": r"\frac{3}{7}"},
            {"label": "D", "text": "3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Кеңістіктегі түзу мен жазықтық", "Стереометрия"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"x^2 - 5x + 3 = 0 теңдеудің түбірлері бойынша \frac{1}{x_1} + \frac{1}{x_2} + \frac{x_1}{x_2} + \frac{x_2}{x_1} өрнектің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "10"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадрат теңдеулер", "Виет теоремасы"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"y = x \sin x функциясының анықталу облысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "[-1; 1]"},
            {"label": "B", "text": r"(-\infty; +\infty)"},
            {"label": "C", "text": r"(-\infty; -1) \cup (1; +\infty)"},
            {"label": "D", "text": r"(-\infty; -1] \cup [1; +\infty)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Анықталу облысы", "Тригонометрия"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"Суретте берілген шеңбердің центрі O нүктесі. ABO үшбұрышы қабырғасы b-ға тең дұрыс үшбұрыш, BC доға ұзындығын b арқылы өрнектеңіз (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{b}{2}"},
            {"label": "B", "text": r"\frac{b}{6}"},
            {"label": "C", "text": r"\frac{b}{3}"},
            {"label": "D", "text": r"\frac{b}{4}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Доға ұзындығы"],
        "image_filename": "v23_q22_circle_triangle.png",
    },
    # 23
    {
        "slot_index": 23,
        "text": r"200-ден аспайтын 3-ке еселі сандардың қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6030"},
            {"label": "B", "text": "6633"},
            {"label": "C", "text": "6500"},
            {"label": "D", "text": "6363"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия", "Бөлінгіштік"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"Нүкте түзусызықты s(t) = 5t + 7t^2 - t^3 заңымен қозғалады. t = 2\text{ с} мезетіндегі нүктенің үдеуін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "1"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Қозғалыс заңы"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"Сфера центрінің әр жағында жататын қималарының аудандары 9\pi және 16\pi, ал олардың арақашықтығы 7 см. Сфера радиусын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "7"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "6"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера", "Шар қимасы"],
        "image_filename": None,
    },
    # 26 (Context)
    {
        "slot_index": 26,
        "text": (
            r"Фибоначчи ағашы" "\n"
            r"Бірінші қатарда 1 бұтақ, екінші қатарда 2 бұтақ, ал келесілері алдыңғы екеуінің қосындысына тең болатын Фибоначчи ағашы берілген. Бірінші қатардағы бұтақтың биіктігі 55 см. Әрбір келесі қатарда бұтақтың биіктігі 5 см-ге кеміп отырады." "\n\n"
            r"144 бұтақ қай қатарда орналасқанын табыңыз"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "11"},
            {"label": "D", "text": "13"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Алгебра", "Тізбектер", "Фибоначчи сандары"],
        "image_filename": "v23_q26_fibonacci_tree.png",
    },
    # 27 (Context)
    {
        "slot_index": 27,
        "text": (
            r"Фибоначчи ағашы" "\n"
            r"Бірінші қатарда 1 бұтақ, екінші қатарда 2 бұтақ, ал келесілері алдыңғы екеуінің қосындысына тең болатын Фибоначчи ағашы берілген. Бірінші қатардағы бұтақтың биіктігі 55 см. Әрбір келесі қатарда бұтақтың биіктігі 5 см-ге кеміп отырады." "\n\n"
            r"8-ші қатардағы бұтақ санын табыңыз"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "34"},
            {"label": "B", "text": "55"},
            {"label": "C", "text": "32"},
            {"label": "D", "text": "45"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Алгебра", "Тізбектер", "Фибоначчи сандары"],
        "image_filename": "v23_q26_fibonacci_tree.png",
    },
    # 28 (Context)
    {
        "slot_index": 28,
        "text": (
            r"Фибоначчи ағашы" "\n"
            r"Бірінші қатарда 1 бұтақ, екінші қатарда 2 бұтақ, ал келесілері алдыңғы екеуінің қосындысына тең болатын Фибоначчи ағашы берілген. Бірінші қатардағы бұтақтың биіктігі 55 см. Әрбір келесі қатарда бұтақтың биіктігі 5 см-ге кеміп отырады." "\n\n"
            r"Заңдылықты анықтайтын формуланы көрсетіңіз"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"a_n = a_{n+2} + a_{n-1}"},
            {"label": "B", "text": r"a_n = a_{n-1} + a_{n+1}"},
            {"label": "C", "text": r"a_n = a_{n-2} + a_{n-1}"},
            {"label": "D", "text": r"a_n = a_{n-2} - a_{n-1}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Алгебра", "Тізбектер", "Фибоначчи сандары"],
        "image_filename": "v23_q26_fibonacci_tree.png",
    },
    # 29 (Context)
    {
        "slot_index": 29,
        "text": (
            r"Фибоначчи ағашы" "\n"
            r"Бірінші қатарда 1 бұтақ, екінші қатарда 2 бұтақ, ал келесілері алдыңғы екеуінің қосындысына тең болатын Фибоначчи ағашы берілген. Бірінші қатардағы бұтақтың биіктігі 55 см. Әрбір келесі қатарда бұтақтың биіктігі 5 см-ге кеміп отырады." "\n\n"
            r"6-шы қатардағы бұтақтардың биіктігін табыңыз"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "40"},
            {"label": "B", "text": "45"},
            {"label": "C", "text": "35"},
            {"label": "D", "text": "30"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Алгебра", "Прогрессия", "Фибоначчи сандары"],
        "image_filename": "v23_q26_fibonacci_tree.png",
    },
    # 30 (Context)
    {
        "slot_index": 30,
        "text": (
            r"Фибоначчи ағашы" "\n"
            r"Бірінші қатарда 1 бұтақ, екінші қатарда 2 бұтақ, ал келесілері алдыңғы екеуінің қосындысына тең болатын Фибоначчи ағашы берілген. Бірінші қатардағы бұтақтың биіктігі 55 см. Әрбір келесі қатарда бұтақтың биіктігі 5 см-ге кеміп отырады." "\n\n"
            r"Ағаштың жалпы ұзындығын табыңыз"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "310"},
            {"label": "B", "text": "230"},
            {"label": "C", "text": "330"},
            {"label": "D", "text": "240"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Алгебра", "Прогрессия", "Фибоначчи сандары"],
        "image_filename": "v23_q26_fibonacci_tree.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"Екі натурал санның айырмасы 2-ге тең. Егер үлкен санға екінші санның квадратын көбейтсек, үлкен саннан 40-қа артық болады. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "3"},
        ],
        "subquestions": [
            {"text": "үлкен сан", "correct": "B"},
            {"text": "кіші сан", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Мәтіндік есептер", "Теңдеулер"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"Үшбұрыштың бұрыштары 2:3:4 сандарына тура пропорционал екені белгілі. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"40^\circ"},
            {"label": "B", "text": r"50^\circ"},
            {"label": "C", "text": r"70^\circ"},
            {"label": "D", "text": r"80^\circ"},
        ],
        "subquestions": [
            {"text": "Үшбұрыштың үлкен бұрышы", "correct": "D"},
            {"text": "Үшбұрыштың кіші бұрышы", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Үшбұрыш"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"Арифметикалық прогрессия берілген: 1; 6; 11; 16; \dots Егер a_n = 496 болса, онда мүшелер саны n мен S_n қосындысын анықтап, келесі өрнектерді мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "10000"},
            {"label": "B", "text": "12500"},
            {"label": "C", "text": "16000"},
            {"label": "D", "text": "24000"},
        ],
        "subquestions": [
            {"text": r"S_n - 850", "correct": "D"},
            {"text": r"100n", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"(9k + 11 + 2m + n)(9k - 2m + 11 - n) - 9k(9k + 22) + 4m(m + n) өрнегі берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "21"},
        ],
        "subquestions": [
            {"text": r"n = 11\text{ болғандағы мәні}", "correct": "A"},
            {"text": r"n = 10\text{ болғандағы мәні}", "correct": "D"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Өрнекті ықшамдау", "Көпмүшелер"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"(x^2 + 2x - 1)(x^2 + 2x + 2) = -2 теңдеуі берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-5"},
            {"label": "B", "text": "-3"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "-1"},
        ],
        "subquestions": [
            {"text": "Теңдеу түбірлерінің қосындысы", "correct": "B"},
            {"text": "Теңдеудің ең кіші түбірі", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Теңдеулер", "Квадрат теңдеулер"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Арифметикалық прогрессияның екінші мүшесі 8-ге тең, ал бесінші мүшесі 23-ке тең. Прогрессияның айырымы мен бірінші мүшесін табыңыз.",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "2"},
            {"label": "E", "text": "9"},
            {"label": "F", "text": "7"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"y = \frac{1}{4}\sin\left(3x + \frac{\pi}{7}\right) функциясының мәндер облысын табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\left[-\frac{1}{2}; \frac{1}{2}\right]"},
            {"label": "B", "text": r"(-0,4; 0,4)"},
            {"label": "C", "text": r"[-0,25; 0,25]"},
            {"label": "D", "text": r"(-0,5; 0,5)"},
            {"label": "E", "text": r"\left(-\frac{1}{5}; \frac{1}{5}\right)"},
            {"label": "F", "text": r"\left[-\frac{1}{4}; \frac{1}{4}\right]"},
        ],
        "answer": '["C", "F"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функция", "Мәндер жиыны"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"\begin{cases} \sqrt{x+y} = 7 \\ \sqrt{x-y} = \sqrt{3} \end{cases} теңдеулер жүйесінің шешімі (x_0; y_0) сандар жұбы болса, x_0 және y_0 сандарының мәндері",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "25"},
            {"label": "B", "text": "26"},
            {"label": "C", "text": "22"},
            {"label": "D", "text": "23"},
            {"label": "E", "text": "20"},
            {"label": "F", "text": "21"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"Қиық конустың табандарының аудандарының қатынасы 1:36. Остік қимасының диагоналі 35, биіктігі 21. Бүйір бетінің ауданы мен толық бетінің ауданын табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"696\pi"},
            {"label": "B", "text": r"1608\pi"},
            {"label": "C", "text": r"812\pi"},
            {"label": "D", "text": r"840\pi"},
            {"label": "E", "text": r"1203\pi"},
            {"label": "F", "text": r"1404\pi"},
        ],
        "answer": '["C", "F"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус", "Қиық конус"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\vec{a} векторы \vec{b} = (-1; 2; -2) векторына коллинеар және Oz осімен сүйір бұрыш жасайды. |\vec{a}| = 129. \vec{a} векторының координаталары бола алатын сандарды көрсетіңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "-43"},
            {"label": "B", "text": "43"},
            {"label": "C", "text": "86"},
            {"label": "D", "text": "-38"},
            {"label": "E", "text": "-86"},
            {"label": "F", "text": "68"},
        ],
        "answer": '["B", "C", "E"]',
        "topics": ["ҰБТ есебі", "Векторлар", "Кеңістіктегі геометрия", "Стереометрия"],
        "image_filename": None,
    },
]

async def import_variant():
    db_url = get_db_url()
    if not db_url:
        print("Error: DATABASE_URL not found in .env.prod.test", flush=True)
        return

    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    # Get folder 11 or 'ҰБТ есептері'
    folders = await db.trial_tests.get_trial_test_folders(include_empty=True)
    ubt_folder = next((f for f in folders if f['id'] == 11 or f['name'] == 'ҰБТ есептері'), None)
    if not ubt_folder:
        print("Folder 'ҰБТ есептері' not found, creating...", flush=True)
        ubt_folder = await db.trial_tests.create_trial_test_folder(name='ҰБТ есептері', sort_order=1)
    
    folder_id = ubt_folder['id']
    print(f"Target folder ID: {folder_id} ({ubt_folder['name']})", flush=True)

    test_title = "23-нұсқа: Фибанначи сандары"
    test_desc = "ҰБТ 23-нұсқа математика тапсырмалары (Контекст: Фибанначи сандары)"

    # Check if test already exists in folder
    tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = None
    for t in tests:
        if t['title'] == test_title or t['title'].startswith("23-нұсқа"):
            target_test = t
            break

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description=test_desc,
            sort_order=23,
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
                    source="ubt_import_v23",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 23 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
