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

CONTEXT_TEXT = (
    "**Банк картасы**\n\n"
    "Банк картасының алдыңғы бетінде төрт-төрттен тұратын 16 цифр жазылады. "
    "Ең соңғы цифры – тексеруші сан деп аталады. Ол цифр алдыңғы цифрларға тәуелді.\n"
    "Мысал ретінде, мына Банк картасының 0485 0554 9919 033? тексеруші цифрын табайық:\n"
    "1. Алдымен тізбек түрінде жазамыз: 0 4 8 5 0 5 5 4 9 9 1 9 0 3 3\n"
    "2. Тақ орындағы цифрларды екіге көбейтеміз, ал жұп орындағы сандардың өзін жазамыз: 0 4 16 5 0 5 10 4 18 9 2 9 0 3 6\n"
    "3. Егер көбейтудің мәндері 9-дан артық болса, онда ол саннан 9-ды азайтамыз: 0 4 7 5 0 5 1 4 9 9 2 9 0 3 6\n"
    "4. Барлық цифрларды қосамыз: 0 + 4 + 7 + 5 + 0 + 5 + 1 + 4 + 9 + 9 + 2 + 9 + 0 + 3 + 6 = 64\n"
    "5. Шыққан санымыз 10-ға бүтіндей бөліну үшін цифр қосамыз: 64 + 6 = 70. Осы 6 цифры картаның соңғы 16-шы цифры болады."
)

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"Шаршыға іштей және сырттай сызылған шеңбер радиустарының қатынасы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": r"2\sqrt{2}"},
            {"label": "C", "text": r"\frac{\sqrt{2}}{2}"},
            {"label": "D", "text": r"\frac{\sqrt{2}}{4}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шаршы", "Шеңбер"],
        "image_filename": "v11_q01_circles.png",
    },
    # 2
    {
        "slot_index": 2,
        "text": r"2(x^2 - 6x + 13)^{\log_2(x+1)} + (x + 1)^{\log_2(x^2 - 6x + 13)} = 3x^3 + 9x^2 + 9x + 3 теңдеудің түбірлерінің қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеу", "Көрсеткіштік теңдеу"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"5^{x+1} - 8^{x+1} = 0 теңдеуді шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеу"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"y = x^2, y = 2x сызықтармен шектелген фигураның ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{2}{3}"},
            {"label": "B", "text": r"1\frac{2}{3}"},
            {"label": "C", "text": r"1\frac{1}{3}"},
            {"label": "D", "text": r"\frac{3}{4}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Анықталған интеграл", "Фигура ауданы"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"\int \frac{x^2+2x+3}{x+2} dx есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{x^2}{x+2} - 3\ln|x+2| + C"},
            {"label": "B", "text": r"\frac{x^2}{2} + 3\ln|x+2| + C"},
            {"label": "C", "text": r"\frac{x^2}{2} - 3\ln|x+2| + C"},
            {"label": "D", "text": r"x^2 + 2x + 3\ln|x+2| + C"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Анықталмаған интеграл"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\begin{cases} \log_x y - \log_y x = \frac{8}{3} \\ xy = 81 \end{cases} теңдеулер жүйесін шешіп, \sqrt{\frac{x}{y}} мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{3}; \frac{1}{9}"},
            {"label": "B", "text": r"\frac{1}{3}; \frac{1}{27}"},
            {"label": "C", "text": r"\frac{1}{3}; \frac{1}{4}"},
            {"label": "D", "text": r"\frac{1}{3}; \frac{1}{81}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"Қыры 1-ге тең дұрыс алтыбұрышты призманың ең үлкен диагоналін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{3}"},
            {"label": "B", "text": r"\sqrt{7}"},
            {"label": "C", "text": r"\sqrt{5}"},
            {"label": "D", "text": r"\sqrt{11}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"y \le 3 - 2x теңсіздігін қанағаттандыратын сандар жұбын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(1; 3)"},
            {"label": "B", "text": "(3; 1)"},
            {"label": "C", "text": "(1; 0)"},
            {"label": "D", "text": "(2; 2)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Сызықтық теңсіздік"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"\begin{cases} x^2 - 16 \le 0 \\ x^2 - 5x + 6 \ge 0 \end{cases} теңсіздіктер жүйесінің бүтін шешімдерінің санын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": "8"},
            {"label": "D", "text": "7"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жүйесі", "Квадрат теңсіздік"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"A(2; -1; 3), B(-3; 4; 1), C(0; 2; 5). (2\vec{AB} + 3\vec{BC}) \cdot (\vec{BA} - 2\vec{AC}) скаляр көбейтіндісін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "69"},
            {"label": "B", "text": "-69"},
            {"label": "C", "text": "51"},
            {"label": "D", "text": "-51"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Скаляр көбейтінді"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"y = m a^x функциясы берілген. Егер f(0) = 3, f(1) = 12 болса, m + a мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "7"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік функция"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"y = x^2 - 4 функциясына x_0 = 1 нүктесінде жүргізілген жанаманың теңдеуін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = -2x - 5"},
            {"label": "B", "text": r"y = 2x - 3"},
            {"label": "C", "text": r"y = -2x + 7"},
            {"label": "D", "text": r"y = 2x - 5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Жанаманың теңдеуі"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"\overline{abba} + \overline{aba} = \overline{b6a4} болса, |a - b| өрнегінің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "3"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Арифметика", "Сандар теориясы"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"f(x) = x^4 - 6x^2 + 1 функциясының [-1; 3] аралығындағы ең үлкен мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "38"},
            {"label": "B", "text": "17"},
            {"label": "C", "text": "32"},
            {"label": "D", "text": "28"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Функцияның ең үлкен мәні"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Үшбұрышты призманың табаны қабырғалары 5 см, 5 см және 8 см болатын теңбүйірлі үшбұрыш. Призма биіктігі табанының кіші биіктігіне тең. Призманың толық бетінің ауданын табыңыз.",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "96"},
            {"label": "B", "text": "78"},
            {"label": "C", "text": "84"},
            {"label": "D", "text": "64"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Толық бет ауданы"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"Радиусы 17 см шеңбердің бойынан алынған AB доғасы 150^\circ-қа тең. AB доғасының ұзындығын табыңыз.",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{83\pi}{18}"},
            {"label": "B", "text": r"\frac{17\pi}{6}"},
            {"label": "C", "text": r"\frac{85\pi}{6}"},
            {"label": "D", "text": r"\frac{82\pi}{17}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Доға ұзындығы"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Егер (x_0; y_0) сандар жұбы \begin{cases} \sqrt{0,2}^{\log_{\frac{1}{25}}(3x - y)} = 2 \\ \log_{\sqrt{2}}(y - x) = 4 \end{cases} теңдеудің шешімдері болса, x_0 \cdot y_0 мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "24"},
            {"label": "B", "text": "48"},
            {"label": "C", "text": "140"},
            {"label": "D", "text": "100"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\operatorname{arctg}(-\sqrt{3}) - \operatorname{arcctg}(-\sqrt{3}) есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-\frac{7\pi}{6}"},
            {"label": "B", "text": r"-\frac{\pi}{6}"},
            {"label": "C", "text": r"-\frac{2\pi}{3}"},
            {"label": "D", "text": "0"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"y = 2\sin x - 2\cos 2x + 5 ең кіші оң периодын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\pi"},
            {"label": "B", "text": r"2\pi"},
            {"label": "C", "text": r"\frac{\pi}{2}"},
            {"label": "D", "text": r"\frac{3\pi}{2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функцияның периоды"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"x^{\log_3 x - 2} = 27 теңдеудің түбірлерінің көбейтіндісін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "9"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеу"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Цилиндр табанының диаметрі 10-ға тең. Цилиндрдің осінен қашықтығы 3-ке тең цилиндрдің осіне параллель қима жүргізілген. Қиманың диагоналі 8\sqrt{2}-ге тең. Қиманың ауданын табыңыз.",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "16"},
            {"label": "B", "text": "64"},
            {"label": "C", "text": "81"},
            {"label": "D", "text": "100"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Қима ауданы"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"Центрлері O және O_1 болатын екі шеңбер C және D нүктелерінде қиылысады. Қиылысу нүктесінде үлкен шеңбердің \frac{1}{6} бөлігі және кіші шеңбердің \frac{1}{4} бөлігі бөлінеді. Пайда болған OCO_1 бұрышының мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"75^\circ"},
            {"label": "B", "text": r"60^\circ"},
            {"label": "C", "text": r"105^\circ"},
            {"label": "D", "text": r"120^\circ"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Бұрыш"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"3x^2 + 3 - (x + 1)^{\log_3(x - 2)} = 2(x - 2)^{\log_3(x + 1)} - 6x теңдеуін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "11"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "13"},
            {"label": "D", "text": "7"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеу"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\operatorname{tg}135^\circ + \operatorname{ctg}45^\circ - \cos 90^\circ есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": r"\sqrt{2}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық функциялардың мәндері"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"y = \operatorname{arctg}2x функциясының туындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y' = \frac{1}{1 + x^2}"},
            {"label": "B", "text": r"y' = \frac{1}{1 + 2x^2}"},
            {"label": "C", "text": r"y' = \frac{1}{1 + 4x^2}"},
            {"label": "D", "text": r"y' = \frac{2}{1 + 4x^2}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": CONTEXT_TEXT + "\n\n" + r"4003 0A51 2915 2596 банк картасындағы белгісіз A санын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "6"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Логика", "Арифметика"],
        "image_filename": "v11_q26_card.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": CONTEXT_TEXT + "\n\n" + r"Егер банк картасының алғашқы 15 цифры 4002 8900 3556 023 болса, онда тексеруші цифр",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "8"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Логика", "Арифметика"],
        "image_filename": "v11_q26_card.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": CONTEXT_TEXT + "\n\n" + r"C395 4597 9004 8383 банк картасының белгісіз C цифрын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "7"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Логика", "Арифметика"],
        "image_filename": "v11_q26_card.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": CONTEXT_TEXT + "\n\n" + r"4004 0343 ?716 184? банк картасының белгісіз мүмкін цифрларының ең үлкен қосындысы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "14"},
            {"label": "D", "text": "7"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Логика", "Арифметика"],
        "image_filename": "v11_q26_card.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": CONTEXT_TEXT + "\n\n" + r"5069 860X X71X 5073 банк картасының белгісіз X санын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "6"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Логика", "Арифметика"],
        "image_filename": "v11_q26_card.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"Катеттері 3 см және 4 см тікбұрышты үшбұрышты катеттеріне айналдырғанда пайда болған айналу денесінің бүйір бет аудандарын сан мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"15\pi"},
            {"label": "B", "text": r"16\pi"},
            {"label": "C", "text": r"20\pi"},
            {"label": "D", "text": r"18\pi"},
        ],
        "subquestions": [
            {"text": "Үлкен катетінен айналдырған дененің бүйір бет ауданы", "correct": "A"},
            {"text": "Кіші катетінен айналдырған дененің бүйір бет ауданы", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Конус"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"(2x + 1)(5x^2 - x + 1) = 10x^3 + Ax^2 + Bx + C теңбе-теңдігі бойынша белгісіз коэффициенттерді сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "5"},
        ],
        "subquestions": [
            {"text": "A коэффициент", "correct": "A"},
            {"text": "B коэффициент", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Көпмүшелер"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"A(2; 1; 0) және B(3; 0; 5) нүктелері берілген. AB кесіндісінің ұзындығы мен оны 1:2 қатынасында бөлетін C нүктесінің координатасын сан мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"3\sqrt{3}"},
            {"label": "B", "text": r"3\sqrt{2}"},
            {"label": "C", "text": r"\left(\frac{7}{3}; \frac{2}{3}; \frac{5}{3}\right)"},
            {"label": "D", "text": r"\left(\frac{7}{3}; \frac{5}{3}; \frac{2}{3}\right)"},
        ],
        "subquestions": [
            {"text": "AB кесіндісінің ұзындығы", "correct": "A"},
            {"text": "C нүктесінің координатасы", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Аналитикалық геометрия", "Координаталар"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"Қабырғалары 4 см және 5 см тіктөртбұрышты қабырғаларынан айналдырғанда пайда болған дененің көлемдерін сан мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"70\pi"},
            {"label": "B", "text": r"80\pi"},
            {"label": "C", "text": r"90\pi"},
            {"label": "D", "text": r"100\pi"},
        ],
        "subquestions": [
            {"text": "Ұзын қабырғасынан айналдырғанда пайда болған дене көлемі", "correct": "B"},
            {"text": "Қысқа қабырғасынан айналдырғанда пайда болған дене көлемі", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Цилиндр"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"a_1, a_2, 11, a_4, a_5, 23 арифметикалық прогрессия берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "18"},
            {"label": "B", "text": "15"},
            {"label": "C", "text": "125"},
            {"label": "D", "text": "133"},
        ],
        "subquestions": [
            {"text": r"a_1 + a_4", "correct": "A"},
            {"text": r"a_2 \cdot a_5", "correct": "D"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\begin{cases} 2^{2\sqrt{x} - \sqrt{y}} = 16 \\ \log_5 \sqrt{xy} = 1 + \log_5 6 \end{cases} теңдеулер жүйесін шешіп, \sqrt{xy} пен \sqrt{x} + \sqrt{y} мәндерін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "11"},
            {"label": "B", "text": "15"},
            {"label": "C", "text": "25"},
            {"label": "D", "text": "18"},
            {"label": "E", "text": "30"},
            {"label": "F", "text": "40"},
        ],
        "answer": '["A", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер жүйесі", "Логарифм"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"Биіктігі 8, радиусы 5 болатын цилиндрдің осіне параллель ABCD қимасы жүргізілді, AB = 6. Осы цилиндрдің ішінен ауданы 64-ке тең, ABCD жазықтығына параллель жазықтық жүргізілді. Екі жазықтықтың арақашықтығына тең болатын жауап(-тар)",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "10"},
            {"label": "E", "text": "7"},
            {"label": "F", "text": "3"},
        ],
        "answer": '["B", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Қима"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"\log_{x+4}(2x^3 - x^2 + 4x + 7)\log_{x+1}(x+4) = 3 теңдеудің түбірлерінің санын табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": r"\sqrt{9}"},
            {"label": "E", "text": r"\sqrt{2}^2"},
            {"label": "F", "text": r"3^0"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеу"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"Дұрыс төртбұрышты пирамиданың диагоналдік қимасының ауданы 2-ге тең тікбұрышты үшбұрыш. Пирамиданың бүйір бетінің ауданын табыңыз.",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"4\sqrt{2}"},
            {"label": "B", "text": r"\sqrt{48}"},
            {"label": "C", "text": r"6\sqrt{3}"},
            {"label": "D", "text": r"4\sqrt{3}"},
            {"label": "E", "text": r"\sqrt{108}"},
            {"label": "F", "text": r"\sqrt{32}"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Бүйір бет ауданы"],
        "image_filename": "v11_q39_pyramid.png",
    },
    # 40
    {
        "slot_index": 40,
        "text": r"4 \ge |x^2 - x - 2| - x теңсіздіктің бүтін шешімдерін көрсетіңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "-2"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "-3"},
            {"label": "E", "text": "4"},
            {"label": "F", "text": "-1"},
        ],
        "answer": '["B", "C", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Модульді теңсіздік"],
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

    test_title = "11-нұсқа: Банк картасы"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 11-нұсқа математика тапсырмалары (Контекст: Банк картасы)",
            sort_order=11,
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
                    source="ubt_import_v11",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 11 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
