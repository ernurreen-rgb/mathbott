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
    "Айгүл денсаулығын жақсарту үшін күн сайын жаяу жүреді. "
    "Ол бірінші күні 2000 қадам жүрді. Келесі әр күн сайын қадам санын 1000-ға арттырып отырды. "
    "Айгүлдің қадам саны 10000-ға жеткен күні ол әр күн сайын тұрақты түрде 10000 қадамнан жүріп отырды. "
    "Айгүлдің әр қадамы 72 см-ге тең"
)

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"y = 3\arcsin(2x - 7) функциясының анықталу облысына тиісті ең кіші бүтін санды тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-7"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "3"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Анықталу облысы", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"\sqrt{\sqrt{\log_x^4 y + \log_y^4 x + 2} - 2} өрнекті ықшамда мұндағы 1 < x < y",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"|\log_x y - \log_y x|"},
            {"label": "B", "text": r"|\log_x y + \log_y x|"},
            {"label": "C", "text": r"2|\log_x y + \log_y x|"},
            {"label": "D", "text": r"-2\log_x y + \log_y x"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"Суретте берілген функцияға A(2; -1) нүктесінде жүргізілген жанаманың теңдеуін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "y = -2x + 3"},
            {"label": "B", "text": "y = -x + 1"},
            {"label": "C", "text": "y = 4x - 9"},
            {"label": "D", "text": "y = -3x + 5"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Жанама теңдеуі"],
        "image_filename": "v13_q03_tangent.png",
    },
    # 4
    {
        "slot_index": 4,
        "text": r"\int_1^2 \frac{dx}{x^2 - 6x + 9} есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "0,6"},
            {"label": "C", "text": "0,5"},
            {"label": "D", "text": "1"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Анықталған интеграл"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"4-ке еселі 170-тен аспайтын сандардың қосындысын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3850"},
            {"label": "B", "text": "3900"},
            {"label": "C", "text": "3600"},
            {"label": "D", "text": "3612"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"Шеңбердің \frac{1}{9}-іне тең доғаға тірелетін іштей сызылған бұрышты тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"20^\circ"},
            {"label": "B", "text": r"40^\circ"},
            {"label": "C", "text": r"60^\circ"},
            {"label": "D", "text": r"30^\circ"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Бұрыштар"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"Өспелі геометриялық прогрессия құрайтын үш санның қосындысы 0,7-ге тең, ал олардың көбейтіндісі 0,008 болса, прогрессияның еселігін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"f(x) = 4\sin 2x \cos 2x - \cos^2 x + \sin^2 x \text{ функциясы берілген. } f'\left(\frac{\pi}{4}\right) \text{ мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-4"},
            {"label": "B", "text": "-5"},
            {"label": "C", "text": "-6"},
            {"label": "D", "text": "-7"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Туынды", "Математикалық талдау"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"A(k; 2; -1), B(4; 3; 2), C(1; 5; 2) нүктелерінен құралған векторлар \vec{AB} \perp \vec{AC} болса, k-ның қабылдайтын мәндерінің қосындысын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Скаляр көбейтінді"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"Катеттері 3 см және 4 см тікбұрышты үшбұрышты катеттерінен айналдырғанда пайда болған денелердің көлемдерінің қатынасын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4:3"},
            {"label": "B", "text": "5:3"},
            {"label": "C", "text": "5:4"},
            {"label": "D", "text": "4:5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус", "Айналу денелері"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\begin{cases} \lg(x^2 + y^2) = 1 \\ \log_3 x + \log_3 y = 1 \end{cases} \text{ теңдеулер жүйесін шешіп, } 10(x_1 + x_2) - 2(y_1 + y_2) \text{ өрнегінің мәнін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "16"},
            {"label": "C", "text": "20"},
            {"label": "D", "text": "32"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Логарифмдік теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"Қиық конустың табан радиустары 2 см және 5 см. Егер конустың биіктігі радиустардың қосындысына тең болса, қиық конустың көлемін тап (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "273"},
            {"label": "B", "text": "260"},
            {"label": "C", "text": "270"},
            {"label": "D", "text": "265"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Қиық конус", "Көлем"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"Берілген функциялардан кемімелі функцияны тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \left(\frac{\pi}{3}\right)^x"},
            {"label": "B", "text": r"y = \left(\frac{e}{3}\right)^x"},
            {"label": "C", "text": r"y = \left(\frac{2}{3 - 2\sqrt{2}}\right)^x"},
            {"label": "D", "text": r"y = \left(\frac{2}{\sqrt{2} - 1}\right)^x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік функция", "Функция қасиеттері"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"Теңсіздікті шеш: |2\cos x| \le 1",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left[\frac{\pi}{4} + \pi n; \frac{3\pi}{4} + \pi n\right]"},
            {"label": "B", "text": r"\left[\frac{\pi}{6} + \pi n; \frac{5\pi}{6} + \pi n\right]"},
            {"label": "C", "text": r"\left[\frac{\pi}{3} + \pi n; \frac{2\pi}{3} + \pi n\right]"},
            {"label": "D", "text": r"[2\pi n; \pi + 2\pi n]"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңсіздік"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Сферадан тыс жатқан нүктеден осы сфераның бойында жатқан нүктелеріне дейінгі ең қысқа және ең ұзын қашықтықтар 3 см және 7 см. Сфера бетінің ауданын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"9\pi"},
            {"label": "B", "text": r"10\pi"},
            {"label": "C", "text": r"12\pi"},
            {"label": "D", "text": r"16\pi"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера", "Сфера ауданы"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"Суретте y = f'(x) графигі берілген. x_{\max} - ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "3"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Функцияның экстремумдары"],
        "image_filename": "v13_q16_derivative.png",
    },
    # 17
    {
        "slot_index": 17,
        "text": r"3^x = 7^{x^2} \text{ теңдеудің түбірлерінің қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\log_7 3"},
            {"label": "B", "text": r"\ln 3"},
            {"label": "C", "text": r"\log_3 7"},
            {"label": "D", "text": r"\ln 7"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеу", "Логарифм"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"Негізі 4 болғанда \sqrt[7]{8} санының логарифмі нешеге тең?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3}{4}"},
            {"label": "B", "text": r"\frac{4}{7}"},
            {"label": "C", "text": r"\frac{5}{7}"},
            {"label": "D", "text": r"\frac{3}{14}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифм қасиеттері"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"Егер f(x) = x^2 \sin\frac{\pi}{6} + 9x - 2025 берілген, f'(x) < 0 қанағаттандыратын ең үлкен бүтін санды тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-7"},
            {"label": "B", "text": "-9"},
            {"label": "C", "text": "-10"},
            {"label": "D", "text": "-8"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Теңсіздік"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"Дұрыс төртбұрышты пирамиданың диагональдық қимасы – қабырғасы 2 см болатын теңқабырғалы үшбұрыш. Осы пирамиданың көлемін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "B", "text": r"\frac{2\sqrt{3}}{3}"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Пирамида көлемі"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Графикті пайдаланып берілген функция теңдеуін жаз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "y = x^3 - 1,5"},
            {"label": "B", "text": "y = -x^3 + 2"},
            {"label": "C", "text": "y = x^3 + 2"},
            {"label": "D", "text": "y = -x^3 - 1,5"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар және графиктер", "Дәрежелік функция"],
        "image_filename": "v13_q21_graph.png",
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\left(\sqrt{4 - \sqrt{15}}\right)^x + \left(\sqrt{4 + \sqrt{15}}\right)^x = 8 \text{ теңдеудің түбірлерінің көбейтіндісін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-4"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "8"},
            {"label": "D", "text": "-8"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеу", "Иррационал теңдеу"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\int 4x e^{2x} dx \text{ интегралды тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(2x + 1)e^{2x} + C"},
            {"label": "B", "text": r"(4x + 1)e^{2x} + C"},
            {"label": "C", "text": r"(x - 1)e^{2x} + C"},
            {"label": "D", "text": r"(2x - 1)e^{2x} + C"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Анықталмаған интеграл", "Бөліктеп интегралдау"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\frac{x^2 - 5x + 6}{x^3 - 4x} > 0 \text{ теңсіздіктің шешімін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; -2) \cup (0; 2) \cup (3; +\infty)"},
            {"label": "B", "text": r"(-2; 0) \cup (3; +\infty)"},
            {"label": "C", "text": r"(-2; 0) \cup (2; 3)"},
            {"label": "D", "text": r"(-\infty; 2) \cup (2; 3) \cup (3; +\infty)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Бөлшек-рационал теңсіздік", "Интервалдар әдісі"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"\begin{cases} 2\sin x \sin y = \sin\frac{\pi}{4} \\ x - y = -\frac{\pi}{4} \end{cases} \text{ теңдеулер жүйесін шешіп, } y - x \text{ өрнегінің мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\pi}{4}"},
            {"label": "B", "text": r"-\frac{\pi}{4}"},
            {"label": "C", "text": r"\frac{\pi}{2}"},
            {"label": "D", "text": r"-\frac{\pi}{2}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": CONTEXT_TEXT + "\n\n" + r"Айгүлдің үшінші күні жүрген қадам саны",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5000"},
            {"label": "B", "text": "4000"},
            {"label": "C", "text": "7000"},
            {"label": "D", "text": "6000"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 27
    {
        "slot_index": 27,
        "text": CONTEXT_TEXT + "\n\n" + r"Айгүл бесінші күні қанша км жол жүрді?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4,32 км"},
            {"label": "B", "text": "432 км"},
            {"label": "C", "text": "43,2 км"},
            {"label": "D", "text": "0,432 км"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Арифметика", "Қозғалысқа есептер"],
        "image_filename": None,
    },
    # 28
    {
        "slot_index": 28,
        "text": CONTEXT_TEXT + "\n\n" + r"Айгүл 10000 қадамды 1,5 сағат жүрсе, 10 күнде жалпы қанша уақыт жүрді?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "9,5 сағ"},
            {"label": "B", "text": "9,72 сағ"},
            {"label": "C", "text": "9,6 сағ"},
            {"label": "D", "text": "9,82 сағ"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Пропорция", "Арифметика"],
        "image_filename": None,
    },
    # 29
    {
        "slot_index": 29,
        "text": CONTEXT_TEXT + "\n\n" + r"Айгүл он үшінші күні қанша қадам жасады",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "13000"},
            {"label": "B", "text": "10000"},
            {"label": "C", "text": "12000"},
            {"label": "D", "text": "14000"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Логика"],
        "image_filename": None,
    },
    # 30
    {
        "slot_index": 30,
        "text": CONTEXT_TEXT + "\n\n" + r"Айгүл бір айда (30 күнде) жалпы қанша км жүрді",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "190,08 км"},
            {"label": "B", "text": "182,88 км"},
            {"label": "C", "text": "192,06 км"},
            {"label": "D", "text": "188,43 км"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Арифметика", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 31
    {
        "slot_index": 31,
        "text": r"Периметрі 48 см дұрыс алтыбұрыш берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"3\sqrt{5}"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": r"4\sqrt{3}"},
            {"label": "D", "text": "8"},
        ],
        "subquestions": [
            {"text": "сырттай сызылған шеңбер радиусы", "correct": "D"},
            {"text": "іштей сызылған шеңбер радиусы", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Дұрыс көпбұрыштар"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"\frac{x-3}{4} = \frac{y-2}{-1} = \frac{z+2}{3} \text{ және } \frac{3x+7}{3} = \frac{y-3}{3} = \frac{z+1}{4} \text{ түзулері берілген. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"\frac{1}{2}"},
            {"label": "B", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "C", "text": r"\frac{\sqrt{3}}{2}"},
            {"label": "D", "text": r"\frac{\sqrt{2}}{2}"},
        ],
        "subquestions": [
            {"text": "түзулердің арасындағы бұрыштың косинусы", "correct": "A"},
            {"text": "түзулердің арасындағы бұрыштың синусы", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Кеңістіктегі түзулер"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"ABC тікбұрышты үшбұрышының катеттері 6 см және 8 см. CE және BD биссектрисалардың қиылысу нүктесі O нүктесі. OK перпендикуляры мен гипотенузаның ұзындығын сан мәндерімен сәйкестендір",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "12"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "3"},
        ],
        "subquestions": [
            {"text": "гипотенуза", "correct": "A"},
            {"text": "перпендикулярдың ұзындығы", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш"],
        "image_filename": "v13_q33_triangle.png",
    },
    # 34
    {
        "slot_index": 34,
        "text": r"Көлемі екінші шардың көлемінен 8 есе үлкен болатын шардың радиусы мен ауданы қанша есе үлкен болады. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "2"},
        ],
        "subquestions": [
            {"text": "радиусы", "correct": "D"},
            {"text": "ауданы", "correct": "B"},
        ],
        "answer": '["D", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Шар"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"y = x^2 + 3x + 3 \text{ функциясы } y = x + b \text{ түзуімен өзара орналасуын сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "жанасады"},
            {"label": "B", "text": "параллель"},
            {"label": "C", "text": "қиылысады"},
            {"label": "D", "text": "қиылыспайды"},
        ],
        "subquestions": [
            {"text": "егер b = 3 болса", "correct": "C"},
            {"text": "егер b = 2 болса", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функциялар және графиктер", "Парабола мен түзу"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Барлық қыры 1-ге тең ABCA_1B_1C_1 дұрыс үшбұрышты призманың A төбесінен A_1B_1C жазықтығына дейінгі қашықтықты табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{2}}{2}"},
            {"label": "B", "text": r"\frac{\sqrt{6}}{2}"},
            {"label": "C", "text": r"\frac{\sqrt{5}}{2}"},
            {"label": "D", "text": r"\frac{\sqrt{3}}{2}"},
            {"label": "E", "text": r"0,5\sqrt{2}"},
            {"label": "F", "text": r"0,5\sqrt{6}"},
        ],
        "answer": '["A", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Нүктеден жазықтыққа дейінгі қашықтық"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\operatorname{arcctg}(-\operatorname{ctg} 45^\circ) \text{ есептеңіз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"-\frac{\pi}{4}"},
            {"label": "B", "text": r"\frac{3\pi}{4}"},
            {"label": "C", "text": r"\frac{\pi}{2}"},
            {"label": "D", "text": r"135^\circ"},
            {"label": "E", "text": r"90^\circ"},
            {"label": "F", "text": r"-45^\circ"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар", "Бұрыштың радиандық және градустық өлшемі"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"f(x) = 7 - x^2 \text{ және } g(x) = 5 + |x| \text{ сызықтарымен шектелген фигураның ауданын табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{7}{3}"},
            {"label": "B", "text": r"\frac{4}{3}"},
            {"label": "C", "text": r"2\frac{2}{3}"},
            {"label": "D", "text": r"\frac{8}{3}"},
            {"label": "E", "text": r"1\frac{1}{3}"},
            {"label": "F", "text": r"2\frac{1}{3}"},
        ],
        "answer": '["A", "F"]',
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Анықталған интеграл", "Фигураның ауданы"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"\frac{a^2 \cdot a^3 (6a^4)^2}{(2a)^2}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{1}{2} a^{10}"},
            {"label": "B", "text": r"5a^{11}"},
            {"label": "C", "text": r"0,5a^{10}"},
            {"label": "D", "text": r"\frac{3}{4} a^{11}"},
            {"label": "E", "text": r"9a^{11}"},
            {"label": "F", "text": r"0,75a^{11}"},
        ],
        "answer": '["E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Дәрежелер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\frac{x+\sqrt{5}}{x-\sqrt{5}} + \frac{x-\sqrt{5}}{x+\sqrt{5}} = \frac{4x+8}{x^2-4} \text{ теңдеудің шешімі жатқан аралықты көрсетіңіз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "(0; 3)"},
            {"label": "B", "text": "(-1; 2)"},
            {"label": "C", "text": "(-2; 0)"},
            {"label": "D", "text": "[0; 2)"},
            {"label": "E", "text": "(-1; 1]"},
            {"label": "F", "text": "(0; 1]"},
        ],
        "answer": '["B", "D", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Рационал теңдеу", "Сан аралықтары"],
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

    test_title = "13-нұсқа: Қадам"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 13-нұсқа математика тапсырмалары (Контекст: Қадам)",
            sort_order=13,
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
                    source="ubt_import_v13",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 13 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
