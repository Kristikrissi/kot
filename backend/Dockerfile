FROM node:18

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Создаем директорию для загрузок
RUN mkdir -p /app/uploads

# Копируем исходный код
COPY . .

# Открываем порт
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server.js"]
