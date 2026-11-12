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
    "**Семей көпірі**\n\n"
    "Семей қаласының мақтанышы саналатын аспалы көпір ТМД мемлекеттерінің ішінде жалғыз, "
    "ал әлем бойынша көлемі жөнінен 17-ші орынды иеленеді. Аспалы көпір – қала өңірінің оң жағы "
    "мен сол жағын байланыстыратын теңдесі жоқ құрылыс нысаны. Көпір жер сілкінісіне төзімді етіліп жасалған. "
    "Көпірдің кеңістіктегі ұзындығы 750 м, ал жалпы ұзындығы 1086 м. Ені 35 м, биіктігі 90 м."
)

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"Есептеңіз: \frac{2-\sqrt{3}}{2+\sqrt{3}} - \frac{2+\sqrt{3}}{2-\sqrt{3}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-24"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": r"8\sqrt{3}"},
            {"label": "D", "text": r"-8\sqrt{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал өрнектер", "Бөлшектер"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"Егер a > 2025, b < 2024 болса, \frac{|a-2025|+|b-2024|+1}{a^2-b^2} өрнекті ықшамдаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{a-b}"},
            {"label": "B", "text": r"\frac{1}{a+b}"},
            {"label": "C", "text": r"a - b"},
            {"label": "D", "text": r"a + b"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Модуль", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"Өрнектің мәнін табыңыз: \cos\left(2\arcsin\frac{1}{3}\right)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{5}{9}"},
            {"label": "B", "text": r"\frac{4}{3}"},
            {"label": "C", "text": r"\frac{2}{3}"},
            {"label": "D", "text": r"\frac{7}{9}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"Өрнекті ықшамдаңыз: \left(\frac{\sqrt{b}+2}{b+2\sqrt{b}+1} - \frac{\sqrt{b}-2}{b-1}\right) \cdot \frac{\sqrt{b}+1}{\sqrt{b}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{b+1}"},
            {"label": "B", "text": r"\frac{2}{b-1}"},
            {"label": "C", "text": r"\frac{2}{b+1}"},
            {"label": "D", "text": r"\frac{1}{b-1}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал өрнектер", "Бөлшек-рационал өрнектер"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"x^2 - 4x + q = 0 теңдеудің түбірлерінің квадраттарының қосындысы 10-ға тең болса, q мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадрат теңдеулер", "Виет теоремасы"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"y = \log_2 x функциясының графигі қай координаталық ширектерде орналасқан?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "III және IV"},
            {"label": "B", "text": "I және IV"},
            {"label": "C", "text": "II және III"},
            {"label": "D", "text": "I және II"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Функциялар", "Логарифмдік функция", "Координаталық жүйе"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"Интегралды есептеңіз: \int_{\frac{\pi}{6}}^{\frac{\pi}{2}} \operatorname{ctg} x\,dx",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\ln 5"},
            {"label": "B", "text": r"\ln 4"},
            {"label": "C", "text": r"\ln 3"},
            {"label": "D", "text": r"\ln 2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Интеграл", "Анықталған интеграл", "Тригонометрия"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"Шеңберлердің қиылысуынан пайда болған BD доғасы үлкен шеңбердің \frac{1}{4} бөлігіне, кіші шеңбердің \frac{1}{2} бөлігіне тең. Шеңберлердің центрлері A және C болса, \angle ABC мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"60^\circ"},
            {"label": "B", "text": r"30^\circ"},
            {"label": "C", "text": r"45^\circ"},
            {"label": "D", "text": r"90^\circ"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Планиметрия", "Шеңбер", "Бұрыштар"],
        "image_filename": "v25_q08_circles.png",
    },
    # 9
    {
        "slot_index": 9,
        "text": r"\sqrt{1-x} \le \sqrt[4]{5+x} теңсіздікті қанағаттандыратын бүтін сандардың көбейтіндісін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңсіздіктер"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"Есептеңіз: 81^{\log_9 2 - 0{,}25\log_3 2} + 25^{\log_5 2 - 0{,}5\log_5 4}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Дәрежелер"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"ABC дұрыс үшбұрышының AA_1, BB_1, CC_1 медианалары O нүктесінде қиылысады. Егер үшбұрыш қабырғасы 4 см болса, \vec{CO} \cdot \vec{CA_1} есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "3"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Скаляр көбейтінді"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\frac{2^{5x+3}}{4^{x+1}} > 1 теңсіздікті қанағаттандыратын ең кіші бүтін санды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "0"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"y = ax^2 + bx + c функция графигіне A(0;1) нүктесі арқылы жүргізілген жанама теңдеуін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = -4x + 1"},
            {"label": "B", "text": r"y = 4x - 1"},
            {"label": "C", "text": r"y = 4x + 1"},
            {"label": "D", "text": r"y = -4x - 1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Туынды", "Жанаманың теңдеуі", "Парабола"],
        "image_filename": "v25_q13_parabola.png",
    },
    # 14
    {
        "slot_index": 14,
        "text": r"Екінші мүшесі мен төртінші мүшесінің қосындысы 16-ға тең, бірінші және бесінші мүшелерінің көбейтіндісі 28-ге тең өспелі арифметикалық прогрессияның айырымын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "-3"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"\frac{x}{2} - \frac{y}{6} + \frac{z}{3} = 1 жазықтығы мен 3x - y + 2z - 9 = 0 жазықтықтарының арақашықтығын есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": r"\frac{\sqrt{13}}{13}"},
            {"label": "C", "text": r"\frac{3\sqrt{14}}{14}"},
            {"label": "D", "text": "2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Стереометрия", "Аналитикалық геометрия", "Жазықтық"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"1; \sqrt{x}; 3\sqrt{x} + 4 сандары геометриялық прогрессияның тізбектес мүшелері болса, осы мүшелердің қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "13"},
            {"label": "C", "text": "21"},
            {"label": "D", "text": "31"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"A(x; 2; 1), B(2; 3; 0) нүктелерінің координаталары бойынша AB кесіндісінің ұзындығы \sqrt{6} болса, x айнымалысының мәндерін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x_1 = 1, \quad x_2 = -4"},
            {"label": "B", "text": r"x_1 = -1, \quad x_2 = 3"},
            {"label": "C", "text": r"x_1 = 0, \quad x_2 = 4"},
            {"label": "D", "text": r"x_1 = 4, \quad x_2 = 5"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Аналитикалық геометрия", "Кеңістіктегі координаталар", "Кесінді ұзындығы"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"Өрнектің мәнін табыңыз: \frac{1 + \frac{1}{2} + \frac{1}{4} + \frac{1}{8} + \dots}{1 + \frac{1}{3} + \frac{1}{9} + \frac{1}{27} + \dots}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{3}"},
            {"label": "B", "text": r"\frac{1}{2}"},
            {"label": "C", "text": r"\frac{2}{3}"},
            {"label": "D", "text": r"\frac{4}{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"Дұрыс үшбұрышты призма табанының қабырғасы 2 см-ге тең. Осы призмаға іштей сфера сызылған. Призма биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{2\sqrt{3}}{3}"},
            {"label": "B", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "C", "text": r"\frac{2}{3}"},
            {"label": "D", "text": r"\frac{1}{3}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Стереометрия", "Призма", "Сфера"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\arcsin(2x - 0{,}5) = \frac{\pi}{6} теңдеудің түбірі бойынша x + x^{-1} есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "1,5"},
            {"label": "C", "text": "2,5"},
            {"label": "D", "text": "2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Координаталық жазықтықтың суретте кескінделген нүктелер жиынын анықтайтын теңсіздіктер жүйесін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\begin{cases} y \ge (x-1)^2 - 2 \\ y \le -x + 2 \end{cases}"},
            {"label": "B", "text": r"\begin{cases} y \le 2(x-1)^2 - 2 \\ y \le -x + 2 \end{cases}"},
            {"label": "C", "text": r"\begin{cases} y \ge 2(x-1)^2 - 2 \\ y \le -x + 2 \end{cases}"},
            {"label": "D", "text": r"\begin{cases} y \ge (x+1)^2 - 2 \\ y \le -x + 3 \end{cases}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жүйесі", "Функция графигі"],
        "image_filename": "v25_q21_inequality_region.png",
    },
    # 22
    {
        "slot_index": 22,
        "text": r"y = \frac{x^2 - 3x}{x - 4} функцияның экстремум нүктелерін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x_{\max} = 2;\ x_{\min} = 6"},
            {"label": "B", "text": r"x_{\max} = 6;\ x_{\min} = 2"},
            {"label": "C", "text": r"x_{\max} = 6;\ x_{\min} = 4"},
            {"label": "D", "text": r"x_{\max} = 4;\ x_{\min} = 6"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Туынды", "Экстремум", "Функцияны зерттеу"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\sin^4 x - \cos^4 x = 1 теңдеудің түбірін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\pm \frac{\pi}{6} + 2\pi n,\ n \in \mathbb{Z}"},
            {"label": "B", "text": r"\pi + 2\pi n,\ n \in \mathbb{Z}"},
            {"label": "C", "text": r"\pm \frac{\pi}{3} + 2\pi n,\ n \in \mathbb{Z}"},
            {"label": "D", "text": r"\frac{\pi}{2} + \pi n,\ n \in \mathbb{Z}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"Цилиндрдің осьтік қимасы қабырғасы 6 см-ге тең шаршы. Цилиндрдің көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"84\pi"},
            {"label": "B", "text": r"108\pi"},
            {"label": "C", "text": r"60\pi"},
            {"label": "D", "text": r"54\pi"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Стереометрия", "Цилиндр", "Көлем"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"ABCDA_1B_1C_1D_1 кубында B_1C_1 қырының ортасы E нүктесімен белгіленді. \vec{DE} векторын \vec{BC}, \vec{AA_1}, \vec{CD} векторлары арқылы өрнектеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\vec{DE} = -\vec{CD} + \vec{AA_1} - \frac{1}{2}\vec{BC}"},
            {"label": "B", "text": r"\vec{DE} = \vec{CD} + \vec{AA_1} + \frac{1}{2}\vec{BC}"},
            {"label": "C", "text": r"\vec{DE} = -\vec{CD} - \vec{AA_1} - \frac{1}{2}\vec{BC}"},
            {"label": "D", "text": r"\vec{DE} = -\vec{CD} - \vec{AA_1} - \vec{BC}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Кеңістіктегі векторлар"],
        "image_filename": "v25_q25_cube.png",
    },
    # 26 (Context 1)
    {
        "slot_index": 26,
        "text": CONTEXT_TEXT + "\n\n" + r"Көпірдің бетінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"26250\text{ м}^2"},
            {"label": "B", "text": r"38010\text{ м}^2"},
            {"label": "C", "text": r"28224\text{ м}^2"},
            {"label": "D", "text": r"40280\text{ м}^2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Қолданбалы есептер", "Аудан"],
        "image_filename": "v25_q26_semey_bridge.png",
    },
    # 27 (Context 2)
    {
        "slot_index": 27,
        "text": CONTEXT_TEXT + "\n\n" + r"A нүктесін координаталар бас нүктесі деп алып, AB түзуінің теңдеуін жазыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \frac{3}{4}x"},
            {"label": "B", "text": r"y = \frac{15}{28}x"},
            {"label": "C", "text": r"y = \frac{17}{32}x"},
            {"label": "D", "text": r"y = \frac{7}{18}x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Аналитикалық геометрия", "Түзудің теңдеуі"],
        "image_filename": "v25_q26_semey_bridge.png",
    },
    # 28 (Context 3)
    {
        "slot_index": 28,
        "text": CONTEXT_TEXT + "\n\n" + r"Көпірдің ортаңғы бөлігінің теңдеуін жазыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \frac{2}{3125}(x - 543)^2"},
            {"label": "B", "text": r"y = \frac{9}{1250}(x - 543)^2"},
            {"label": "C", "text": r"y = \frac{2}{3125}(x - 518)^2"},
            {"label": "D", "text": r"y = \frac{2}{1250}(x - 375)^2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Парабола", "Функция теңдеуі"],
        "image_filename": "v25_q26_semey_bridge.png",
    },
    # 29 (Context 4)
    {
        "slot_index": 29,
        "text": CONTEXT_TEXT + "\n\n" + r"Көпірдің боялған бөлігінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "36542"},
            {"label": "B", "text": "28760"},
            {"label": "C", "text": "38540"},
            {"label": "D", "text": "37620"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Интеграл", "Фигура ауданы"],
        "image_filename": "v25_q26_semey_bridge.png",
    },
    # 30 (Context 5)
    {
        "slot_index": 30,
        "text": CONTEXT_TEXT + "\n\n" + r"Көпірдің ортаңғы бөлігі шеңбер доғасы болса, теңдеуін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(x - 375)^2 + (y - 168)^2 = 543^2"},
            {"label": "B", "text": r"(x - 543)^2 + (y - 925{,}25)^2 = 925{,}25^2"},
            {"label": "C", "text": r"(x - 543)^2 + (y - 826{,}25)^2 = 826{,}25^2"},
            {"label": "D", "text": r"(x - 543)^2 + (y - 90)^2 = 826{,}25^2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Шеңбер теңдеуі", "Аналитикалық геометрия"],
        "image_filename": "v25_q26_semey_bridge.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"y = 5^x - 1 функциясы берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "II, IV"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "I, III"},
        ],
        "subquestions": [
            {"text": r"Берілген функция графигі қай ширектерде жатады?", "correct": "D"},
            {"text": r"y = -x^2 функция графигімен қанша нүктеде қиылысады", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Көрсеткіштік функция", "Графиктер"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"(x - 2)^{x^2 - 6x + 8} > 1 теңсіздігі берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "7"},
        ],
        "subquestions": [
            {"text": r"Теңсіздіктің ең кіші бүтін түбірі", "correct": "B"},
            {"text": r"Теңсіздіктің түбірі бола алатын сан", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Көрсеткіштік теңсіздіктер"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"Геометриялық прогрессияда b_2 + b_3 = 18, b_4 - b_2 = 18, S_n = 93. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "6"},
        ],
        "subquestions": [
            {"text": r"Прогрессияның еселігі", "correct": "A"},
            {"text": r"Мүшелер саны", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"\int_0^{a+\frac{\pi}{2}} \cos 2x\,dx,\ a \in \mathbb{R}. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "0,5"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "-0,5"},
        ],
        "subquestions": [
            {"text": r"Интегралдың ең үлкен мәні", "correct": "B"},
            {"text": r"Интегралдың ең кіші мәні", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Интеграл", "Тригонометрия"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"\left(2\frac{1}{2}\right)\% \cdot (2x - 8) = 0{,}15 теңдеуі берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "35"},
            {"label": "D", "text": "24"},
        ],
        "subquestions": [
            {"text": r"x-тің мәні", "correct": "A"},
            {"text": r"x^2 - 2x", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Теңдеу", "Пайыз"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Пирамиданың табанына параллель жазықтық қимасы, оның биіктігін 1:1 қатынасындай етіп бөледі. Пирамиданың табанының ауданы 60\text{ м}^2 болса, қиманың ауданының жай бөлгіштерін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "5"},
            {"label": "E", "text": "7"},
            {"label": "F", "text": "11"},
        ],
        "answer": '["C", "D"]',
        "topics": ["ҰБТ есебі", "Стереометрия", "Пирамида", "Жай сандар"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\sqrt{2 - \sqrt{3}}^x + \sqrt{2 + \sqrt{3}}^x = 4 теңдеудің түбірлерінің қосындысы жатқан аралық(тар)ды табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"(0; 2)"},
            {"label": "B", "text": r"(-4; 0{,}5)"},
            {"label": "C", "text": r"[-1; 1]"},
            {"label": "D", "text": r"(-5; -1)"},
            {"label": "E", "text": r"(1; 4)"},
            {"label": "F", "text": r"(-1; 2)"},
        ],
        "answer": '["B", "C", "F"]',
        "topics": ["ҰБТ есебі", "Көрсеткіштік теңдеулер", "Иррационал сандар", "Сан аралықтары"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"Егер \cos\alpha = \frac{3}{5} болса, онда \sin\alpha-ның мән(дер)ін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "0,8"},
            {"label": "B", "text": "0,6"},
            {"label": "C", "text": "0,5"},
            {"label": "D", "text": "-0,8"},
            {"label": "E", "text": "-0,6"},
            {"label": "F", "text": "0,2"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңбе-теңдіктер"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"m-нің қандай мәнінде |x^2 - 3| = m теңдеуінің екіден артық түбірі болады",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "5"},
            {"label": "E", "text": "3"},
            {"label": "F", "text": "7"},
        ],
        "answer": '["B", "C", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Модуль", "Параметрлі теңдеулер"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Цилиндрге іштей шар сызылған. Ең алыс орналасқан екі жанасу нүктелерінің арақашықтығы 8-ге тең. Шардың көлемі мен шар көлемінің цилиндр көлеміне қатынасын табыңыз (\pi \approx 3)",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "2:3"},
            {"label": "B", "text": "144"},
            {"label": "C", "text": "2:5"},
            {"label": "D", "text": "256"},
            {"label": "E", "text": "3:4"},
            {"label": "F", "text": "768"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Стереометрия", "Цилиндр", "Шар", "Көлемдер қатынасы"],
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

    # Find or create test under folder 11 ("ҰБТ есептері")
    folder_id = 11
    test_title = "25-нұсқа: Семей көпірі"

    tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = None
    for t in tests:
        if t['title'] == test_title:
            target_test = t
            break

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 25-нұсқа математика тапсырмалары (Контекст: Семей көпірі)",
            sort_order=25,
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
                    source="ubt_import_v25",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 25 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
