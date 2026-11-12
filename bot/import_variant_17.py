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
        "text": r"\frac{a^{-2}\cdot (a^2)^3}{a^4\cdot \sqrt[3]{a^2}} \text{ өрнектің мәнін тап, мұндағы } a = 8",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,5"},
            {"label": "B", "text": "0,25"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "1,5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Дәрежелер мен түбірлер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"\text{Бөлшектің бөлімін иррационалдықтан арылтыңыз: } \frac{\sqrt{11(4+\sqrt{5})}}{\sqrt{4-\sqrt{5}}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"4 - \sqrt{5}"},
            {"label": "B", "text": r"11(4 - \sqrt{5})"},
            {"label": "C", "text": r"11(4 + \sqrt{5})"},
            {"label": "D", "text": r"4 + \sqrt{5}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал өрнектер", "Бөлшекті ықшамдау"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"\frac{0,5\sqrt{3}\cos 15^\circ - 0,5\sin 15^\circ}{\sqrt{2}} + 0,5 \text{ теңдікті ықшамда}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": r"\sqrt{2}"},
            {"label": "D", "text": "1,5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық формулалар"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"\text{Көбейткішке жікте: } x^4 - 16y^4",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(x - 2y)(x + 2y)(x^2 + 4y^2)"},
            {"label": "B", "text": r"(x^2 + 2y)(x^2 + 4y^2)"},
            {"label": "C", "text": r"(x - 2y)(x - 2y^2)(x^2 + 2y)"},
            {"label": "D", "text": r"(x^2 + 2y)(x + 2y)(x^2 + 4y^2)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көпмүшелер", "Көбейткіштерге жіктеу"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"(x^2 - 2x)^2 - 2(x^2 - 2x) + 1 = 0 \text{ теңдеуінің барлық түбірлерінің қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер", "Квадрат теңдеулер", "Виет теоремасы"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"y = -x^2 + 2x - 3 \text{ функциясының графигі қай координаталық ширектерде орналасқан?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "III және IV"},
            {"label": "B", "text": "I және IV"},
            {"label": "C", "text": "II және III"},
            {"label": "D", "text": "I және II"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Функциялар", "Квадраттық функция", "Функция графигі"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"\text{Анықталмаған интегралды тап: } \int \frac{x^2 - 36}{x+6} dx",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"0,5x^2 + 6x + C"},
            {"label": "B", "text": r"-0,5x^2 + x + C"},
            {"label": "C", "text": r"0,5x^2 - 6x + C"},
            {"label": "D", "text": r"0,5x^2 - x + C"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Анықталмаған интеграл"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"\text{Бірлік кубтың диагоналі мен табан жазықтығының арасындағы бұрыштың синусын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{3}}{2}"},
            {"label": "B", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "C", "text": r"\frac{\sqrt{2}}{2}"},
            {"label": "D", "text": r"\frac{1}{2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Стереометрия", "Куб", "Кеңістіктегі бұрыштар"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"y = \frac{2x - 3}{x + 3} \text{ функцияға кері функцияны тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \frac{x+3}{x-2}"},
            {"label": "B", "text": r"y = \frac{3x+3}{2-x}"},
            {"label": "C", "text": r"y = \frac{3x-3}{2+x}"},
            {"label": "D", "text": r"y = -\frac{3x-3}{2-x}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар", "Кері функция"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"\text{Есепте: } \sqrt{10^{2 + \frac{1}{2}\lg 16}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "20"},
            {"label": "C", "text": "15"},
            {"label": "D", "text": "16"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Дәрежелер"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\text{Ұштары } A(3; -2), \ B(0; 1) \text{ нүктелері болатын } \vec{AB} \text{ векторына қарама-қарсы вектордың координатасын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(3; -3)"},
            {"label": "B", "text": "(3; 0)"},
            {"label": "C", "text": "(-3; 3)"},
            {"label": "D", "text": "(-3; 0)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Векторлар", "Аналитикалық геометрия"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\text{Функция мен оған кері функцияға сәйкес дұрыс тұжырымды тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "координаталар басына қарағанда симметриялы болады"},
            {"label": "B", "text": "Oy осіне қарағанда симметриялы болады"},
            {"label": "C", "text": "Ox осіне қарағанда симметриялы болады"},
            {"label": "D", "text": "y=x түзуіне қарағанда симметриялы болады"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Функциялар", "Кері функция", "Симметрия"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"y = 2x^2 \text{ функциясы мен } y = 4x \text{ функцияларымен шектелген фигураның ауданын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\frac{2}{3} \text{ кв.бірл}"},
            {"label": "B", "text": r"3 \text{ кв.бірл}"},
            {"label": "C", "text": r"2 \text{ кв.бірл}"},
            {"label": "D", "text": r"3\frac{1}{3} \text{ кв.бірл}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Аудан табу"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"\sin\left(2x - \frac{\pi}{3}\right) = 0",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x = \frac{\pi}{3} + \frac{\pi n}{2}, n \in Z"},
            {"label": "B", "text": r"x = \frac{\pi}{6} + \frac{\pi n}{2}, n \in Z"},
            {"label": "C", "text": r"x = \frac{\pi}{4} + \frac{\pi n}{2}, n \in Z"},
            {"label": "D", "text": r"x = \frac{\pi}{2} + \frac{\pi n}{2}, n \in Z"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"\text{Центрі } C(-2; 1; 3) \text{ нүктесінде орналасқан аппликата осін жанайтын сфера бетінің ауданын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"12\pi"},
            {"label": "B", "text": r"20\pi"},
            {"label": "C", "text": r"15\pi"},
            {"label": "D", "text": r"16\pi"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Стереометрия", "Сфера", "Аналитикалық геометрия"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"a\text{-ның қандай мәндерінде } x^2 - 2x - a = 0 \text{ теңдеуінің нақты түбірлері бар?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "a > 2"},
            {"label": "B", "text": "a < 1"},
            {"label": "C", "text": r"a \ge -1"},
            {"label": "D", "text": r"a \ge \frac{1}{2}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадрат теңдеулер", "Параметрлі теңдеулер"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"-2; 3; \dots \text{ геометриялық прогрессияның алғашқы төрт мүшесінің қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "3,25"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "3,5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\text{Өрнектің мәнін тап: } \frac{1+3+3^2+3^3+\dots+3^9}{3^{10}-1}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1,5"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "0,5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"A(2; 4; -3), \ B(4; 5; 2), \ C(0; 3; -2) \text{ нүктелері арқылы өтетін } AB \text{ және } AC \text{ түзулерінің арасындағы бұрышты тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"60^\circ"},
            {"label": "B", "text": r"30^\circ"},
            {"label": "C", "text": r"45^\circ"},
            {"label": "D", "text": r"90^\circ"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Векторлар", "Стереометрия", "Кеңістіктегі бұрыштар"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\text{Конустың осьтік қимасы катеті 6 см тікбұрышты үшбұрыш. Конустың көлемін тап } (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"27\sqrt{2}"},
            {"label": "B", "text": r"108\sqrt{2}"},
            {"label": "C", "text": r"54\sqrt{2}"},
            {"label": "D", "text": "60"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Стереометрия", "Конус", "Конус көлемі"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\text{Өрнекті ықшамдап, мәнін тап: } \sqrt{\frac{1+\sin x}{1-\sin x}} + \sqrt{\frac{1-\sin x}{1+\sin x}}, \quad x = \frac{\pi}{4}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{2}"},
            {"label": "B", "text": r"2\sqrt{2}"},
            {"label": "C", "text": r"\frac{\sqrt{2}}{2}"},
            {"label": "D", "text": r"\frac{3\sqrt{2}}{2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық өрнектер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\begin{cases} \log_x y + \log_y x = 2 \\ x^2 + y = 42 \end{cases} \text{ теңдеулер жүйесінің шешімдері бойынша } 2x + y \text{ өрнегінің мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "15"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": "18"},
            {"label": "D", "text": "12"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"y = \ln(\sin x) \text{ берілген функция бойынша } y'\left(\frac{\pi}{4}\right) = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{2}"},
            {"label": "B", "text": r"\sqrt{3}"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "-1"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Тригонометрия"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\text{Дұрыс төртбұрышты пирамиданың барлық қыры 2 см, пирамиданың көлемін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3\sqrt{2}}{2}"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": r"\frac{3\sqrt{2}}{4}"},
            {"label": "D", "text": r"\frac{4\sqrt{2}}{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Стереометрия", "Пирамида", "Пирамида көлемі"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"\text{Егер } |\vec{a}| = 2, \ |\vec{b}| = 3 \text{ және } \angle(\vec{a}, \vec{b}) = 60^\circ \text{ болса, онда } x\text{-тің қандай мәнінде } \vec{p} = x\vec{a} - 5\vec{b} \text{ және } \vec{q} = 4\vec{a} - \vec{b} \text{ векторлары перпендикуляр болатынын анықтаңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1,5"},
            {"label": "B", "text": r"\frac{15}{13}"},
            {"label": "C", "text": "2,5"},
            {"label": "D", "text": r"\frac{3}{13}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Векторлар", "Скаляр көбейтінді", "Перпендикуляр векторлар"],
        "image_filename": None,
    },
    # 26 (Context: Гүлзар)
    {
        "slot_index": 26,
        "text": "Контекст «Гүлзар»\nПараллелограмм тәріздес Гүлзар берілген. A(1; 1; 1), B(3; 2; 0), C(7; 3; 1)\n\nO нүктесінің координаталары",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(2; 2; 4)"},
            {"label": "B", "text": "(4; 2; 1)"},
            {"label": "C", "text": "(4; 1; 2)"},
            {"label": "D", "text": "(1; 4; 2)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Векторлар", "Координаталар әдісі", "Параллелограмм"],
        "image_filename": "v17_context_gulzar.png",
    },
    # 27 (Context: Гүлзар)
    {
        "slot_index": 27,
        "text": "Контекст «Гүлзар»\nПараллелограмм тәріздес Гүлзар берілген. A(1; 1; 1), B(3; 2; 0), C(7; 3; 1)\n\nD нүктесінің координаталары",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(5; 2; 4)"},
            {"label": "B", "text": "(2; 4; 5)"},
            {"label": "C", "text": "(5; 2; 2)"},
            {"label": "D", "text": "(2; 2; 5)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Векторлар", "Координаталар әдісі", "Параллелограмм"],
        "image_filename": "v17_context_gulzar.png",
    },
    # 28 (Context: Гүлзар)
    {
        "slot_index": 28,
        "text": r"Контекст «Гүлзар»" + "\n" + r"Параллелограмм тәріздес Гүлзар берілген. A(1; 1; 1), B(3; 2; 0), C(7; 3; 1)" + "\n\n" + r"\angle BAD \text{ бұрышының косинусын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{8\sqrt{3}}{9}"},
            {"label": "B", "text": r"\frac{\sqrt{3}}{18}"},
            {"label": "C", "text": r"\frac{4\sqrt{3}}{9}"},
            {"label": "D", "text": r"\frac{5\sqrt{3}}{6}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Векторлар", "Бұрыш косинусы", "Параллелограмм"],
        "image_filename": "v17_context_gulzar.png",
    },
    # 29 (Context: Гүлзар)
    {
        "slot_index": 29,
        "text": "Контекст «Гүлзар»\nПараллелограмм тәріздес Гүлзар берілген. A(1; 1; 1), B(3; 2; 0), C(7; 3; 1)\n\n" + r"\vec{AB} \cdot \vec{BD} \text{ скаляр көбейтіндісін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "0"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Векторлар", "Скаляр көбейтінді"],
        "image_filename": "v17_context_gulzar.png",
    },
    # 30 (Context: Гүлзар)
    {
        "slot_index": 30,
        "text": "Контекст «Гүлзар»\nПараллелограмм тәріздес Гүлзар берілген. A(1; 1; 1), B(3; 2; 0), C(7; 3; 1)\n\nПараллелограммның ауданы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{13}"},
            {"label": "B", "text": r"3\sqrt{11}"},
            {"label": "C", "text": r"2\sqrt{13}"},
            {"label": "D", "text": r"2\sqrt{11}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Векторлар", "Параллелограмм ауданы", "Геометрия"],
        "image_filename": "v17_context_gulzar.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"P(x) = x^3 - 3x - 2 \text{ көпмүшесі берілген. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "-3"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "-2"},
        ],
        "subquestions": [
            {"text": "түбірлерінің қосындысы", "correct": "C"},
            {"text": "түбірлерінің көбейтіндісі", "correct": "D"},
        ],
        "answer": '["C", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Көпмүшелер", "Виет теоремасы"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"f(x) = -5x^3 \text{ функциясы берілген. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-40"},
            {"label": "B", "text": "-30"},
            {"label": "C", "text": "40"},
            {"label": "D", "text": "-35"},
        ],
        "subquestions": [
            {"text": "f(2)", "correct": "A"},
            {"text": "f(-2)", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функциялар", "Функцияның мәні"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"\text{Шеңбердің радиусы } - \ 7 \text{ см. } O \text{ нүктесі } - \text{ шеңбердің центрі және } m \text{ түзуі берілген. } O \text{ нүктесінен } m \text{ түзуіне дейінгі қашықтық } x \text{ болсын. Түзу мен шеңбердің өзара орналасуын сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "Түзу мен шеңбер екі нүктеде қиылысады"},
            {"label": "B", "text": "Түзу шеңбердің центрі арқылы өтеді"},
            {"label": "C", "text": "Түзу мен шеңбер жанасады"},
            {"label": "D", "text": "Түзу мен шеңбер қиылыспайды"},
        ],
        "subquestions": [
            {"text": r"x = 7 \text{ см болғанда}", "correct": "C"},
            {"text": r"x = 5,5 \text{ см болғанда}", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Шеңбер және түзу"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"\text{Айырымы 0-ден өзгеше 4 сан арифметикалық прогрессия құрайды, екінші немесе үшінші санды сызып тастаса геометриялық прогрессия шығады. Геометриялық прогрессияның еселігін тап}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "1,5"},
            {"label": "D", "text": "0,5"},
        ],
        "subquestions": [
            {"text": "Екінші мүшесін сызып тастаса", "correct": "D"},
            {"text": "Үшінші мүшесін сызып тастаса", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Арифметикалық прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"\text{Суретте тең қабырғалы үшбұрыштар (шексіз көп) берілген, әрқайсысының қабырғасы алдыңғыларының орта сызығына тең етіп жасалған. Ең үлкен үшбұрыштың қабырғасы 12-ге тең. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "36"},
            {"label": "B", "text": "72"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "24"},
        ],
        "subquestions": [
            {"text": "Барлық үшбұрыштардың периметрлерінің қосындысы", "correct": "B"},
            {"text": "АВ табанына параллель барлық орта сызықтардың қосындысы", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Шексіз кемімелі геометриялық прогрессия", "Үшбұрыштар"],
        "image_filename": "v17_q35_triangles.png",
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\frac{\sin 80^\circ + \sin 10^\circ}{\cos 80^\circ + \cos 10^\circ} \text{ өрнегінің мәні жататын аралықт(ард)ы табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "[1,5; 3]"},
            {"label": "B", "text": "[-2; 0]"},
            {"label": "C", "text": "[-1; 1]"},
            {"label": "D", "text": "[-1; 0,5]"},
            {"label": "E", "text": "[0,5; 2]"},
            {"label": "F", "text": "[-3; -1,5]"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық формулалар", "Сан аралықтары"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\text{Мүшелері оң геометриялық прогрессияда } b_1 \cdot b_3 = 81, \ b_2 \cdot b_4 = 729 \text{ болса, онда } S_6 \text{ мәнінің бөлгіш(тер)ін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "273"},
            {"label": "B", "text": "123"},
            {"label": "C", "text": "41"},
            {"label": "D", "text": "91"},
            {"label": "E", "text": "82"},
            {"label": "F", "text": "3"},
        ],
        "answer": '["A", "D", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Геометриялық прогрессия", "Бөлгіштер"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"CK = 3, \ KO = 6, \ KM = 4. \text{ Үлкен конустың табан радиусы мен жасаушысын және кіші конустың көлемін табыңыз } (\pi \approx 3)",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "20"},
            {"label": "B", "text": "96"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "64"},
            {"label": "E", "text": "15"},
            {"label": "F", "text": "48"},
        ],
        "answer": '["C", "E", "F"]',
        "topics": ["ҰБТ есебі", "Стереометрия", "Конус", "Конус көлемі", "Қиық конус"],
        "image_filename": "v17_q38_cone.png",
    },
    # 39
    {
        "slot_index": 39,
        "text": r"A(2; 1; 3), \ B(3; 4; 5). \ AB \text{ кесіндісі ортасының координаталарының қосындысын есепте}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": r"\sqrt{64}"},
            {"label": "C", "text": r"\sqrt{100}"},
            {"label": "D", "text": "8"},
            {"label": "E", "text": "10"},
            {"label": "F", "text": r"\sqrt{81}"},
        ],
        "answer": '["A", "F"]',
        "topics": ["ҰБТ есебі", "Векторлар", "Кеңістіктегі координаталар", "Кесіндінің ортасы"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\text{Радиусы 15 см сфера центрінен 12 см қашықтықта қима жүргізілді. Қиманың ауданы мен ұзындығын тап}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"25\pi"},
            {"label": "B", "text": r"10\pi"},
            {"label": "C", "text": r"71\pi"},
            {"label": "D", "text": r"81\pi"},
            {"label": "E", "text": r"17\pi"},
            {"label": "F", "text": r"18\pi"},
        ],
        "answer": '["D", "F"]',
        "topics": ["ҰБТ есебі", "Стереометрия", "Сфера", "Сфера қимасы", "Аудан мен ұзындық"],
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

    test_title = "17-нұсқа: Гүлзар"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 17-нұсқа математика тапсырмалары (Контекст: Гүлзар)",
            sort_order=17,
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
                    source="ubt_import_v17",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 17 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
