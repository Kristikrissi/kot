const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const multer = require("multer");
const { exec } = require("child_process");
const AdmZip = require("adm-zip");
const { promisify } = require("util");
const execAsync = promisify(exec);
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

// Конфигурация
const PORT = process.env.PORT || 3001;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.MODEL || "anthropic/claude-3-opus:beta";
const HISTORY_FILE = path.join(__dirname, "chat_history.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const SAVED_CHATS_DIR = path.join(__dirname, "saved_chats");

// Создаем объект CONFIG для использования во всем приложении
const CONFIG = {
  PORT: PORT,
  OPENROUTER_API_KEY: OPENROUTER_API_KEY,
  MODEL: MODEL,
  HISTORY_FILE: HISTORY_FILE,
  UPLOAD_DIR: UPLOAD_DIR,
  SAVED_CHATS_DIR: SAVED_CHATS_DIR,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 МБ
  MAX_FILES: 5,
  REQUEST_TIMEOUT: 30000, // 30 секунд таймаут для запросов
  DOMAIN: process.env.DOMAIN || "https://kot-assistant.app",
  APP_NAME: "Kot - Smart Assistant"
};

console.log("Конфигурация сервера:", CONFIG);

// Проверка наличия API ключа
if (!CONFIG.OPENROUTER_API_KEY) {
  console.warn("ВНИМАНИЕ: API ключ OpenRouter не установлен. Функциональность будет ограничена.");
}

// Создаем необходимые директории
[CONFIG.UPLOAD_DIR, CONFIG.SAVED_CHATS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Настройка хранилища для multer
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function(req, file, cb) {
    // Генерируем UUID для имени файла
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, uniqueId + ext);
    
    // Сохраняем метаданные о файле в отдельном JSON-файле
    const metadata = {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date().toISOString()
    };
    
    // Путь к файлу метаданных
    const metadataPath = path.join(UPLOAD_DIR, uniqueId + '.meta.json');
    
    // Записываем метаданные в файл
    fs.writeFileSync(metadataPath, JSON.stringify(metadata), 'utf8');
  }
});

// Улучшенная настройка загрузки файлов
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: CONFIG.MAX_FILE_SIZE,
    files: CONFIG.MAX_FILES
  },
  fileFilter: function(req, file, cb) {
    // Улучшенная проверка типов файлов
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/zip', 'application/json', 'text/plain',
      'text/html', 'text/css', 'application/javascript'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый тип файла. Разрешены только изображения, ZIP-файлы и текстовые файлы.'));
    }
  }
});

// Модуль для работы с историей чата
const chatHistoryManager = (() => {
  let chatHistory = [];
  
  const load = () => {
    try {
      if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        const data = fs.readFileSync(CONFIG.HISTORY_FILE, "utf8");
        chatHistory = JSON.parse(data);
        console.log("История чата загружена из файла");
      }
    } catch (error) {
      console.error("Ошибка при загрузке истории чата:", error);
      // Создаем пустую историю в случае ошибки
      chatHistory = [];
    }
    return chatHistory;
  };
  
  const save = () => {
    try {
      // Создаем копию истории без путей к файлам (для безопасности)
      const historyCopy = chatHistory.map(message => {
        const messageCopy = { ...message };
        
        // Если есть файлы, сохраняем только их метаданные
        if (messageCopy.files) {
          messageCopy.files = messageCopy.files.map(file => ({
            name: file.name,
            type: file.type,
            size: file.size
          }));
        }
        
        return messageCopy;
      });
      
      fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyCopy), "utf8");
      return true;
    } catch (error) {
      console.error("Ошибка при сохранении истории чата:", error);
      return false;
    }
  };
  
  const getHistory = () => chatHistory;
  
  const addMessage = (message) => {
    chatHistory.push(message);
    save();
  };
  
  const clear = () => {
    chatHistory = [];
    save();
  };
  
  const removeLastMessage = () => {
    chatHistory.pop();
    save();
  };
  
  // Инициализация при запуске
  load();
  
  return {
    getHistory,
    addMessage,
    clear,
    removeLastMessage
  };
})();

// Модуль для работы с сохраненными чатами
const savedChatsManager = (() => {
  let savedChats = [];
  
  const loadAllChats = () => {
    try {
      const files = fs.readdirSync(CONFIG.SAVED_CHATS_DIR);
      savedChats = files
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const chatId = path.basename(file, '.json');
          try {
            const chatData = JSON.parse(fs.readFileSync(path.join(CONFIG.SAVED_CHATS_DIR, file), 'utf8'));
            return {
              id: chatId,
              name: chatData.name || `Чат ${chatId}`,
              createdAt: chatData.createdAt || new Date().toISOString(),
              updatedAt: chatData.updatedAt || new Date().toISOString()
            };
          } catch (err) {
            console.error(`Ошибка при чтении файла чата ${file}:`, err);
            return null;
          }
        })
        .filter(chat => chat !== null)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      
      console.log(`Загружено ${savedChats.length} сохраненных чатов`);
      return savedChats;
    } catch (error) {
      console.error("Ошибка при загрузке сохраненных чатов:", error);
      return [];
    }
  };
  
  const saveChat = (chatId, name, messages) => {
    try {
      if (!chatId) {
        throw new Error("ID чата не может быть пустым");
      }
      
      const chatData = {
        id: chatId,
        name: name || `Чат ${chatId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: messages.map(message => {
          const messageCopy = { ...message };
          
          // Если есть файлы, сохраняем только их метаданные
          if (messageCopy.files) {
            messageCopy.files = messageCopy.files.map(file => ({
              name: file.name,
              type: file.type,
              size: file.size
            }));
          }
          
          return messageCopy;
        })
      };
      
      fs.writeFileSync(
        path.join(CONFIG.SAVED_CHATS_DIR, `${chatId}.json`), 
        JSON.stringify(chatData), 
        "utf8"
      );
      
      // Обновляем список сохраненных чатов
      const existingChatIndex = savedChats.findIndex(chat => chat.id === chatId);
      if (existingChatIndex !== -1) {
        savedChats[existingChatIndex] = {
          id: chatId,
          name: name,
          createdAt: chatData.createdAt,
          updatedAt: chatData.updatedAt
        };
      } else {
        savedChats.push({
          id: chatId,
          name: name,
          createdAt: chatData.createdAt,
          updatedAt: chatData.updatedAt
        });
      }
      
      // Сортируем чаты по дате обновления (новые сверху)
      savedChats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      
      return chatData;
    } catch (error) {
      console.error("Ошибка при сохранении чата:", error);
      throw error;
    }
  };
  
  const loadChat = (chatId) => {
    try {
      if (!chatId) {
        throw new Error("ID чата не может быть пустым");
      }
      
      const chatFilePath = path.join(CONFIG.SAVED_CHATS_DIR, `${chatId}.json`);
      if (!fs.existsSync(chatFilePath)) {
        throw new Error(`Чат с ID ${chatId} не найден`);
      }
      
      const chatData = JSON.parse(fs.readFileSync(chatFilePath, "utf8"));
      return chatData;
    } catch (error) {
      console.error("Ошибка при загрузке чата:", error);
      throw error;
    }
  };
  
  const deleteChat = (chatId) => {
    try {
      if (!chatId) {
        throw new Error("ID чата не может быть пустым");
      }
      
      const chatFilePath = path.join(CONFIG.SAVED_CHATS_DIR, `${chatId}.json`);
      if (fs.existsSync(chatFilePath)) {
        fs.unlinkSync(chatFilePath);
      }
      
      // Обновляем список сохраненных чатов
      savedChats = savedChats.filter(chat => chat.id !== chatId);
      
      return true;
    } catch (error) {
      console.error("Ошибка при удалении чата:", error);
      throw error;
    }
  };
  
  const renameChat = (chatId, newName) => {
    try {
      if (!chatId) {
        throw new Error("ID чата не может быть пустым");
      }
      
      if (!newName || newName.trim() === '') {
        throw new Error("Новое имя чата не может быть пустым");
      }
      
      const chatFilePath = path.join(CONFIG.SAVED_CHATS_DIR, `${chatId}.json`);
      if (!fs.existsSync(chatFilePath)) {
        throw new Error(`Чат с ID ${chatId} не найден`);
      }
      
      const chatData = JSON.parse(fs.readFileSync(chatFilePath, "utf8"));
      chatData.name = newName;
      chatData.updatedAt = new Date().toISOString();
      
      fs.writeFileSync(chatFilePath, JSON.stringify(chatData), "utf8");
      
      // Обновляем список сохраненных чатов
      const chatIndex = savedChats.findIndex(chat => chat.id === chatId);
      if (chatIndex !== -1) {
        savedChats[chatIndex].name = newName;
        savedChats[chatIndex].updatedAt = chatData.updatedAt;
      }
      
      return chatData;
    } catch (error) {
      console.error("Ошибка при переименовании чата:", error);
      throw error;
    }
  };
  
  const getAllChats = () => savedChats;
  
  // Инициализация при запуске
  loadAllChats();
  
  return {
    getAllChats,
    saveChat,
    loadChat,
    deleteChat,
    renameChat
  };
})();

// Модуль для работы с OpenRouter API
const openRouterClient = (() => {
  const getModels = async () => {
    try {
      // Проверяем наличие API ключа
      if (!CONFIG.OPENROUTER_API_KEY) {
        console.error("API ключ OpenRouter не установлен");
        return [{ id: CONFIG.MODEL, name: "Модель по умолчанию (API ключ не установлен)" }];
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
      
      console.log("Отправка запроса к OpenRouter API для получения списка моделей...");
      
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
          "HTTP-Referer": CONFIG.DOMAIN,
          "X-Title": CONFIG.APP_NAME
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error (${response.status}):`, errorText);
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Проверяем структуру ответа
      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        console.warn("OpenRouter API вернул пустой список моделей или неожиданный формат");
        return [{ id: CONFIG.MODEL, name: "Модель по умолчанию" }];
      }
      
      console.log(`Получено ${data.data.length} моделей от OpenRouter API`);
      return data.data;
    } catch (error) {
      console.error("Ошибка при получении списка моделей:", error);
      // Возвращаем хотя бы одну модель по умолчанию в случае ошибки
      return [{ id: CONFIG.MODEL, name: "Модель по умолчанию (ошибка API)" }];
    }
  };
  
  const sendMessage = async (messages, selectedModel = CONFIG.MODEL) => {
    try {
      // Проверяем наличие API ключа
      if (!CONFIG.OPENROUTER_API_KEY) {
        throw new Error("API ключ OpenRouter не установлен");
      }
      
      console.log(`Отправка запроса к OpenRouter API, модель: ${selectedModel}`);
      
      // Настраиваем таймаут для запроса
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
      
      // Формируем заголовки запроса
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
        "HTTP-Referer": CONFIG.DOMAIN,
        "X-Title": CONFIG.APP_NAME
      };
      
      // Формируем тело запроса
      const requestBody = {
        model: selectedModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: false
      };
      
      // Выполняем запрос к API
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      // Очищаем таймаут
      clearTimeout(timeoutId);
      
      // Проверяем статус ответа
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error (${response.status}):`, errorText);
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      // Парсим и возвращаем ответ
      return await response.json();
    } catch (error) {
      console.error("Ошибка при отправке запроса к OpenRouter API:", error);
      throw error;
    }
  };
  
  return {
    getModels,
    sendMessage
  };
})();

// Создаем Express приложение
const app = express();

// Настройка безопасности
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "https://openrouter.ai"]
    }
  },
  crossOriginEmbedderPolicy: false // Разрешаем загрузку ресурсов с других доменов
}));

// Настройка CORS
app.use(cors());

// Ограничение количества запросов
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов за 15 минут
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Слишком много запросов, попробуйте позже" }
});

// Применяем ограничение к API-маршрутам
app.use("/api/", apiLimiter);

// Настройка парсинга JSON
app.use(express.json({ charset: 'utf-8' }));

// Настройка статических файлов
app.use(express.static(path.join(__dirname, "public")));

// Доступ к загруженным файлам с дополнительной проверкой
app.use("/uploads", (req, res, next) => {
  // Проверяем, что запрашиваемый файл существует
  const requestedFile = path.join(CONFIG.UPLOAD_DIR, path.basename(req.path));
  if (!fs.existsSync(requestedFile)) {
    return res.status(404).json({ status: "error", message: "Файл не найден" });
  }
  next();
}, express.static(CONFIG.UPLOAD_DIR));

// API для получения истории чата
app.get("/api/chat-history", (req, res) => {
  try {
    res.json(chatHistoryManager.getHistory());
  } catch (error) {
    console.error("Ошибка при получении истории чата:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для получения списка сохраненных чатов
app.get("/api/saved-chats", (req, res) => {
  try {
    res.json({ status: "success", chats: savedChatsManager.getAllChats() });
  } catch (error) {
    console.error("Ошибка при получении списка сохраненных чатов:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для получения списка доступных моделей
app.get("/api/models", async (req, res) => {
  try {
    const models = await openRouterClient.getModels();
    res.json({ status: "success", models });
  } catch (error) {
    console.error("Ошибка при получении списка моделей:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для обратной совместимости
app.get("/api/check-openrouter", async (req, res) => {
  try {
    console.log("Запрос проверки доступности OpenRouter API...");
    
    // Перенаправляем запрос на новый эндпоинт
    const models = await openRouterClient.getModels();
    
    // Преобразуем формат ответа для обратной совместимости
    res.json({ status: "success", models });
  } catch (error) {
    console.error("Ошибка при проверке доступности OpenRouter:", error);
    res.status(500).json({ 
      status: "error", 
      message: `Ошибка при проверке доступности OpenRouter: ${error.message}`
    });
  }
});

// API для проверки существования файла
app.get("/api/check-file", (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ status: "error", message: "Не указан путь к файлу" });
    }
    
    // Проверяем, что путь не содержит "../" для предотвращения path traversal
    if (filePath.includes("../") || filePath.includes("..\\")) {
      return res.status(403).json({ status: "error", message: "Недопустимый путь к файлу" });
    }
    
    const fullPath = path.join(UPLOAD_DIR, filePath);
    
    // Проверяем, существует ли файл
    if (fs.existsSync(fullPath)) {
      res.json({ status: "success", exists: true });
    } else {
      res.json({ status: "success", exists: false });
    }
  } catch (error) {
    console.error("Ошибка при проверке файла:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для получения содержимого файла
app.get("/api/file-content", (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ status: "error", message: "Не указан путь к файлу" });
    }
    
    // Проверяем, что путь не содержит "../" для предотвращения path traversal
    if (filePath.includes("../") || filePath.includes("..\\")) {
      return res.status(403).json({ status: "error", message: "Недопустимый путь к файлу" });
    }
    
    let fullPath;
    
    // Если путь начинается с /app/uploads, используем его как есть
    if (filePath.startsWith('/app/uploads/')) {
      fullPath = filePath;
    } else {
      // Иначе считаем, что это относительный путь
      fullPath = path.join(UPLOAD_DIR, filePath);
    }
    
    // Проверяем, существует ли файл
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ status: "error", message: "Файл не найден" });
    }
    
    // Проверяем, что это текстовый файл
    const ext = path.extname(fullPath).toLowerCase();
    const textExtensions = ['.txt', '.js', '.py', '.html', '.css', '.json', '.xml', '.md', '.java', '.c', '.cpp', '.cs'];
    
    if (!textExtensions.includes(ext)) {
      return res.status(400).json({ status: "error", message: "Файл не является текстовым" });
    }
    
    // Читаем содержимое файла
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Отправляем содержимое
    res.send(content);
  } catch (error) {
    console.error("Ошибка при получении содержимого файла:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для загрузки файлов
app.post("/api/upload", upload.array("files", CONFIG.MAX_FILES), (req, res) => {
  try {
    const files = req.files.map(file => {
      const fileId = path.basename(file.path);
      const fileNameWithoutExt = fileId.split('.').slice(0, -1).join('.');
      
      // Формируем простое описание типа файла
      let fileType = 'Файл';
      if (file.mimetype.startsWith('image/')) {
        fileType = 'Изображение';
      } else if (file.mimetype === 'application/zip') {
        fileType = 'Архив';
      } else if (file.mimetype.includes('javascript') || file.mimetype.includes('text')) {
        fileType = 'Код';
      }
      
      // Формируем простое описание для отображения
      const displayName = `${fileType} (${Math.round(file.size / 1024)} КБ)`;
      
      return {
        id: fileId,
        name: displayName, // Используем простое описание вместо оригинального имени
        originalName: file.originalname, // Сохраняем оригинальное имя для справки
        path: file.path,
        type: file.mimetype,
        size: file.size,
        url: `/uploads/${fileId}`
      };
    });
    
    // Если это ZIP-файл, распаковываем его
    const zipFiles = files.filter(file => file.type === 'application/zip');
    if (zipFiles.length > 0) {
      zipFiles.forEach(zipFile => {
        try {
          const zip = new AdmZip(zipFile.path);
          const extractDir = path.join(UPLOAD_DIR, path.basename(zipFile.path, '.zip'));
          
          // Создаем директорию для распаковки
          if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
          }
          
          // Распаковываем архив
          zip.extractAllTo(extractDir, true);
          
          // Добавляем информацию о распакованных файлах
          const extractedFiles = [];
          zip.getEntries().forEach(entry => {
            if (!entry.isDirectory) {
              // Проверяем расширение файла для определения типа
              const fileName = entry.name;
              const fileExt = path.extname(fileName).toLowerCase();
              
              // Определяем MIME-тип на основе расширения
              const ext = path.extname(entry.name).toLowerCase();
              let mimeType = 'text/plain';
              
              if (ext === '.js') mimeType = 'application/javascript';
              else if (ext === '.py') mimeType = 'text/x-python';
              else if (ext === '.html') mimeType = 'text/html';
              else if (ext === '.css') mimeType = 'text/css';
              else if (ext === '.json') mimeType = 'application/json';
              else if (ext === '.xml') mimeType = 'application/xml';
              else if (ext === '.java') mimeType = 'text/x-java';
              else if (ext === '.c' || ext === '.cpp') mimeType = 'text/x-c';
              else if (ext === '.cs') mimeType = 'text/x-csharp';
              
              extractedFiles.push({
                name: fileName,
                path: path.join(extractDir, entry.entryName),
                type: mimeType,
                size: entry.header.size,
                content: entry.getData().toString('utf8'),
                url: `/uploads/${path.basename(zipFile.path, '.zip')}/${entry.entryName}`
              });
            }
          });
          
          // Добавляем информацию о распакованных файлах к ответу
          zipFile.extractedFiles = extractedFiles;
        } catch (zipError) {
          console.error(`Ошибка при распаковке ZIP-файла ${zipFile.name}:`, zipError);
        }
      });
    }
    
    res.json({ status: "success", files });
  } catch (error) {
    console.error("Ошибка при загрузке файлов:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для сохранения чата
app.post("/api/save-chat", express.json(), (req, res) => {
  try {
    const { chatId, name, messages } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ status: "error", message: "Не указан ID чата" });
    }
    
    const chatData = savedChatsManager.saveChat(chatId, name || `Чат ${chatId}`, messages || []);
    
    res.json({ status: "success", chat: chatData });
  } catch (error) {
    console.error("Ошибка при сохранении чата:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для загрузки чата
app.get("/api/load-chat/:chatId", (req, res) => {
  try {
    const { chatId } = req.params;
    
    if (!chatId) {
      return res.status(400).json({ status: "error", message: "Не указан ID чата" });
    }
    
    const chatData = savedChatsManager.loadChat(chatId);
    
    res.json({ status: "success", chat: chatData });
  } catch (error) {
    console.error("Ошибка при загрузке чата:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для удаления чата
app.delete("/api/delete-chat/:chatId", (req, res) => {
  try {
    const { chatId } = req.params;
    
    if (!chatId) {
      return res.status(400).json({ status: "error", message: "Не указан ID чата" });
    }
    
    savedChatsManager.deleteChat(chatId);
    
    res.json({ status: "success" });
  } catch (error) {
    console.error("Ошибка при удалении чата:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// API для переименования чата
app.put("/api/rename-chat/:chatId", express.json(), (req, res) => {
  try {
    const { chatId } = req.params;
    const { name } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ status: "error", message: "Не указан ID чата" });
    }
    
    if (!name) {
      return res.status(400).json({ status: "error", message: "Не указано новое имя чата" });
    }
    
    const chatData = savedChatsManager.renameChat(chatId, name);
    
    res.json({ status: "success", chat: chatData });
  } catch (error) {
    console.error("Ошибка при переименовании чата:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Обработка 404 для API запросов
app.use('/api/*', (req, res) => {
  res.status(404).json({ status: "error", message: "API эндпоинт не найден" });
});

// Создаем HTTP сервер
const server = http.createServer(app);

// Создаем WebSocket сервер
const wss = new WebSocket.Server({ server, path: "/ws" });

// Функция для отправки истории чата клиенту
function sendChatHistory(ws) {
  ws.send(JSON.stringify({
    type: "history",
    messages: chatHistoryManager.getHistory()
  }));
}

// Обработка WebSocket соединений
wss.on("connection", (ws) => {
  console.log("Новое WebSocket соединение установлено");
  
  // Отправляем историю чата при подключении
  sendChatHistory(ws);
  
  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === "message") {
        // Получаем выбранную модель или используем модель по умолчанию
        const selectedModel = data.model || CONFIG.MODEL;
        console.log(`Используемая модель: ${selectedModel}`);
        
        // Обрабатываем файлы, если они есть
        let filesContent = "";
        let hasImages = false;
        
        if (data.files && Array.isArray(data.files) && data.files.length > 0) {
          console.log(`Получено ${data.files.length} файлов`);
          
          // Проверяем, есть ли изображения
          hasImages = data.files.some(file => file.type.startsWith('image/'));
          
          if (!hasImages) {
            // Если нет изображений, добавляем текстовое описание файлов
            filesContent = "\n\nПользователь прикрепил следующие файлы:\n";
            
            for (const file of data.files) {
              filesContent += `- ${file.name} (${file.type}, ${Math.round(file.size / 1024)} КБ)\n`;
              
              // Если это код, добавляем его содержимое
              if (file.content) {
                filesContent += `\nСодержимое файла ${file.name}:\n\`\`\`\n${file.content}\n\`\`\`\n`;
              }
            }
          }
        }
        
        // Сохраняем сообщение пользователя
        const userMessage = {
          role: "user", 
          content: data.content + filesContent,
          files: data.files,
          timestamp: new Date().toISOString()
        };
        
        chatHistoryManager.addMessage(userMessage);
        
        try {
          // Преобразуем историю чата в формат OpenRouter
          const messages = [
            {
              role: "system",
              content: "Ты - Кот, дружелюбный и умный ассистент. Ты помогаешь пользователям с различными вопросами, особенно с программированием. Всегда используй форматирование кода в блоках ``` с указанием языка. Отвечай на русском языке."
            }
          ];
          
          // Добавляем историю чата (последние 10 сообщений)
          const recentHistory = chatHistoryManager.getHistory().slice(-10);
          for (const msg of recentHistory) {
            messages.push({
              role: msg.role === "assistant" ? "assistant" : "user",
              content: msg.content
            });
          }

          for (const msg of recentHistory) {
            // Проверяем, содержит ли сообщение изображения
            if (msg.files && msg.files.some(file => file.type.startsWith('image/'))) {
              const imageFiles = msg.files.filter(file => file.type.startsWith('image/'));
              
              // Создаем мультимодальное сообщение
              const messageContent = [];
              
              // Добавляем текст сообщения
              if (msg.content) {
                messageContent.push({
                  type: "text",
                  text: msg.content
                });
              }
              
              // Добавляем изображения
              for (const file of imageFiles) {
                try {
                  // Проверяем, есть ли путь к файлу
                  if (file.path) {
                    // Читаем файл и кодируем в base64
                    const imagePath = file.path;
                    const imageBuffer = fs.readFileSync(imagePath);
                    const base64Image = imageBuffer.toString('base64');
                    
                    messageContent.push({
                      type: "image_url",
                      image_url: {
                        url: `data:${file.type};base64,${base64Image}`
                      }
                    });
                  } else if (file.url) {
                    // Если есть URL, используем его
                    const fullUrl = file.url.startsWith('http') 
                      ? file.url 
                      : `${process.env.SERVER_URL || `http://localhost:${PORT}`}${file.url}`;
                    
                    messageContent.push({
                      type: "image_url",
                      image_url: {
                        url: fullUrl
                      }
                    });
                  }
                } catch (imageError) {
                  console.error(`Ошибка при обработке изображения ${file.name}:`, imageError);
                }
              }
              
              // Добавляем мультимодальное сообщение
              messages.push({
                role: msg.role === "assistant" ? "assistant" : "user",
                content: messageContent
              });
            } else {
              // Обычное текстовое сообщение
              messages.push({
                role: msg.role === "assistant" ? "assistant" : "user",
                content: msg.content
              });
            }
          }
          
          // Проверяем, поддерживает ли выбранная модель изображения
          const supportsImages = selectedModel.includes("claude-3") || 
                                selectedModel.includes("gpt-4") || 
                                selectedModel.includes("vision");
          
          // Если модель не поддерживает изображения, но они есть, предупреждаем пользователя
          if (hasImages && !supportsImages) {
            ws.send(JSON.stringify({
              type: "warning",
              content: "Выбранная модель не поддерживает анализ изображений. Рекомендуется использовать Claude-3 или GPT-4 Vision.",
              timestamp: new Date().toISOString()
            }));
          }
          
          // Отправляем запрос к OpenRouter API
          const result = await openRouterClient.sendMessage(messages, selectedModel);
          const assistantResponse = result.choices[0].message.content;
          
          console.log("Получен ответ от OpenRouter API");
          
          // Сохраняем ответ ассистента
          chatHistoryManager.addMessage({ role: "assistant", content: assistantResponse });
          
          // Отправляем ответ клиенту
          ws.send(JSON.stringify({
            type: "response",
            content: assistantResponse
          }));
          
        } catch (error) {
          console.error("Ошибка при получении ответа от OpenRouter API:", error);
          
          // Отправляем сообщение об ошибке клиенту
          ws.send(JSON.stringify({
            type: "error",
            content: `Произошла ошибка при обработке запроса: ${error.message}`
          }));
          
          // Удаляем последнее сообщение пользователя из истории, так как на него не получен ответ
          chatHistoryManager.removeLastMessage();
        }
      } else if (data.type === "clear") {
        // Очищаем историю чата
        chatHistoryManager.clear();
        
        // Отправляем команду очистки клиенту
        ws.send(JSON.stringify({ type: "clear" }));
        
        console.log("История чата очищена");
      }
    } catch (error) {
      console.error("Ошибка при обработке сообщения:", error);
      
      // Отправляем сообщение об ошибке клиенту
      ws.send(JSON.stringify({
        type: "error",
        content: `Произошла ошибка при обработке сообщения: ${error.message}`
      }));
    }
  });
  
  // Обработка закрытия соединения
  ws.on("close", (code, reason) => {
    console.log(`WebSocket соединение закрыто: ${code} ${reason}`);
  });
  
  // Обработка ошибок соединения
  ws.on("error", (error) => {
    console.error("WebSocket ошибка:", error);
  });
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('Необработанное исключение:', error);
  // Не завершаем процесс, чтобы сервер продолжал работать
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение промиса:', reason);
});

// Запускаем сервер
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Используемая модель по умолчанию: ${CONFIG.MODEL}`);
  console.log(`API ключ OpenRouter ${CONFIG.OPENROUTER_API_KEY ? 'установлен' : 'НЕ УСТАНОВЛЕН'}`);
});
