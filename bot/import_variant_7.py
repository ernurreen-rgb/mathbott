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
        "text": r"\frac{\sqrt{\theta} - 37^0}{10(\theta - 1)^0} өрнектің мәнін табыңыз, мұндағы \theta = 121",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-1"},
            {"label": "D", "text": "2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Дәрежелер", "Арифметика"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"x^4 + 7x^3 - 2x^2 - 7x + 1 = 0 түбірлерінің саны",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "1"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер", "Көпмүшелер"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"x^2 + y^2 + z^2 - 4x + 2y + 6z - 2 = 0 сфера радиусын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "4"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"\int \frac{x}{\sqrt[3]{x}} \, dx интегралды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{3\sqrt[3]{x}}{7} + C"},
            {"label": "B", "text": r"\frac{3\sqrt[3]{x^2}}{5} + C"},
            {"label": "C", "text": r"\frac{3\sqrt[3]{x^2}}{4} + C"},
            {"label": "D", "text": r"\frac{3\sqrt[3]{x^2}}{7} + C"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Алғашқы функция"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"7-ге бөлгенде қалдығы 3 болатын барлық екітаңбалы сандардың қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "624"},
            {"label": "B", "text": "654"},
            {"label": "C", "text": "676"},
            {"label": "D", "text": "689"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\left| \cos\left(3x - \frac{\pi}{4}\right) \right| \le \frac{\sqrt{3}}{2}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left[ \frac{5\pi}{3} + \frac{\pi n}{3}; \frac{13\pi}{3} + \frac{\pi n}{3} \right], n \in \mathbb{Z}"},
            {"label": "B", "text": r"\left[ \frac{5\pi}{12} + 2\pi n; \frac{13\pi}{12} + 2\pi n \right], n \in \mathbb{Z}"},
            {"label": "C", "text": r"\left[ \frac{5\pi}{36} + \frac{2\pi n}{3}; \frac{25\pi}{36} + \frac{2\pi n}{3} \right], n \in \mathbb{Z}"},
            {"label": "D", "text": r"\left[ \frac{5\pi}{36} + \frac{\pi n}{3}; \frac{13\pi}{36} + \frac{\pi n}{3} \right], n \in \mathbb{Z}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңсіздіктер"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"Графикке сәйкес дұрыс тұжырымды анықтаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"k < 0, b > 0"},
            {"label": "B", "text": r"k < 0, b < 0"},
            {"label": "C", "text": r"k > 0, b = 0"},
            {"label": "D", "text": r"k > 0, b < 0"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Сызықтық функция", "График"],
        "image_filename": "v7_q07_linear_graph.png",
    },
    # 8
    {
        "slot_index": 8,
        "text": r"0,3(2a + 5b) + 0,5b - 0,1a өрнектің мәнін тап, мұндағы a + 4b = 8",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Өрнектерді ықшамдау"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"\frac{3\sin\alpha - 6\cos\alpha}{2\cos\alpha - \sin\alpha} = 3 бөлшегінен \operatorname{tg} 2\alpha мәнін есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-2\frac{2}{3}"},
            {"label": "B", "text": r"-1\frac{1}{3}"},
            {"label": "C", "text": r"1\frac{1}{3}"},
            {"label": "D", "text": r"2\frac{2}{3}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық формулалар"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"Барлық қыры 3-ке тең дұрыс алтыбұрышты пирамиданың бүйір жағы табан жазықтығымен 30^\circ бұрыш жасайды. Пирамиданың көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{9\sqrt{3}}{2}"},
            {"label": "B", "text": r"\frac{27\sqrt{3}}{4}"},
            {"label": "C", "text": r"\frac{9\sqrt{3}}{4}"},
            {"label": "D", "text": r"\frac{21\sqrt{3}}{2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"y = x^2 - \ln x функциясына y = x + 3 түзуіне перпендикуляр болатын жанама теңдеуін жаз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = -x + 0,25 + \ln 2"},
            {"label": "B", "text": r"y = -x + 0,75 - \ln 2"},
            {"label": "C", "text": r"y = -x + 0,75 + \ln 2"},
            {"label": "D", "text": r"y = -x + 0,25 - \ln 2"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Жанама"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\begin{cases} 5x + 4y = 17 \\ 2y - 3x - 3 = 0 \end{cases} теңдеулер жүйесінің түбірлері бойынша (x + y)^2",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "25"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"f(x) = 4x^3 - \frac{2}{x} + \frac{1}{1+x^2} функциясының алғашқы функциясын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"F(x) = x^4 - 2\ln x + \operatorname{arcctg} x + C"},
            {"label": "B", "text": r"F(x) = x^4 - 2\ln x + \arcsin x + C"},
            {"label": "C", "text": r"F(x) = 12x^2 - 2\ln x + \operatorname{arcctg} x + C"},
            {"label": "D", "text": r"F(x) = x^4 - 2\ln x + \operatorname{arctg} x + C"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Алғашқы функция"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"y = -2x^2 - 8x + 9 функциясының мәндер жиынын тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"[17; \infty)"},
            {"label": "B", "text": r"[8; \infty)"},
            {"label": "C", "text": r"(-\infty; 17]"},
            {"label": "D", "text": r"(-\infty; 9]"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Мәндер жиыны", "Квадраттық функция"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Өрнекті ықшамда: \frac{m^4 - 49}{m^2 + 7} - \frac{m^6 - 343}{m^4 + 7m^2 + 49}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "m + 1"},
            {"label": "B", "text": "m - 1"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "1"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Өрнектерді ықшамдау", "Қысқаша көбейту формулалары"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"f(x) = 2\sin 8x \cos 8x + 4\cos^2 x + 4\sin^2 x функциясы F(0) = \frac{15}{16} болса, F\left(\frac{\pi}{32}\right) = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\pi}{8} + 1"},
            {"label": "B", "text": r"\frac{\pi}{8} - 1"},
            {"label": "C", "text": r"-\frac{\pi}{8} + 1"},
            {"label": "D", "text": r"-\frac{\pi}{8} - 1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Алғашқы функция", "Тригонометрия"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Катеттері 12 см және 7 см ABC тікбұрышты үшбұрышы берілген. Үшбұрыш медианалары O нүктесінде қиылысады. BOC үшбұрышының ауданын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "16"},
            {"label": "B", "text": "12"},
            {"label": "C", "text": "10"},
            {"label": "D", "text": "14"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Үшбұрыш", "Медиана"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": r"Шаршы қабырғасының ұзындығы 2 \le a \le 5 мәндерін қабылдайды. S ауданы қабылдайтын аралықты табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"[4; 10]"},
            {"label": "B", "text": r"[4; 25]"},
            {"label": "C", "text": r"[8; 20]"},
            {"label": "D", "text": r"[6; 15]"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шаршы", "Аудан"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"\begin{cases} \sqrt{x} + \sqrt{y} = 10 \\ \sqrt[4]{x} + \sqrt[4]{y} = 4 \end{cases} теңдеулер жүйесінің шешімдерінің көбейтіндісін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "81"},
            {"label": "B", "text": "64"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "49"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"Амалды орындаңыз: \frac{a^5 + a^4 + a^3}{a^3 + a^2} \cdot \frac{a^5 + a^4}{a^4 + a^3 + a^2}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"a^5"},
            {"label": "B", "text": r"a^7"},
            {"label": "C", "text": r"a^3"},
            {"label": "D", "text": r"a^8"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Өрнектерді ықшамдау", "Дәрежелер"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\frac{3 - 2x}{x + 2} бөлшектің мәні теріс болатындай айнымалының мүмкін мәндерін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-2; 1,5)"},
            {"label": "B", "text": r"(-\infty; -2) \cup (1,5; \infty)"},
            {"label": "C", "text": r"(-1,5; 2)"},
            {"label": "D", "text": r"(-\infty; -1,5) \cup (2; \infty)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Бөлшек-рационал теңсіздіктер"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"y = \lg(x^2 - 9) - \lg(2x + 7) функциясының анықталу облысын қанағаттандыратын ең кіші бүтін сан",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "-3"},
            {"label": "D", "text": "4"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Анықталу облысы"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"-1; \frac{1}{3}; -\frac{1}{9}; \frac{1}{27}; \dots геометриялық прогрессияның алғашқы үш теріс мүшесінің қосындысын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-1\frac{1}{81}"},
            {"label": "B", "text": r"-\frac{10}{81}"},
            {"label": "C", "text": r"-1\frac{10}{81}"},
            {"label": "D", "text": r"-1\frac{1}{9}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"x^4 \cdot 9^x - 16 \cdot 3^{2x - 4} = 0 теңдеуінің түбірлерінің қосындысын есепте",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "-1"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"\cos^2 x + 1 = \sin x теңдеудің түбірін тап",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x = -\frac{\pi}{2} + 2\pi k"},
            {"label": "B", "text": r"x = \frac{\pi}{2} + 2\pi k"},
            {"label": "C", "text": r"x = \pm\frac{\pi}{6} + 2\pi k"},
            {"label": "D", "text": r"x = \pm\frac{\pi}{4} + 2\pi k"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": "Теннис спортында жеке ойын (екі адамның ойыны) өткізілсе алаңның екі жасыл шеті есепке алынбайды, егер жалпы ойын (төрт адамның ойыны) өткізілетін болса, онда толық алаңда өткізіледі.\n\nАрман мен Әсет ойнайтын ойын алаңының ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "260,8666"},
            {"label": "B", "text": "195,7094"},
            {"label": "C", "text": "19,6749"},
            {"label": "D", "text": "18,6752"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Аудан"],
        "image_filename": "v7_context_tennis_court.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": "Теннис спортында жеке ойын (екі адамның ойыны) өткізілсе алаңның екі жасыл шеті есепке алынбайды, егер жалпы ойын (төрт адамның ойыны) өткізілетін болса, онда толық алаңда өткізіледі.\n\nЕгер Әсет Арманның ауласына ұпай салса, доп түсетін ең кіші аймақтың ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "32,754"},
            {"label": "B", "text": "24,564"},
            {"label": "C", "text": "26,336"},
            {"label": "D", "text": "23,633"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Аудан"],
        "image_filename": "v7_context_tennis_court.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": "Теннис спортында жеке ойын (екі адамның ойыны) өткізілсе алаңның екі жасыл шеті есепке алынбайды, егер жалпы ойын (төрт адамның ойыны) өткізілетін болса, онда толық алаңда өткізіледі.\n\nЖеке ойын алаңы мен жалпы ойын алаңының аудандарының қатынасы (ондық үлеске дейін жуықтаңыз)",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1,3"},
            {"label": "B", "text": "1,4"},
            {"label": "C", "text": "1,5"},
            {"label": "D", "text": "1,7"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Планиметрия", "Аудан"],
        "image_filename": "v7_context_tennis_court.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": "Теннис спортында жеке ойын (екі адамның ойыны) өткізілсе алаңның екі жасыл шеті есепке алынбайды, егер жалпы ойын (төрт адамның ойыны) өткізілетін болса, онда толық алаңда өткізіледі.\n\n1 м^2-қа 0,25 грамм бояу кетсе жасыл ойын алаңын бояуға қанша гр бояу керек болады (екі қабат етіп бояу қажет)?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "130,4333"},
            {"label": "B", "text": "120,3457"},
            {"label": "C", "text": "134,4343"},
            {"label": "D", "text": "151,2232"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Мәтіндік есептер", "Аудан"],
        "image_filename": "v7_context_tennis_court.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": "Теннис спортында жеке ойын (екі адамның ойыны) өткізілсе алаңның екі жасыл шеті есепке алынбайды, егер жалпы ойын (төрт адамның ойыны) өткізілетін болса, онда толық алаңда өткізіледі.\n\nБалалар ойынның алдында жаттығу жасау үшін ойын алаңын 2 рет айналды, олар неше метр жүрді",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "140"},
            {"label": "B", "text": "165"},
            {"label": "C", "text": "137"},
            {"label": "D", "text": "139"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Периметр"],
        "image_filename": "v7_context_tennis_court.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"Берілген парабола графигі бойынша сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"(-1; 0)"},
            {"label": "B", "text": r"(0; -1)"},
            {"label": "C", "text": r"y = 2(x - 1)^2 - 3"},
            {"label": "D", "text": r"y = (x - 1)^2 - 3"},
        ],
        "subquestions": [
            {"text": r"квадраттық функциямен берілуі", "correct": "C"},
            {"text": r"ордината осімен қиылысу нүктесі", "correct": "B"},
        ],
        "answer": '["C", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Функция", "Парабола", "График"],
        "image_filename": "v7_q31_parabola.png",
    },
    # 32
    {
        "slot_index": 32,
        "text": r"Шеңберге іштей сызылған төртбұрыштың бұрыштары берілген. Бұрыштардың мәндерін сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"60^\circ"},
            {"label": "B", "text": r"80^\circ"},
            {"label": "C", "text": r"112,5^\circ"},
            {"label": "D", "text": r"120,5^\circ"},
        ],
        "subquestions": [
            {"text": r"BCD бұрышының мәні", "correct": "C"},
            {"text": r"CDA бұрышының мәні", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Шеңбер", "Төртбұрыш"],
        "image_filename": "v7_q32_circle_quad.png",
    },
    # 33
    {
        "slot_index": 33,
        "text": r"ABC кез-келген үшбұрышы берілген. A бұрышы 50^\circ-қа тең. BD, CE – биссектрисалар. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"105^\circ"},
            {"label": "B", "text": r"130^\circ"},
            {"label": "C", "text": r"135^\circ"},
            {"label": "D", "text": r"115^\circ"},
        ],
        "subquestions": [
            {"text": r"\angle B + \angle C", "correct": "B"},
            {"text": r"\angle EFD", "correct": "D"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Үшбұрыш", "Биссектриса"],
        "image_filename": "v7_q33_triangle_bisectors.png",
    },
    # 34
    {
        "slot_index": 34,
        "text": r"A(5; -3), B(-1; -2) нүктелері арқылы өтетін AB түзуінің теңдеуі y = ax + b түрінде болса, a мен b-ны мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"-\frac{1}{6}"},
            {"label": "B", "text": r"-\frac{8}{7}"},
            {"label": "C", "text": r"-\frac{13}{6}"},
            {"label": "D", "text": r"\frac{3}{4}"},
        ],
        "subquestions": [
            {"text": r"a", "correct": "A"},
            {"text": r"b", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Аналитикалық геометрия", "Түзу теңдеуі"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"Өспелі арифметикалық прогрессия берілген. Егер \frac{a_5}{a_1} = 11, S_8 = 312 болса, айырымы мен екінші мүшесін сан мәндерімен сәйкестендір",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "14"},
            {"label": "D", "text": "12"},
        ],
        "subquestions": [
            {"text": r"d", "correct": "A"},
            {"text": r"a_2", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\left(\sqrt{5 - 2\sqrt{6}}\right)^x + \left(\sqrt{5 + 2\sqrt{6}}\right)^x = 10 теңдеудің түбірлерінің көбейтіндісін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "-4"},
            {"label": "D", "text": "-3"},
            {"label": "E", "text": r"-\sqrt{16}"},
            {"label": "F", "text": r"\sqrt{9}"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер", "Иррационал сандар"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"Ішкі бұрыштарының қосындысы 720^\circ болатын дұрыс көпбұрыштың қабырғасы 5 см. Осы көпбұрышқа сырттай сызылған және іштей сызылған шеңбер радиустарын есепте",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": r"5\sqrt{3}"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "2"},
            {"label": "E", "text": r"2,5\sqrt{3}"},
            {"label": "F", "text": "4"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Дұрыс көпбұрыш", "Шеңбер"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"f(x) = \operatorname{tg} x - \operatorname{ctg} x, \quad f'\left(\frac{\pi}{4}\right) = ?",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"2\sqrt{3}"},
            {"label": "B", "text": r"\sqrt{16}"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "3"},
            {"label": "E", "text": r"\sqrt{12}"},
            {"label": "F", "text": r"2^2"},
        ],
        "answer": '["B", "C", "F"]',
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Тригонометрия"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"Қыры 4 см октаэдрдің бет ауданы мен көлемін есепте",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{61\sqrt{2}}{3}"},
            {"label": "B", "text": r"\frac{32\sqrt{2}}{3}"},
            {"label": "C", "text": r"\frac{64\sqrt{2}}{3}"},
            {"label": "D", "text": r"64\sqrt{3}"},
            {"label": "E", "text": r"32\sqrt{3}"},
            {"label": "F", "text": r"16\sqrt{3}"},
        ],
        "answer": '["C", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Октаэдр", "Көлем", "Аудан"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Дұрыс алтыбұрышты призманың барлық қыры 2 см. Көлемі мен толық бетінің ауданын есепте",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"S_{т.б} = 15(2 + \sqrt{3})"},
            {"label": "B", "text": r"V = 12\sqrt{3}"},
            {"label": "C", "text": r"V = 10\sqrt{3}"},
            {"label": "D", "text": r"S_{т.б} = 12(2 + \sqrt{3})"},
            {"label": "E", "text": r"S_{т.б} = 10(2 + \sqrt{3})"},
            {"label": "F", "text": r"V = 8\sqrt{3}"},
        ],
        "answer": '["B", "D"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Көлем", "Аудан"],
        "image_filename": None,
    },
]

async def import_variant():
    db_url = get_db_url()
    if not db_url:
        print("Error: DATABASE_URL not found!")
        return

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

    test_title = "7-нұсқа: Тенис алаңы"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 7-нұсқа математика тапсырмалары (Контекст: Тенис алаңы)",
            sort_order=7,
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
                    source="ubt_import_v7",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 7 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
