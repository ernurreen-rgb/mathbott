import asyncio
import json
import sys
from pathlib import Path

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

from database import Database

def get_db_url():
    with open(bot_dir / '.env.prod.test', 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"f(x) = \sin 2x + 2x\text{ функциясының екінші ретті туындысын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"f''(x) = 2\sin 2x + 2"},
            {"label": "B", "text": r"f''(x) = -4\sin 2x"},
            {"label": "C", "text": r"f''(x) = 4\cos 2x"},
            {"label": "D", "text": r"f''(x) = -8\sin 2x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Тригонометрия"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"Дұрыс төртбұрышты қиық пирамиданың табан қабырғалары 5 және 7, ал диагональдық қимасының диагоналы 9-ға тең. Пирамиданың биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "3"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Қиық пирамида"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"\begin{cases} \sin 2x + \sin 2y = 1 \\ x + y = \frac{\pi}{2} \end{cases} \text{ теңдеуді шешіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left(\frac{\pi}{6} \pm \frac{\pi}{4} + \pi k; \frac{\pi}{3} \mp \frac{\pi}{4} - \pi k\right)"},
            {"label": "B", "text": r"\left(\pm \frac{\pi}{6} + \frac{\pi}{3} + \pi k; \mp \frac{\pi}{6} + \frac{\pi}{6} - \pi k\right)"},
            {"label": "C", "text": r"\left(\pm \frac{\pi}{3} + \frac{\pi}{4} + \pi k; \mp \frac{\pi}{3} + \frac{\pi}{4} - \pi k\right)"},
            {"label": "D", "text": r"\left(\pm \frac{\pi}{6} + \frac{\pi}{4} + \pi k; \mp \frac{\pi}{6} + \frac{\pi}{4} - \pi k\right)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"Шардың көлемін 8 есе арттырса, радиусы қалай өзгереді",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"8\text{ есе артады}"},
            {"label": "B", "text": r"4\text{ есе артады}"},
            {"label": "C", "text": r"2\text{ есе артады}"},
            {"label": "D", "text": r"\text{өзгермейді}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Шар"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"\cos(920^\circ)\text{ тең жауапты көрсетіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-\cos 20^\circ"},
            {"label": "B", "text": r"\cos 20^\circ"},
            {"label": "C", "text": r"-\sin 20^\circ"},
            {"label": "D", "text": r"\sin 20^\circ"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Келтіру формулалары"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\text{Квадрат үшмүшені көбейткіштерге жіктеңіз: } x^2 - 4x - 21",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(x + 7) \cdot (x + 3)"},
            {"label": "B", "text": r"(2x - 7) \cdot (x - 3)"},
            {"label": "C", "text": r"(x - 7) \cdot (x + 3)"},
            {"label": "D", "text": r"(x + 7) \cdot (x - 3)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Көпмүшелер", "Квадрат үшмүше"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"t = 3\text{ уақыт мезетіндегі } s(t) = \frac{1}{2}t^2 + 4t\text{ заңы бойынша қозғалатын материалдық нүктенің жылдамдығын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "7"},
            {"label": "C", "text": "10"},
            {"label": "D", "text": "8"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Физикалық мағынасы"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"ACB тікбұрышты үшбұрышы жарты шеңберге іштей сызылған. AB шеңбердің диаметрі, ұзындығы 13-ке тең. Егер AH = 4 болса, ACH үшбұрышының ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "18"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "20"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш"],
        "image_filename": "v3_q08_semicircle_triangle.png",
    },
    # 9
    {
        "slot_index": 9,
        "text": r"\begin{cases} x + 2y = 6, \\ -5x + y = 9 \end{cases}\text{ теңдеулер жүйесінің шешімі қай ширекте жатқанын көрсетіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\text{I}"},
            {"label": "B", "text": r"\text{II}"},
            {"label": "C", "text": r"\text{III}"},
            {"label": "D", "text": r"\text{IV}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Координаталар жүйесі"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"0,0(5)\text{ шексіз периодтық ондық бөлшекті жай бөлшек арқылы көрсетіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{5}{18}"},
            {"label": "B", "text": r"\frac{2}{3}"},
            {"label": "C", "text": r"\frac{1}{7}"},
            {"label": "D", "text": r"\frac{1}{18}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Арифметика", "Бөлшектер", "Периодты бөлшек"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"Геометриялық прогрессияда b_n = 5, b_1 = 80, q = 0,5\text{ екені белгілі болса, } n\text{-нің мәні}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"f(x) = 2\sin\left(3x - \frac{\pi}{4}\right) - \cos\left(2x + \frac{\pi}{6}\right)\text{ функциясының туындысын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"3\cos\left(3x - \frac{\pi}{4}\right) + 2\sin\left(2x + \frac{\pi}{6}\right)"},
            {"label": "B", "text": r"-6\cos\left(3x - \frac{\pi}{4}\right) - 2\sin\left(2x + \frac{\pi}{6}\right)"},
            {"label": "C", "text": r"6\cos\left(3x - \frac{\pi}{4}\right) - 2\sin\left(2x + \frac{\pi}{6}\right)"},
            {"label": "D", "text": r"6\cos\left(3x - \frac{\pi}{4}\right) + 2\sin\left(2x + \frac{\pi}{6}\right)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Тригонометрия"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"\text{Теңдеулер жүйесін шешіңіз: } \begin{cases} \frac{1}{x} + \frac{1}{y} = 1 \\ y = 4 - x \end{cases}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(3; 1)"},
            {"label": "B", "text": "(1; 2)"},
            {"label": "C", "text": "(2; 2)"},
            {"label": "D", "text": "(1; 3)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"49x^2 - 28x + 4 < 0\text{ теңсіздігін шешіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; +\infty)"},
            {"label": "B", "text": r"x = \frac{2}{7}"},
            {"label": "C", "text": r"\left(-\infty; \frac{2}{7}\right) \cup \left(\frac{2}{7}; +\infty\right)"},
            {"label": "D", "text": r"\text{шешімі жоқ}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Квадрат теңсіздік"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"\text{Өрнекті ықшамдаңыз: } (\vec{AB} + \vec{AC}) + (\vec{BA} + \vec{CB}) + (\vec{CA} + \vec{BC})",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": r"-\vec{AB}"},
            {"label": "C", "text": r"\vec{AB}"},
            {"label": "D", "text": "0"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"\vec{a} = (2; -1; 0)\text{ және }\vec{b} = (3; 0; 1)\text{ векторларының арасындағы бұрышты табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\arccos\frac{3\sqrt{2}}{5}"},
            {"label": "B", "text": r"\arccos\frac{6\sqrt{2}}{5}"},
            {"label": "C", "text": r"\arcsin\frac{\sqrt{2}}{5}"},
            {"label": "D", "text": r"\arcsin\frac{3\sqrt{3}}{4}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Векторлар арасындағы бұрыш"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"|x^2 - 3x| = 4\text{ теңдеуінің түбірлерінің көбейтіндісін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "-2"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "-4"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Модульдік теңдеулер", "Квадрат теңдеу"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\text{Дұрыс төртбұрышты пирамиданың табан қабырғасы 10 см, биіктігі 4 см. Пирамиданың көлемін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "600"},
            {"label": "B", "text": "400"},
            {"label": "C", "text": r"\frac{500}{3}"},
            {"label": "D", "text": r"\frac{400}{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Пирамида көлемі"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\text{Дұрыс көпбұрыш бұрыштарының қосындысы } 1800^\circ\text{. Қабырғалар санын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "11"},
            {"label": "B", "text": "15"},
            {"label": "C", "text": "13"},
            {"label": "D", "text": "12"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Көпбұрыш"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\begin{cases} 3x^2 - 5x + 6 \ge 0 \\ x^2 + 10x + 25 \le 0 \end{cases} \text{ теңсіздіктер жүйесінің шешімі}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-5"},
            {"label": "B", "text": r"\emptyset"},
            {"label": "C", "text": r"(-\infty; 5) \cup (5; +\infty)"},
            {"label": "D", "text": r"(-\infty; +\infty)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жүйесі", "Квадрат теңсіздік"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"x^2 + (\sqrt{2} - 2)x - 2\sqrt{2} < 0\text{ теңсіздігінің шешімі}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"[-2\sqrt{2}; +\infty)"},
            {"label": "B", "text": r"(-\infty; \sqrt{2})"},
            {"label": "C", "text": r"(-\sqrt{2}; 2)"},
            {"label": "D", "text": r"(2,2; \sqrt{2})"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Квадрат теңсіздік"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"x^2 - |x| - 6 = 0\text{ теңдеуінің барлық түбірлерінің квадраттарының қосындысының мәнін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "18"},
            {"label": "D", "text": "14"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Модульдік теңдеулер", "Квадрат теңдеу"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\begin{cases} \frac{7,4x + 23}{21} \le 1 + 0,4x \\ 3x - 5 \le \frac{20x - 31}{7} \end{cases} \text{ теңсіздіктер жүйесінің шешімі болатын ең кіші натурал санды табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жүйесі", "Сызықтық теңсіздік"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\cos\frac{\pi}{6} + \cos^2\frac{\pi}{6} + \cos^3\frac{\pi}{6} + \dots + \cos^n\frac{\pi}{6} + \dots \text{ қосындының мәнін есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"4 + 2\sqrt{3}"},
            {"label": "B", "text": r"2\sqrt{3} - 3"},
            {"label": "C", "text": r"3 + 2\sqrt{3}"},
            {"label": "D", "text": r"2\sqrt{3} - 2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия", "Тригонометрия"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"\text{Табандары 8 см және 14 см тең бүйірлі трапецияның бүйір қабырғасы 5 см. Трапецияның үлкен табанынан айналдырғанда пайда болатын фигураның бет ауданын есептеңіз } (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "120"},
            {"label": "B", "text": "190"},
            {"label": "C", "text": "252"},
            {"label": "D", "text": "312"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Цилиндр", "Конус"],
        "image_filename": None,
    },
    # 26 (Context 1)
    {
        "slot_index": 26,
        "text": r"10 \text{ соттық тіктөртбұрышты жер телімі берілген. Ол жерге үй салып, жанына бассейн орнатпақшы. Үйдің ұзындығы } - x\text{, ені } - y\text{ метр. Бассейн дөңгелек пішінді, радиусы 2 м } (1\text{ сот.} = 100\text{ м}^2)." + "\n\n" + r"\text{Үйдің ауданын өрнектейтін формуланы көрсетіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x + y"},
            {"label": "B", "text": r"xy"},
            {"label": "C", "text": r"x^2"},
            {"label": "D", "text": r"y^2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Аудан"],
        "image_filename": "v3_q26_30_land_plan.png",
    },
    # 27 (Context 2)
    {
        "slot_index": 27,
        "text": r"10 \text{ соттық тіктөртбұрышты жер телімі берілген. Ол жерге үй салып, жанына бассейн орнатпақшы. Үйдің ұзындығы } - x\text{, ені } - y\text{ метр. Бассейн дөңгелек пішінді, радиусы 2 м } (1\text{ сот.} = 100\text{ м}^2)." + "\n\n" + r"10 \text{ соттық жердің ауданын есептеңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"100\text{ м}^2"},
            {"label": "B", "text": r"10^4\text{ м}^2"},
            {"label": "C", "text": r"100000\text{ м}^2"},
            {"label": "D", "text": r"1000\text{ м}^2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Арифметика", "Өлшем бірліктер"],
        "image_filename": "v3_q26_30_land_plan.png",
    },
    # 28 (Context 3)
    {
        "slot_index": 28,
        "text": r"10 \text{ соттық тіктөртбұрышты жер телімі берілген. Ол жерге үй салып, жанына бассейн орнатпақшы. Үйдің ұзындығы } - x\text{, ені } - y\text{ метр. Бассейн дөңгелек пішінді, радиусы 2 м } (1\text{ сот.} = 100\text{ м}^2)." + "\n\n" + r"\text{Бассейн ұзындығын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\pi"},
            {"label": "B", "text": r"4\pi"},
            {"label": "C", "text": r"6\pi"},
            {"label": "D", "text": r"0,5\pi"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Шеңбер ұзындығы"],
        "image_filename": "v3_q26_30_land_plan.png",
    },
    # 29 (Context 4)
    {
        "slot_index": 29,
        "text": r"10 \text{ соттық тіктөртбұрышты жер телімі берілген. Ол жерге үй салып, жанына бассейн орнатпақшы. Үйдің ұзындығы } - x\text{, ені } - y\text{ метр. Бассейн дөңгелек пішінді, радиусы 2 м } (1\text{ сот.} = 100\text{ м}^2)." + "\n\n" + r"\text{Үйді алып тастағандағы жердің периметрі}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2(a + b) - (x + y)"},
            {"label": "B", "text": r"2ab - 2xy"},
            {"label": "C", "text": r"2a + 2b"},
            {"label": "D", "text": r"2(a + b - x + y)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Периметр"],
        "image_filename": "v3_q26_30_land_plan.png",
    },
    # 30 (Context 5)
    {
        "slot_index": 30,
        "text": r"10 \text{ соттық тіктөртбұрышты жер телімі берілген. Ол жерге үй салып, жанына бассейн орнатпақшы. Үйдің ұзындығы } - x\text{, ені } - y\text{ метр. Бассейн дөңгелек пішінді, радиусы 2 м } (1\text{ сот.} = 100\text{ м}^2)." + "\n\n" + r"\text{Жалпы жердің периметрі ең кіші болатындай } a\text{-ның мәні}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"10\sqrt{5}"},
            {"label": "B", "text": r"10\sqrt{10}"},
            {"label": "C", "text": r"5\sqrt{10}"},
            {"label": "D", "text": "10"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Математикалық анализ", "Ең кіші мән", "Экстремум"],
        "image_filename": "v3_q26_30_land_plan.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"\text{Түбірлерінің бірі } x_1 = 4\text{ болатын } 3x^2 - bx - 24 = 0\text{ квадрат теңдеуінің } b\text{ коэффициентін және } x_2\text{ екінші түбірін мәндерімен сәйкестендіріңіз:}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-6"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-2"},
        ],
        "subquestions": [
            {"text": r"b", "correct": "B"},
            {"text": r"x_2", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Квадрат теңдеу", "Виет теоремасы"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"A(0; 4), B(2; -4), C(1; 6)\text{ нүктелері үшбұрыштың төбелері. Төмендегі ұғымдарды олардың мәндерімен сәйкестендіріңіз:}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"2\sqrt{13}"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": r"2\sqrt{17}"},
        ],
        "subquestions": [
            {"text": r"AB\text{ қабырғасының ұзындығы}", "correct": "D"},
            {"text": r"ABC\text{ үшбұрышының ауданы}", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Аналитикалық геометрия", "Үшбұрыш ауданы"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"\text{Дұрыс алтыбұрыштың периметрі 48 см. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "9"},
        ],
        "subquestions": [
            {"text": r"\text{іштей сызылған шеңбер радиусының бүтінге дейін жуықталған мәні}", "correct": "A"},
            {"text": r"\text{сырттай сызылған шеңбер радиусы}", "correct": "B"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Дұрыс көпбұрыш"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"S_n = 4n^2 + n\text{. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "13"},
        ],
        "subquestions": [
            {"text": r"a_1", "correct": "C"},
            {"text": r"d", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"\text{Табандары 3 см және 7 см дұрыс төртбұрышты қиық пирамиданың бүйір жағы мен табан жазықтығының арасындағы бұрыш } 60^\circ\text{. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "138"},
            {"label": "B", "text": r"80\sqrt{3}"},
            {"label": "C", "text": r"58 + 80\sqrt{3}"},
            {"label": "D", "text": "80"},
        ],
        "subquestions": [
            {"text": r"\text{бүйір бетінің ауданы}", "correct": "D"},
            {"text": r"\text{толық бетінің ауданы}", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Пирамида", "Қиық пирамида"],
        "image_filename": "v3_q35_frustum_pyramid.png",
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\sqrt{x - 2} = 3 - \sqrt{7 - x}\text{ иррационал теңдеудің түбірлерінің қосындысы мен айырмасының модулін анықтаңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "-2"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "10"},
            {"label": "E", "text": "0"},
            {"label": "F", "text": "9"},
        ],
        "answer": '["A", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңдеу"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\text{Көбейткіштерге жіктеңіз: } 0,16a^2 - (a - x)^2",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"(x - 0,6a)(1,4a - x)"},
            {"label": "B", "text": r"-(0,6a - x)(1,4a - x)"},
            {"label": "C", "text": r"(0,4x - 0,6a)(1,4a - 2x)"},
            {"label": "D", "text": r"(x + 0,6a)(1,4a - x)"},
            {"label": "E", "text": r"(2x - 0,6a)(2,4a - x)"},
            {"label": "F", "text": r"-(x - 0,6a)(1,4a - x)"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Қысқаша көбейту формулалары", "Көбейткіштерге жіктеу"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"\text{Төмендегі сандардың ішінен бірінші мүшесі 2-ге тең, одан кейінгі орналасқан мүшелерінің қосындысы 1-ге тең болатын шектеусіз кемімелі геометриялық прогрессияның мүшелері бола алатын(дар)ы}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{2}{27}"},
            {"label": "B", "text": r"\frac{2}{3}"},
            {"label": "C", "text": r"\frac{1}{12}"},
            {"label": "D", "text": r"\frac{2}{7}"},
            {"label": "E", "text": r"\frac{1}{6}"},
            {"label": "F", "text": r"\frac{1}{3}"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"\text{Осьтік қимасының диагоналі 10 см, биіктігі 8 см болатын цилиндрдің осьтік қимасының және осіне перпендикуляр қиманың ауданын табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"18\pi"},
            {"label": "B", "text": "36"},
            {"label": "C", "text": "42"},
            {"label": "D", "text": "48"},
            {"label": "E", "text": r"8\pi"},
            {"label": "F", "text": r"9\pi"},
        ],
        "answer": '["D", "F"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Қималар"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\text{Төмендегілер ішінде } \alpha\text{ сүйір бұрышы үшін мәні оң болатын өрнек(тер)}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\cos\left(\frac{5\pi}{6} + 2\alpha\right)"},
            {"label": "B", "text": r"-\sin\left(\alpha + \frac{\pi}{2}\right)"},
            {"label": "C", "text": r"\sin\left(\frac{\pi}{2} + \alpha\right)"},
            {"label": "D", "text": r"-\operatorname{tg}(3\pi + \alpha)"},
            {"label": "E", "text": r"\operatorname{ctg}\left(\frac{3\pi}{2} - \alpha\right)"},
            {"label": "F", "text": r"\cos\left(\frac{3\pi}{2} + 2\alpha\right)"},
        ],
        "answer": '["C", "E", "F"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Келтіру формулалары", "Тригонометриялық таңбалар"],
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

    # Check folder ҰБТ есептері
    folders = await db.trial_tests.get_trial_test_folders(include_empty=True)
    ubt_folder = next((f for f in folders if f['name'] == 'ҰБТ есептері'), None)
    if not ubt_folder:
        print("Creating folder ҰБТ есептері...", flush=True)
        ubt_folder = await db.trial_tests.create_trial_test_folder(name='ҰБТ есептері', sort_order=1)

    folder_id = ubt_folder['id']
    print(f"Target folder ID: {folder_id}", flush=True)

    test_title = "3-нұсқа: Жер телімі"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 3-нұсқа математика тапсырмалары (Контекст: Жер телімі)",
            sort_order=3,
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
                    source="ubt_import_v3",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 3 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
