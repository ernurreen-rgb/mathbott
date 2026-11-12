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

context_text = (
    "**Рим цифрлары**\n\n"
    "Рим цифрлары — Ежелгі Римде қолданылған санау жүйесі. "
    "Бұл жүйе латын әріптерінің комбинациясына негізделген, әр әріп белгілі бір сандық мәнге ие. "
    "Бұл — позициялық емес жүйе және нөл санын қолданбайды. "
    "Қазіргі уақытта рим цифрлері тараулардың, ғасырлардың, сағаттардың нөмірленуінде және ресми құжаттарда қолданылады.\n\n"
)

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"Есепте: \frac{\sqrt{7} - \sqrt{5}}{\sqrt{7} + \sqrt{5}} + \frac{\sqrt{7} + \sqrt{5}}{\sqrt{7} - \sqrt{5}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": r"4\sqrt{35}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал сандар", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"Егер a = 2025, b = 2024 болса, \sqrt{b^2 - 2ab + a^2} + a^2 - b^2 өрнегінің мәнін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4050"},
            {"label": "B", "text": "4048"},
            {"label": "C", "text": "4052"},
            {"label": "D", "text": "4049"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Қысқаша көбейту формулалары"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"\int 3^{x+1} dx \text{ есептеңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"3^{x+1} + C"},
            {"label": "B", "text": r"\frac{3^{x+1}}{\ln 3} + C"},
            {"label": "C", "text": r"3^{x+1}\ln (x + 1) + C"},
            {"label": "D", "text": r"\frac{3^{x+1}}{\ln x} + C"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Анықталмаған интеграл"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"Көбейткішке жікте: 2x^4 + 6x^3 + 6x^2 + 2x",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"6x^2(x + 1)(x - 1)"},
            {"label": "B", "text": r"2x^2(x + 1)^2"},
            {"label": "C", "text": r"2x(x + 1)^3"},
            {"label": "D", "text": r"2x(x + 1)^2(x - 1)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Көпмүшелер", "Көбейткіштерге жіктеу"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"(x - 3)^{x^2 - 4} > 1 теңсіздігін қанағаттандыратын ең кіші бүтін түбірін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздік"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"y = x^2 - 4x + 7 функциясының графигі қай координаталық ширектерде орналасқан?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "III және IV"},
            {"label": "B", "text": "I және IV"},
            {"label": "C", "text": "II және III"},
            {"label": "D", "text": "I және II"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Парабола", "Координаталық жазықтық"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"Анықталмаған интегралды тап: \int (x + 2)\cos x \, dx",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(x + 2)\cos x + \sin x"},
            {"label": "B", "text": r"x + 2 - x\cos x"},
            {"label": "C", "text": r"(x + 2)\sin x + \cos x"},
            {"label": "D", "text": r"-(x + 2)\cos x - \sin x"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Бөліктеп интегралдау"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"Шеңберлердің қиылысуынан пайда болған BD доғасы үлкен шеңбердің \frac{1}{6} бөлігіне, кіші шеңбердің \frac{1}{3} бөлігіне тең. Шеңберлердің центрлері A және C болса, \angle ABC мәнін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"100^\circ"},
            {"label": "B", "text": r"135^\circ"},
            {"label": "C", "text": r"120^\circ"},
            {"label": "D", "text": r"90^\circ"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Бұрыштар"],
        "image_filename": "v16_q08_circles.png",
    },
    # 9
    {
        "slot_index": 9,
        "text": r"\frac{x^2 - 5x + 6}{x^2 + 2x - 8} < 0 теңсіздікті қанағаттандыратын ең үлкен бүтін түбірді тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "0"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Бөлшек-рационал теңсіздік"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"\text{Есепте: } \log_3 2 \cdot \log_4 3 \cdot \log_5 4 \cdot \log_6 5 \cdot \log_7 6 \cdot \log_8 7",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{8}"},
            {"label": "B", "text": r"\frac{1}{3}"},
            {"label": "C", "text": r"\frac{1}{2}"},
            {"label": "D", "text": r"\frac{1}{4}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"ABC теңбүйірлі тікбұрышты үшбұрыш берілген, егер \vec{AB} векторының ұзындығы 20 см болса, \vec{CD} векторының ұзындығын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "15"},
            {"label": "D", "text": r"10\sqrt{3}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш", "Векторлар"],
        "image_filename": "v16_q11_triangle.png",
    },
    # 12
    {
        "slot_index": 12,
        "text": r"2^{\operatorname{tg}x \cdot \operatorname{ctg}x - \log_2 x} \le 4 теңсіздігінің ең кіші бүтін шешімі",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "0"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздік", "Логарифм", "Тригонометрия"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"y = ax^2 + bx + c функция графигіне сәйкес дұрыс тұжырымды анықта",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "a < 0, b < 0, c > 0"},
            {"label": "B", "text": "a < 0, b > 0, c > 0"},
            {"label": "C", "text": "a < 0, b = 0, c < 0"},
            {"label": "D", "text": "a < 0, b > 0, c = 0"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Парабола", "График"],
        "image_filename": "v16_q13_parabola.png",
    },
    # 14
    {
        "slot_index": 14,
        "text": r"y = \operatorname{tg}x \text{ функциясының графигі мен } y = 0, \, x = -\frac{\pi}{4}, \, x = \frac{\pi}{4} \text{ түзулерімен шектелген фигураның ауданын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\ln \frac{1}{2}\text{ кв.бірл}"},
            {"label": "B", "text": r"2\ln 2\text{ кв.бірл}"},
            {"label": "C", "text": r"\ln 2\text{ кв.бірл}"},
            {"label": "D", "text": r"\ln 3\text{ кв.бірл}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Қисықсызықты трапеция ауданы"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Центрі C(-2; 1; 3) нүктесінде орналасқан аппликата осін жанайтын сфера теңдеуін жаз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(x + 2)^2 + (y - 1)^2 + (z - 3)^2 = 5"},
            {"label": "B", "text": r"(x + 2)^2 + (y - 1)^2 + (z - 3)^2 = 10"},
            {"label": "C", "text": r"(x + 2)^2 + (y - 1)^2 + (z - 3)^2 = 13"},
            {"label": "D", "text": r"(x - 2)^2 + (y + 1)^2 + (z + 3)^2 = 1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера теңдеуі", "Аналитикалық геометрия"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"a-ның қандай мәндерінде x^2 - 4x - \log_2 a = 0 теңдеуінің нақты түбірлері бар?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "a > 2"},
            {"label": "B", "text": "a < 4"},
            {"label": "C", "text": r"a \ge \frac{1}{16}"},
            {"label": "D", "text": r"a \ge \frac{1}{4}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадрат теңдеу", "Логарифм", "Параметрлі есептер"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"\text{Есепте: } \sqrt[3]{2 - \sqrt{3}} \cdot \sqrt[6]{7 + 4\sqrt{3}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Түбірлер", "Иррационал өрнектер"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\text{Өрнектің мәнін тап: } \frac{1 + 2 + 2^2 + 2^3 + \dots + 2^9}{2^{10} - 1}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "1"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"A(-3; 2; -3) \text{ және } B(4; 5; 2) \text{ нүктелері арқылы өтетін түзудің параметрлік теңдеуін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\begin{cases} x = -3 + 7t \\ y = 2 + 3t \\ z = -3 + 5t \end{cases}"},
            {"label": "B", "text": r"\begin{cases} x = 3 + 7t \\ y = -2 + 3t \\ z = 3 + 5t \end{cases}"},
            {"label": "C", "text": r"\begin{cases} x = -3 - 7t \\ y = 2 - 3t \\ z = -3 - 5t \end{cases}"},
            {"label": "D", "text": r"\begin{cases} x = 3 - 7t \\ y = -2 - 3t \\ z = 3 - 5t \end{cases}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Түзудің теңдеуі", "Аналитикалық геометрия"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"Конустың осьтік қимасы қабырғасы 2 см-ге тең теңқабырғалы үшбұрыш. Конустың көлемін тап (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": r"\sqrt{3}"},
            {"label": "D", "text": r"\frac{1}{3}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус", "Көлем"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\text{Өрнекті ықшамда: } \sqrt{\frac{1 + \sin x}{1 - \sin x}} - \sqrt{\frac{1 - \sin x}{1 + \sin x}}, \quad 0 < x < \frac{\pi}{2}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-2\operatorname{tg} x"},
            {"label": "B", "text": r"2\operatorname{tg} x"},
            {"label": "C", "text": r"2\operatorname{ctg} x"},
            {"label": "D", "text": r"-2\operatorname{ctg} x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\text{Теңдеулер жүйесін шеш: } \begin{cases} \cos x \cos y = \frac{\sqrt{3}}{4} \\ x + y = \frac{\pi}{6} \end{cases}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left(\frac{\pi}{4} + \frac{\pi n}{2}; -\frac{\pi}{12} - \frac{\pi n}{2}\right)"},
            {"label": "B", "text": r"\left(\frac{3\pi}{4} + \frac{\pi n}{2}; -\frac{7\pi}{12} - \frac{\pi n}{2}\right)"},
            {"label": "C", "text": r"\left(-\frac{\pi}{6} + \frac{\pi n}{2}; -\frac{\pi}{3} - \frac{\pi n}{2}\right)"},
            {"label": "D", "text": r"\left(\frac{\pi}{3} + \frac{\pi n}{2}; -\frac{\pi}{6} - \frac{\pi n}{2}\right)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"y = 5x + \arcsin(x + 2) \text{ берілген функция бойынша } y'(-2) = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"Тіктөртбұрыштың қабырғалары 4 см және 6 см. Үлкен қабырғасынан айналдырғанда пайда болған дененің көлемін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"84\pi"},
            {"label": "B", "text": r"104\pi"},
            {"label": "C", "text": r"144\pi"},
            {"label": "D", "text": r"96\pi"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Цилиндр"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"Суретте берілген функция графигіне A(1; 3) нүктесінде жүргізілген жанама теңдеуін жаз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = 3x"},
            {"label": "B", "text": r"y = -3x + 6"},
            {"label": "C", "text": r"y = 4x"},
            {"label": "D", "text": r"y = 4x - 1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Жанама теңдеуі", "График"],
        "image_filename": "v16_q25_graph.png",
    },
    # 26
    {
        "slot_index": 26,
        "text": context_text + r"2460 санын Рим цифрларымен жазыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "MMCDLX"},
            {"label": "B", "text": "MMXLD"},
            {"label": "C", "text": "MMDLX"},
            {"label": "D", "text": "MMDCLX"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Рим цифрлары", "Арифметика"],
        "image_filename": "v16_q26_roman_table.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": context_text + r"\text{MMD} + \text{MCC} + \text{CCXL} + \text{CDLXXX} = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4450"},
            {"label": "B", "text": "4400"},
            {"label": "C", "text": "4420"},
            {"label": "D", "text": "4520"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Рим цифрлары", "Арифметика"],
        "image_filename": "v16_q26_roman_table.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": context_text + r"Екі таңбалы санды беретін екі Рим цифрынан тұратын қанша сан бар",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "7"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Рим цифрлары", "Комбинаторика"],
        "image_filename": "v16_q26_roman_table.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": context_text + r"423 санын Рим тілінде жазыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "CDXXIII"},
            {"label": "B", "text": "CDVIXXX"},
            {"label": "C", "text": "CDXIII"},
            {"label": "D", "text": "CDXXI"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Рим цифрлары", "Арифметика"],
        "image_filename": "v16_q26_roman_table.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": context_text + r"(\text{MMCCCXXXIII} + \text{XVII} + \text{MCD}600) : \text{L}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "85"},
            {"label": "B", "text": "82"},
            {"label": "C", "text": "79"},
            {"label": "D", "text": "87"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Рим цифрлары", "Арифметика"],
        "image_filename": "v16_q26_roman_table.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"Шеңберге іштей сызылған он екі бұрыштың ауданы 30\sqrt{3}. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"45^\circ"},
            {"label": "B", "text": "35"},
            {"label": "C", "text": r"60^\circ"},
            {"label": "D", "text": "45"},
        ],
        "subquestions": [
            {"text": "алтыбұрыштың ауданы", "correct": "D"},
            {"text": r"\alpha \text{ бұрышы}", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Дұрыс көпбұрыштар"],
        "image_filename": "v16_q31_dodecagon.png",
    },
    # 32
    {
        "slot_index": 32,
        "text": r"3^{3x+2} - 3^{2x+3} = 3^{x+1} - 9 \text{ теңдеуі берілген. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-0,5"},
            {"label": "B", "text": "1,5"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "0,5"},
        ],
        "subquestions": [
            {"text": "түбірлерінің қосындысы", "correct": "D"},
            {"text": "түбірлерінің көбейтіндісі", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Көрсеткіштік теңдеу"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"y = \left(\frac{1}{3}\right)^x - 3 \text{ функциясы берілген. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"(-3; +\infty)"},
            {"label": "B", "text": "Нақты сандар жиыны"},
            {"label": "C", "text": r"(-\infty; -3)"},
            {"label": "D", "text": "Теріс сандар жиыны"},
        ],
        "subquestions": [
            {"text": "анықталу облысы", "correct": "B"},
            {"text": "мәндер облысы", "correct": "A"},
        ],
        "answer": '["B", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция", "Анықталу облысы", "Мәндер облысы"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"x^2 + (y - 3)^2 = 4 \text{ функциясына координаталар бас нүктесі арқылы өтетін жанаманың теңдеуін сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"y = \frac{\sqrt{3}}{3}x"},
            {"label": "B", "text": r"y = -\frac{\sqrt{5}}{2}x"},
            {"label": "C", "text": r"y = -\frac{\sqrt{3}}{3}x"},
            {"label": "D", "text": r"y = \frac{\sqrt{5}}{2}x"},
        ],
        "subquestions": [
            {"text": r"k > 0", "correct": "D"},
            {"text": r"k < 0", "correct": "B"},
        ],
        "answer": '["D", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Шеңбер", "Жанама", "Аналитикалық геометрия"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"(x + 3)^2 + (y - 2)^2 = 36 \text{ шеңбері берілген. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "36"},
            {"label": "B", "text": "(3; -2)"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "(-3; 2)"},
        ],
        "subquestions": [
            {"text": "радиусы", "correct": "C"},
            {"text": "центрі", "correct": "D"},
        ],
        "answer": '["C", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Шеңбер", "Аналитикалық геометрия"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"5\sin x - 5 = 2\cos^2 x \text{ теңдеуді шешіңіз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"x = -\frac{\pi}{2} + 2\pi n, \, n \in \mathbb{Z}"},
            {"label": "B", "text": r"x = \frac{\pi}{2} + 2\pi n, \, n \in \mathbb{Z}"},
            {"label": "C", "text": r"x = \frac{\pi}{6} + 2\pi n, \, n \in \mathbb{Z}"},
            {"label": "D", "text": r"x = 2\pi n, \, n \in \mathbb{Z}"},
            {"label": "E", "text": r"x = \frac{\pi}{2} + \pi n, \, n \in \mathbb{Z}"},
            {"label": "F", "text": r"x = \pi + 2\pi n, \, n \in \mathbb{Z}"},
        ],
        "answer": '["B"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеу"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\frac{a^3 b}{2b^7} \cdot \frac{ab^2}{a^4} \text{ өрнегіне тең өрнек(тер)}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{1}{2b^4}"},
            {"label": "B", "text": r"0,5b^{-4}"},
            {"label": "C", "text": r"\frac{1}{2b^{-4}}"},
            {"label": "D", "text": r"2b^{-4}"},
            {"label": "E", "text": r"0,5ab^{-4}"},
            {"label": "F", "text": r"\frac{b^{-4}}{2}"},
        ],
        "answer": '["A", "B", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Дәрежелер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"A(-1; 3; 4) \text{ нүктесінен } 3x + 5y - 6z + 10 = 0 \text{ жазықтығына дейінгі қашықтықты табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{1}{\sqrt{70}}"},
            {"label": "B", "text": r"\frac{22}{\sqrt{70}}"},
            {"label": "C", "text": r"\frac{2}{\sqrt{70}}"},
            {"label": "D", "text": r"\frac{11\sqrt{70}}{35}"},
            {"label": "E", "text": r"\frac{\sqrt{70}}{35}"},
            {"label": "F", "text": r"\frac{\sqrt{70}}{2}"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Нүктеден жазықтыққа дейінгі қашықтық", "Аналитикалық геометрия"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"Қырлары 3\sqrt{2} \text{ болатын } ABCA_1B_1C_1 \text{ үшбұрышты көлбеу призма берілген. } A_1 \text{ нүктесінен } ABC \text{ үшбұрышының төбелеріне дейінгі қашықтықтар тең. } BA_1C \text{ жазықтығы призманы екі бөлікке бөледі. Пайда болған фигуралардың көлемін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": "8"},
            {"label": "D", "text": "9"},
            {"label": "E", "text": "18"},
            {"label": "F", "text": "16"},
        ],
        "answer": '["D", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Пирамида", "Көлем"],
        "image_filename": "v16_q39_prism.png",
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\text{Егер } (x_0; y_0) \text{ сандар жұбы } \begin{cases} \log_5(x^2 + y) + \log_3(x^2 - y) = 2 \\ 2\log_5(x^2 + y) + \log_3(x^2 - y) = 3 \end{cases} \text{ теңдеулер жүйесінің шешімі болса, онда } x_0 - y_0 \text{ мәндерін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-3"},
            {"label": "E", "text": "-2"},
            {"label": "F", "text": "-4"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеулер жүйесі", "Теңдеулер жүйесі"],
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

    test_title = "16-нұсқа: Рим цифры"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 16-нұсқа математика тапсырмалары (Контекст: Рим цифры)",
            sort_order=16,
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
                    source="ubt_import_v16",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 16 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
