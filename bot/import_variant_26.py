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
        "text": r"Өрнекті ықшамда: \frac{x^2-4}{x+5} : \frac{2x+4}{x^2-25} \cdot \frac{4}{x^2-7x+10}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "-1"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Бөлшек-рационал өрнектер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"\frac{\sin x + \cos x}{1 + \operatorname{tg} x}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"1 + \cos x"},
            {"label": "B", "text": r"\frac{1}{\cos x}"},
            {"label": "C", "text": r"1 - \cos x"},
            {"label": "D", "text": r"\cos x"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық өрнектер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"\begin{cases} \sqrt[3]{x} + 2\sqrt[3]{y} = 1 \\ 3\sqrt[3]{x} - \sqrt[3]{y} = 10 \end{cases} \text{ теңдеуінің түбірлерінің қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "28"},
            {"label": "B", "text": "26"},
            {"label": "C", "text": "27"},
            {"label": "D", "text": "25"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"-8 \text{ бен } 9 \text{ сандарының айырмасының абсолют мәні}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "17"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Арифметика", "Модуль", "Бүтін сандар"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"\int_0^1 \sqrt{x\sqrt{x\sqrt{x}}} \, dx \text{ интегралды есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{8}{13}"},
            {"label": "B", "text": r"\frac{8}{15}"},
            {"label": "C", "text": r"\frac{7}{8}"},
            {"label": "D", "text": r"\frac{7}{13}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Анықталған интеграл"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\text{Теңдеуді шешіңіз: } 4^x - 16 \cdot 4^{-x} = 6",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1,5"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "0,5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"\text{Есептеңіз: } \begin{cases} b_2 = 6 \\ b_1 b_2 b_3 = ? \end{cases}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "216"},
            {"label": "B", "text": "36"},
            {"label": "C", "text": "72"},
            {"label": "D", "text": "108"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"Кубтың диагоналі мен табан жазықтығының арасындағы бұрыштың котангенсін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": r"\sqrt{3}"},
            {"label": "C", "text": r"\sqrt{2}"},
            {"label": "D", "text": r"\frac{\sqrt{2}}{2}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Куб", "Бұрыш"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"f(x) = 5 + \frac{1}{3}\ln 2x, \, x_0 = 2 \text{ нүктесіндегі туындысының мәні?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{6}"},
            {"label": "B", "text": r"\frac{1}{3}"},
            {"label": "C", "text": r"-\frac{1}{6}"},
            {"label": "D", "text": r"\frac{1}{2}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Логарифмдік функция"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"y = 2^{x-3} + 1 \text{ функциясының графигі қай координаталық ширектерде орналасқан?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "I ширек, III ширекте"},
            {"label": "B", "text": "III ширек, IV ширекте"},
            {"label": "C", "text": "I ширек, II ширекте"},
            {"label": "D", "text": "II ширек, IV ширекте"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Функциялар", "Көрсеткіштік функция", "Графиктер"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\text{Суретте берілген } f(x) \text{ функциясы бойынша } f'(0)\text{-мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-\ln 4"},
            {"label": "B", "text": r"\ln 2"},
            {"label": "C", "text": r"-\ln 2"},
            {"label": "D", "text": r"\ln 4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Көрсеткіштік функция", "Графиктер"],
        "image_filename": "v26_q11_graph.png",
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\text{Қиық конустың жасаушысы } 4\sqrt{2}\text{ см және ол табанымен } 45^\circ \text{ бұрыш жасайды. Егер қиық конустың кіші табаны 2 см болса, көлемін тап } (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "160"},
            {"label": "B", "text": "156"},
            {"label": "C", "text": "104"},
            {"label": "D", "text": "208"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Қиық конус", "Көлем"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"\text{Егер } \log_x 27 = y \text{ болса, } \log_{\sqrt{3}} \sqrt[6]{x} \text{ - неге тең?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "y"},
            {"label": "B", "text": "y^2"},
            {"label": "C", "text": "y^{-1}"},
            {"label": "D", "text": "y^{-2}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"\sqrt[5]{2x-1} \ge -2 \text{ теңсіздікті қанағаттандыратын ең кіші бүтін санды тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-17"},
            {"label": "B", "text": "-15"},
            {"label": "C", "text": "-16"},
            {"label": "D", "text": "-14"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңсіздіктер"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Алғашқы функциялары екі түрлі болатын функцияның ...",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\text{қатынасы } 1 - \text{ге тең}"},
            {"label": "B", "text": r"\text{қосындысы нақты санға тең}"},
            {"label": "C", "text": r"\text{айырымы нақты санға тең}"},
            {"label": "D", "text": r"\text{қатынасы нақты санға тең}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Алғашқы функция", "Интеграл"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"\sqrt{x^2+4} = 10 \text{ теңдеуінің түбірлерінің көбейтіндісін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "96"},
            {"label": "B", "text": "-96"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "18"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Қабырғалары 6, 8 параллелограммның доғал бұрышы сүйір бұрышынан 2 есе үлкен. Ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"24\sqrt{3}"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": r"12\sqrt{3}"},
            {"label": "D", "text": "12"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Параллелограмм", "Аудан"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"a = \log_2 \log_4 \log_2 16 \text{ және } b = \log_5 \log_7 (7^{\log_2 \sqrt[5]{32}}) \text{ өрнектері берілген. Дұрыс теңдікті көрсетіңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "a = b"},
            {"label": "B", "text": "a = 2b"},
            {"label": "C", "text": "a = -b"},
            {"label": "D", "text": "2a = b"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\left[\begin{array}{l} x^2 - 6x + 5 < 0 \\ |x - 4| \le 2 \end{array}\right. \text{ теңсіздіктер жиынтығының шешімін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(2; 5]"},
            {"label": "B", "text": "(1; 6]"},
            {"label": "C", "text": "(2; 6]"},
            {"label": "D", "text": "(1; 5]"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Теңсіздіктер жиынтығы"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\vec{a}(3; y - 1; 6) \text{ және } \vec{b}(1; 4; z - 1) \text{ векторлары коллинеар болса, } 2yz \text{ өрнегінің мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "39"},
            {"label": "B", "text": "36"},
            {"label": "C", "text": "78"},
            {"label": "D", "text": "72"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Коллинеар векторлар"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\begin{cases} 2\log_{10}(x + y) - \log_{10} x = \log_{10} 9 \\ 2^{2x+y} = 16 \end{cases} \text{ теңдеуінің түбірлерінің қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-9"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-12"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Логарифм", "Көрсеткіштік теңдеулер"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"Конустың осьтік қимасы — қабырғасы 2 см-ге тең теңқабырғалы үшбұрыш. Конусқа сырттай сызылған дұрыс төртбұрышты пирамиданың бүйір бетінің ауданын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "16"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "8"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус", "Пирамида", "Бүйір бетінің ауданы"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\text{Есепте: } \operatorname{tg}\left(2\operatorname{arctg}\frac{1}{4}\right)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{8}{15}"},
            {"label": "B", "text": r"\frac{7}{15}"},
            {"label": "C", "text": r"\frac{1}{3}"},
            {"label": "D", "text": r"\frac{2}{5}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар", "Екі еселі бұрыш"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"(3x - 7)^2 - (3x - 7) - 2 = 0 \text{ түбірлерінің көбейтіндісін есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "-6"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадрат теңдеулер", "Жаңа айнымалы енгізу"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"Қабырғасы а-ға тең кубқа іштей сызылған цилиндр көлемін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\pi a^3}{6}"},
            {"label": "B", "text": r"\frac{\pi a^3}{2}"},
            {"label": "C", "text": r"\frac{\pi a^3}{8}"},
            {"label": "D", "text": r"\frac{\pi a^3}{4}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Куб", "Цилиндр", "Көлем"],
        "image_filename": None,
    },
    # 26 (Context: Қарлығаш пен торғай)
    {
        "slot_index": 26,
        "text": r"**Қарлығаш пен торғай**" + "\n\n" + r"Жәлел жерде тұрған торғайды бақылап тұрды. Кенеттен ол торғайдың 2 м биіктіктегі ағашқа ұшып барып қонғанын және жерден 3 м биіктіктегі сымда қарлығаштың отырғанын көрді." + "\n\n" + r"Қарлығаш пен жердегі торғайдың арақашықтығының жерге ортогональ проекциясын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2 м"},
            {"label": "B", "text": "1 м"},
            {"label": "C", "text": "1,5 м"},
            {"label": "D", "text": "3 м"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Проекция", "Координаттар"],
        "image_filename": "v26_q26_birds_graph.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": r"**Қарлығаш пен торғай**" + "\n\n" + r"Жәлел жерде тұрған торғайды бақылап тұрды. Кенеттен ол торғайдың 2 м биіктіктегі ағашқа ұшып барып қонғанын және жерден 3 м биіктіктегі сымда қарлығаштың отырғанын көрді." + "\n\n" + r"Торғайдың төменгі орны мен қарлығаштың орнын сипаттайтын \vec{AD} вектордың координатасын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(2; -3)"},
            {"label": "B", "text": "(-2; -3)"},
            {"label": "C", "text": "(-2; 3)"},
            {"label": "D", "text": "(-3; 2)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Векторлар", "Координаттар"],
        "image_filename": "v26_q26_birds_graph.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": r"**Қарлығаш пен торғай**" + "\n\n" + r"Жәлел жерде тұрған торғайды бақылап тұрды. Кенеттен ол торғайдың 2 м биіктіктегі ағашқа ұшып барып қонғанын және жерден 3 м биіктіктегі сымда қарлығаштың отырғанын көрді." + "\n\n" + r"Торғайдың ағаштағы орны мен қарлығаштың орнын сипаттайтын \vec{CD} вектордың координатасын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(-1; 2)"},
            {"label": "B", "text": "(3; -1)"},
            {"label": "C", "text": "(0,5; -1)"},
            {"label": "D", "text": "(-2; 1)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Векторлар", "Координаттар"],
        "image_filename": "v26_q26_birds_graph.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": r"**Қарлығаш пен торғай**" + "\n\n" + r"Жәлел жерде тұрған торғайды бақылап тұрды. Кенеттен ол торғайдың 2 м биіктіктегі ағашқа ұшып барып қонғанын және жерден 3 м биіктіктегі сымда қарлығаштың отырғанын көрді." + "\n\n" + r"Торғайдың ағаштағы орны мен қарлығаштың арақашықтығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{13}"},
            {"label": "B", "text": r"\sqrt{5}"},
            {"label": "C", "text": r"\sqrt{3}"},
            {"label": "D", "text": r"\sqrt{11}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Арақашықтық", "Векторлар"],
        "image_filename": "v26_q26_birds_graph.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": r"**Қарлығаш пен торғай**" + "\n\n" + r"Жәлел жерде тұрған торғайды бақылап тұрды. Кенеттен ол торғайдың 2 м биіктіктегі ағашқа ұшып барып қонғанын және жерден 3 м биіктіктегі сымда қарлығаштың отырғанын көрді." + "\n\n" + r"|AD| - |CD| \text{ мәнін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{11}"},
            {"label": "B", "text": r"2\sqrt{2}"},
            {"label": "C", "text": r"\sqrt{13} - \sqrt{5}"},
            {"label": "D", "text": r"\sqrt{11} - \sqrt{3}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Арақашықтық", "Векторлар"],
        "image_filename": "v26_q26_birds_graph.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"f(x) = \cos^2 x \text{ функция туындысының анықталу облысы мен мәндер жиынын тауып, дұрыс жауаптармен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "[-1; 0]"},
            {"label": "B", "text": "[0; 1]"},
            {"label": "C", "text": "[-1; 1]"},
            {"label": "D", "text": "R"},
        ],
        "subquestions": [
            {"text": "Анықталу облысы", "correct": "D"},
            {"text": "Мәндер облысы", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Математикалық талдау", "Туынды", "Анықталу облысы", "Мәндер жиыны"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"2 \cdot 1000 + x \cdot 100 + x \cdot 10 + 6 \text{ өрнегі 9-ға қалдықсыз бөлінеді. Мұндағы белгісіз } x\text{-тің мәнін тауып, төмендегі өрнектерді дұрыс жауаптарымен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "13"},
            {"label": "B", "text": "14"},
            {"label": "C", "text": "15"},
            {"label": "D", "text": "16"},
        ],
        "subquestions": [
            {"text": r"3x - 2", "correct": "A"},
            {"text": r"2x + 4", "correct": "B"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Арифметика", "Бөлінгіштік белгілері"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"\begin{cases} x - 2y + 3z - 6 = 0 \\ 3x - 2y - 5z - 6 = 0 \end{cases} \text{ жүйесімен берілген түзу үшін дұрыс жауаптарды сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "(8; 7; 2)"},
            {"label": "B", "text": r"\frac{x}{8} = \frac{y+3}{7} = \frac{z}{2}"},
            {"label": "C", "text": "(4; 7; 3)"},
            {"label": "D", "text": r"\frac{x}{4} = \frac{y+3}{7} = \frac{z}{3}"},
        ],
        "subquestions": [
            {"text": "түзудің канондық теңдеуі", "correct": "B"},
            {"text": "пайда болған түзудің бағыттаушы векторы", "correct": "A"},
        ],
        "answer": '["B", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Кеңістіктегі түзу"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"x^3 - 4x^2 - 4x + 16 = 0 \text{ теңдеуі берілген. Дұрыс жауаптармен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "2"},
        ],
        "subquestions": [
            {"text": "Түбірлерінің саны", "correct": "A"},
            {"text": "Түбірлерінің қосындысы", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Көпмүшелер", "Жоғары дәрежелі теңдеулер"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"193; 176; 159; \dots \text{ арифметикалық прогрессия құрайтын сан қатары берілген. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "7"},
        ],
        "subquestions": [
            {"text": "он екінші мүшесі", "correct": "C"},
            {"text": "екі таңбалы мүшелерінің саны", "correct": "B"},
        ],
        "answer": '["C", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\text{Егер } (x_0; y_0) \begin{cases} 2^{\log_2(x+y)} = 10 \\ \log_x (y+2) = 2 \end{cases} \text{ теңдеулер жүйесінің шешімі болса, онда } x_0 - y_0 \text{ және } x_0 + y_0 \text{ мәндерін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "11"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "-4"},
            {"label": "E", "text": "-11"},
            {"label": "F", "text": "5"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Логарифм", "Көрсеткіштік теңдеулер"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"(\log_{\sqrt{5}} 5\sqrt{5})^2 - \log_{\sqrt[3]{5}} \sqrt[4]{5} + \log_{\sqrt{3}+1}\sqrt{4 + 2\sqrt{3}} \text{ өрнегінің мәні жатқан аралықтарды көрсетіңіз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "(7; 17)"},
            {"label": "B", "text": "(-9; 9)"},
            {"label": "C", "text": "(0; 12)"},
            {"label": "D", "text": "(7; 9)"},
            {"label": "E", "text": "(-2; 6)"},
            {"label": "F", "text": "(1; 7)"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Сан аралықтары"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"\text{Егер } (x_0; y_0) \begin{cases} 2\sqrt[3]{x} + \sqrt[3]{y} = 5 \\ \sqrt[3]{y} - \sqrt[3]{x} = -4 \end{cases} \text{ теңдеулер жүйесінің шешімі болса, онда } x_0 - y_0, \, x_0 + y_0 \text{ және } x_0 \cdot y_0 \text{ мәндерін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "-26"},
            {"label": "B", "text": "-27"},
            {"label": "C", "text": "26"},
            {"label": "D", "text": "-28"},
            {"label": "E", "text": "27"},
            {"label": "F", "text": "28"},
        ],
        "answer": '["B", "C", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"Бүйір қыры 6-ға тең дұрыс төртбұрышты пирамиданың көлемінің ең үлкен мәні жатқан аралық(тар)",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "(30; 46)"},
            {"label": "B", "text": "(12; 49)"},
            {"label": "C", "text": "(25; 55)"},
            {"label": "D", "text": "(46; 60)"},
            {"label": "E", "text": "(47,5; 59,5)"},
            {"label": "F", "text": "(27; 47)"},
        ],
        "answer": '["D", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Экстремум", "Көлем"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Центрлерінің арасындағы қашықтық 40-қа тең екі сфераның бет аудандары 676\pi \text{ және } 5476\pi. \text{ Олардың беттері қиылысқанда пайда болған шеңбердің радиусының жай бөлгіштерін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "7"},
            {"label": "D", "text": "5"},
            {"label": "E", "text": "2"},
            {"label": "F", "text": "8"},
        ],
        "answer": '["B", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера", "Жай сандар"],
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

    test_title = "26-нұсқа: Торғай"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 26-нұсқа математика тапсырмалары (Контекст: Торғай)",
            sort_order=26,
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
                    source="ubt_import_v26",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 26 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
