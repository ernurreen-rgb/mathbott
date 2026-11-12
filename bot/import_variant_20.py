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

context_text = "**Мая шөп**\n\nМая шөп жиналды. Жаңадан жиналған шөп уақыт өте келе басылады. Басылу кестесі төмендегідей:\n\n"

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"y = \ln\frac{x^2 - 5x}{x + 3} \text{ функциясының анықталу облысына тиісті ең кіші бүтін санды тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-3"},
            {"label": "B", "text": "-5"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "0"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Анықталу облысы", "Логарифм"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"\operatorname{arctg}\left(\frac{2x + 1}{4} - 2\right) = \frac{\pi}{4} \text{ теңдеудің түбірін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "5,5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар", "Теңдеу"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"Жұп функцияның графигін анықта",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "A"},
            {"label": "B", "text": "B"},
            {"label": "C", "text": "C"},
            {"label": "D", "text": "D"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция қасиеттері", "Жұп және тақ функциялар", "График"],
        "image_filename": "v20_q03_even_function_graphs.png",
    },
    # 4
    {
        "slot_index": 4,
        "text": r"\text{Есепте: } \frac{1}{\sqrt{2} + 1} + \frac{1}{\sqrt{2} + \sqrt{3}} + \frac{1}{\sqrt{3} + \sqrt{4}} + \ldots + \frac{1}{\sqrt{99} + \sqrt{100}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": "11"},
            {"label": "D", "text": "12"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал өрнектер", "Телескоптық қосынды"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"\text{Есепте: } 7^{\frac{2}{\log_2 7}} \cdot 4^{\log_4 6} + 4 \cdot 6^{\frac{1}{\log_4 6}} + (\sqrt[3]{5})^{\log_3 27}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "40"},
            {"label": "B", "text": "45"},
            {"label": "C", "text": "50"},
            {"label": "D", "text": "35"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\text{Суретте радиустары 10 және 4 болатын екі шеңбер A нүктесінде сырттай жанасады. A нүктесі арқылы өтетін түзу шеңберлерді B және C нүктелерінде қиып өтеді. } AC = 15, AB \text{ кесіндісін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "9"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Ұқсастық"],
        "image_filename": "v20_q06_touching_circles.png",
    },
    # 7
    {
        "slot_index": 7,
        "text": r"\cos x + \cos^2 x + \cos^3 x + \ldots = 3 \text{ теңдікті пайдаланып } \sin 2x = ? \text{ мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3\sqrt{7}}{8}"},
            {"label": "B", "text": r"\frac{\sqrt{7}}{7}"},
            {"label": "C", "text": r"\frac{3\sqrt{7}}{10}"},
            {"label": "D", "text": r"\frac{3\sqrt{7}}{16}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"\text{Теңдеудің түбірлерінің қосындысын есепте: } \frac{x-1}{\sqrt{x}+1} - \frac{x}{6} = \frac{1}{3}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "10"},
            {"label": "D", "text": "20"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңдеулер", "Теңдеу"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"\text{Есептеңіз: } \log_{\sqrt{3}+1}(4 + 2\sqrt{3})",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"\text{Сүйір бұрышы } 30^\circ\text{-қа тең тікбұрышты трапеция пішіндес жер телімінің периметрі 18 м. Жер телімі ауданының ең үлкен мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "14"},
            {"label": "B", "text": "11"},
            {"label": "C", "text": "13,5"},
            {"label": "D", "text": "12"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Трапеция", "Ең үлкен мән", "Туынды"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"4 \sin 5x \cos 5x \ge \sqrt{3} \text{ теңсіздікті шеш}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left[\frac{\pi}{60} + \frac{\pi n}{6}; \frac{\pi}{30} + \frac{\pi n}{6}\right], n \in \mathbb{Z}"},
            {"label": "B", "text": r"\left[\frac{\pi}{10} + \frac{\pi n}{5}; \frac{\pi}{5} + \frac{\pi n}{5}\right], n \in \mathbb{Z}"},
            {"label": "C", "text": r"\left[\frac{\pi}{30} + \frac{\pi n}{5}; \frac{\pi}{15} + \frac{\pi n}{5}\right], n \in \mathbb{Z}"},
            {"label": "D", "text": r"\left[\frac{\pi}{6} + \frac{\pi n}{5}; \frac{\pi}{3} + \frac{\pi n}{5}\right], n \in \mathbb{Z}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңсіздік"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\frac{\alpha}{\beta} = \frac{1}{2} \text{ және C бұрышы тік болса, тікбұрышты үшбұрыштың ауданын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{3}"},
            {"label": "B", "text": r"2\sqrt{3}"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": r"3\sqrt{3}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш", "Үшбұрыш ауданы"],
        "image_filename": "v20_q12_right_triangle.png",
    },
    # 13
    {
        "slot_index": 13,
        "text": r"x^{\log_3 x - 3} = 81 \text{ теңдеудің түбірлерінің көбейтіндісін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "81"},
            {"label": "B", "text": "27"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "243"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеулер", "Теңдеу"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"\left(\frac{1}{3}\right)^{\log_3(2x-4)} < 1 \text{ теңсіздікті қанағаттандыратын ең кіші бүтін санды тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "3"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер", "Логарифмдік теңсіздіктер"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"\text{Бірлік кубқа сырттай және іштей сызылған сфераның бет аудандарының қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2,5\pi"},
            {"label": "B", "text": r"5\pi"},
            {"label": "C", "text": r"3\pi"},
            {"label": "D", "text": r"4\pi"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Куб", "Сфера"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"\text{Есептеңіз: } \arccos\left(2 \sin\left(-\frac{\pi}{6}\right)\right)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\pi"},
            {"label": "B", "text": r"\frac{\pi}{2}"},
            {"label": "C", "text": r"\frac{\pi}{3}"},
            {"label": "D", "text": r"-\pi"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"\text{Катеттері 3 см және 4 см тікбұрышты үшбұрышты кіші катетінен айналдырғанда пайда болған дененің толық бетінің ауданын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"20\pi"},
            {"label": "B", "text": r"16\pi"},
            {"label": "C", "text": r"26\pi"},
            {"label": "D", "text": r"36\pi"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Конус"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\text{Жазықтыққа одан тыс жатқан нүкте арқылы оған параллель болатын қанша түзу жүргізуге болатынын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "жүргізу мүмкін емес"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "шексіз көп"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Параллельдік"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\text{Өрнекті ықшамда: } \sin^2 x + \sin^2 x \cdot \cos^2 x + \cos^4 x",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": r"\cos x"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": r"\sin x"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\frac{2025a+4050}{a^2-25} \cdot \frac{a+5}{a+2} \text{ өрнекті ықшамдап, } a = 6 \text{ болғанда мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2024"},
            {"label": "B", "text": "2025"},
            {"label": "C", "text": "2023"},
            {"label": "D", "text": "2000"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Рационал өрнектер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\text{Теңсіздікті шешіңіз: } (\sqrt{10} - 3)^x > 19 - 6\sqrt{10}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; -2)"},
            {"label": "B", "text": r"(-\infty; 2)"},
            {"label": "C", "text": r"(2; +\infty)"},
            {"label": "D", "text": r"(-2; 2)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер", "Теңсіздіктер"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\text{Радиусы 4 см-ге тең шеңберге ұзындығы 4 см AB хордасы жүргізілді. AB хордасы бөлетін екі сегменттің кішісінің ауданын тап } (\pi \approx 3)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"12 - 6\sqrt{3}"},
            {"label": "B", "text": r"16 - 8\sqrt{3}"},
            {"label": "C", "text": r"10 - 5\sqrt{3}"},
            {"label": "D", "text": r"8 - 4\sqrt{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Сегмент ауданы"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\frac{x}{2} + \frac{y}{1} + \frac{z}{3} = 1 \text{ және } 4x - 2y + z - 6 = 0 \text{ жазықтықтарының арасындағы бұрышты тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\arccos\frac{2\sqrt{21}}{147}"},
            {"label": "B", "text": r"\arcsin\frac{5\sqrt{21}}{147}"},
            {"label": "C", "text": r"\arccos\frac{\sqrt{21}}{147}"},
            {"label": "D", "text": r"\arcsin\frac{\sqrt{21}}{147}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Аналитикалық геометрия", "Стереометрия", "Жазықтықтар арасындағы бұрыш"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"y = \sin 2x + \operatorname{arctg} x \text{ функцияның туындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = 2\cos 2x + \frac{1}{1-x^2}"},
            {"label": "B", "text": r"y = 2\cos 2x - \frac{1}{\sqrt{1-x^2}}"},
            {"label": "C", "text": r"y = 2\cos 2x + \frac{1}{\sqrt{1-x^2}}"},
            {"label": "D", "text": r"y = 2\cos 2x + \frac{1}{1+x^2}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Тригонометрия"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"a\text{-ның қандай мәнінде } y = \sin 2x \text{ функциясы мен } y = a \text{ түзуінің ортақ нүктесі болмайды?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; -1) \cup (1; \infty)"},
            {"label": "B", "text": r"(-1; 1)"},
            {"label": "C", "text": r"(-\infty; -2) \cup (2; \infty)"},
            {"label": "D", "text": r"(-2; 2)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функция", "Мәндер жиыны"],
        "image_filename": None,
    },
    # 26 (Context: Мая шөп)
    {
        "slot_index": 26,
        "text": context_text + r"12 \text{ күн өткен соң шөптің басылуы қанша см}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "22"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": "23"},
            {"label": "D", "text": "25"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Функция", "Кестемен жұмыс"],
        "image_filename": "v20_q26_hay_table.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": context_text + r"\text{Кестедегі тәуелділікті табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \sqrt{x - 2} + 22"},
            {"label": "B", "text": r"y = \sqrt{x - 3} + 20"},
            {"label": "C", "text": r"y = \sqrt{x - 2} + 21"},
            {"label": "D", "text": r"y = \sqrt{x - 3} + 21"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Функция", "Функция графигі және формуласы"],
        "image_filename": "v20_q26_hay_table.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": context_text + r"\text{Шөп 26 см басылу үшін қанша күн керек}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "33"},
            {"label": "B", "text": "29"},
            {"label": "C", "text": "30"},
            {"label": "D", "text": "39"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Функция", "Теңдеу"],
        "image_filename": "v20_q26_hay_table.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": context_text + r"\text{Функция қай ширекте жатады?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "I"},
            {"label": "B", "text": "II"},
            {"label": "C", "text": "III"},
            {"label": "D", "text": "IV"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Функция", "Координаталық ширектер"],
        "image_filename": "v20_q26_hay_table.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": context_text + r"\text{Тәуелсіз айнымалының қабылдайтын мәндері}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"[2; +\infty)"},
            {"label": "B", "text": r"[1; +\infty)"},
            {"label": "C", "text": r"[4; +\infty)"},
            {"label": "D", "text": r"[3; +\infty)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Функция", "Анықталу облысы"],
        "image_filename": "v20_q26_hay_table.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"\{b_n\} \text{ – натурал сан қатарын құрайтын геометриялық прогрессияның алғашқы екі мүшесінің қосындысы 20-ға тең. Ал тізбектің кері мүшелері қосындысы } \frac{3}{8} \text{ – ке тең шексіз геометриялық прогрессия құрайды. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "0,125"},
            {"label": "B", "text": "2,5"},
            {"label": "C", "text": "1,5"},
            {"label": "D", "text": "0"},
        ],
        "subquestions": [
            {"text": r"b_n \text{ – нің еселігі}", "correct": "C"},
            {"text": r"c_n \text{ – нің бірінші мүшесі}", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"y = 2x^2 - 5x + 6 \text{ функциясының төбелерінің координаталарын сан мәндерімен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "1,5"},
            {"label": "B", "text": r"\frac{23}{8}"},
            {"label": "C", "text": "1,25"},
            {"label": "D", "text": r"\frac{21}{4}"},
        ],
        "subquestions": [
            {"text": "m", "correct": "C"},
            {"text": "n", "correct": "B"},
        ],
        "answer": '["C", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция", "Парабола төбесі"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"f(x) = \left(x^3 + \frac{2}{x^3}\right)^2 \text{ функциясының туындысының 1 және -1 нүктелеріндегі мәнін дұрыс жауаптарымен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "18"},
            {"label": "B", "text": "24"},
            {"label": "C", "text": "-18"},
            {"label": "D", "text": "-24"},
        ],
        "subquestions": [
            {"text": r"f'(1)", "correct": "C"},
            {"text": r"f'(-1)", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Математикалық анализ", "Туынды"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"y = 4 - |x - 4| \text{ функциясы берілген. Оның анықталу облысын және мәндер жиынын төмендегі мәндерімен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"(-\infty; 0] \cup (4; +\infty)"},
            {"label": "B", "text": r"(-\infty; +\infty)"},
            {"label": "C", "text": r"(-\infty; 1]"},
            {"label": "D", "text": r"(-\infty; 4]"},
        ],
        "subquestions": [
            {"text": "функцияның анықталу облысы", "correct": "B"},
            {"text": "функцияның мәндерінің жиыны", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция", "Анықталу облысы", "Мәндер жиыны"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"AB \text{ кесіндісінің ортасы Ox осінде жатыр. } A(0; m; n + 1), B(1; n; 1 - m). m \text{ және } n\text{-ді сан мәндерімен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "3"},
        ],
        "subquestions": [
            {"text": "m", "correct": "A"},
            {"text": "n", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Аналитикалық геометрия", "Кесінді ортасы"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"y = \ln(\operatorname{ctg} 2x) \text{ функциясының туындысын табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"-\frac{2}{\sin 4x}"},
            {"label": "B", "text": r"\frac{1}{\operatorname{ctg} 2x}"},
            {"label": "C", "text": r"-\frac{4}{\sin 4x}"},
            {"label": "D", "text": r"\frac{4}{\sin 4x}"},
            {"label": "E", "text": r"-\frac{2}{\sin 2x \cos 2x}"},
            {"label": "F", "text": r"\frac{2}{\operatorname{ctg} 2x}"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Тригонометрия"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\begin{cases} 3^x \cdot 2^y = 81 \\ x + y = 4 \end{cases} \text{ теңдеулер жүйесін шешіп, } x_0 - y_0 \text{ мән(дер)ін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "0"},
            {"label": "E", "text": "6"},
            {"label": "F", "text": "5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер жүйесі", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"\text{Шар центрінен } OO_1 \text{ қашықтықтағы қиманың ұзындығы } 8\pi\text{ см. Шардың көлемін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{550}{3}\pi\text{ см}^3"},
            {"label": "B", "text": r"\frac{500}{3}\pi\text{ см}^3"},
            {"label": "C", "text": r"\frac{400}{3}\pi\text{ см}^3"},
            {"label": "D", "text": r"\frac{600}{3}\pi\text{ см}^3"},
            {"label": "E", "text": r"\frac{700}{3}\pi\text{ см}^3"},
            {"label": "F", "text": r"\frac{300}{3}\pi\text{ см}^3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Шар", "Қима", "Көлем"],
        "image_filename": "v20_q38_sphere_section.png",
    },
    # 39
    {
        "slot_index": 39,
        "text": r"\text{Шексіз кемімелі геометриялық прогрессияның бірінші мүшесі } \sin^2\alpha\text{, ал үшінші мүшесі } \sin^6\alpha\text{. Шексіз кемімелі геометриялық прогрессияның қосындысын табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\operatorname{tg}^2\alpha"},
            {"label": "B", "text": r"\frac{\sin^2\alpha}{1 + \cos\alpha}"},
            {"label": "C", "text": r"\frac{\cos^2\alpha}{1 + \cos^2\alpha}"},
            {"label": "D", "text": r"\operatorname{ctg}^2\alpha"},
            {"label": "E", "text": r"\frac{\sin^2\alpha}{1 + \sin^2\alpha}"},
            {"label": "F", "text": r"1 + \cos^2\alpha"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\text{Биіктігі 3 см конусқа көлемі } \frac{4}{3}\pi\text{ см}^3 \text{ болатын шар іштей сызылған. Егер конустың көлемі } k\pi\text{ см}^3 \text{ болса, } k\text{ – ның еселіктерін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "18"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "32"},
            {"label": "D", "text": "9"},
            {"label": "E", "text": "16"},
            {"label": "F", "text": "27"},
        ],
        "answer": '["A", "D", "F"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус", "Шар", "Бөлінгіштік"],
        "image_filename": None,
    },
]

def validate_tasks():
    assert len(tasks_data) == 40, f"Expected 40 tasks, got {len(tasks_data)}"
    for idx, item in enumerate(tasks_data, 1):
        assert item["slot_index"] == idx, f"Task {idx} has wrong slot_index {item['slot_index']}"
        # Check no dollar signs
        assert "$" not in item["text"], f"Task {idx} has '$' in text: {item['text']}"
        for opt in item["options"]:
            assert "$" not in opt["text"], f"Task {idx} opt {opt['label']} has '$': {opt['text']}"
        if item.get("subquestions"):
            for sq in item["subquestions"]:
                assert "$" not in sq["text"], f"Task {idx} subquestion has '$': {sq['text']}"

        # Check types
        if idx <= 30:
            assert item["question_type"] == "mcq", f"Task {idx} should be mcq"
            assert len(item["options"]) == 4, f"Task {idx} should have 4 options"
            assert item["answer"] in ["A", "B", "C", "D"], f"Task {idx} answer invalid: {item['answer']}"
        elif idx <= 35:
            assert item["question_type"] == "select", f"Task {idx} should be select"
            assert len(item["options"]) == 4, f"Task {idx} should have 4 options"
            assert len(item["subquestions"]) == 2, f"Task {idx} should have 2 subquestions"
            ans_arr = json.loads(item["answer"])
            assert len(ans_arr) == 2, f"Task {idx} answer array invalid"
        else:
            assert item["question_type"] == "mcq6", f"Task {idx} should be mcq6"
            assert len(item["options"]) == 6, f"Task {idx} should have 6 options"

        # Context tag check
        if 26 <= idx <= 30:
            assert "Контекст" in item["topics"], f"Task {idx} missing 'Контекст' in topics!"

        assert "ҰБТ есебі" in item["topics"], f"Task {idx} missing 'ҰБТ есебі'!"

    print("Task validation passed successfully!", flush=True)

async def import_variant():
    validate_tasks()
    
    db_url = get_db_url()
    if not db_url:
        print("DATABASE_URL not found!")
        return

    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    folder_id = 11  # "ҰБТ есептері"
    test_title = "20-нұсқа: Мая шөп"
    test_desc = "ҰБТ 20-нұсқа математика тапсырмалары (Контекст: Мая шөп)"

    # Check if test already exists in folder 11
    tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = None
    for t in tests:
        if t['title'] == test_title or t['title'].startswith("20-нұсқа"):
            target_test = t
            break

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description=test_desc,
            sort_order=20,
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

        for attempt in range(5):
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
                    source="ubt_import_v20",
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
                try:
                    db = Database(db_url, use_pool=True, auto_migrate=False)
                    await db.init()
                except Exception as db_err:
                    print(f"DB reconnect error: {db_err}", flush=True)

    # Verify final count of slots
    existing_tasks = await db.trial_tests.get_trial_test_tasks(test_id)
    print(f"\nFinal count of slots for test ID {test_id}: {len(existing_tasks)}/40", flush=True)
    if len(existing_tasks) == 40:
        print("\n--- ALL 40 TASKS FOR VARIANT 20 IMPORTED SUCCESSFULLY! ---", flush=True)
    else:
        print(f"\nWARNING: Only {len(existing_tasks)} slots filled!", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
