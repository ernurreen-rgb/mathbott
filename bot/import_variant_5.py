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
        "text": r"\frac{1}{7 - \log_2 x} + \frac{1}{1 + \log_2 x} = \frac{8}{7} теңдеудің түбірлерінің көбейтіндісін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "16"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "64"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеу"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"y = \log_2(1+x) функциясының x_0 = 1 нүктесіндегі туындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\ln 2"},
            {"label": "B", "text": r"\frac{2}{\ln 2}"},
            {"label": "C", "text": r"\frac{1}{2\ln 4}"},
            {"label": "D", "text": r"\frac{1}{2\ln 2}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Логарифмдік функция"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"Егер x_0, y_0 берілген \begin{cases} 3^{2x} - 2^y = 725 \\ 3^x - 2^{\frac{y}{2}} = 25 \end{cases} теңдеулер жүйесінің шешімі болса, x_0 + y_0 өрнегінің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"\operatorname{tg}x > -\sqrt{3} теңсіздікті шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left(-\frac{\pi}{6} + \pi n; \frac{\pi}{2} + \pi n\right), n \in \mathbb{Z}"},
            {"label": "B", "text": r"\left(-\frac{\pi}{2} + \pi n; \frac{\pi}{3} + \pi n\right), n \in \mathbb{Z}"},
            {"label": "C", "text": r"\left(-\frac{\pi}{3} + \pi n; \frac{\pi}{2} + \pi n\right), n \in \mathbb{Z}"},
            {"label": "D", "text": r"\left(-\frac{\pi}{2} + \pi n; -\frac{\pi}{3} + \pi n\right), n \in \mathbb{Z}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңсіздік"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"f(x) = \frac{1}{x^2}\ln(4x+3) функциясына x_0 = -0,5 нүктесінде жүргізілген жанаманың теңдеуін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "y = 8x + 4"},
            {"label": "B", "text": "y = 4x - 16"},
            {"label": "C", "text": "y = 16x + 8"},
            {"label": "D", "text": "y = -8x + 4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Жанаманың теңдеуі"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"3^{\lg x} = 18 - x^{\lg 3} теңдеуінің шешіміне кері санды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "100"},
            {"label": "B", "text": "10"},
            {"label": "C", "text": r"\frac{1}{100}"},
            {"label": "D", "text": r"\frac{1}{10}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеу"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"Табаны 6, қыры 5 болатын дұрыс төртбұрышты пирамида берілген. ABC және DTC жазықтықтарының арасындағы екіжақты бұрыштың косинусын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3}{4}"},
            {"label": "B", "text": r"\frac{\sqrt{7}}{4}"},
            {"label": "C", "text": r"\frac{\sqrt{7}}{3}"},
            {"label": "D", "text": r"\frac{4}{5}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Екіжақты бұрыш"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"A(-1; 5), B(4; -6). \vec{AB} векторының ұзындығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{135}"},
            {"label": "B", "text": r"\sqrt{146}"},
            {"label": "C", "text": "11"},
            {"label": "D", "text": r"\sqrt{116}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"Табаны 3-ке тең дұрыс алтыбұрышты пирамиданың бүйір қыры табан жазықтығымен 30^\circ бұрыш жасайды. Пирамиданың көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "40,5"},
            {"label": "B", "text": "12,8"},
            {"label": "C", "text": "13,5"},
            {"label": "D", "text": "32,3"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Көлем"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"Координаталық жазықтықтың суретте кескінделген нүктелер жиынын анықтайтын теңсіздіктер жүйесін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\begin{cases} y \le x^2 + 2 \\ y \ge 2x + 3 \end{cases}"},
            {"label": "B", "text": r"\begin{cases} y \ge 2x^2 \\ y \le 2x + 1 \end{cases}"},
            {"label": "C", "text": r"\begin{cases} y \le 2x^2 \\ y \ge 2x + 1 \end{cases}"},
            {"label": "D", "text": r"\begin{cases} y \ge x^2 + 2 \\ y \le 2x + 3 \end{cases}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер жүйесі", "График"],
        "image_filename": "v5_q10_coordinate_plane.png",
    },
    # 11
    {
        "slot_index": 11,
        "text": r"f(x) = \cos x функциясы F(\pi) = 0 болса, F\left(\frac{\pi}{2}\right) \cdot F\left(\frac{\pi}{6}\right) = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,5"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "-0,5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Алғашқы функция"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"Үшбұрыштың ішкі бұрыштары 30^\circ және 105^\circ. Кіші қабырғасы 1 см болса, үлкен қабырғасын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{6} + \sqrt{2}"},
            {"label": "B", "text": r"\frac{\sqrt{6} + \sqrt{2}}{2}"},
            {"label": "C", "text": r"\frac{\sqrt{6} + \sqrt{2}}{4}"},
            {"label": "D", "text": r"2(\sqrt{2} + \sqrt{6})"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Синустар теоремасы"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"Диагональдары 50 см және 30 см болатын төртбұрыш берілген. Төбелері берілген төртбұрыш қабырғаларының орталарында жататын төртбұрыштың периметрін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "50 см"},
            {"label": "B", "text": "100 см"},
            {"label": "C", "text": "40 см"},
            {"label": "D", "text": "80 см"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Төртбұрыш", "Периметр"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"\int \operatorname{tg}^2 x \, dx интегралды есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-x + \operatorname{ctg} x"},
            {"label": "B", "text": r"-x + \operatorname{tg} x"},
            {"label": "C", "text": r"x + \operatorname{ctg} x"},
            {"label": "D", "text": r"x + \operatorname{tg} x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Тригонометрия"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Геометриялық прогрессияда b_2 \cdot b_8 = 100 болса, b_5-ті есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\pm 10"},
            {"label": "B", "text": r"\pm 11"},
            {"label": "C", "text": r"\pm 12"},
            {"label": "D", "text": r"\pm 15"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"Гипотенузасы 5 см, бір катеті 3 см тікбұрышты үшбұрыш берілген. Осы үшбұрышты үлкен катетінен айналдырғанда шыққан дененің көлемін есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"10\pi"},
            {"label": "B", "text": r"12\pi"},
            {"label": "C", "text": r"15\pi"},
            {"label": "D", "text": r"20\pi"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Конус"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Амалдарды орында: \sqrt{14 - 6\sqrt{5}} + \sqrt{9 - 4\sqrt{5}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "3"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал өрнектер", "Түбір"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"2028^2 - 2025^2 + 2024^2 - 2027^2",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "10"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Қысқаша көбейту формулалары"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"Сызбадағы NK кесіндісінің ұзындығын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2,5"},
            {"label": "B", "text": r"3\sqrt{2}"},
            {"label": "C", "text": r"3\sqrt{3}"},
            {"label": "D", "text": "3,8"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер"],
        "image_filename": "v5_q19_circle.png",
    },
    # 20
    {
        "slot_index": 20,
        "text": r"f(x) = 5\sin(5x - 7) + \frac{8}{x - 1} + 10x\sqrt{x} функциясының алғашқы функциясын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"F(x) = \cos(5x - 7) + 8\ln|x - 1| + 10x^2\sqrt{x} + C"},
            {"label": "B", "text": r"F(x) = \frac{1}{5}\cos(5x - 7) + 8\ln|x - 1| + 4x^2\sqrt{x} + C"},
            {"label": "C", "text": r"F(x) = 7\cos(5x - 7) + \ln|x - 1| + 4x^2\sqrt{x} + C"},
            {"label": "D", "text": r"F(x) = -\cos(5x - 7) + 8\ln|x - 1| + 4x^2\sqrt{x} + C"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Алғашқы функция"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Есепте: 5\cos\left(\operatorname{arctg}\frac{3}{4}\right)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\frac{1}{9}x^2 - 0,(5)x + 1 = 0 теңдеуінің түбірлерінің қосындысын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"3\frac{1}{3}"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "9"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадрат теңдеу", "Виет теоремасы"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"Толық бетінің ауданы 64\pi тең сфераға сырттай сызылған кубтың диагональдық қимасының ауданын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "64"},
            {"label": "B", "text": r"64\sqrt{3}"},
            {"label": "C", "text": r"64\sqrt{2}"},
            {"label": "D", "text": "128"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера", "Куб"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"||x - 4| + 5| = 10 теңдеу түбірлерінің көбейтіндісін есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-9"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "-8"},
            {"label": "D", "text": "8"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Модульдік теңдеу"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"Егер 2 \le a \le 4 болса, \sqrt[4]{(a - 2)^4} + \sqrt[6]{(a - 4)^6} есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "5"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Түбір", "Модуль"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": "**Глобус**\n\nРадиусы 1 м глобус берілген.\n\nГлобустың бетінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"12,56\text{ м}^2"},
            {"label": "B", "text": r"6,28\text{ м}^2"},
            {"label": "C", "text": r"13,21\text{ м}^2"},
            {"label": "D", "text": r"18,84\text{ м}^2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Шар", "Сфера"],
        "image_filename": "v5_context_globe.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": "**Глобус**\n\nРадиусы 1 м глобус берілген.\n\nЭкватор сызығының ұзындығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6 м"},
            {"label": "B", "text": "7,32 м"},
            {"label": "C", "text": "6,28 м"},
            {"label": "D", "text": "9,42 м"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Шеңбер", "Сфера"],
        "image_filename": "v5_context_globe.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": "**Глобус**\n\nРадиусы 1 м глобус берілген.\n\nГлобустың көлемінің жүздік үлеске дейінгі жуықталған мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2,36\text{ м}^3"},
            {"label": "B", "text": r"4,18\text{ м}^3"},
            {"label": "C", "text": r"3,14\text{ м}^3"},
            {"label": "D", "text": r"4,19\text{ м}^3"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Шар", "Көлем"],
        "image_filename": "v5_context_globe.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": r"**Глобус**" + "\n\n" + r"Радиусы 1 м глобус берілген." + "\n\n" + r"Глобустың сыртын қаптауға қанша \text{м}^2 тіктөртбұрыш тұсқағаз қажет?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"12\text{ м}^2"},
            {"label": "B", "text": r"13\text{ м}^2"},
            {"label": "C", "text": r"14\text{ м}^2"},
            {"label": "D", "text": r"20\text{ м}^2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Шар", "Сфера"],
        "image_filename": "v5_context_globe.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": "**Глобус**\n\nРадиусы 1 м глобус берілген.\n\nТабаны 4-ке тең дұрыс төртбұрышты пирамидаға глобус іштей сызылған. Пирамиданың биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{2}{3}"},
            {"label": "B", "text": r"\frac{1}{3}"},
            {"label": "C", "text": r"2\frac{2}{3}"},
            {"label": "D", "text": r"3\frac{1}{3}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Стереометрия", "Пирамида", "Шар"],
        "image_filename": "v5_context_globe.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"Дұрыс төртбұрышты пирамиданың барлық қырлары 2 см-ге тең. Пирамиданың апофемасы мен биіктігін олардың сан мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"\sqrt{2}"},
            {"label": "B", "text": r"\sqrt{5}"},
            {"label": "C", "text": r"2\sqrt{3}"},
            {"label": "D", "text": r"\sqrt{3}"},
        ],
        "subquestions": [
            {"text": "пирамида биіктігі", "correct": "A"},
            {"text": "пирамида апофемасы", "correct": "D"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Стереометрия", "Пирамида"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"Алғашқы төрт мүшесінің қосындысы 64, соңғы төрт мүшесінің қосындысы 729. Егер он мүшеден тұратын өспелі геометриялық прогрессия берілсе, еселігі мен бірінші мүшесін тауып жауаптарды сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"\frac{5}{3}"},
            {"label": "B", "text": r"\frac{3}{2}"},
            {"label": "C", "text": r"\frac{512}{65}"},
            {"label": "D", "text": r"\frac{108}{17}"},
        ],
        "subquestions": [
            {"text": "q", "correct": "B"},
            {"text": "b_1", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"Координаталары x^2 + y^2 - 6x - 4y - 12 \le 0 берілген теңсіздіктің шешімі болатын нүктелер жиынын координаталық жазықтықта кескіндеп, шыққан геометриялық фигура бойынша шамаларды сан мәнімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"10\pi"},
            {"label": "B", "text": r"20\pi"},
            {"label": "C", "text": r"25\pi"},
            {"label": "D", "text": r"30\pi"},
        ],
        "subquestions": [
            {"text": "C", "correct": "A"},
            {"text": "S", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Шеңбер", "Дөңгелек"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"x^2 - kx + 9 = 0 теңдеуі берілген",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-6 < k < 6"},
            {"label": "B", "text": r"k = \pm 9"},
            {"label": "C", "text": "k < -6, k > 6"},
            {"label": "D", "text": "k > 9"},
        ],
        "subquestions": [
            {"text": "k-ның қандай мәнінде теңдеудің түбірі болмайды", "correct": "A"},
            {"text": "k-ның қандай мәнінде теңдеудің екі түбірі болады", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Квадрат теңдеу", "Параметрлі теңдеу"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"y = 3 + \frac{2}{x + 1} функциясы берілген",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "-1"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "-2"},
        ],
        "subquestions": [
            {"text": "мәндер облысына кірмейтін сан", "correct": "A"},
            {"text": "анықталу облысына кірмейтін сан", "correct": "B"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция", "Анықталу облысы"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"y = \log_5(3x - 4) функциясы берілген. y' > 0 теңсіздігін қанағаттандыратын бүтін сандарды анықта",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "0,04"},
            {"label": "E", "text": "3"},
            {"label": "F", "text": "4"},
        ],
        "answer": '["C", "E", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Логарифмдік функция", "Теңсіздік"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"y = -x^2 + 4 параболасымен және абсцисса осімен шектелген қисық сызықты трапецияның ауданын есепте",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"10\frac{2}{3}"},
            {"label": "B", "text": r"\frac{32}{3}"},
            {"label": "C", "text": r"10\frac{1}{3}"},
            {"label": "D", "text": r"\frac{31}{3}"},
            {"label": "E", "text": "16"},
            {"label": "F", "text": "15"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Қисық сызықты трапецияның ауданы"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"f(x) = x^2 - 4x + 2024 функция графигіне x_0 = 3 нүктесінде жүргізілген жанаманың абсцисса осімен жасайтын бұрышы \alpha болса, \sin 2\alpha = ?",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": r"\frac{4}{5}"},
            {"label": "C", "text": "3,5"},
            {"label": "D", "text": "0,8"},
            {"label": "E", "text": r"3\frac{1}{2}"},
            {"label": "F", "text": "5"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Жанама", "Тригонометрия"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"Есепте: \int_0^4 |x - 3| \, dx",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{7}{2}"},
            {"label": "B", "text": r"\sqrt{25}"},
            {"label": "C", "text": "3,5"},
            {"label": "D", "text": "5"},
            {"label": "E", "text": r"3\frac{1}{2}"},
            {"label": "F", "text": r"2\frac{1}{2}"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Модуль"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Бірінші және екінші мүшелерінің қосындысы 6, үшінші мүшесі 8 болатын геометриялық прогрессияның еселігін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": r"\frac{1}{3}"},
            {"label": "D", "text": "5"},
            {"label": "E", "text": r"-\frac{3}{4}"},
            {"label": "F", "text": r"-\frac{2}{3}"},
        ],
        "answer": '["A", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
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

    test_title = "5-нұсқа: Глобус"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 5-нұсқа математика тапсырмалары (Контекст: Глобус)",
            sort_order=5,
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
                    source="ubt_import_v5",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 5 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
