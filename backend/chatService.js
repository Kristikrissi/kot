const fs = require('fs');
const path = require('path');
const { getOllamaResponse } = require('./ollamaService');

// Путь к файлу с историей чата
const CHAT_HISTORY_FILE = path.join(__dirname, 'chat_history.json');

// Инициализация истории чата
let chatHistory = [];

// Загрузка истории чата из файла
function loadChatHistory() {
    try {
        if (fs.existsSync(CHAT_HISTORY_FILE)) {
            const data = fs.readFileSync(CHAT_HISTORY_FILE, 'utf8');
            chatHistory = JSON.parse(data);
        }
    } catch (error) {
        console.error('Ошибка при загрузке истории чата:', error);
        chatHistory = [];
    }
}

// Сохранение истории чата в файл
function saveChatHistory() {
    try {
        fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2), 'utf8');
    } catch (error) {
        console.error('Ошибка при сохранении истории чата:', error);
    }
}

// Получение истории чата
function getChatHistory() {
    return chatHistory;
}

// Очистка истории чата
function clearChatHistory() {
    chatHistory = [];
    saveChatHistory();
}

// Добавление сообщения в историю чата
function addMessageToHistory(message) {
    chatHistory.push(message);
    saveChatHistory();
}

// Получение ответа от ИИ
async function getAIResponse(messages) {
    try {
        return await getOllamaResponse(messages);
    } catch (error) {
        console.error('Ошибка при получении ответа от ИИ:', error);
        throw new Error('Не удалось получить ответ от ИИ. Пожалуйста, попробуйте позже.');
    }
}

// Обработка сообщения пользователя
async function processUserMessage(message) {
    // Добавляем сообщение пользователя в историю
    const userMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    };
    addMessageToHistory(userMessage);

    // Формируем контекст для запроса к ИИ
    const context = [
        {
            role: 'system',
            content: 'Ты - дружелюбный и полезный ассистент по имени Кот. Ты всегда готов помочь пользователю с его вопросами и задачами. Ты отвечаешь кратко, но информативно.'
        }
    ];

    // Добавляем последние 10 сообщений из истории для контекста
    const recentMessages = chatHistory.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
    }));

    const messages = [...context, ...recentMessages];

    try {
        // Получаем ответ от ИИ
        const aiResponse = await getAIResponse(messages);

        // Добавляем ответ ИИ в историю
        const assistantMessage = {
            role: 'assistant',
            content: aiResponse.content,
            timestamp: new Date().toISOString()
        };
        addMessageToHistory(assistantMessage);

        return assistantMessage;
    } catch (error) {
        console.error('Ошибка при обработке сообщения:', error);
        throw error;
    }
}

// Загружаем историю чата при запуске
loadChatHistory();

module.exports = {
    getChatHistory,
    clearChatHistory,
    processUserMessage
};
