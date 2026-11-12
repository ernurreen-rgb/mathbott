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
        "text": r"4,5 \cdot 10^{10} : (3 \cdot 10^8) \text{ есептеңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "200"},
            {"label": "B", "text": "13,5"},
            {"label": "C", "text": "15"},
            {"label": "D", "text": "150"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Сандар мен есептеулер", "Дәреже"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"\left(\sqrt{12} + \sqrt{\frac{1}{27}}\right) \cdot \sqrt{3} \text{ өрнегінің мәні}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"6\frac{1}{9}"},
            {"label": "B", "text": r"4\frac{1}{3}"},
            {"label": "C", "text": r"6\frac{1}{3}"},
            {"label": "D", "text": r"9\frac{1}{3}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Түбірлер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"y = \cos 4x \text{ болса, } y'' - ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-4\cos 4x"},
            {"label": "B", "text": r"-16\cos 4x"},
            {"label": "C", "text": r"-4\sin 4x"},
            {"label": "D", "text": r"16\cos 4x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Екінші ретті туынды"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"y = \arccos 3x \text{ болса, } y' - ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-\frac{3}{\sqrt{1 - 9x^2}}"},
            {"label": "B", "text": r"-\frac{3}{\sqrt{1 + 9x^2}}"},
            {"label": "C", "text": r"-\frac{3}{\sqrt{1 - 3x^2}}"},
            {"label": "D", "text": r"-\frac{1}{\sqrt{1 + 3x^2}}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"x^3 - 4x^2 + x + 6 \text{ көбейткішке жіктеңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(x - 1)(x + 2)(x + 3)"},
            {"label": "B", "text": "(x + 1)(x - 2)(x - 3)"},
            {"label": "C", "text": "(x - 1)(x - 2)(x + 3)"},
            {"label": "D", "text": "(x + 1)(x + 2)(x + 3)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көпмүшелер", "Көбейткіштерге жіктеу"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"y = 7 - x^2 \text{ және } y = 5 + |x| \text{ функцияларымен шектелген фигураның ауданы}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"1\frac{1}{3} \text{ кв. бірл}"},
            {"label": "B", "text": r"2\frac{2}{3} \text{ кв. бірл}"},
            {"label": "C", "text": r"2\frac{1}{3} \text{ кв. бірл}"},
            {"label": "D", "text": r"1\frac{1}{4} \text{ кв. бірл}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Фигура ауданы"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"y = 2\sin 2x + 1 \text{ функциясының мәндер жиыны}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "[0; 2]"},
            {"label": "B", "text": "[-1; 3]"},
            {"label": "C", "text": "[0; 3]"},
            {"label": "D", "text": "[-2; 2]"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функция", "Мәндер жиыны"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"2\cos\left(\frac{\pi}{2} + x\right) = \sqrt{2} \text{ теңдеуді шешіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x = (-1)^n \frac{\pi}{4} + \pi n, n \in \mathbb{Z}"},
            {"label": "B", "text": r"x = (-1)^n \frac{\pi}{4} + 2\pi n, n \in \mathbb{Z}"},
            {"label": "C", "text": r"x = (-1)^{n+1} \frac{\pi}{4} + \pi n, n \in \mathbb{Z}"},
            {"label": "D", "text": r"x = (-1)^{n+1} \frac{\pi}{4} + 2\pi n, n \in \mathbb{Z}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"f(x) = 2x^3 + 5x^2 - 7x + 23 \text{ функциясының } f''(-2) \text{ мәнін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-14"},
            {"label": "B", "text": "14"},
            {"label": "C", "text": "22"},
            {"label": "D", "text": "-11"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Екінші ретті туынды"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"\text{Қиық конустың табанының диаметрлері } 4, 12 \text{ және биіктігі } 3. \text{ Жасаушысын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{73}"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": r"\sqrt{55}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Қиық конус"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\text{Цилиндрдің екі табан жазықтығының ауданы оның бүйір бетінің ауданына тең. Цилиндр биіктігінің табан диаметріне қатынасы қандай?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1:2"},
            {"label": "B", "text": "2:3"},
            {"label": "C", "text": "1:3"},
            {"label": "D", "text": "2:5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"8^x + 3 \cdot \sqrt{16^x} \le 12 + \sqrt[3]{8^{x+2}} \text{ теңсіздігін шешіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; 1]"},
            {"label": "B", "text": "[-2; 4]"},
            {"label": "C", "text": r"(-\infty; 2]"},
            {"label": "D", "text": "(0; 1]"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"\frac{x}{x+2} = \frac{x+1}{5x+1} \text{ теңдеу түбірлерінің қосындысын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "0,5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Рационал теңдеулер", "Теңдеу түбірлері"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"\begin{cases} \sqrt{x} + \sqrt{y} = 4 \\ x^2 + 5\sqrt{y} = 20 \end{cases} \text{ жүйесінің шешімі } (x_0; y_0) \text{ болса, } x_0 + y_0 = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "16"},
            {"label": "B", "text": "25"},
            {"label": "C", "text": "34"},
            {"label": "D", "text": "10"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"\sqrt{4x + 3} = x + 2 \text{ теңдеуін шешіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "шешімі жоқ"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"\begin{cases} 3x + 1 \ge 7 \\ x^2 - 4x \le 12 \end{cases} \text{ теңсіздіктер жүйесінің бүтін шешімдерінің санын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жүйесі", "Квадрат теңсіздік"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"(\log_3 x - 2)(x^2 - 2x - 8) \ge 0 \text{ теңсіздігін қанағаттандыратын ең кіші бүтін түбірді табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңсіздіктер", "Интервалдар әдісі"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\text{Боялған бөліктің ауданын есептеңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\ln 2"},
            {"label": "B", "text": r"2\ln 2"},
            {"label": "C", "text": r"\frac{2}{\ln 2}"},
            {"label": "D", "text": r"\frac{1}{\ln 2}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Фигура ауданы"],
        "image_filename": "v15_q18_integral.png",
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\text{Радиусы 8 см-ге тең шеңбердің радиусының ортасы арқылы } CD \text{ хордасы жүргізілді. Суреттегі сызбадағы } CE = 6 \text{ см болса, хорда ұзындығын есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "14"},
            {"label": "D", "text": "16"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Хорда"],
        "image_filename": "v15_q19_circle.png",
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\text{Алғашқы тақ нөмірлі үш мүшесінің қосындысы 39, ал көбейтіндісі 1365-ке тең болатын арифметикалық прогрессияның 41-ге тең мүшесінің нөмірін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "11"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "10"},
            {"label": "D", "text": "12"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\lg a = 4, \lg b = 3 \text{ болса, мына өрнектің мәнін табыңыз: } \log_b a - 3\log_b 4 + 2\lg 2",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3}{4}"},
            {"label": "B", "text": r"\frac{4}{3}"},
            {"label": "C", "text": r"\frac{2}{3}"},
            {"label": "D", "text": r"\frac{1}{6}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"f(x) = x \cdot e^{-x^2} \text{ функциясының экстремум нүктелерін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x_{min} = 1; x_{max} = 1"},
            {"label": "B", "text": r"x_{min} = -2; x_{max} = 2"},
            {"label": "C", "text": r"x_{min} = -\frac{1}{2}; x_{max} = \frac{1}{2}"},
            {"label": "D", "text": r"x_{min} = -\frac{\sqrt{2}}{2}; x_{max} = \frac{\sqrt{2}}{2}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Экстремум"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"A \text{ нүктесінен } \alpha \text{ жазықтығына ұзындықтары 12-ге тең } AB \text{ және } AC \text{ екі көлбеу жүргізілген. Олардың проекциялары арасындағы бұрыш } 120^\circ, \text{ ал көлбеу мен проекция арасындағы бұрыш } 30^\circ. BC \text{ кесіндісінің ұзындығын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "18"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "20"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Көлбеу және оның проекциясы"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\text{Теңдеулер жүйесін шешіңіз: } \begin{cases} \cos x \cdot \cos y = \frac{1}{4} \\ x + y = \frac{\pi}{3} \end{cases}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left(\frac{\pi}{6} + \frac{\pi n}{2}; -\frac{\pi}{6} - \frac{\pi n}{2}\right), n \in \mathbb{Z}"},
            {"label": "B", "text": r"\left(\frac{5\pi}{6} + \pi n; -\frac{\pi}{6} - \pi n\right), n \in \mathbb{Z}"},
            {"label": "C", "text": r"\left(\frac{5\pi}{12} + \frac{\pi n}{2}; -\frac{\pi}{12} - \frac{\pi n}{2}\right), n \in \mathbb{Z}"},
            {"label": "D", "text": r"\left(\frac{\pi}{12} + \frac{\pi n}{2}; -\frac{\pi}{12} - \frac{\pi n}{2}\right), n \in \mathbb{Z}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"\text{Центрі } (-3; 4), \text{ радиусы } 4 \text{ см шеңбердің теңдеуін жазыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(x + 3)^2 + (y - 4)^2 = 16"},
            {"label": "B", "text": r"(x + 3)^2 + (y - 4)^2 = 4"},
            {"label": "C", "text": r"(x - 3)^2 + (y + 4)^2 = 16"},
            {"label": "D", "text": r"(x - 3)^2 + (y + 4)^2 = 4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер теңдеуі"],
        "image_filename": None,
    },
    # 26 (Context: Үш дос)
    {
        "slot_index": 26,
        "text": "Контекст «Үш дос»\nАрман, Берік, Серік есімді үш достың үйлері үшбұрыш тәрізді жердің төбелерінде орналасқан. Арман пен Беріктің үйлерінің арақашықтығы 13 м, Арман мен Серіктің үйлерінің арақашықтығы 14 м, Берік пен Серіктің үйлерінің арақашықтығы 15 м.\n\nБеріктің үйінен Арман мен Серіктің жолына дейінгі ең қысқа қашықтық",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10 м"},
            {"label": "B", "text": "13 м"},
            {"label": "C", "text": "12 м"},
            {"label": "D", "text": "14 м"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Үшбұрыш биіктігі"],
        "image_filename": "v15_context_ush_dos.png",
    },
    # 27 (Context: Үш дос)
    {
        "slot_index": 27,
        "text": "Контекст «Үш дос»\nАрман, Берік, Серік есімді үш достың үйлері үшбұрыш тәрізді жердің төбелерінде орналасқан. Арман пен Беріктің үйлерінің арақашықтығы 13 м, Арман мен Серіктің үйлерінің арақашықтығы 14 м, Берік пен Серіктің үйлерінің арақашықтығы 15 м.\n\nДостардың үйлеріне бірдей қашықтықта орналасатындай құдық қазылды. Құдықтан Арманның үйіне дейінгі қашықтық неше м?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8,125 м"},
            {"label": "B", "text": "9 м"},
            {"label": "C", "text": "8,5 м"},
            {"label": "D", "text": "9,125 м"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Сырттай сызылған шеңбер радиусы"],
        "image_filename": "v15_context_ush_dos.png",
    },
    # 28 (Context: Үш дос)
    {
        "slot_index": 28,
        "text": "Контекст «Үш дос»\nАрман, Берік, Серік есімді үш достың үйлері үшбұрыш тәрізді жердің төбелерінде орналасқан. Арман пен Беріктің үйлерінің арақашықтығы 13 м, Арман мен Серіктің үйлерінің арақашықтығы 14 м, Берік пен Серіктің үйлерінің арақашықтығы 15 м.\n\nДостардың үйлерін қосатын жолдарға бірдей қашықтықта жарықтандыру шамын орналастыру қажет. Шам жолдан неше м қашықтықта орналастырылады?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "6"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Іштей сызылған шеңбер радиусы"],
        "image_filename": "v15_context_ush_dos.png",
    },
    # 29 (Context: Үш дос)
    {
        "slot_index": 29,
        "text": "Контекст «Үш дос»\nАрман, Берік, Серік есімді үш достың үйлері үшбұрыш тәрізді жердің төбелерінде орналасқан. Арман пен Беріктің үйлерінің арақашықтығы 13 м, Арман мен Серіктің үйлерінің арақашықтығы 14 м, Берік пен Серіктің үйлерінің арақашықтығы 15 м.\n\nДостардың үйлерін қосатын жолдармен шектелген жердің ауданы?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"35 \text{ м}^2"},
            {"label": "B", "text": r"42 \text{ м}^2"},
            {"label": "C", "text": r"70 \text{ м}^2"},
            {"label": "D", "text": r"84 \text{ м}^2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Үшбұрыш ауданы"],
        "image_filename": "v15_context_ush_dos.png",
    },
    # 30 (Context: Үш дос)
    {
        "slot_index": 30,
        "text": r"Контекст «Үш дос»" + "\n" + r"Арман, Берік, Серік есімді үш достың үйлері үшбұрыш тәрізді жердің төбелерінде орналасқан. Арман пен Беріктің үйлерінің арақашықтығы 13 м, Арман мен Серіктің үйлерінің арақашықтығы 14 м, Берік пен Серіктің үйлерінің арақашықтығы 15 м." + "\n\n" + r"Үш дос өз үйлерін ауданы 900 \text{ м}^2\text{-қа тең болатындай тіктөртбұрышты етіп қоршады. Периметрі ең аз болатындай ұзындығы мен енінің өлшемі}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "45 м, 20 м"},
            {"label": "B", "text": r"30\sqrt{2} \text{ м}, 15\sqrt{2} \text{ м}"},
            {"label": "C", "text": "25 м, 36 м"},
            {"label": "D", "text": "30 м, 30 м"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Алгебра", "Экстремум", "Геометрия"],
        "image_filename": "v15_context_ush_dos.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"\left(7\frac{1}{3} a^3 b c^4 \cdot 2\frac{3}{11} c^2 a b^3\right) \cdot \frac{3}{2} b^2 a^3 c^3 \text{ өрнегі бойынша сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "22"},
            {"label": "B", "text": "21"},
            {"label": "C", "text": "25"},
            {"label": "D", "text": "27"},
        ],
        "subquestions": [
            {"text": "Бірмүшенің коэффициенті", "correct": "C"},
            {"text": "Бірмүшенің дәрежесі", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Бірмүше"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"(a - 2)x^2 + 2(a^2 - 4)x - 8 = 0 \text{ теңдеуі бойынша сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-2"},
        ],
        "subquestions": [
            {"text": r"a\text{-ның қандай мәнінде теңдеудің бірдей екі түбірі болады?}", "correct": "A"},
            {"text": r"a\text{-ның қандай мәнінде толымсыз квадрат теңдеу шығады?}", "correct": "D"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Квадрат теңдеулер", "Параметрлі теңдеулер"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"\cos^2\alpha + \cos^4\alpha + \cos^6\alpha + \dots = 3 \text{ теңдігі бойынша } \operatorname{tg}\alpha\text{-ны сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"-\frac{\sqrt{3}}{3}"},
            {"label": "B", "text": r"\sqrt{3}"},
            {"label": "C", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "D", "text": r"-\sqrt{3}"},
        ],
        "subquestions": [
            {"text": r"\operatorname{tg}\alpha > 0", "correct": "C"},
            {"text": r"\operatorname{tg}\alpha < 0", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Тригонометрия", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"2x^2 - 8x + k = 0 \text{ теңдеуінің түбірлерінің айырмасы } x_2 - x_1 = 2 \text{ болса, } x_1 \text{ және } k\text{-ны сан мәндерімен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "6"},
        ],
        "subquestions": [
            {"text": "x_1", "correct": "B"},
            {"text": "k", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Виет теоремасы", "Квадрат теңдеулер"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"1 - \frac{1}{2} + \frac{1}{4} - \frac{1}{8} + \dots \text{ тізбегінің оң мүшелерінің қосындысы мен теріс мүшелерінің қосындысын сан мәндерімен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": r"1\frac{1}{3}"},
            {"label": "C", "text": r"-\frac{5}{3}"},
            {"label": "D", "text": r"-\frac{2}{3}"},
        ],
        "subquestions": [
            {"text": "оң мүшелердің қосындысы", "correct": "B"},
            {"text": "теріс мүшелердің қосындысы", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Геометриялық прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\sin\alpha = \frac{\sqrt{3}}{2} \text{ болса, } \operatorname{tg}\alpha = ?",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "B", "text": r"-\sqrt{3}"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": r"\sqrt{3}"},
            {"label": "E", "text": "1"},
            {"label": "F", "text": r"-\frac{\sqrt{3}}{3}"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"(x_0; y_0) \text{ сандар жұбы } \begin{cases} \sqrt[3]{x} + \sqrt[3]{y} = 4 \\ x + y = 28 \end{cases} \text{ теңдеулер жүйесінің шешімі екені белгілі. } x_0 - y_0 \text{ өрнегінің сан мәні жататын аралық(-тары)}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "(-5; 26)"},
            {"label": "B", "text": "(30; 40)"},
            {"label": "C", "text": "(2; 27)"},
            {"label": "D", "text": "(7; 23)"},
            {"label": "E", "text": "(-30; 0)"},
            {"label": "F", "text": "(-12; 12)"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"2x - 3y = 5 \text{ теңдігінен } x \text{ пен } y\text{-ті табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"x = \frac{3}{2}y - \frac{5}{2}"},
            {"label": "B", "text": r"x = \frac{2}{3}y - \frac{5}{2}"},
            {"label": "C", "text": r"x = \frac{3}{2}y + \frac{5}{2}"},
            {"label": "D", "text": r"y = \frac{2}{3}x + \frac{5}{3}"},
            {"label": "E", "text": r"y = \frac{2}{3}x - \frac{5}{3}"},
            {"label": "F", "text": r"y = \frac{3}{2}x + \frac{5}{3}"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Сызықтық теңдеулер", "Өрнекті түрлендіру"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"\text{Егер } (x_0; y_0) \text{ сандар жұбы } \begin{cases} \lg(x^2 + y^2) = 1 \\ \lg(x + y) + \lg(x - y) = 3\lg 2 \end{cases} \text{ теңдеулер жүйесінің шешімі болса, онда } x_0 - y_0 \text{ мәндерін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "-4"},
            {"label": "D", "text": "3"},
            {"label": "E", "text": "4"},
            {"label": "F", "text": "-2"},
        ],
        "answer": '["B", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\text{Дұрыс төртбұрышты қиық пирамида берілген. Толық бетінің және бүйір бетінің аудандарын табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"40\sqrt{7}"},
            {"label": "B", "text": r"2(13 + 14\sqrt{7})"},
            {"label": "C", "text": r"60\sqrt{7}"},
            {"label": "D", "text": r"2(28 + 30\sqrt{7})"},
            {"label": "E", "text": r"2(29 + 20\sqrt{7})"},
            {"label": "F", "text": r"28\sqrt{7}"},
        ],
        "answer": '["A", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Қиық пирамида", "Бетінің ауданы"],
        "image_filename": "v15_q40_pyramid.png",
    },
]

async def import_variant():
    db_url = get_db_url()
    if not db_url:
        print("DATABASE_URL not found!")
        return

    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    folder_id = 11  # "ҰБТ есептері"
    test_title = "15-нұсқа: Үш дос"
    test_desc = "ҰБТ 15-нұсқа математика тапсырмалары (Контекст: Үш дос)"

    # Check if test already exists in folder 11
    tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = None
    for t in tests:
        if t['title'] == test_title or t['title'].startswith("15-нұсқа"):
            target_test = t
            break

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description=test_desc,
            sort_order=15,
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
                    source="ubt_import_v15",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 15 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
