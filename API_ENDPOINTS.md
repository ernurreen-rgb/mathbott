# API Endpoints Documentation

База URL: `http://localhost:8000`

---

## 📋 Содержание

1. [Общие эндпойнты](#общие-эндпойнты)
2. [Модули и прогресс](#модули-и-прогресс)
3. [Задачи](#задачи)
4. [Рейтинг и пользователи](#рейтинг-и-пользователи)
5. [Админ панель - Задачи](#админ-панель---задачи)
6. [Админ панель - Модули](#админ-панель---модули)
7. [Админ панель - Разделы](#админ-панель---разделы)
8. [Админ панель - Уроки](#админ-панель---уроки)
9. [Админ панель - Мини-уроки](#админ-панель---мини-уроки)
10. [Админ панель - Пробные тесты](#админ-панель---пробные-тесты)
11. [Пробные тесты (публичные)](#пробные-тесты-публичные)
12. [Многошаговые задачи](#многошаговые-задачи)

---

## Общие эндпойнты

### GET `/`
**Описание:** Проверка работоспособности API

**Ответ:**
```json
{
  "message": "Mathbot API",
  "version": "1.0.0"
}
```

---

## Модули и прогресс

### GET `/api/modules/map`
**Описание:** Получить карту всех модулей с прогрессом пользователя

**Параметры:**
- `email` (query, optional): Email пользователя для отображения прогресса

**Ответ:** Массив модулей с разделами и прогрессом

---

### GET `/api/modules/{module_id}`
**Описание:** Получить детали модуля с разделами и уроками

**Параметры:**
- `module_id` (path): ID модуля
- `email` (query, optional): Email пользователя

**Ответ:** Детали модуля со списком разделов и уроков

---

### GET `/api/lessons/{lesson_id}`
**Описание:** Получить детали урока с мини-уроками и задачами

**Параметры:**
- `lesson_id` (path): ID урока
- `email` (query, optional): Email пользователя

**Ответ:** Детали урока с мини-уроками и задачами

---

## Задачи

### GET `/api/tasks/{task_id}`
**Описание:** Получить детали задачи

**Параметры:**
- `task_id` (path): ID задачи

**Ответ:** Детали задачи

---

### POST `/api/task/check`
**Описание:** Проверить ответ на задачу

**Тело запроса:**
```json
{
  "task_id": 1,
  "answer": "42",
  "email": "user@example.com"
}
```

**Ответ:**
```json
{
  "correct": true,
  "correct_answer": "42"
}
```

---

## Рейтинг и пользователи

### GET `/api/rating`
**Описание:** Получить рейтинг пользователей

**Параметры:**
- `limit` (query, default: 10): Количество пользователей
- `league` (query, optional): Фильтр по лиге

**Ответ:** Массив пользователей с рейтингом

---

### GET `/api/user/web/{email}`
**Описание:** Получить данные пользователя для веб-интерфейса

**Параметры:**
- `email` (path): Email пользователя
- `refresh_achievements` (query, default: false): Обновить достижения

**Ответ:** Данные пользователя (статистика, достижения, streak)

---

### POST `/api/user/web/nickname`
**Описание:** Обновить никнейм пользователя

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "nickname": "Новый никнейм"
}
```

**Ответ:** Обновленные данные пользователя

---

### GET `/api/admin/check`
**Описание:** Проверить, является ли пользователь админом

**Параметры:**
- `email` (query): Email пользователя

**Ответ:**
```json
{
  "is_admin": true
}
```

---

### POST `/api/admin/set-admin`
**Описание:** Установить права администратора

**Тело запроса:**
```json
{
  "email": "user@example.com"
}
```

**Ответ:** Результат операции

---


## Админ панель - Задачи

### GET `/api/admin/tasks`
**Описание:** Получить все задачи (админ)

**Параметры:**
- `email` (query): Email администратора

**Ответ:** Массив всех задач

---

### POST `/api/admin/tasks`
**Описание:** Создать новую задачу (админ)

**Параметры (FormData):**
- `text` (required): Текст задачи
- `answer` (required): Правильный ответ
- `email` (required): Email администратора

**Ответ:** Созданная задача

---

### PUT `/api/admin/tasks/{task_id}`
**Описание:** Обновить задачу (админ)

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query): Email администратора
- `text` (form, optional): Текст задачи
- `answer` (form, optional): Правильный ответ

**Ответ:** Обновленная задача

---

### DELETE `/api/admin/tasks/{task_id}`
**Описание:** Удалить задачу (soft delete, админ)

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query): Email администратора

**Ответ:** Результат удаления

---

### GET `/api/admin/tasks/trash`
**Описание:** Получить удаленные задачи (админ)

**Параметры:**
- `email` (query): Email администратора

**Ответ:** Массив удаленных задач

---

### POST `/api/admin/tasks/{task_id}/restore`
**Описание:** Восстановить удаленную задачу (админ)

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query): Email администратора

**Ответ:** Результат восстановления

---

### POST `/api/admin/tasks/trash/empty`
**Описание:** Очистить корзину (удалить все удаленные задачи навсегда, админ)

**Параметры:**
- `email` (query): Email администратора

**Ответ:** Результат операции

---

### POST `/api/admin/tasks/reset-id-counter`
**Описание:** Сбросить счетчик ID задач (админ)

**Параметры:**
- `email` (query): Email администратора

**Ответ:** Результат операции

---

### POST `/api/admin/tasks/{task_id}/ai-solution`
**Описание:** Создать AI решение для задачи (админ)

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query): Email администратора
- `solution_text` (body): Текст решения

**Ответ:** Созданное AI решение

---

### GET `/api/admin/tasks/{task_id}/ai-solution`
**Описание:** Получить AI решение задачи (админ)

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query): Email администратора

**Ответ:** AI решение задачи

---

### POST `/api/admin/tasks/{task_id}/ai-solution/retry`
**Описание:** Повторить генерацию AI решения (админ)

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query): Email администратора

**Ответ:** Новое AI решение

---

### POST `/api/admin/tasks/{task_id}/ai-solution/approve`
**Описание:** Одобрить AI решение (админ)

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query): Email администратора

**Ответ:** Результат операции

---

### POST `/api/admin/tasks/{task_id}/ai-solution/reject`
**Описание:** Отклонить AI решение (админ)

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query): Email администратора

**Ответ:** Результат операции

---

## Админ панель - Модули

### GET `/api/admin/modules`
**Описание:** Получить все модули (админ)

**Параметры:**
- `email` (query): Email администратора

**Ответ:** Массив всех модулей

---

### POST `/api/admin/modules`
**Описание:** Создать новый модуль (админ)

**Параметры (FormData):**
- `name` (required): Название модуля
- `description` (optional): Описание модуля
- `icon` (optional): Иконка модуля
- `sort_order` (optional, default: 0): Порядок сортировки
- `email` (required): Email администратора

**Ответ:** Созданный модуль

---

### PUT `/api/admin/modules/{module_id}`
**Описание:** Обновить модуль (админ)

**Параметры:**
- `module_id` (path): ID модуля
- `email` (query): Email администратора
- `name` (form, optional): Название модуля
- `description` (form, optional): Описание модуля
- `icon` (form, optional): Иконка модуля
- `sort_order` (form, optional): Порядок сортировки

**Ответ:** Обновленный модуль

---

### DELETE `/api/admin/modules/{module_id}`
**Описание:** Удалить модуль (админ)

**Параметры:**
- `module_id` (path): ID модуля
- `email` (query): Email администратора

**Ответ:** Результат удаления

---

## Админ панель - Разделы

### GET `/api/admin/modules/{module_id}/sections`
**Описание:** Получить все разделы модуля (админ)

**Параметры:**
- `module_id` (path): ID модуля
- `email` (query): Email администратора

**Ответ:** Массив разделов модуля

---

### POST `/api/admin/modules/{module_id}/sections`
**Описание:** Создать новый раздел (админ)

**Параметры (FormData):**
- `module_id` (path): ID модуля
- `name` (required): Название раздела
- `description` (optional): Описание раздела
- `guide` (optional): Справочник раздела
- `sort_order` (optional, default: 0): Порядок сортировки
- `email` (required): Email администратора

**Ответ:** Созданный раздел

---

### PUT `/api/admin/sections/{section_id}`
**Описание:** Обновить раздел (админ)

**Параметры:**
- `section_id` (path): ID раздела
- `email` (query): Email администратора
- `name` (form, optional): Название раздела
- `description` (form, optional): Описание раздела
- `guide` (form, optional): Справочник раздела
- `sort_order` (form, optional): Порядок сортировки

**Ответ:** Обновленный раздел

---

### DELETE `/api/admin/sections/{section_id}`
**Описание:** Удалить раздел (админ)

**Параметры:**
- `section_id` (path): ID раздела
- `email` (query): Email администратора

**Ответ:** Результат удаления

---

### GET `/api/admin/sections/{section_id}/tasks`
**Описание:** Получить все задачи раздела (админ)

**Параметры:**
- `section_id` (path): ID раздела
- `email` (query): Email администратора

**Ответ:** Массив задач раздела

---

### POST `/api/admin/sections/{section_id}/tasks`
**Описание:** Создать задачу в разделе (админ)

**Параметры (FormData):**
- `section_id` (path): ID раздела
- `text` (required): Текст задачи
- `answer` (required): Правильный ответ
- `question_type` (optional, default: "input"): Тип вопроса (tf | mcq | input)
- `options` (optional): JSON строка с вариантами ответов для MCQ
- `sort_order` (optional, default: 0): Порядок сортировки
- `task_type` (optional, default: "standard"): Тип задачи
- `email` (required): Email администратора

**Ответ:** Созданная задача

---

### GET `/api/admin/sections/{section_id}/lessons`
**Описание:** Получить все уроки раздела (админ)

**Параметры:**
- `section_id` (path): ID раздела
- `email` (query): Email администратора

**Ответ:** Массив уроков раздела

---

### POST `/api/admin/sections/{section_id}/lessons`
**Описание:** Создать новый урок в разделе (админ)

**Параметры (FormData):**
- `section_id` (path): ID раздела
- `name` (required): Название урока
- `sort_order` (optional, default: 0): Порядок сортировки
- `email` (required): Email администратора

**Ответ:** Созданный урок

---

## Админ панель - Уроки

### PUT `/api/admin/lessons/{lesson_id}`
**Описание:** Обновить урок (админ)

**Параметры:**
- `lesson_id` (path): ID урока
- `email` (query): Email администратора
- `name` (form, optional): Название урока
- `sort_order` (form, optional): Порядок сортировки

**Ответ:** Обновленный урок

---

### DELETE `/api/admin/lessons/{lesson_id}`
**Описание:** Удалить урок (админ)

**Параметры:**
- `lesson_id` (path): ID урока
- `email` (query): Email администратора

**Ответ:** Результат удаления

---

## Админ панель - Мини-уроки

### GET `/api/admin/lessons/{lesson_id}/mini-lessons`
**Описание:** Получить все мини-уроки урока (админ)

**Параметры:**
- `lesson_id` (path): ID урока
- `email` (query): Email администратора

**Ответ:** Массив мини-уроков

---

### PUT `/api/admin/mini-lessons/{mini_lesson_id}`
**Описание:** Обновить мини-урок (админ)

**Параметры:**
- `mini_lesson_id` (path): ID мини-урока
- `email` (query): Email администратора
- `name` (form, optional): Название мини-урока
- `sort_order` (form, optional): Порядок сортировки

**Ответ:** Обновленный мини-урок

---

### GET `/api/admin/mini-lessons/{mini_lesson_id}/tasks`
**Описание:** Получить все задачи мини-урока (админ)

**Параметры:**
- `mini_lesson_id` (path): ID мини-урока
- `email` (query): Email администратора

**Ответ:** Массив задач мини-урока

---

### POST `/api/admin/mini-lessons/{mini_lesson_id}/tasks`
**Описание:** Создать задачу в мини-уроке (админ)

**Параметры (FormData):**
- `mini_lesson_id` (path): ID мини-урока
- `text` (required): Текст задачи
- `answer` (required): Правильный ответ
- `question_type` (optional, default: "input"): Тип вопроса (tf | mcq | input)
- `options` (optional): JSON строка с вариантами ответов для MCQ
- `sort_order` (optional, default: 0): Порядок сортировки
- `task_type` (optional, default: "standard"): Тип задачи
- `email` (required): Email администратора

**Ответ:** Созданная задача

---

## Админ панель - Пробные тесты

### GET `/api/admin/trial-tests`
**Описание:** Получить все пробные тесты (админ)

**Параметры:**
- `email` (query): Email администратора

**Ответ:** Массив пробных тестов

---

### POST `/api/admin/trial-tests`
**Описание:** Создать новый пробный тест (админ)

**Параметры (FormData):**
- `title` (required): Название теста
- `description` (optional): Описание теста
- `email` (required): Email администратора

**Ответ:** Созданный пробный тест

---

### PUT `/api/admin/trial-tests/{test_id}`
**Описание:** Обновить пробный тест (админ)

**Параметры:**
- `test_id` (path): ID теста
- `email` (query): Email администратора
- `title` (form, optional): Название теста
- `description` (form, optional): Описание теста

**Ответ:** Обновленный пробный тест

---

### DELETE `/api/admin/trial-tests/{test_id}`
**Описание:** Удалить пробный тест (админ)

**Параметры:**
- `test_id` (path): ID теста
- `email` (query): Email администратора

**Ответ:** Результат удаления

---

### POST `/api/admin/trial-tests/{test_id}/tasks/create`
**Описание:** Создать задачу для пробного теста (админ)

**Параметры (FormData):**
- `test_id` (path): ID теста
- `text` (required): Текст задачи
- `answer` (required): Правильный ответ
- `question_type` (optional, default: "input"): Тип вопроса (tf | mcq | input)
- `options` (optional): JSON строка с вариантами ответов для MCQ
- `sort_order` (optional, default: 0): Порядок сортировки
- `email` (required): Email администратора

**Ответ:** Созданная задача

---

### DELETE `/api/admin/trial-tests/{test_id}/tasks/{task_id}`
**Описание:** Удалить задачу из пробного теста (админ)

**Параметры:**
- `test_id` (path): ID теста
- `task_id` (path): ID задачи
- `email` (query): Email администратора

**Ответ:** Результат удаления

---

## Пробные тесты (публичные)

### GET `/api/trial-tests`
**Описание:** Получить все доступные пробные тесты

**Ответ:** Массив пробных тестов

---

### GET `/api/trial-tests/{test_id}`
**Описание:** Получить детали пробного теста с задачами (без правильных ответов)

**Параметры:**
- `test_id` (path): ID теста
- `email` (query, optional): Email пользователя

**Ответ:** Детали теста со списком задач

---

### POST `/api/trial-tests/{test_id}/submit`
**Описание:** Отправить ответы на пробный тест и получить результаты

**Тело запроса:**
```json
{
  "email": "user@example.com",
  "answers": {
    "1": "42",
    "2": "true",
    "3": "A"
  }
}
```

**Ответ:**
```json
{
  "score": 2,
  "total": 3,
  "percentage": 66.67,
  "results": {
    "1": {
      "answer": "42",
      "correct": true,
      "correct_answer": "42"
    },
    "2": {
      "answer": "true",
      "correct": true,
      "correct_answer": "true"
    },
    "3": {
      "answer": "A",
      "correct": false,
      "correct_answer": "B"
    }
  }
}
```

---

### GET `/api/trial-tests/{test_id}/results`
**Описание:** Получить результаты прохождения пробного теста пользователем

**Параметры:**
- `test_id` (path): ID теста
- `email` (query, required): Email пользователя

**Ответ:** Массив результатов прохождения теста

---

## Многошаговые задачи

### GET `/api/tasks/{task_id}/questions`
**Описание:** Получить вопросы многошаговой задачи

**Параметры:**
- `task_id` (path): ID задачи
- `email` (query, optional): Email пользователя

**Ответ:** Массив вопросов задачи

---

### POST `/api/tasks/{task_id}/questions/check`
**Описание:** Проверить ответ на вопрос многошаговой задачи

**Параметры (FormData):**
- `task_id` (path): ID задачи
- `question_index` (required): Индекс вопроса (0-based)
- `answer` (required): Ответ пользователя
- `email` (required): Email пользователя

**Ответ:**
```json
{
  "correct": true
}
```

---

## Примечания

- Все админ эндпойнты требуют параметр `email` для проверки прав администратора
- Файлы (изображения и решения) загружаются через `FormData` с типом `multipart/form-data`
- Для MCQ задач параметр `options` должен быть JSON строкой в формате:
  ```json
  [
    {"label": "A", "text": "Вариант A"},
    {"label": "B", "text": "Вариант B"},
    {"label": "C", "text": "Вариант C"},
    {"label": "D", "text": "Вариант D"}
  ]
  ```
- Типы вопросов: `input` (текстовый ввод), `tf` (True/False), `mcq` (Multiple Choice)
- Все временные метки возвращаются в формате ISO 8601
- Soft delete означает, что запись помечается как удаленная, но не удаляется физически из базы данных

