# Формулограф

Тренажёр формул по физике: приложение задаёт вопрос, набираешь формулу на встроенной клавиатуре, приложение проверяет ответ и ведёт статистику ошибок по разделам.

Открыть: https://grizot1109-dotcom.github.io/Ratnick/

На iPhone: открой ссылку в Safari → «Поделиться» → «На экран Домой».

- `index.html` — приложение
- `sw.js`, `manifest.webmanifest` — работа без интернета и установка на экран

## Рейтинг

Общий рейтинг (за день и за неделю) хранится в Supabase.
1. Создай проект на supabase.com.
2. SQL Editor → New query → вставь `supabase.sql` → Run.
3. Project Settings → API: адрес проекта и публичный ключ (anon / publishable) впиши в `LEADERBOARD` в `index.html`.
