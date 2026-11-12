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
        "text": r"Есепте: \sqrt{1013^2 - 1012^2} - \sqrt{13^2 - 12^2}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "55"},
            {"label": "B", "text": "50"},
            {"label": "C", "text": "45"},
            {"label": "D", "text": "40"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Сандар мен есептеулер", "Түбірлер"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"Бөлшектің бөлімін иррационалдықтан арылтыңыз: \frac{\sqrt{a^2+1}+\sqrt{a^2-1}}{\sqrt{a^2+1}-\sqrt{a^2-1}}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"1 + 2\sqrt{a^4 - 1}"},
            {"label": "B", "text": r"a^2 - 2\sqrt{a^4 - 1}"},
            {"label": "C", "text": r"a^2 + \sqrt{a^4 - 1}"},
            {"label": "D", "text": r"a^2 + 2\sqrt{a^4 - 1}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал өрнектер", "Бөлшектің бөлімін иррационалдықтан арылту"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"4 \sin 105^\circ \sin 15^\circ - 3\operatorname{tg} 201^\circ \operatorname{tg} 291^\circ \text{ өрнектің мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "3"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық формулалар", "Келтіру формулалары"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"Көбейткішке жікте: 2x^5 + 4x^3 + 2x",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2x(x^2 - 1)(x^2 + 1)"},
            {"label": "B", "text": r"2x(x^2 + 1)^2"},
            {"label": "C", "text": r"2x(x^2 - 1)^2"},
            {"label": "D", "text": r"x(2x^2 + 1)^2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көпмүшелер", "Көбейткіштерге жіктеу"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"3^x + 3^{1-x} = 4 \text{ теңдеуінің барлық түбірлерінің қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-1"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер", "Теңдеулер"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\text{Есептеңіз: } (2024 - 1) \cdot (2024 - 2) \cdot (2024 - 3) \dots (2024 - 2023)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2023!"},
            {"label": "D", "text": r"2024^{2023}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Факториал", "Сандар теориясы"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"\text{Анықталмаған интегралды тап: } \int \frac{x^4 - 2x^2 + 1}{(x-1)(x+1)} dx",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-\frac{1}{2} x^2 + x + C"},
            {"label": "B", "text": r"\frac{1}{2} x^2 - x + C"},
            {"label": "C", "text": r"\frac{1}{3} x^3 - x + C"},
            {"label": "D", "text": r"-\frac{1}{3} x^3 + x + C"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Интеграл", "Анықталмаған интеграл"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"\log_{x^2} 8 + \log_{2x} 4 = 2,5 \text{ теңдеудің түбірін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік теңдеулер"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"\text{Егер } \sin 2\alpha = 0,25 \text{ болса, } \sin^4\alpha + \cos^4\alpha \text{ өрнектің мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \frac{15}{16}"},
            {"label": "B", "text": r"y = \frac{31}{32}"},
            {"label": "C", "text": r"y = \frac{7}{8}"},
            {"label": "D", "text": r"y = -\frac{3}{4}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық өрнектер", "Тригонометриялық тепе-теңдіктер"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"\sqrt{x^{1 + \frac{1}{2\log_4 x}} + 8^{\frac{1}{3\log_{x^2} 2}} + 1} \text{ өрнекті ықшамда}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "x - 1"},
            {"label": "B", "text": "x + 1"},
            {"label": "C", "text": "x + 2"},
            {"label": "D", "text": "x + 4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\text{Ұштары } A(7; -1), B(4; -5) \text{ нүктелері болатын } \vec{AB} \text{ векторымен бағыттас бірлік вектордың координатасын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left(\frac{12}{13}; \frac{5}{13}\right)"},
            {"label": "B", "text": "(0,8; 0,6)"},
            {"label": "C", "text": "(-0,6; -0,8)"},
            {"label": "D", "text": "(-0,8; -0,6)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Бірлік вектор"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"y = x^2 - 3x + 5 \text{ функциясы графигінің қай нүктесіне жүргізілген жанамасы } Ox \text{ осінің оң бағытымен } 45^\circ \text{ бұрыш жасайды}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(2; 4)"},
            {"label": "B", "text": "(1; 2)"},
            {"label": "C", "text": "(3; 6)"},
            {"label": "D", "text": "(2; 3)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Жанаманың теңдеуі"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"y = \sin 2x + \cos\left(3x - \frac{\pi}{8}\right) \text{ берілген функцияның ең кіші оң периодын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\pi"},
            {"label": "B", "text": r"\pi"},
            {"label": "C", "text": r"\frac{5\pi}{3}"},
            {"label": "D", "text": r"\frac{3\pi}{2}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функция қасиеттері", "Функция периоды"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"\text{Тік төртбұрыштың диагоналі оның бұрышын } 1:2 \text{ бөледі. Егер екі диагональдің қосындысы } 20\text{ см болса, тіктөртбұрыштың кіші қабырғасын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "8"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тіктөртбұрыш"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"\text{Радиустары } 4\text{ см және } 8\text{ см екі шеңбер қиылысады. Егер олардың центрлерінің арақашықтығы } 4\sqrt{3}\text{ болса, шеңберлердің қиылысуынан пайда болған доғалардың ұзындықтарының қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{15\pi}{4}"},
            {"label": "B", "text": r"\frac{20\pi}{3}"},
            {"label": "C", "text": r"15\pi"},
            {"label": "D", "text": r"12\pi"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Доға ұзындығы"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"AB = \sqrt{3}, \frac{\alpha}{\beta} = \frac{1}{2} \text{ және C бұрышы тік болса, тікбұрышты үшбұрыштың ауданын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3\sqrt{3}}{4}"},
            {"label": "B", "text": r"\frac{3\sqrt{2}}{8}"},
            {"label": "C", "text": r"\frac{3\sqrt{3}}{8}"},
            {"label": "D", "text": r"\frac{2\sqrt{3}}{3}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш", "Үшбұрыш ауданы"],
        "image_filename": "v19_q16_triangle.png",
    },
    # 17
    {
        "slot_index": 17,
        "text": r"x - 7\sqrt{x-3} + 7 = 0 \text{ теңдеудің түбірлерінің қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "20"},
            {"label": "B", "text": "35"},
            {"label": "C", "text": "15"},
            {"label": "D", "text": "24"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Иррационал теңдеулер", "Теңдеулер"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\text{Өрнектің мәнін тап: } \frac{10+15+20+\dots+100}{19}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "110"},
            {"label": "B", "text": "50"},
            {"label": "C", "text": "100"},
            {"label": "D", "text": "55"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\text{Суретте берілген функцияның A нүктесі арқылы жүргізілген жанаманың бұрыштық коэффициентін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,7"},
            {"label": "B", "text": "0,3"},
            {"label": "C", "text": "0,2"},
            {"label": "D", "text": "0,5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туындының геометриялық мағынасы", "Жанама"],
        "image_filename": "v19_q19_plot.png",
    },
    # 20
    {
        "slot_index": 20,
        "text": r"\text{Конустың осьтік қимасы катеті } 4\text{ см тікбұрышты үшбұрыш. Конусқа іштей сызылған сфера радиусын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"4 + 2\sqrt{2}"},
            {"label": "B", "text": r"4 - 2\sqrt{2}"},
            {"label": "C", "text": r"2 - \sqrt{2}"},
            {"label": "D", "text": r"2 + \sqrt{2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус", "Сфера"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\text{Барлық қабырғалары тең үшбұрышты пирамиданың биіктігінің проекциясының геометриялық орны}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "табанына іштей сызылған шеңбер центрі"},
            {"label": "B", "text": "табанының ұзын қабырғасының ортасы"},
            {"label": "C", "text": "табанына сырттай сызылған шеңбер центрі"},
            {"label": "D", "text": "табанының ауырлық центрі"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\begin{cases} y^{x^2 - 2x - 3} = 1 \\ \log_2 x = y \end{cases} \text{ теңдеулер жүйесінің түбірлерінің көбейтіндісін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"12\log_2 3"},
            {"label": "B", "text": r"3\log_2 3"},
            {"label": "C", "text": r"6\log_2 3"},
            {"label": "D", "text": r"2\log_2 3"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Логарифм"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"y = \ln(\operatorname{tg} x) \text{ берілген функция бойынша } y\left(\frac{\pi}{4}\right) + y'\left(\frac{\pi}{4}\right) = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{2}"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "1"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Логарифмдік функция"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"\text{Сызбада берілген шеңбердің радиусы } OA \text{ және } OC. \angle AOC = 160^\circ, \angle OCB = 30^\circ. \angle OAB = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"50^\circ"},
            {"label": "B", "text": r"60^\circ"},
            {"label": "C", "text": r"30^\circ"},
            {"label": "D", "text": r"70^\circ"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Бұрыштар"],
        "image_filename": "v19_q24_circle.png",
    },
    # 25
    {
        "slot_index": 25,
        "text": r"\log_{125} x + \log_{125}^2 x + \dots + \log_{125}^n x + \dots = \frac{1}{2} \text{ теңдеудің түбірінің квадратын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "16"},
            {"label": "B", "text": "25"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "36"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Логарифм", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 26 (Context: Себет)
    {
        "slot_index": 26,
        "text": "Контекст «Себет»\n\nТікбұрышты параллелепипед тәріздес себеттер берілген.\nКіші себеттің өлшемдері: ені 11 см, ұзындығы 20 см, биіктігі 10 см\nОрташа себеттің өлшемдері: ені 18 см, ұзындығы 20 см, биіктігі 10 см\nҮлкен себеттің өлшемдері: ені 15 см, ұзындығы 22 см, биіктігі 20 см\n\nКіші себеттің көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2000\text{ см}^3"},
            {"label": "B", "text": r"2200\text{ см}^3"},
            {"label": "C", "text": r"3600\text{ см}^3"},
            {"label": "D", "text": r"2600\text{ см}^3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Параллелепипед", "Көлем"],
        "image_filename": "v19_context_sebet.png",
    },
    # 27 (Context: Себет)
    {
        "slot_index": 27,
        "text": "Контекст «Себет»\n\nТікбұрышты параллелепипед тәріздес себеттер берілген.\nКіші себеттің өлшемдері: ені 11 см, ұзындығы 20 см, биіктігі 10 см\nОрташа себеттің өлшемдері: ені 18 см, ұзындығы 20 см, биіктігі 10 см\nҮлкен себеттің өлшемдері: ені 15 см, ұзындығы 22 см, биіктігі 20 см\n\nКіші себеттің көлемінің орташа себеттің көлеміне қатынасы?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{18}{11}"},
            {"label": "B", "text": r"\frac{1}{3}"},
            {"label": "C", "text": r"\frac{6}{11}"},
            {"label": "D", "text": r"\frac{11}{18}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Параллелепипед", "Қатынас"],
        "image_filename": "v19_context_sebet.png",
    },
    # 28 (Context: Себет)
    {
        "slot_index": 28,
        "text": "Контекст «Себет»\n\nТікбұрышты параллелепипед тәріздес себеттер берілген.\nКіші себеттің өлшемдері: ені 11 см, ұзындығы 20 см, биіктігі 10 см\nОрташа себеттің өлшемдері: ені 18 см, ұзындығы 20 см, биіктігі 10 см\nҮлкен себеттің өлшемдері: ені 15 см, ұзындығы 22 см, биіктігі 20 см\n\nОрташа себеттің толық бетінің ауданы?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"1120\text{ см}^2"},
            {"label": "B", "text": r"1480\text{ см}^2"},
            {"label": "C", "text": r"1160\text{ см}^2"},
            {"label": "D", "text": r"1440\text{ см}^2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Параллелепипед", "Толық бетінің ауданы"],
        "image_filename": "v19_context_sebet.png",
    },
    # 29 (Context: Себет)
    {
        "slot_index": 29,
        "text": "Контекст «Себет»\n\nТікбұрышты параллелепипед тәріздес себеттер берілген.\nКіші себеттің өлшемдері: ені 11 см, ұзындығы 20 см, биіктігі 10 см\nОрташа себеттің өлшемдері: ені 18 см, ұзындығы 20 см, биіктігі 10 см\nҮлкен себеттің өлшемдері: ені 15 см, ұзындығы 22 см, биіктігі 20 см\n\nКіші себеттің бүйір бетінің ауданын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"660\text{ см}^2"},
            {"label": "B", "text": r"840\text{ см}^2"},
            {"label": "C", "text": r"620\text{ см}^2"},
            {"label": "D", "text": r"760\text{ см}^2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Параллелепипед", "Бүйір бетінің ауданы"],
        "image_filename": "v19_context_sebet.png",
    },
    # 30 (Context: Себет)
    {
        "slot_index": 30,
        "text": "Контекст «Себет»\n\nТікбұрышты параллелепипед тәріздес себеттер берілген.\nКіші себеттің өлшемдері: ені 11 см, ұзындығы 20 см, биіктігі 10 см\nОрташа себеттің өлшемдері: ені 18 см, ұзындығы 20 см, биіктігі 10 см\nҮлкен себеттің өлшемдері: ені 15 см, ұзындығы 22 см, биіктігі 20 см\n\nТөртінші себеттің көлемі осы үш себеттің көлемдерінің қосындысына тең. Дұрыс жауапты көрсетіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"12400\text{ см}^3"},
            {"label": "B", "text": r"14200\text{ см}^3"},
            {"label": "C", "text": r"13200\text{ см}^3"},
            {"label": "D", "text": r"14400\text{ см}^3"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Стереометрия", "Параллелепипед", "Көлем"],
        "image_filename": "v19_context_sebet.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"x = \alpha, y = \beta. \text{ Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"30^\circ"},
            {"label": "B", "text": r"40^\circ"},
            {"label": "C", "text": r"60^\circ"},
            {"label": "D", "text": r"70^\circ"},
        ],
        "subquestions": [
            {"text": r"x\text{ - тің мәні}", "correct": "A"},
            {"text": r"y\text{ - тің мәні}", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш"],
        "image_filename": "v19_q31_triangle.png",
    },
    # 32
    {
        "slot_index": 32,
        "text": r"x^2 - 3x - 6 \text{ үшмүшесін көбейткішке жіктегенде } (x - a)(x - b) \text{ өрнегін аламыз. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "21"},
            {"label": "C", "text": "24"},
            {"label": "D", "text": "3"},
        ],
        "subquestions": [
            {"text": "a + b", "correct": "D"},
            {"text": r"a^2 + b^2", "correct": "B"},
        ],
        "answer": '["D", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Квадрат үшмүше", "Виет теоремасы"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"\text{Тізбектің } a_n = 5n - 104 \text{ жалпы мүшесінің формуласы берілген. } 21 \text{ және } 36 \text{ сандары тізбектің сәйкесінше } k \text{ және } m \text{ нөмірлі мүшелері болса, } k \text{ мен } m\text{-ді реттік нөмірімен сәйкестендіріңіз:}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "25"},
            {"label": "B", "text": "26"},
            {"label": "C", "text": "27"},
            {"label": "D", "text": "28"},
        ],
        "subquestions": [
            {"text": "k", "correct": "A"},
            {"text": "m", "correct": "D"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Тізбектер", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"\text{Төменде берілген квадрат функция графигін пайдаланып, сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "(-3; 0)"},
            {"label": "B", "text": "(3; 0)"},
            {"label": "C", "text": "(-2; -1)"},
            {"label": "D", "text": "(0; 3)"},
        ],
        "subquestions": [
            {"text": r"Oy \text{ осімен қиылысу нүктесінің координаталары}", "correct": "D"},
            {"text": "парабола төбесінің координаталары", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функциялар және графиктер", "Парабола"],
        "image_filename": "v19_q34_parabola.png",
    },
    # 35
    {
        "slot_index": 35,
        "text": r"\text{Барлық оң екі таңбалы жұп сандардың қосындысы мен тақ екі таңбалы сандардың қосындысын олардың сан мәндерімен сәйкестендір}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "2500"},
            {"label": "B", "text": "2430"},
            {"label": "C", "text": "2475"},
            {"label": "D", "text": "2575"},
        ],
        "subquestions": [
            {"text": "Жұп екі таңбалы сандардың қосындысы", "correct": "B"},
            {"text": "Тақ екі таңбалы сандардың қосындысы", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Арифметикалық прогрессия", "Сандар теориясы"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\text{Табаны 6, қыры 4 болатын дұрыс үшбұрышты пирамиданың бүйір қыры мен табан жазықтығының арасындағы бұрышын табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"60^\circ"},
            {"label": "B", "text": r"45^\circ"},
            {"label": "C", "text": r"30^\circ"},
            {"label": "D", "text": r"\frac{\pi}{6}"},
            {"label": "E", "text": r"\frac{\pi}{3}"},
            {"label": "F", "text": r"\frac{\pi}{4}"},
        ],
        "answer": '["C", "D"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Бұрыш"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"\text{Тік параллелепипедтің табаны диагональдары } 6\text{ см және } 8\text{ см-ге тең ромб. Бүйір жағының диагоналі } 13\text{ см болса, параллелепипедтің биіктігін есепте}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\sqrt{100}"},
            {"label": "B", "text": "12"},
            {"label": "C", "text": "8"},
            {"label": "D", "text": "10"},
            {"label": "E", "text": r"\sqrt{144}"},
            {"label": "F", "text": r"\sqrt{64}"},
        ],
        "answer": '["B", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Параллелепипед", "Пифагор теоремасы"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"y = -2\sin 20x + \sin^2 20x + 10 \text{ функцияның мәндер жиынын тап}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "[-2; 2]"},
            {"label": "B", "text": "[-2; 10]"},
            {"label": "C", "text": "[-8; 8]"},
            {"label": "D", "text": "[9; 13]"},
            {"label": "E", "text": "[8; 9]"},
            {"label": "F", "text": "[-9; 10]"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функция қасиеттері", "Мәндер жиыны"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"\frac{8\pi}{3}\text{ – ге тең бұрышты градус арқылы өрнектеңіз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"480^\circ"},
            {"label": "B", "text": r"460^\circ"},
            {"label": "C", "text": r"440^\circ"},
            {"label": "D", "text": r"450^\circ"},
            {"label": "E", "text": r"470^\circ"},
            {"label": "F", "text": r"490^\circ"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Бұрыш", "Радиан"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"\text{Егер } (x_0; y_0) \begin{cases} \cos(x + y) = 1 \\ x - y = \frac{\pi}{3} \end{cases} \text{ теңдеулер жүйесінің } [-900^\circ; 900^\circ] \text{ аралығындағы шешімі болса, } x_0 \cdot y_0 \text{ мән(дер)ін табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"-\frac{\pi^2}{24}"},
            {"label": "B", "text": r"-\frac{\pi^2}{64}"},
            {"label": "C", "text": r"-\frac{\pi^2}{36}"},
            {"label": "D", "text": r"-\frac{\pi^2}{48}"},
            {"label": "E", "text": r"-\frac{\pi^2}{9}"},
            {"label": "F", "text": r"-\frac{\pi^2}{16}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер жүйесі", "Теңдеулер жүйесі"],
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
    test_title = "19-нұсқа: Себет"
    test_desc = "ҰБТ 19-нұсқа математика тапсырмалары (Контекст: Себет)"

    # Check if test already exists in folder 11
    tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = None
    for t in tests:
        if t['title'] == test_title or t['title'].startswith("19-нұсқа"):
            target_test = t
            break

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description=test_desc,
            sort_order=19,
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
                    source="ubt_import_v19",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 19 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
