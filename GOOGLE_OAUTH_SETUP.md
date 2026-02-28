# Настройка Google OAuth

## Точный Redirect URI для локальной разработки:
```
http://localhost:3000/api/auth/callback/google
```

## Пошаговая инструкция:

### 1. Откройте Google Cloud Console
Перейдите: https://console.cloud.google.com/

### 2. Выберите проект
- В верхней части страницы выберите нужный проект

### 3. Перейдите в OAuth настройки
- Слева меню → **APIs & Services** → **Credentials**
- Или прямая ссылка: https://console.cloud.google.com/apis/credentials

### 4. Отредактируйте OAuth 2.0 Client ID
- Найдите ваш OAuth 2.0 Client ID (обычно называется "Web client")
- Нажмите на иконку карандаша (Edit) или название клиента

### 5. Добавьте Authorized redirect URIs
- Прокрутите вниз до секции **"Authorized redirect URIs"**
- Нажмите **"+ ADD URI"**
- Вставьте точно этот URL (без пробелов, без переносов строк):
  ```
  http://localhost:3000/api/auth/callback/google
  ```
- Убедитесь, что:
  - ✅ Нет пробелов перед или после URL
  - ✅ Нет переносов строк
  - ✅ Начинается с `https://`
  - ✅ Заканчивается на `/api/auth/callback/google`

### 6. Сохраните изменения
- Нажмите **"SAVE"** внизу страницы

### 7. Подождите несколько секунд
- Изменения могут применяться с задержкой 1-2 минуты

### 8. Перезапустите frontend (если еще не перезапускали после изменения .env.local)
```powershell
cd web
# Остановите текущий процесс (Ctrl+C в терминале где запущен npm run dev)
npm run dev
```

## Проверка:

1. Откройте приложение в браузере:
   http://localhost:3000

2. Нажмите "Google арқылы кіру" (Войти через Google)

3. Должен открыться Google OAuth экран (не ошибка redirect_uri_mismatch)

## Возможные проблемы:

### Ошибка "redirect_uri_mismatch"
- ✅ Проверьте, что URL добавлен ТОЧНО как указано выше
- ✅ Убедитесь, что нет пробелов
- ✅ Проверьте, что сохранено (нажмите SAVE)
- ✅ Подождите 1-2 минуты после сохранения

### Несколько OAuth клиентов
- Убедитесь, что вы редактируете правильный OAuth клиент
- Если не уверены, проверьте GOOGLE_CLIENT_ID в `.env.local`

### URL не совпадает
- Убедитесь, что в `.env.local` указан правильный `NEXTAUTH_URL`:
  ```
  NEXTAUTH_URL=http://localhost:3000
  ```
- Проверьте, что в Google Cloud Console добавлен правильный redirect URI
- Перезапустите frontend после изменения `.env.local`

