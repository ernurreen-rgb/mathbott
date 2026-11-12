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
        "text": r"\int \left(\cos 2x + \frac{1}{x^2}\right) dx\text{ есептеңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sin 2x - \frac{1}{x} + C"},
            {"label": "B", "text": r"2\sin 2x + \frac{1}{x} + C"},
            {"label": "C", "text": r"\frac{1}{2}\sin 2x - \frac{1}{x} + C"},
            {"label": "D", "text": r"\frac{1}{2}\sin 2x + \frac{1}{x} + C"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Анықталмаған интеграл"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"\frac{2^{x+1}+19}{2^{x-1}+1} - 3 \ge 0\text{ теңсіздігінің шешімі}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "барлық нақты сандар жиыны"},
            {"label": "B", "text": "барлық натурал сандар жиыны"},
            {"label": "C", "text": "бүтін сандар жиыны"},
            {"label": "D", "text": "шешімі жоқ"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер", "Теңсіздіктер"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"Қиық конустың табандарының радиусы 6 және 11. Биіктігі радиустарының қосындысына тең. Қиық конустың көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3793\pi}{3}"},
            {"label": "B", "text": r"\frac{3371\pi}{3}"},
            {"label": "C", "text": r"\frac{3678\pi}{3}"},
            {"label": "D", "text": r"\frac{3791\pi}{3}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Қиық конус", "Көлем"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"Катеттері 4 және 6. Үлкен катетінен айналдырғанда шыққан фигураның бүйір бетінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"8\sqrt{13}\pi"},
            {"label": "B", "text": r"12\sqrt{13}\pi"},
            {"label": "C", "text": r"6\sqrt{13}\pi"},
            {"label": "D", "text": r"62\pi"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Конус"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"y = x^2 + 2x + 8\text{ функциясының мәндер жиынын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"[8; +\infty)"},
            {"label": "B", "text": r"[7; +\infty)"},
            {"label": "C", "text": r"[-1; +\infty)"},
            {"label": "D", "text": r"[1; +\infty)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Мәндер жиыны", "Квадраттық функция"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\begin{cases} x^2 + y^2 = 10 \\ xy = 3 \end{cases}\text{ теңдеулер жүйесін шешіп, }x_1 y_1 + x_2 y_2 + x_3 y_3 + x_4 y_4\text{ мәнін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "-1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Екінші дәрежелі жүйелер"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"y = x^3 + 3x^2 + 12\text{ функциясының }[-3; 3]\text{ кесіндісіндегі ең үлкен және ең кіші мәндерін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "66, 12"},
            {"label": "B", "text": "16, 0"},
            {"label": "C", "text": "66, 0"},
            {"label": "D", "text": "27, 12"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Функцияның ең үлкен және ең кіші мәндері"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"s(t) = 0,5t^3 + 2t^2 + 2024t + 2025\text{ заңымен қозғалатын нүктенің }t = 4\text{ уақыт мезетіндегі үдеуін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "16"},
            {"label": "B", "text": "13"},
            {"label": "C", "text": "2064"},
            {"label": "D", "text": "2030"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Туындының физикалық мағынасы"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"\lg 5 = a, \lg 2 = c\text{ болса, онда }\log_{50} 8\text{ санын өрнектеңіз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3c}{a-1}"},
            {"label": "B", "text": r"\frac{3a}{c-1}"},
            {"label": "C", "text": r"\frac{3c}{a+1}"},
            {"label": "D", "text": r"\frac{3a}{c+1}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"Дұрыс төртбұрышты пирамиданың барлық қырлары 2-ге тең. Көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{8\sqrt{2}}{3}"},
            {"label": "B", "text": r"\frac{4\sqrt{2}}{3}"},
            {"label": "C", "text": r"2\sqrt{2}"},
            {"label": "D", "text": r"\frac{4\sqrt{3}}{3}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Көлем"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"3x^2 - 2x - 1 = 0\text{ теңдеуінің түбірлерінің көбейтіндісіне кері санды жаз есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-\frac{1}{3}"},
            {"label": "B", "text": "-3"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Квадрат теңдеулер", "Виет теоремасы"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\sqrt{x+6} - 2 = \sqrt{x-2}\text{ теңдеудің шешімі жатқан аралықты табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(3; 5)"},
            {"label": "B", "text": "(-1; 3)"},
            {"label": "C", "text": "(1; 4)"},
            {"label": "D", "text": "(0; 2)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"Тікбұрышты параллелепипедтің биіктігі мен ұзындығының қосындысы 18 см, биіктік пен енінің қосындысы 17 см және барлық қырларының қосындысы 120 см-ге тең. Параллелепипедтің толық бетінің ауданы қандай?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"562\text{ см}^2"},
            {"label": "B", "text": r"580\text{ см}^2"},
            {"label": "C", "text": r"536\text{ см}^2"},
            {"label": "D", "text": r"575\text{ см}^2"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Параллелепипед", "Толық бетінің ауданы"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"Егер (x_0; y_0)\text{ }\begin{cases} \log_5 x + \log_5 y = 2 + 2\log_5 4 \\ \log_{81}(y - x) = 0,5 \end{cases}\text{ теңдеулер жүйесінің шешімі болса, }x_0 + y_0\text{ өрнегін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "36"},
            {"label": "B", "text": "42"},
            {"label": "C", "text": "38"},
            {"label": "D", "text": "41"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеулер жүйесі", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Цилиндрдің биіктігі 24 м, осьтік қимасының диагоналі 25 м-ге тең. Цилиндрдің толық бетінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"190,5\pi\text{ м}^2"},
            {"label": "B", "text": r"197,5\pi\text{ м}^2"},
            {"label": "C", "text": r"192,5\pi\text{ м}^2"},
            {"label": "D", "text": r"200\pi\text{ м}^2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Цилиндр", "Толық бетінің ауданы"],
        "image_filename": "v9_q15_cylinder.png",
    },
    # 16
    {
        "slot_index": 16,
        "text": r"\cos\frac{\pi}{3} + \cos^2\frac{\pi}{3} + \cos^3\frac{\pi}{3} + \dots + \cos^n\frac{\pi}{3} + \dots\text{ қосындының мәнін есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3}{2}"},
            {"label": "B", "text": r"\left(\frac{\pi}{6}\right)^3"},
            {"label": "C", "text": r"\left(\frac{\pi}{6}\right)^0"},
            {"label": "D", "text": "2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Тригонометрия", "Шексіз кемімелі геометриялық прогрессия", "Прогрессия"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"-3; 5; 13; \dots\text{ арифметикалық прогрессияның 75-ші мүшесінен бастап 92-ші мүшесімен қоса алғандағы мүшелерінің қосындысының мәні}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12289"},
            {"label": "B", "text": "11826"},
            {"label": "C", "text": "10170"},
            {"label": "D", "text": "9858"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Арифметикалық прогрессия", "Прогрессия"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"Конустың жасаушысы мен биіктігінің айырмасы 1-ге, ал олардың арасындағы бұрыш 60^\circ\text{-қа тең болса, конустың көлемі}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\pi"},
            {"label": "B", "text": r"\frac{1}{3}\pi"},
            {"label": "C", "text": r"\frac{\pi}{2}"},
            {"label": "D", "text": r"\pi"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус", "Көлем"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\sqrt[3]{x^6} + \sqrt{x^2}\text{ өрнегін ықшамдаңыз, мұндағы }x < 0",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "x^2 + x"},
            {"label": "B", "text": "x^2 - x"},
            {"label": "C", "text": "-x^2 + x"},
            {"label": "D", "text": "-x^2 - x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Түбірлер мен дәрежелер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\operatorname{arctg}0 - \arcsin\left(-\frac{1}{2}\right) - \arccos\frac{\sqrt{3}}{2}\text{ өрнегінің мәнін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-60^\circ"},
            {"label": "B", "text": r"60^\circ"},
            {"label": "C", "text": r"0^\circ"},
            {"label": "D", "text": r"30^\circ"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Берілген графиктер ішінен жұп функцияны(ларды) анықтаңыз:",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1 және 2"},
            {"label": "B", "text": "3 және 4"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Жұп және тақ функциялар", "График"],
        "image_filename": "v9_q21_graphs.png",
    },
    # 22
    {
        "slot_index": 22,
        "text": r"y = f(x)\text{ функциясының графигі берілген. }2f(x - 2) + 3\text{ түрлендіруінен кейінгі }A(x; y)\text{ нүктесінің координаталарын анықтаңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(1; 0)"},
            {"label": "B", "text": "(5; -3)"},
            {"label": "C", "text": "(1; -9)"},
            {"label": "D", "text": "(1; -3)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Функция графигін түрлендіру", "График"],
        "image_filename": "v9_q22_parabola.png",
    },
    # 23
    {
        "slot_index": 23,
        "text": r"y = \frac{2x-3}{x+2}\text{ функциясына кері функцияны табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y^{-1} = \frac{2x+3}{x-2}"},
            {"label": "B", "text": r"y^{-1} = -\frac{2x-3}{x+2}"},
            {"label": "C", "text": r"y^{-1} = -\frac{2x+3}{x-2}"},
            {"label": "D", "text": r"y^{-1} = -\frac{3x+2}{x-2}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Кері функция"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"10^{x^2 - x - 4} < 0,1^{3x+1}\text{ теңсіздігінің бүтін шешімдерінің санын анықтаңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "3"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер", "Теңсіздіктер"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"y = x^4 - 4x\text{ функциясының }[-1; 2]\text{ аралығындағы ең үлкен және ең кіші мәндерін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y_{\text{ең кіші}} = 5; y_{\text{ең үлкен}} = 8"},
            {"label": "B", "text": r"y_{\text{ең кіші}} = -1; y_{\text{ең үлкен}} = 2"},
            {"label": "C", "text": r"y_{\text{ең кіші}} = -3; y_{\text{ең үлкен}} = 8"},
            {"label": "D", "text": r"y_{\text{ең кіші}} = 1; y_{\text{ең үлкен}} = 2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Функцияның ең үлкен және ең кіші мәндері"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": r"**Проектор**" + "\n\n" + r"Егер \varphi = 90^\circ, AO = BO, AB = 3\text{ м болса, }AO = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{2}}{2}"},
            {"label": "B", "text": r"\frac{3\sqrt{2}}{2}"},
            {"label": "C", "text": r"\frac{\sqrt{2}}{4}"},
            {"label": "D", "text": r"\frac{\sqrt{3}}{3}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш"],
        "image_filename": "v9_q26_projector.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": r"**Проектор**" + "\n\n" + r"\varphi = 60^\circ, AO = BO, AO = 2\text{ м болса, }O\text{ дан }AB\text{ — ға дейінгі арақашықтық?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": r"\sqrt{3}"},
            {"label": "C", "text": r"2\sqrt{3}"},
            {"label": "D", "text": "1"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Теңқабырғалы үшбұрыш"],
        "image_filename": "v9_q26_projector.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": r"**Проектор**" + "\n\n" + r"\varphi = 60^\circ, AO = BO = 2\text{ м болса, }AB\text{ мәні?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Үшбұрыштар"],
        "image_filename": "v9_q26_projector.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": r"**Проектор**" + "\n\n" + r"AB = 2\text{ м}, \varphi = 90^\circ\text{ болса, }AO\text{ мәні (}AO = BO\text{):}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{2}"},
            {"label": "B", "text": r"2\sqrt{2}"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш"],
        "image_filename": "v9_q26_projector.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": r"**Проектор**" + "\n\n" + r"Проектор жерден 2 м қашықтықта орналасқан. AO = 2\text{ м}, BO = 2\text{ м}. A\text{ нүктесі жерден қанша м қашықтықта?}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "2,5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Қолданбалы геометрия"],
        "image_filename": "v9_q26_projector.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"\frac{x}{3} - \frac{y}{2} + \frac{z}{4} = 1\text{ жазықтық теңдеуі бойынша нормаль вектор мен параллель жазықтықтарды олардың сан мәндерімен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"\vec{n}(4; -6; 3)"},
            {"label": "B", "text": r"\vec{n}(8; -12; -6)"},
            {"label": "C", "text": r"4x - 6y + 3z - 10 = 0"},
            {"label": "D", "text": r"8x - 12y + 6z - 24 = 0"},
        ],
        "subquestions": [
            {"text": "жазықтықтың нормаль векторын анықта", "correct": "A"},
            {"text": "берілген жазықтыққа параллель жазықтық теңдеуін тап", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Аналитикалық геометрия", "Жазықтық теңдеуі"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"Арифметикалық прогрессияның төртінші және оныншы мүшелерінің қосындысы 2,6, ал бесінші және он бірінші мүшелерінің қосындысы (-0,2)-ге тең. Арифметикалық прогрессияның алғашқы алты және тоғыз мүшесінің қосындысын тауып, жауаптармен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "36,9"},
            {"label": "B", "text": "33,8"},
            {"label": "C", "text": "35,4"},
            {"label": "D", "text": "37,2"},
        ],
        "subquestions": [
            {"text": r"S_6", "correct": "D"},
            {"text": r"S_9", "correct": "A"},
        ],
        "answer": '["D", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Арифметикалық прогрессия", "Прогрессия қосындысы"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"4x^2 - 7x + 4 = 3(1 - x)\text{ теңдеуінің түбірлерін тауып, дұрыс жауаптармен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "14"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "7"},
        ],
        "subquestions": [
            {"text": r"7(x_1 + x_2)^{12}", "correct": "D"},
            {"text": r"4x_1 x_2", "correct": "B"},
        ],
        "answer": '["D", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Квадрат теңдеулер", "Виет теоремасы"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"f(x) = 5x^4 - 4x^3 + 7\text{ функциясының алғашқы функциясының мәндерін оның сан мәндерімен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-7"},
            {"label": "B", "text": "7"},
            {"label": "C", "text": "(1; 7)"},
            {"label": "D", "text": "(1; 8)"},
        ],
        "subquestions": [
            {"text": r"F(1) - F(0)", "correct": "B"},
            {"text": "берілген функцияға тиісті нүктені анықта", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Математикалық талдау", "Алғашқы функция", "Функция графигі"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"y = 4(x + 2)^2\text{ функциясының қандай аралықта өсетінін және кемитінін анықтаңыз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"[4; +\infty)"},
            {"label": "B", "text": r"(-\infty; -2]"},
            {"label": "C", "text": r"[-2; +\infty)"},
            {"label": "D", "text": r"(-\infty; 4]"},
        ],
        "subquestions": [
            {"text": "өседі", "correct": "C"},
            {"text": "кемиді", "correct": "B"},
        ],
        "answer": '["C", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция қасиеттері", "Өсу және кему аралықтары"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"Геометриялық прогрессияның алғашқы үш мүшесінің қосындысы 0,7, ал көбейтінділері 0,008. Геометриялық прогрессияның еселігін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "0,5"},
            {"label": "E", "text": "2,5"},
            {"label": "F", "text": "-3"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Геометриялық прогрессия", "Прогрессия еселігі"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\arcsin(x^2 - 5x + 6,5) = \frac{\pi}{6}\text{ теңдеудің түбірлерінің қосындысын және көбейтіндісін есепте}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "4"},
            {"label": "E", "text": "6"},
            {"label": "F", "text": "5"},
        ],
        "answer": '["E", "F"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер", "Кері тригонометрия"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"x\text{-тың қандай мәнінде }\frac{3}{x^2 - 9} + \frac{1}{x}\text{ өрнегінің мағынасы болмайтынын табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "0"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "-3"},
            {"label": "E", "text": "-9"},
            {"label": "F", "text": "3"},
        ],
        "answer": '["B", "D", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Бөлшек-рационал өрнектер", "Анықталу облысы"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"Егер x_0, y_0\text{ }\begin{cases} \log_2 x + \log_2 y = 5 \\ \log_2 x - 2\log_2 y = 2 \end{cases}\text{ теңдеулер жүйесінің шешімі болса, }x_0 \cdot y_0\text{ мәнін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "16"},
            {"label": "B", "text": r"2^5"},
            {"label": "C", "text": "64"},
            {"label": "D", "text": r"2^4"},
            {"label": "E", "text": "1"},
            {"label": "F", "text": "32"},
        ],
        "answer": '["B", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеулер жүйесі", "Логарифм"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Егер \cos\alpha = 0,3\text{ болса, онда }\operatorname{ctg}\alpha\text{ мәні}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\sqrt{0,09}"},
            {"label": "B", "text": r"\frac{3}{\sqrt{91}}"},
            {"label": "C", "text": r"\frac{3}{\sqrt{9,1}}"},
            {"label": "D", "text": r"-\frac{30}{91}"},
            {"label": "E", "text": r"\sqrt{0,91}"},
            {"label": "F", "text": r"-\frac{3}{\sqrt{91}}"},
        ],
        "answer": '["B", "F"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық функциялар", "Тригонометриялық теңбе-теңдіктер"],
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

    test_title = "9-нұсқа: Проектор"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 9-нұсқа математика тапсырмалары (Контекст: Проектор)",
            sort_order=9,
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
                    source="ubt_import_v9",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 9 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
