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
        "text": r"Қабырғасы a-ға тең кубқа іштей сызылған шар көлемін есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\pi a^3}{8}"},
            {"label": "B", "text": r"\frac{\pi a^3}{6}"},
            {"label": "C", "text": r"\frac{\pi a^3}{12}"},
            {"label": "D", "text": r"\frac{\pi a^3}{\sqrt{6}}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Шар", "Куб"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"(6 - 7x)^{11} көпмүшесінің коэффициенттерінің қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "-1"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "-2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көпмүшелер"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"\lg 2, \lg(2^x - 6), \lg(2^x + 34) сандары арифметикалық прогрессияның алғашқы үш мүшесі болса, x-тің мәні нешеге тең?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Логарифм"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"\sqrt{3}\operatorname{tg}\frac{x}{2} \le 1 теңсіздігін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left[-\pi + 2\pi k; \frac{\pi}{3} + 2\pi k\right), k \in \mathbb{Z}"},
            {"label": "B", "text": r"\left(-\pi + 2\pi k; \frac{\pi}{3} + 2\pi k\right], k \in \mathbb{Z}"},
            {"label": "C", "text": r"\left[-\pi + \pi k; \frac{\pi}{3} + \pi k\right), k \in \mathbb{Z}"},
            {"label": "D", "text": r"\left(-\pi + \pi k; -\frac{\pi}{3} + \pi k\right], k \in \mathbb{Z}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Теңсіздік"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"5(0,(4) - 3x) + 2^3 x + 2025^0 \cdot 0,(7) өрнектің мәнін табыңыз, мұндағы x = \frac{1}{7}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "-3"},
            {"label": "D", "text": "2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Бөлшектер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\frac{x-9}{\sqrt{x}-3} = x + 3 теңдеудің түбірлерінің қосындысын есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "6"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеу", "Иррационал теңдеу"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"y = \sqrt{x^2 - 4x + 8} - 5 функциясының ең кіші мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-3"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "-5"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Ең кіші мән"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"Пирамида табаны – сүйір бұрышы 60^\circ-қа тең ромб. Пирамиданың биіктігі мен табан қабырғасы 6 см және биіктіктің табаны сүйір бұрышының төбесімен беттеседі. Пирамиданың бүйір бетінің ауданы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"18(1 + \sqrt{7})"},
            {"label": "B", "text": r"12(2 + \sqrt{7})"},
            {"label": "C", "text": r"18(2 + \sqrt{7})"},
            {"label": "D", "text": r"18(1 + \sqrt{7})"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"y = x^2 - e^{x-1} функциясына x_0 = 1 нүктесінде жүргізілген жанаманың абсцисса осімен жасайтын бұрышының шамасын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"135^\circ"},
            {"label": "B", "text": r"30^\circ"},
            {"label": "C", "text": r"45^\circ"},
            {"label": "D", "text": r"60^\circ"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Жанама"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"Бүйір бетінің ауданы 1-ге тең цилиндр табан қабырғасы 4\sqrt{3} болатын дұрыс алтыбұрышты призмаға іштей сызылған. Цилиндрдің көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Призма"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"Барлық қырлары 2 см болатын тетраэдрдің толық бетінің ауданы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"3\sqrt{3}"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": r"2\sqrt{3}"},
            {"label": "D", "text": r"4\sqrt{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Тетраэдр"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"f(x) = \frac{1+e^x}{e^x} функциясының туындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-\frac{1}{e^x}"},
            {"label": "B", "text": r"-e^x + 1"},
            {"label": "C", "text": r"\frac{1}{e^x} + 1"},
            {"label": "D", "text": r"e^x"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"Функцияның анықталу облысын табыңыз: y = \frac{1}{\sqrt{-4x+2}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; 0,5)"},
            {"label": "B", "text": r"(-\infty; -0,2)"},
            {"label": "C", "text": r"(-\infty; -0,5)"},
            {"label": "D", "text": r"(-\infty; 0,2)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Анықталу облысы"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"Бүйір бетінің ауданы 2\pi\sqrt{10} болатын конус табанының радиусы биіктігінен 3 есе кем. Конустың жасаушысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\sqrt{5}"},
            {"label": "B", "text": r"3\sqrt{3}"},
            {"label": "C", "text": r"5\sqrt{2}"},
            {"label": "D", "text": r"4\sqrt{2}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Арифметикалық прогрессияда a_7 + a_{11} = 36 теңдігі орындалады. Осы арифметикалық прогрессияның алғашқы он жеті мүшесінің қосындысын есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "306"},
            {"label": "B", "text": "362"},
            {"label": "C", "text": "612"},
            {"label": "D", "text": "294"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"A(1; 0; 3) және B(1; 2; 5) нүктелері берілген. \vec{AB} векторының координаталарын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(0; 0; 3)"},
            {"label": "B", "text": r"(0; 2; 2)"},
            {"label": "C", "text": r"(1; 2; 3)"},
            {"label": "D", "text": r"(1; 0; 3)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Теңсіздіктер жүйесін шешіңіз: \begin{cases} 6^{\frac{x-1}{3}} \le 6\sqrt{6} \\ \left(1\frac{1}{3}\right)^{5x-2} > 2\frac{10}{27} \end{cases}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(1; 5,5]"},
            {"label": "B", "text": r"(-2; 4,5]"},
            {"label": "C", "text": r"[3; 2,5]"},
            {"label": "D", "text": r"(-1,5; 3]"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздік", "Теңсіздіктер жүйесі"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"Теңсіздікті шешіңіз: \frac{1-|2x+1|}{2} > -3",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; -3)"},
            {"label": "B", "text": r"(0; 3)"},
            {"label": "C", "text": r"(-4; 3)"},
            {"label": "D", "text": r"(-7; 7)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Модульді теңсіздік"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"Биіктігі 3 см-ге тең төртбұрышты пирамиданың табан қабырғалары 3 см және 4 см, арасындағы бұрыш 30^\circ. Пирамиданың көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "12"},
            {"label": "C", "text": "18"},
            {"label": "D", "text": "9"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\vec{a} = (1; 0) және \vec{b} = (1; 1) векторлары берілген. \vec{a} + m\vec{b} және \vec{a} векторлары перпендикуляр болу үшін, m саны қандай болу керек?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"m = 0"},
            {"label": "B", "text": r"m = -2"},
            {"label": "C", "text": r"m = 2"},
            {"label": "D", "text": r"m = -1"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Перпендикуляр векторлар"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Геометриялық прогрессияның бірінші мүшесі 1-ге, төртінші және алтыншысы мүшелерінің қосындысы 40-қа тең болса, төртінші мүшесін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "16"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "8"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"Есептеңіз: \log_2 \sqrt{3} + \frac{1}{2}\log_2 \frac{4}{3}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"a мен b-ның қандай мәндерінде \sqrt{2a+b+2} = 3 және \sqrt{2a-4b-1} = a-2 теңдіктері орындалады?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"a = 3, b = -9 немесе a = 3, b = 12"},
            {"label": "B", "text": r"a = 11, b = -15 немесе a = 2, b = 1"},
            {"label": "C", "text": r"a = 11, b = -10 немесе a = 3, b = 1"},
            {"label": "D", "text": r"a = 11, b = -15 немесе a = 3, b = 1"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"Теңсіздікті шешіңіз: \sqrt{2 - |x|} > x",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-1; 3)"},
            {"label": "B", "text": r"[-2; 1)"},
            {"label": "C", "text": r"(0; 4]"},
            {"label": "D", "text": r"[-1; 1]"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңсіздік", "Модуль"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"x^2 - 4x + a = 0 теңдеуі түбірлерінің квадраттарының қосындысының мәні 16-ға тең, a-ның мәнін анықтаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "0"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадрат теңдеу", "Виет теоремасы"],
        "image_filename": None,
    },
    # 26 (Context: Икосаэдр)
    {
        "slot_index": 26,
        "text": "**Икосаэдр**\n\nҚазақ ғалымдары ежелгі геометриялық денелерді зерттеу мақсатында музейге арналған көрме жасақтауда. Көрмеге әртүрлі көпжақты денелердің үлгілері тапсырыспен дайындалды. Солардың бірі – икосаэдр. Икосаэдр – 20 дұрыс үшбұрыштан тұратын дене. Оның әрбір қыры 6 см-ге тең. Бұл үлгіні акрильден жасайды.\n\nИкосаэдрдің қырларының саны",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "36"},
            {"label": "B", "text": "30"},
            {"label": "C", "text": "26"},
            {"label": "D", "text": "32"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Мәнмәтіндік тапсырма", "Стереометрия", "Көпжақтар"],
        "image_filename": "v2_q26_icosahedron.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": "**Икосаэдр**\n\nҚазақ ғалымдары ежелгі геометриялық денелерді зерттеу мақсатында музейге арналған көрме жасақтауда. Көрмеге әртүрлі көпжақты денелердің үлгілері тапсырыспен дайындалды. Солардың бірі – икосаэдр. Икосаэдр – 20 дұрыс үшбұрыштан тұратын дене. Оның әрбір қыры 6 см-ге тең. Бұл үлгіні акрильден жасайды.\n\nТөбелерінің саны",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "12"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Мәнмәтіндік тапсырма", "Стереометрия", "Көпжақтар"],
        "image_filename": "v2_q26_icosahedron.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": "**Икосаэдр**\n\nҚазақ ғалымдары ежелгі геометриялық денелерді зерттеу мақсатында музейге арналған көрме жасақтауда. Көрмеге әртүрлі көпжақты денелердің үлгілері тапсырыспен дайындалды. Солардың бірі – икосаэдр. Икосаэдр – 20 дұрыс үшбұрыштан тұратын дене. Оның әрбір қыры 6 см-ге тең. Бұл үлгіні акрильден жасайды.\n\nИкосаэдрдің жазбасының периметрі",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "180"},
            {"label": "B", "text": "150"},
            {"label": "C", "text": "132"},
            {"label": "D", "text": "144"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Мәнмәтіндік тапсырма", "Стереометрия", "Периметр"],
        "image_filename": "v2_q26_icosahedron.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": "**Икосаэдр**\n\nҚазақ ғалымдары ежелгі геометриялық денелерді зерттеу мақсатында музейге арналған көрме жасақтауда. Көрмеге әртүрлі көпжақты денелердің үлгілері тапсырыспен дайындалды. Солардың бірі – икосаэдр. Икосаэдр – 20 дұрыс үшбұрыштан тұратын дене. Оның әрбір қыры 6 см-ге тең. Бұл үлгіні акрильден жасайды.\n\nБетінің ауданы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"160\sqrt{3}"},
            {"label": "B", "text": r"150\sqrt{3}"},
            {"label": "C", "text": r"170\sqrt{3}"},
            {"label": "D", "text": r"180\sqrt{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Мәнмәтіндік тапсырма", "Стереометрия", "Аудан"],
        "image_filename": "v2_q26_icosahedron.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": r"**Икосаэдр**" + "\n\n" + r"Қазақ ғалымдары ежелгі геометриялық денелерді зерттеу мақсатында музейге арналған көрме жасақтауда. Көрмеге әртүрлі көпжақты денелердің үлгілері тапсырыспен дайындалды. Солардың бірі – икосаэдр. Икосаэдр – 20 дұрыс үшбұрыштан тұратын дене. Оның әрбір қыры 6 см-ге тең. Бұл үлгіні акрильден жасайды." + "\n\n" + r"Егер акриль материалының 1\text{ см}^2-і 10 теңге тұрса, үлгіні жасауға кететін материалдың жалпы құнын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3118"},
            {"label": "B", "text": "3212"},
            {"label": "C", "text": "4230"},
            {"label": "D", "text": "3012"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Мәнмәтіндік тапсырма", "Қолданбалы есептер"],
        "image_filename": "v2_q26_icosahedron.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"x_1 және x_2 сандары x^4 + 5x^2 - 14 = 0 теңдеуінің нақты түбірлері. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "subquestions": [
            {"text": r"x_1^2 + x_2^2", "correct": "D"},
            {"text": r"x_1^2 - x_2^2", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Теңдеу"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"Арифметикалық прогрессияның үшінші мен бесінші мүшелерінің қосындысы 30-ға, ал алтыншы мен бірінші мүшелерінің айырмасы 20-ға тең. Келесі өрнектердің мәндерін жауаптарымен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "8"},
            {"label": "D", "text": "9"},
        ],
        "subquestions": [
            {"text": r"2d", "correct": "C"},
            {"text": r"S_8 - 127", "correct": "D"},
        ],
        "answer": '["C", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"Өрнекті ықшамдап, белгісіз коэффициенттерді мәндерімен сәйкестендіріңіз: (24x^2 + 27x):3x + (7x^4 - 6x^2):x^2 = Mx^2 + Nx + 3",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "7"},
            {"label": "C", "text": "8"},
            {"label": "D", "text": "10"},
        ],
        "subquestions": [
            {"text": r"N", "correct": "C"},
            {"text": r"M", "correct": "B"},
        ],
        "answer": '["C", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Көпмүшелер"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"Теңбүйірлі трапецияның диагоналі 10\sqrt{3} және табанымен 30^\circ бұрыш жасайды. Сәйкестендіріңіз (\sqrt{3} \approx 1,73)",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "15"},
            {"label": "B", "text": "128"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "130"},
        ],
        "subquestions": [
            {"text": "трапеция ауданының бүтінге дейін жуықталған мәні", "correct": "D"},
            {"text": "трапецияның орта сызығының бүтінге дейін жуықталған мәні", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Трапеция"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"Берілген парабола графигі бойынша функция мәндерін жауаптарымен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "-3"},
            {"label": "D", "text": "-2"},
        ],
        "subquestions": [
            {"text": r"f(1)", "correct": "B"},
            {"text": r"f(4)", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция", "График"],
        "image_filename": "v2_q35_parabola.png",
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Берілген фигураның толық беті 460\pi\text{ см}^2. Фигураның көлемін мен биіктігін радиусы арқылы өрнектеңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"H = 230\frac{1}{R} - 1,5R"},
            {"label": "B", "text": r"H = 460\frac{1}{R} - \frac{2}{3}R"},
            {"label": "C", "text": r"V = 230R - \frac{5}{6}\pi R^3"},
            {"label": "D", "text": r"V = 460R - \frac{3}{4}\pi R^3"},
            {"label": "E", "text": r"H = 230\frac{1}{R} - 0,5R"},
            {"label": "F", "text": r"V = 230\pi R - \frac{5}{6}\pi R^3"},
        ],
        "answer": '["A", "F"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Шар"],
        "image_filename": "v2_q36_cylinder_dome.png",
    },
    # 37
    {
        "slot_index": 37,
        "text": r"В мен С төбелеріндегі бұрыштары тік болатын ABCD дөңес төртбұрышында \angle DAB = \operatorname{arctg}\frac{2}{3}-ге тең. |CD| = \frac{1}{2}|AB| = 21 + |BC| болса, төмендегі аралықтардың ішінен BD диагоналі ұзындығының сан мәні тиісті болатын аралықтарды көрсетіңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"(60; 75]"},
            {"label": "B", "text": r"(54; 70)"},
            {"label": "C", "text": r"(76; 80]"},
            {"label": "D", "text": r"[73; 76)"},
            {"label": "E", "text": r"[80; 94)"},
            {"label": "F", "text": r"[75; 82)"},
        ],
        "answer": '["D", "F"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Трапеция"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"A(3; -3; 1) нүктесі арқылы өтетін \vec{n} = (3; 4; -2) нормаль векторы болып келген жазықтықтың теңдеуін жазыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"3x + 4y - 2z + 5 = 0"},
            {"label": "B", "text": r"3x - 4y - 2z + 5 = 0"},
            {"label": "C", "text": r"3x - 4y + 2z - 5 = 0"},
            {"label": "D", "text": r"3(x - 3) - 4(y + 3) - 2(z + 1) = 0"},
            {"label": "E", "text": r"3x - 4y + 5z - 3 = 0"},
            {"label": "F", "text": r"3(x - 3) - 4(y + 3) - 2(z - 1) = 0"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Аналитикалық геометрия", "Жазықтық теңдеуі"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"Есептеңіз: \sin\frac{11\pi}{6}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"-0,5\sqrt{3}"},
            {"label": "B", "text": r"\frac{1}{2}"},
            {"label": "C", "text": r"-\frac{1}{2}"},
            {"label": "D", "text": r"-\frac{\sqrt{3}}{2}"},
            {"label": "E", "text": "-0,5"},
            {"label": "F", "text": "0,5"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Көлемі 64 см^3 кубтың диагональдық қимасының ауданын есепте",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"15\sqrt{2}"},
            {"label": "B", "text": r"\sqrt{512}"},
            {"label": "C", "text": r"\sqrt{450}"},
            {"label": "D", "text": r"16\sqrt{2}"},
            {"label": "E", "text": r"\sqrt{400}"},
            {"label": "F", "text": "20"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Куб", "Қима ауданы"],
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

    test_title = "2-нұсқа: Икосаэдр"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 2-нұсқа математика тапсырмалары (Контекст: Икосаэдр)",
            sort_order=2,
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
                    source="ubt_import_v2",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 2 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
