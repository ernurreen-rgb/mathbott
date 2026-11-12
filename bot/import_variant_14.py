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

context_header = (
    r"**Призма**" + "\n\n"
    + r"Өлшемдері 4 дм, 4 дм, 12 дм болатын, төбесі ашық дұрыс төртбұрышты призма тәріздес ыдысқа "
    + r"диаметрі 2 дм болатын үш металл шар тасталды. A кранынан осы ыдысқа су құйылады. (\pi \approx 3)"
)

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"Радиусы 3 см, биіктігі 4 см болатын цилиндрдің бүйір бетінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "24"},
            {"label": "B", "text": r"12\pi"},
            {"label": "C", "text": r"24\pi"},
            {"label": "D", "text": "12"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"y = \frac{x^3}{3} - 1 функциясына жүргізілген жанама y = 16x - 1 түзуіне параллель болатын нүктенің абсциссасын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\pm 5"},
            {"label": "B", "text": r"\pm 1"},
            {"label": "C", "text": r"\pm 2"},
            {"label": "D", "text": r"\pm 4"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Жанама теңдеуі"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"\arccos(1 - 2x) = \frac{\pi}{2} теңдеуінің шешімі жататын аралықты табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(0; 1)"},
            {"label": "B", "text": r"\left(\frac{1}{2}; 1\right)"},
            {"label": "C", "text": r"\left[-\frac{1}{2}; \frac{1}{2}\right)"},
            {"label": "D", "text": "(1; 2)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометрия", "Теңдеу"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"Сөйлемді толықтырыңыз: «Өзара кері функциялардың графиктері ... қатысты симметриялы орналасады.»",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "Ox осіне"},
            {"label": "B", "text": "O(0; 0) бас нүктесіне"},
            {"label": "C", "text": "y = x түзуіне"},
            {"label": "D", "text": "Oy осіне"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Кері функция"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"2^x + 2^{x+1} + 2^{x+2} = 56 теңдеуінің шешімі x_0 болса, x_0^2 + 2x_0 өрнегінің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "14"},
            {"label": "B", "text": "15"},
            {"label": "C", "text": "18"},
            {"label": "D", "text": "20"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеу"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"-8(3 + 5a - 2b) - (-4a + 5b) өрнегін ықшамдаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-36a + 11b - 24"},
            {"label": "B", "text": "36a - 11b - 24"},
            {"label": "C", "text": "-44a + 21b - 24"},
            {"label": "D", "text": "44a - 21b - 24"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"ABCDA_1B_1C_1D_1 параллелепипеді берілген. B_1D диагоналінің ұзындығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": r"\sqrt{3}"},
            {"label": "C", "text": r"2\sqrt{3}"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Параллелепипед"],
        "image_filename": "v14_q07_parallelepiped.png",
    },
    # 8
    {
        "slot_index": 8,
        "text": r"Суреттегі боялған күлгін аймақтың нүктелер жиынын анықтайтын теңсіздікті табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x^2 + y^2 \ge 9"},
            {"label": "B", "text": r"x^2 + y^2 \le 3"},
            {"label": "C", "text": r"x^2 + y^2 \ge 3"},
            {"label": "D", "text": r"x^2 + y^2 \le 9"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Аналитикалық геометрия", "Шеңбер теңдеуі"],
        "image_filename": "v14_q08_circle_region.png",
    },
    # 9
    {
        "slot_index": 9,
        "text": r"Канондық түрде берілген \frac{x-2}{3} = \frac{y+1}{-2} = z + 4 түзуіне параллель және A(-1; 0; 5) нүктесінен өтетін түзудің параметрлі түрде берілуін жазыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\begin{cases} x = 2 + 3t \\ y = 2t \\ z = -4 + t \end{cases}"},
            {"label": "B", "text": r"\begin{cases} x = -1 - 3t \\ y = 2t \\ z = 5 + t \end{cases}"},
            {"label": "C", "text": r"\begin{cases} x = -1 + 3t \\ y = -2t \\ z = 5 + t \end{cases}"},
            {"label": "D", "text": r"\begin{cases} x = 1 + 3t \\ y = -2t \\ z = -5 + t \end{cases}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Аналитикалық геометрия", "Кеңістіктегі түзу"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"Геометриялық прогрессияда b_5 = -6, b_8 = 162 болса, екінші және төртінші мүшелерінің қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\frac{2}{9}"},
            {"label": "B", "text": r"1\frac{4}{9}"},
            {"label": "C", "text": r"2\frac{4}{9}"},
            {"label": "D", "text": r"1\frac{2}{9}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"(x_0; y_0) сандар жұбы \begin{cases} x + y = -4 \\ x^2 - y^2 = 32 \end{cases} теңдеулер жүйесінің шешімі болса, x_0 \cdot y_0 өрнегінің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-8"},
            {"label": "B", "text": "-12"},
            {"label": "C", "text": "-6"},
            {"label": "D", "text": "-10"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"y = ax^2 функциясы A(-4; 32) және B(3; n) нүктелері арқылы өтеді. n-нің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "18"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Парабола"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"0,0225 + 0,3a + a^2 өрнегінің мәнін табыңыз, мұндағы a = 3,85",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "16"},
            {"label": "C", "text": "22"},
            {"label": "D", "text": "25"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Қысқаша көбейту формулалары"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"Радиусы 6-ға тең шеңбер бойынан A және B нүктелері алынған. A нүктесі арқылы AC жанамасы жүргізілген. BAC бұрышы 60^\circ-қа тең болса, AB доғасының ұзындығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"4\pi"},
            {"label": "B", "text": r"12\pi"},
            {"label": "C", "text": r"8\pi"},
            {"label": "D", "text": r"6\pi"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Доға ұзындығы"],
        "image_filename": "v14_q14_circle_tangent.png",
    },
    # 15
    {
        "slot_index": 15,
        "text": r"\frac{\log_3 x - 1}{\log_3 \frac{x}{3}} - 2 \log_3 \sqrt{x} + \log_3^2 x = 3 теңдеуінің түбірлерінің көбейтіндісін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "9"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеу"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"Суретте функция туындысының графигі берілген. f(x) функциясының өсу аралығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"[0; 1], [4; +\infty)"},
            {"label": "B", "text": r"[0; 1], [4; 5]"},
            {"label": "C", "text": r"[0; 2], [4; +\infty)"},
            {"label": "D", "text": r"[0; 1], [3; +\infty)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Функцияның өсу аралығы"],
        "image_filename": "v14_q16_derivative_graph.png",
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Тікбұрышты үшбұрыштың катеттері 10 см және 24 см. Үлкен катеттің гипотенузадағы проекциясын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"3\frac{11}{13}"},
            {"label": "B", "text": r"21\frac{1}{12}"},
            {"label": "C", "text": r"9\frac{11}{26}"},
            {"label": "D", "text": r"22\frac{2}{13}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"Есептеңіз: \arcsin\left(-\frac{\sqrt{3}}{2}\right) - \operatorname{arctg}\sqrt{3}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": r"-\frac{2\pi}{3}"},
            {"label": "C", "text": r"\frac{2\pi}{3}"},
            {"label": "D", "text": r"-\frac{\pi}{3}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометрия"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"y = kx - 4 түзуі y = x^2 - 9x параболасын екі нүктеде қиып өтетіндей k-ның мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; -13) \cup (-5; +\infty)"},
            {"label": "B", "text": r"(-\infty; -4) \cup (4; +\infty)"},
            {"label": "C", "text": r"(-\infty; -5) \cup (5; +\infty)"},
            {"label": "D", "text": r"(-\infty; -13) \cup (4; +\infty)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Парабола", "Түзу", "Квадрат теңдеу"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"Табанына түсірілген биіктігі 2 см, ал табаны 3 см-ге тең, теңбүйірлі үшбұрыштың қабырғаларының қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "8"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Үшбұрыш"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\sqrt{50} - 4\sqrt{72} + 3\sqrt{32} мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": r"-7\sqrt{2}"},
            {"label": "C", "text": r"14\sqrt{2}"},
            {"label": "D", "text": r"-5\sqrt{2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Арифметика", "Түбірлер"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"(a; b), (c; d) берілген \begin{cases} x + 2y = 6 \\ xy = 4 \end{cases} теңдеулер жүйесінің шешімдері болса, a + b + c + d өрнегінің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "7"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"|x^2 + 2x| + 1 = 0 теңдеуін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "шешімі жоқ"},
            {"label": "B", "text": "-1; 1"},
            {"label": "C", "text": "1; 2"},
            {"label": "D", "text": "0"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Модуль", "Модульдік теңдеу"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\begin{cases} x^2 + 3x - 4 < 0 \\ x^2 + 3x + 2 < 0 \end{cases} теңсіздіктер жүйесін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(-1; 1)"},
            {"label": "B", "text": "(-2; 0)"},
            {"label": "C", "text": "(1; 2)"},
            {"label": "D", "text": "(-2; -1)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жүйесі", "Квадрат теңсіздік"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"y = 4x^2 - 5x + 3 функциясына x_0 нүктесінде жүргізілген жанама Ox осінің оң бағытымен жасайтын бұрышының тангенсі 11-ге тең болса, x_0 нүктесін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-3"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Жанаманың бұрыштық коэффициенті"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": context_header + "\n\n" + r"Бір шардың көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"16\text{ дм}^3"},
            {"label": "B", "text": r"4\text{ дм}^3"},
            {"label": "C", "text": r"6\text{ дм}^3"},
            {"label": "D", "text": r"12\text{ дм}^3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Шар", "Көлем"],
        "image_filename": "v14_q26_prisma.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": context_header + "\n\n" + r"Ыдыстың көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"192\text{ дм}^3"},
            {"label": "B", "text": r"198\text{ дм}^3"},
            {"label": "C", "text": r"162\text{ дм}^3"},
            {"label": "D", "text": r"172\text{ дм}^3"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Призма", "Көлем"],
        "image_filename": "v14_q26_prisma.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": context_header + "\n\n" + r"Үш шарлы ыдысты А краны арқылы сумен толтыру үшін қажетті судың көлемі",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "160 л"},
            {"label": "B", "text": "152 л"},
            {"label": "C", "text": "150 л"},
            {"label": "D", "text": "180 л"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Қолданбалы есептер"],
        "image_filename": "v14_q26_prisma.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": context_header + "\n\n" + r"Егер үш шары бар ыдысты шармен толтырсақ, диаметрі сондай кем дегенде неше шар тастау керек",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "20"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": "22"},
            {"label": "D", "text": "21"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Логика"],
        "image_filename": "v14_q26_prisma.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": context_header + "\n\n" + r"Егер ыдысты диаметрі 2 дм болатын шармен толтырып, бос қалған бөлікті сумен толтырса, су көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "100 л"},
            {"label": "B", "text": "95 л"},
            {"label": "C", "text": "96 л"},
            {"label": "D", "text": "98 л"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Шар", "Көлем"],
        "image_filename": "v14_q26_prisma.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"Сурет бойынша мәндерді сәйкестендіріңіз:",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-5"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "-4"},
            {"label": "D", "text": "4"},
        ],
        "subquestions": [
            {"text": "y = -5 болғандағы абсциссаның мәні", "correct": "B"},
            {"text": "x = -2 ординатаның мәні", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Функция", "График"],
        "image_filename": "v14_q31_function_graph.png",
    },
    # 32
    {
        "slot_index": 32,
        "text": r"2\left(x + \frac{1}{x}\right) + 1 = \left(x^2 + \frac{1}{x^2}\right) теңдеуінің түбірлері x_1 < x_2 шартын қанағаттандырса, x_1 және x_2 мәндерін дұрыс жауаптарымен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"1,5 + 0,5\sqrt{5}"},
            {"label": "B", "text": r"0,5 - 1,5\sqrt{5}"},
            {"label": "C", "text": r"1,5 - 0,5\sqrt{5}"},
            {"label": "D", "text": r"0,5 + 1,5\sqrt{5}"},
        ],
        "subquestions": [
            {"text": "x_1", "correct": "C"},
            {"text": "x_2", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Рационал теңдеу"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"Қабырғасы 8 см, биіктігі бір қабырғасымен 60^\circ бұрыш жасайтын ромбтың биіктігі мен іштей сызылған шеңбердің радиусын табыңыз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "2"},
        ],
        "subquestions": [
            {"text": "h", "correct": "B"},
            {"text": "r", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Ромб"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"Өспелі \{a_n\} арифметикалық прогрессияда a_2 \cdot a_4 = -20, a_1 + a_5 = 8 болса, алғашқы алты мүшесінің қосындысы мен тоғызыншы мүшесін дұрыс жауаптарымен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "40"},
            {"label": "B", "text": "44"},
            {"label": "C", "text": "46"},
            {"label": "D", "text": "42"},
        ],
        "subquestions": [
            {"text": "S_6", "correct": "D"},
            {"text": "a_9", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"4x^2 - 5x + c = 0 теңдеуіндегі c-ның қандай мәнінде:",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": r"1\frac{9}{16}"},
            {"label": "C", "text": r"\frac{23}{16}"},
            {"label": "D", "text": "1"},
        ],
        "subquestions": [
            {"text": "бір түбірі 1-ге тең", "correct": "D"},
            {"text": "дискриминант 0-ге тең", "correct": "B"},
        ],
        "answer": '["D", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Квадрат теңдеу", "Дискриминант"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\operatorname{ctg}\frac{\pi}{6} - \sin\frac{2\pi}{3}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{3}}{2}"},
            {"label": "B", "text": r"\frac{1}{2}"},
            {"label": "C", "text": r"\frac{\sqrt{3}}{4}"},
            {"label": "D", "text": "0,5"},
            {"label": "E", "text": r"\sqrt{\frac{3}{4}}"},
            {"label": "F", "text": r"\sqrt{\frac{3}{16}}"},
        ],
        "answer": '["A", "E"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық өрнектер"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"Суреттегі мәліметтер бойынша қималардың арақашықтығын, шар центрінен қималарға дейінгі арақашықтықты табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "13"},
            {"label": "C", "text": "17"},
            {"label": "D", "text": "16"},
            {"label": "E", "text": "5"},
            {"label": "F", "text": "9"},
        ],
        "answer": '["A", "C", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Шар", "Қима"],
        "image_filename": "v14_q37_sphere_sections.png",
    },
    # 38
    {
        "slot_index": 38,
        "text": r"(x_0; y_0) сандар жұбы \begin{cases} 2^x 3^y = 108 \\ 2^y 3^x = 72 \end{cases} теңдеулер жүйесінің шешімі болса, x_0 + y_0 және x_0 \cdot y_0 мәндерін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "8"},
            {"label": "E", "text": "6"},
            {"label": "F", "text": "2"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеу", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"a параметрінің қандай мәнінде \frac{4-x}{49a^2 - x^2} өрнегінің мүмкін мәндер жиыны (-\infty; -7) \cup (-7; 7) \cup (7; +\infty) аралығына тиісті",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "-7"},
            {"label": "E", "text": "-1"},
            {"label": "F", "text": "2"},
        ],
        "answer": '["B", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Анықталу облысы", "Параметр"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\frac{1}{4} + \frac{1}{8} + \frac{1}{16} + \dots + \frac{1}{2^{n+1}} + \dots қосындысының мәні жатқан аралықтар",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "(0,5; 1)"},
            {"label": "B", "text": "(-1; 2)"},
            {"label": "C", "text": "(0; 1)"},
            {"label": "D", "text": "(-1; 0,5)"},
            {"label": "E", "text": "(0,5; 2)"},
            {"label": "F", "text": "(-2; 1,5)"},
        ],
        "answer": '["B", "C", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
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

    test_title = "14-нұсқа: Призма"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 14-нұсқа математика тапсырмалары (Контекст: Призма)",
            sort_order=14,
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
                    source="ubt_import_v14",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 14 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
