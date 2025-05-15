import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './cyber-theme.css';
import { CyberCorners, CyberBackground } from './components/CyberComponents';
import CyberLogo from './components/CyberLogo';

// Импортируем языки
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import html from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';

// Регистрируем языки
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('csharp', csharp);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('html', html);
SyntaxHighlighter.registerLanguage('json', json);

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [ws, setWs] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    // Проверяем сохраненные настройки темы или системные предпочтения
    const savedTheme = localStorage.getItem('darkMode');
    return savedTheme !== null 
      ? JSON.parse(savedTheme) 
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [notification, setNotification] = useState(null);
  const [models, setModels] = useState([]);
  const [modelProvider, setModelProvider] = useState('all'); // 'all', 'openai', 'anthropic', 'google'
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [savedChatsDropdownOpen, setSavedChatsDropdownOpen] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  
  // Функция для декодирования имени файла
  const decodeFileName = useCallback((file) => {
    if (file.nameEncoded) {
      try {
        return atob(file.nameEncoded);
      } catch (e) {
        console.error('Ошибка декодирования имени файла:', e);
      }
    }
    return file.name || 'Файл без имени';
  }, []);

  // Функция для извлечения имени файла из пути
  const getBasename = useCallback((filepath) => {
    if (!filepath) return '';
    // Разделяем путь по слешам и берем последний элемент
    return filepath.split(/[\\/]/).pop();
  }, []);

  // Функция для показа уведомлений
  const showNotification = useCallback((message, type = 'info', duration = 3000) => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, duration);
  }, []);

  // Функция для форматирования размера файла
  const formatFileSize = useCallback((bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }, []);

  // Функция для определения файлов с кодом
  const isCodeFile = useCallback((fileName) => {
    if (!fileName) return false;
  
    const codeExtensions = ['.js', '.py', '.html', '.css', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.ts', '.jsx', '.tsx', '.json', '.xml', '.md', '.txt'];
    const lowerFileName = fileName.toLowerCase();
  
    return codeExtensions.some(ext => lowerFileName.endsWith(ext));
  }, []);

  // Состояние для просмотра кода
  const [codeViewFile, setCodeViewFile] = useState(null);

  // Функция для проверки существования файла на сервере
  const checkFileExists = useCallback(async (filePath) => {
    try {
      const fileName = getBasename(filePath);
      if (!fileName) return false;
      
      const response = await fetch(`/api/check-file?path=${encodeURIComponent(fileName)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.status === 'success' && data.exists;
    } catch (error) {
      console.error('Ошибка при проверке файла:', error);
      return false;
    }
  }, [getBasename]);

  // Функция для получения URL изображения с обработкой ошибок
  const getImageUrl = useCallback((file) => {
    if (!file) return null;
    
    // Если есть прямой URL, используем его
    if (file.url && typeof file.url === 'string') {
      // Если URL относительный, добавляем базовый URL
      if (file.url.startsWith('/')) {
        return `${window.location.origin}${file.url}`;
      }
      return file.url;
    }
    
    // Если есть id файла, формируем URL
    if (file.id) {
      return `${window.location.origin}/uploads/${file.id}`;
    }
    
    // Если есть путь, извлекаем имя файла
    if (file.path) {
      const fileName = getBasename(file.path);
      return `${window.location.origin}/uploads/${fileName}`;
    }
    
    // Запасной вариант - плейсхолдер
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTkiPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
  }, [getBasename]);

  // Функция для просмотра кода
  const handleViewCode = useCallback(async (file) => {
    if (!file) {
      showNotification('Файл не найден', 'error');
      return;
    }
    
    try {
      // Если файл уже загружен на сервер, получаем его содержимое
      if (file.path) {
        const fileName = getBasename(file.path);
        const response = await fetch(`/api/file-content?path=${encodeURIComponent(fileName)}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const content = await response.text();
        setCodeViewFile({
          name: file.name,
          content: content,
          language: getLanguageFromFileName(file.name)
        });
      } else if (file instanceof Blob) {
        // Если файл еще не загружен на сервер, читаем его локально
        const reader = new FileReader();
        reader.onload = (e) => {
          setCodeViewFile({
            name: file.name,
            content: e.target.result,
            language: getLanguageFromFileName(file.name)
          });
        };
        reader.onerror = (e) => {
          console.error('Ошибка при чтении файла:', e);
          showNotification('Не удалось прочитать файл', 'error');
        };
        reader.readAsText(file);
      } else if (file.url) {
        // Если у файла есть URL, загружаем содержимое по нему
        const response = await fetch(file.url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const content = await response.text();
        setCodeViewFile({
          name: file.name,
          content: content,
          language: getLanguageFromFileName(file.name)
        });
      } else if (file.content) {
        // Если содержимое уже есть в объекте файла
        setCodeViewFile({
          name: file.name,
          content: file.content,
          language: getLanguageFromFileName(file.name)
        });
      } else {
        showNotification('Не удалось получить содержимое файла', 'error');
      }
    } catch (error) {
      console.error('Ошибка при загрузке содержимого файла:', error);
      showNotification(`Не удалось загрузить содержимое файла: ${error.message}`, 'error');
    }
  }, [getBasename, showNotification]);

  // Функция для определения языка по имени файла
  const getLanguageFromFileName = useCallback((fileName) => {
    if (!fileName) return 'text';
    
    const extension = fileName.split('.').pop().toLowerCase();
  
    const languageMap = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'xml': 'xml',
      'md': 'markdown',
      'txt': 'text'
    };
  
    return languageMap[extension] || 'text';
  }, []);

  // Новые состояния для сохраненных чатов
  const [savedChats, setSavedChats] = useState(() => {
    const saved = localStorage.getItem('savedChats');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Фильтрация моделей
  const filteredModels = useMemo(() => {
    return models.filter(model => {
      // Фильтрация по провайдеру
      if (modelProvider !== 'all' && !model.id.startsWith(modelProvider)) {
        return false;
      }
      
      // Фильтрация по поисковому запросу
      if (modelSearch && !model.name.toLowerCase().includes(modelSearch.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [models, modelProvider, modelSearch]);

  // Применение темной темы
  useEffect(() => {
    document.body.className = darkMode ? 'dark-theme' : 'light-theme';
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Сохранение чатов в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('savedChats', JSON.stringify(savedChats));
  }, [savedChats]);

  // Создаем и освобождаем URL для Blob файлов
  useEffect(() => {
    // Создаем URL для Blob файлов, которые еще не имеют URL
    const newUploadedFiles = uploadedFiles.map(file => {
      if (file instanceof Blob && !file.url) {
        return {
          ...file,
          url: URL.createObjectURL(file)
        };
      }
      return file;
    });

    // Обновляем состояние только если есть изменения
    if (JSON.stringify(newUploadedFiles) !== JSON.stringify(uploadedFiles)) {
      setUploadedFiles(newUploadedFiles);
    }
    
    // Очищаем URL при размонтировании или изменении uploadedFiles
    return () => {
      uploadedFiles.forEach(file => {
        if (file.url && typeof file.url === 'string' && file.url.startsWith('blob:')) {
          URL.revokeObjectURL(file.url);
        }
      });
    };
  }, [uploadedFiles]);

  // Загрузка доступных моделей
  useEffect(() => {
    const fetchModels = async () => {
      if (modelsLoaded) return;
      try {
        setIsLoadingModels(true);
        console.log('Запрос к /api/models');
        const response = await fetch('/api/models');
        
        if (!response.ok) {
          console.error('Ошибка при загрузке моделей:', response.status, response.statusText);
          throw new Error(`Ошибка при загрузке моделей: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Ответ от /api/models:', data);
        
        if (data.status === 'success' && Array.isArray(data.models)) {
          // Фильтруем модели, исключая те, которые содержат слово "auto"
          const filteredModels = data.models.filter(model => 
            !model.id.toLowerCase().includes('auto')
          );
          
          console.log('Отфильтрованные модели:', filteredModels.map(m => m.id));
          
          // Сортируем модели по размеру контекста (от большего к меньшему)
          const sortedModels = filteredModels.sort((a, b) => 
            (b.contextLength || 0) - (a.contextLength || 0)
          );
          
          setModels(sortedModels);
          
          // Устанавливаем первую модель как выбранную по умолчанию
          if (!selectedModel && sortedModels.length > 0) {
            setSelectedModel(sortedModels[0].id);
          }
          
          setModelsLoaded(true);
        } else {
          console.error('Неверный формат данных от API:', data);
          throw new Error('Неверный формат данных от API');
        }
      } catch (error) {
        console.error('Ошибка при загрузке моделей:', error);
        showNotification(`Ошибка при загрузке моделей: ${error.message}`, 'error');
      } finally {
        setIsLoadingModels(false);
      }
    };
    
    if (isConnected) {
      fetchModels();
    }
  }, [isConnected, selectedModel, showNotification, modelsLoaded]);

  // Загрузка истории чата с сервера
  const fetchChatHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/chat-history');
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Ошибка при загрузке истории чата:', error);
      showNotification('Не удалось загрузить историю чата', 'error');
    }
  }, [showNotification]);

  // Инициализация WebSocket соединения
  useEffect(() => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket соединение уже существует, пропускаем создание нового');
      return; // Соединение уже установлено
    }
    // Используем явный URL для режима разработки
    const wsUrl = process.env.NODE_ENV === 'production'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
      : 'ws://localhost:3001/ws';
    
    console.log('Подключение к WebSocket:', wsUrl);
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log('WebSocket соединение установлено');
      setIsConnected(true);
      showNotification('Соединение установлено', 'success');
      
      // Загружаем историю чата при подключении
      fetchChatHistory();
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Получено сообщение:', data);
        
        if (data.type === 'response') {
          setMessages(prevMessages => {
            const newMessages = [...prevMessages, { role: 'assistant', content: data.content }];
            
            // Если это сохраненный чат, обновляем его
            if (currentChatId) {
              setSavedChats(prev => 
                prev.map(chat => 
                  chat.id === currentChatId 
                    ? { ...chat, messages: newMessages, updatedAt: new Date().toISOString() } 
                    : chat
                )
              );
            }
            
            return newMessages;
          });
          
          setIsLoading(false);
        } else if (data.type === 'error') {
          setMessages(prevMessages => [
            ...prevMessages,
            { role: 'error', content: data.content }
          ]);
          setIsLoading(false);
          showNotification('Произошла ошибка при обработке запроса', 'error');
        } else if (data.type === 'warning') {
          // Обработка предупреждений от сервера
          showNotification(data.content, 'warning', 5000);
        } else if (data.type === 'clear') {
          setMessages([]);
          
          // Если был активен сохраненный чат, сбрасываем его
          if (currentChatId) {
            setCurrentChatId(null);
          }
          
          showNotification('История чата очищена', 'info');
        } else if (data.type === 'history') {
          // Обработка истории чата
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error('Ошибка при обработке сообщения от сервера:', error);
        showNotification('Получены некорректные данные от сервера', 'error');
      }
    };
    
    socket.onclose = (event) => {
      console.log('WebSocket соединение закрыто', event.code, event.reason);
      setIsConnected(false);
      showNotification('Соединение разорвано', 'error');
      
      // Автоматическое переподключение через 3 секунды
      if (event.code !== 1000) { // Не переподключаемся при нормальном закрытии
        setTimeout(() => {
          console.log('Попытка переподключения...');
          // Компонент может быть размонтирован, поэтому проверяем
          if (document.body.contains(messagesEndRef.current)) {
            window.location.reload();
          }
        }, 3000);
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket ошибка:', error);
      setIsConnected(false);
      showNotification('Ошибка соединения с сервером', 'error');
      setMessages(prevMessages => [
        ...prevMessages,
        { role: 'error', content: 'Ошибка соединения с сервером. Пожалуйста, обновите страницу.' }
      ]);
    };
    
    setWs(socket);

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'Компонент размонтирован');
      }
    };
  }, [showNotification, currentChatId, fetchChatHistory]);
  
  // Прокрутка чата вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, executionResult]);
  
  // Функция для обработки загрузки файлов
  const handleFileUpload = useCallback((event) => {
    const files = Array.from(event.target.files);

    // Расширенный список поддерживаемых типов файлов
    const codeExtensions = ['.js', '.py', '.html', '.css', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.ts', '.jsx', '.tsx', '.json', '.xml', '.md', '.txt'];
    
    // Проверяем типы файлов (изображения, zip и файлы с кодом)
    const validFiles = files.filter(file => {
      // Проверка по MIME-типу для изображений и zip
      if (file.type.startsWith('image/') || file.type === 'application/zip') {
        return true;
      }
    
      // Проверка по расширению для файлов с кодом
      const fileName = file.name.toLowerCase();
      return codeExtensions.some(ext => fileName.endsWith(ext));
    });
  
    if (validFiles.length === 0) {
      showNotification('Поддерживаются только изображения, ZIP-файлы и файлы с кодом', 'error');
      return;
    }
    
    // Создаем URL для каждого Blob файла
    const filesWithUrls = validFiles.map(file => {
      // Для Blob файлов создаем URL
      if (file instanceof Blob && !file.url) {
        const url = URL.createObjectURL(file);
        return Object.assign(file, { url });
      }
      return file;
    });
    
    // Добавляем файлы в состояние
    setUploadedFiles(prev => [...prev, ...filesWithUrls]);
    
    // Показываем уведомление
    showNotification(`Загружено файлов: ${validFiles.length}`, 'success');
    
    // Сбрасываем input, чтобы можно было загрузить тот же файл повторно
    event.target.value = '';
  }, [showNotification]);

  // Функция для удаления файла
  const removeFile = useCallback((index) => {
    setUploadedFiles(prev => {
      const newFiles = [...prev];
      const fileToRemove = newFiles[index];
      
      // Если файл имеет URL, созданный через createObjectURL, освобождаем ресурс
      if (fileToRemove && fileToRemove.url && typeof fileToRemove.url === 'string' && fileToRemove.url.startsWith('blob:')) {
        URL.revokeObjectURL(fileToRemove.url);
      }
      
      newFiles.splice(index, 1);
      return newFiles;
    });
  }, []);
  
  // Функция для создания нового чата
  const createNewChat = useCallback(() => {
    const newChatId = Date.now().toString();
    const newChat = {
      id: newChatId,
      name: `Чат ${savedChats.length + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    setSavedChats(prev => [...prev, newChat]);
    setCurrentChatId(newChatId);
    setMessages([]);
    showNotification('Создан новый чат', 'success');
  }, [savedChats.length, showNotification]);

  // Функция для сохранения текущего чата
  const saveCurrentChat = useCallback(() => {
    if (messages.length === 0) {
      showNotification('Нет сообщений для сохранения', 'error');
      return;
    }
    
    // Если чат уже существует, обновляем его
    if (currentChatId) {
      setSavedChats(prev => 
        prev.map(chat => 
          chat.id === currentChatId 
            ? { ...chat, messages, updatedAt: new Date().toISOString() } 
            : chat
        )
      );
      showNotification('Чат обновлен', 'success');
    } else {
      // Иначе создаем новый чат
      const newChatId = Date.now().toString();
      const newChat = {
        id: newChatId,
        name: `Чат ${savedChats.length + 1}`,
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      setSavedChats(prev => [...prev, newChat]);
      setCurrentChatId(newChatId);
      showNotification('Чат сохранен', 'success');
    }
  }, [messages, currentChatId, savedChats.length, showNotification]);

  // Функция для загрузки сохраненного чата
  const loadChat = useCallback((chatId) => {
    const chat = savedChats.find(c => c.id === chatId);
    if (chat) {
      setMessages(chat.messages);
      setCurrentChatId(chatId);
      showNotification(`Загружен чат: ${chat.name}`, 'success');
      setSavedChatsDropdownOpen(false);
    }
  }, [savedChats, showNotification]);

  // Функция для удаления сохраненного чата
  const deleteChat = useCallback((chatId, e) => {
    e.stopPropagation(); // Предотвращаем всплытие события
    
    setSavedChats(prev => prev.filter(chat => chat.id !== chatId));
    
    if (currentChatId === chatId) {
      setCurrentChatId(null);
      setMessages([]);
    }
    
    showNotification('Чат удален', 'info');
  }, [currentChatId, showNotification]);

  // Функция для переименования чата
  const renameChat = useCallback((chatId, newName) => {
    setSavedChats(prev => 
      prev.map(chat => 
        chat.id === chatId 
          ? { ...chat, name: newName, updatedAt: new Date().toISOString() } 
          : chat
      )
    );
    
    showNotification('Чат переименован', 'success');
  }, [showNotification]);
  
  // Отправка сообщения
  const sendMessage = useCallback(() => {
    console.log('sendMessage вызван');
  
    // Проверяем условия для отправки сообщения
    if ((!input.trim() && uploadedFiles.length === 0) || !isConnected || isLoading) {
      console.log('Условия для отправки не выполнены, выход из функции');
      return;
    }
  
    const userMessage = input.trim();
  
    // Предотвращаем повторную отправку, устанавливая isLoading сразу
    setIsLoading(true);
  
    // Подготавливаем файлы для отправки
    const files = uploadedFiles.map(file => ({
      name: file.name,
      type: file.type,
      size: file.size,
      url: file.url || '',
      content: file.content || null
    }));

    // Добавляем сообщение пользователя в локальный state немедленно
    setMessages(prevMessages => {
      const newMessages = [
        ...prevMessages,
        {
          role: 'user',
          content: userMessage,
          files: files.length > 0 ? files : undefined
        }
      ];
    
      // Если это сохраненный чат, обновляем его
      if (currentChatId) {
        setSavedChats(prev =>
          prev.map(chat =>
            chat.id === currentChatId
               ? { ...chat, messages: newMessages, updatedAt: new Date().toISOString() }
              : chat
          )
        );
      }
    
      return newMessages;
    });
  
    // Очищаем поле ввода
    setInput('');
  
    // Создаем локальную копию файлов перед очисткой
    const filesToUpload = [...uploadedFiles];
  
    // Очищаем список загруженных файлов
    setUploadedFiles([]);
  
    // Если есть файлы, загружаем их на сервер
    if (filesToUpload.length > 0) {
      const formData = new FormData();
      filesToUpload.forEach(file => {
        // Если это Blob, добавляем его напрямую
        if (file instanceof Blob) {
          formData.append('files', file, file.name);
        } else if (file.path) {
          // Если файл уже загружен, передаем его путь
          formData.append('filePaths', file.path);
        }
      });
    
      fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.status === 'success') {
          console.log('Файлы успешно загружены:', data.files);
    
          // Проверяем, что у файлов есть все необходимые поля
          data.files.forEach(file => {
            console.log(`Файл: ${file.name}`);
            console.log(`ID: ${file.id}`);
            console.log(`URL: ${file.url}`);
            console.log(`Тип: ${file.type}`);
            console.log(`Размер: ${file.size}`);
          })
          // Обновляем сообщение пользователя с правильными путями к файлам
          setMessages(prevMessages => {
            const updatedMessages = [...prevMessages];
            const lastMessageIndex = updatedMessages.length - 1;
            
            if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].role === 'user') {
              updatedMessages[lastMessageIndex].files = data.files;
            }
            
            return updatedMessages;
          });
          
          // Отправляем сообщение с информацией о файлах
          sendMessageToServer(userMessage, data.files);
        } else {
          throw new Error(data.message || 'Ошибка при загрузке файлов');
        }
      })
      .catch(error => {
        console.error('Ошибка при загрузке файлов:', error);
        setIsLoading(false);
        showNotification(`Ошибка при загрузке файлов: ${error.message}`, 'error');
      
        // Удаляем сообщение пользователя из истории, так как отправка не удалась
        setMessages(prevMessages => prevMessages.slice(0, -1));
      });
    } else {
      // Отправляем сообщение без файлов
      sendMessageToServer(userMessage);
    }
  }, [input, uploadedFiles, isConnected, isLoading, currentChatId, showNotification]);

  // Функция для отправки сообщения на сервер
  const sendMessageToServer = useCallback((content, files = []) => {
    console.log('sendMessageToServer вызван с:', content, files);
    // Проверяем, что файлы имеют правильный формат
    const formattedFiles = files.map(file => ({
      name: file.name,
      type: file.type,
      size: file.size,
      path: file.path || null,
      url: file.url || null
    }));
    
    // Отправляем сообщение через WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'message',
        content,
        files: formattedFiles,
        model: selectedModel // Отправляем выбранную модель
      }));
      console.log('Сообщение отправлено:', content);
      console.log('Выбранная модель:', selectedModel);
      console.log('Файлы:', formattedFiles);
    } else {
      console.error('WebSocket не подключен, состояние:', ws ? ws.readyState : 'null');
      setIsLoading(false);
      setMessages(prevMessages => [
        ...prevMessages,
        { role: 'error', content: 'Ошибка соединения. Пожалуйста, обновите страницу.' }
      ]);
      showNotification('Ошибка соединения с сервером', 'error');
    }
  }, [ws, selectedModel, showNotification]);
  
  // Очистка истории чата
  const clearChat = useCallback(() => {
    if (!isConnected) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'clear'
      }));
      
      // Очищаем локальный state немедленно
      setMessages([]);
      setExecutionResult(null);
      
      // Если был активен сохраненный чат, сбрасываем его
      if (currentChatId) {
        setCurrentChatId(null);
      }
    } else {
      console.error('WebSocket не подключен');
      showNotification('Не удалось очистить чат: нет соединения', 'error');
    }
  }, [isConnected, ws, currentChatId, showNotification]);
  
  // Обработка нажатия Enter для отправки сообщения
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // Функция для выполнения JavaScript кода
  const executeJavaScript = useCallback((code) => {
    try {
      // eslint-disable-next-line no-new-func
      const executeFunction = new Function(`
        try {
          let output = '';
          // Переопределяем console.log для перехвата вывода
          const originalLog = console.log;
          console.log = (...args) => {
            output += args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ') + '\\n';
            originalLog(...args);
          };
          
          // Выполняем код
          const result = (function() { ${code} })();
          
          // Восстанавливаем console.log
          console.log = originalLog;
          
          return { 
            success: true, 
            result: result !== undefined ? String(result) : undefined,
            output: output
          };
        } catch (error) {
          return { success: false, error: error.toString() };
        }
      `);
      
      return executeFunction();
    } catch (error) {
      return { success: false, error: error.toString() };
    }
  }, []);

  // Копирование кода в буфер обмена
  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        showNotification('Код скопирован в буфер обмена', 'success');
      })
      .catch(err => {
        console.error('Не удалось скопировать текст: ', err);
        showNotification('Не удалось скопировать код', 'error');
      });
  }, [showNotification]);

  // Форматирование кода в сообщениях
  const formatMessage = useCallback((content) => {
    if (!content) return null;
    
    // Регулярное выражение для поиска блоков кода
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    
    // Разбиваем сообщение на части: текст и код
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Добавляем текст перед блоком кода
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        });
      }
      
      // Добавляем блок кода
      const language = match[1] || 'javascript';
      parts.push({
        type: 'code',
        language,
        content: match[2]
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Добавляем оставшийся текст
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      });
    }
    
    // Если нет частей (нет блоков кода), возвращаем весь текст
    if (parts.length === 0) {
      parts.push({
        type: 'text',
        content: content
      });
    }
  
    // Рендерим части сообщения
    return parts.map((part, index) => {
      if (part.type === 'text') {
        // Обработка маркированных списков и заголовков
        const formattedText = part.content
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/^# (.*?)$/gm, '<h3>$1</h3>')
          .replace(/^## (.*?)$/gm, '<h4>$1</h4>')
          .replace(/^- (.*?)$/gm, '<li>$1</li>')
          .split('\n');
        
        return (
          <div key={index} className="text-content">
            {formattedText.map((line, i) => {
              if (line.startsWith('<li>')) {
                return <ul key={i} dangerouslySetInnerHTML={{ __html: line }} />;
              } else if (line.startsWith('<h3>') || line.startsWith('<h4>')) {
                return <div key={i} dangerouslySetInnerHTML={{ __html: line }} />;
              } else {
                return <p key={i} dangerouslySetInnerHTML={{ __html: line }} />;
              }
            })}
          </div>
        );
      } else {
        return (
          <div key={index} className="code-block">
            <div className="code-header">
              <span className="language-badge">{part.language}</span>
              <div className="code-actions">
                {part.language === 'javascript' && (
                  <button 
                    className="execute-button"
                    onClick={() => {
                      const result = executeJavaScript(part.content);
                      setExecutionResult(result);
                    }}
                    aria-label="Выполнить JavaScript код"
                  >
                    Выполнить
                  </button>
                )}
                <button 
                  className="copy-button"
                  onClick={() => copyToClipboard(part.content)}
                  aria-label="Копировать код"
                >
                  Копировать
                </button>
              </div>
            </div>
            <SyntaxHighlighter 
              language={part.language} 
              style={vscDarkPlus}
              showLineNumbers={true}
              wrapLines={true}
              customStyle={{ margin: 0, borderRadius: '0 0 8px 8px' }}
            >
              {part.content}
            </SyntaxHighlighter>
          </div>
        );
      }
    });
  }, [executeJavaScript, copyToClipboard]);
  
  return (
    <div className="App">
      <CyberBackground />
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.type === 'success' && '✅ '}
          {notification.type === 'error' && '❌ '}
          {notification.type === 'info' && 'ℹ️ '}
          {notification.type === 'warning' && '⚠️ '}
          {notification.message}
        </div>
      )}
      
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Сохраненные чаты</h3>
          <button 
            className="sidebar-close"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Закрыть боковую панель"
          >
            ✕
          </button>
        </div>
        
        <button 
          className="new-chat-button"
          onClick={createNewChat}
          aria-label="Создать новый чат"
        >
          + Новый чат
        </button>
        
        <div className="saved-chats-list">
          {savedChats.length > 0 ? (
            savedChats.map(chat => (
              <div 
                key={chat.id} 
                className={`saved-chat-item ${currentChatId === chat.id ? 'active' : ''}`}
                onClick={() => loadChat(chat.id)}
              >
                <span className="chat-name">{chat.name}</span>
                <div className="chat-actions">
                  <button 
                    className="rename-chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newName = prompt('Введите новое имя чата:', chat.name);
                      if (newName && newName.trim()) {
                        renameChat(chat.id, newName.trim());
                      }
                    }}
                    aria-label="Переименовать чат"
                  >
                    ✎
                  </button>
                  <button 
                    className="delete-chat"
                    onClick={(e) => deleteChat(chat.id, e)}
                    aria-label="Удалить чат"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="no-saved-chats">
              Нет сохраненных чатов
            </div>
          )}
        </div>
      </div>
      
      <div className="chat-container">
        <div className="chat-header">
          <div className="header-left">
            <CyberLogo />
            <button 
              className="toggle-sidebar-button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Показать/скрыть боковую панель"
            >
              ☰
            </button>
          </div>
          <div className="header-buttons">
            <div className="model-selector">
              <button 
                className="model-selector-button"
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                disabled={isLoading || isLoadingModels}
                aria-haspopup="true"
                aria-expanded={modelDropdownOpen}
              >
                {isLoadingModels ? (
                  'Загрузка моделей...'
                ) : selectedModel ? (
                  models.find(m => m.id === selectedModel)?.name || selectedModel.split('/').pop()
                ) : (
                  'Выберите модель'
                )}
                <span className="dropdown-arrow">▼</span>
              </button>
              
              {modelDropdownOpen && (
                <div className="model-dropdown">
                  <div className="model-filters">
                    <div className="provider-tabs">
                      <button 
                        className={`model-category ${modelProvider === 'all' ? 'active' : ''}`}
                        onClick={() => setModelProvider('all')}
                      >
                        Все
                      </button>
                      <button 
                        className={`model-category ${modelProvider === 'openai' ? 'active' : ''}`}
                        onClick={() => setModelProvider('openai')}
                      >
                        OpenAI
                      </button>
                      <button 
                        className={`model-category ${modelProvider === 'anthropic' ? 'active' : ''}`}
                        onClick={() => setModelProvider('anthropic')}
                      >
                        Anthropic
                      </button>
                      <button 
                        className={`model-category ${modelProvider === 'google' ? 'active' : ''}`}
                        onClick={() => setModelProvider('google')}
                      >
                        Google
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Поиск моделей..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="model-search"
                    />
                  </div>
                  
                  {filteredModels.length > 0 ? (
                    filteredModels.map(model => (
                      <div 
                        key={model.id} 
                        className={`model-option ${selectedModel === model.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setModelDropdownOpen(false);
                        }}
                      >
                        <span className="model-name">{model.name || model.id.split('/').pop()}</span>
                        <span className="model-provider">{model.provider}</span>
                        {model.contextLength && (
                          <span className="model-context-length">
                            {Math.round(model.contextLength / 1000)}K токенов
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="no-models-found">Модели не найдены</div>
                  )}
                </div>
              )}
            </div>
            
            <button 
              className="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Включить светлую тему' : 'Включить темную тему'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            
            <button 
              className="save-button" 
              onClick={saveCurrentChat}
              disabled={messages.length === 0}
              aria-label="Сохранить чат"
            >
              Сохранить
            </button>
            
            <button 
              className="clear-button" 
              onClick={clearChat}
              disabled={!isConnected || isLoading || messages.length === 0}
              aria-label="Очистить чат"
            >
              Очистить
            </button>
          </div>
        </div>
        
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-message">
              <CyberCorners />
              <h3>Привет! Я КОТ, твой компетентный онлайн-тьютор. 🐱</h3>
            </div>
          ) : (
            messages.map((message, index) => (
              <div 
                key={index} 
                className={`message ${message.role === 'user' ? 'user-message' : message.role === 'error' ? 'error-message' : 'assistant-message'}`}
              >
                <CyberCorners />
                <div className="message-content">
                  {formatMessage(message.content)}
                  
                  {/* Отображение информации о файлах */}
                  {message.files && message.files.length > 0 && (
                    <div className="message-files">
                      {message.files.map((file, fileIndex) => {
                        // Определяем тип файла для отображения
                        if (file.type && file.type.startsWith('image/')) {
                          return (
                            <div key={fileIndex} className="message-file image-file">
                              <img 
                                src={getImageUrl(file)} 
                                alt={file.name} 
                                className="message-image"
                                onError={(e) => {
                                  console.error('Ошибка загрузки изображения:', e);
                                  e.target.onerror = null;
                                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTkiPkXRgNGA0L7RgCDQt9Cw0LPRgNGD0LfQutC4PC90ZXh0Pjwvc3ZnPg==';
                                }}
                              />
                              <div className="file-info">
                                <span className="file-name">{decodeFileName(file)}</span>
                                <span className="file-size">{formatFileSize(file.size)}</span>
                              </div>
                            </div>
                          );
                        } else if (file.type === 'application/zip' || (file.name && file.name.endsWith('.zip'))) {
                          return (
                            <div key={fileIndex} className="message-file document-file">
                              <div className="file-icon">📦</div>
                              <div className="file-info">
                                <a 
                                  href={file.url || `/uploads/${file.id || getBasename(file.path || '')}`} 
                                  download={file.name}
                                  className="file-name"
                                >
                                  {file.name}
                                </a>
                                <span className="file-size">{formatFileSize(file.size)}</span>
                              </div>
                            </div>
                          );
                        } else if (isCodeFile(file.name)) {
                          // Отображение файлов с кодом
                          return (
                            <div key={fileIndex} className="message-file document-file">
                              <div className="file-icon">📄</div>
                              <div className="file-info">
                                <a 
                                  href={file.url || `/uploads/${file.id || getBasename(file.path || '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  download={file.name}
                                  className="file-name"
                                >
                                  {file.name}
                                </a>
                                <span className="file-size">{formatFileSize(file.size)}</span>
                              </div>
                              <button 
                                className="view-code-button"
                                onClick={() => handleViewCode(file)}
                                aria-label="Просмотреть код"
                              >
                                Просмотреть код
                              </button>
                            </div>
                          );
                        } else {
                          // Отображение других файлов
                          return (
                            <div key={fileIndex} className="message-file document-file">
                              <div className="file-icon">📄</div>
                              <div className="file-info">
                                <a 
                                  href={file.url || `/uploads/${file.id || getBasename(file.path || '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  download={file.name}
                                  className="file-name"
                                >
                                  {file.name}
                                </a>
                                <span className="file-size">{formatFileSize(file.size)}</span>
                              </div>
                            </div>
                          );
                        }
                      })}
                    </div>
                  )} 
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="message assistant-message">
              <CyberCorners />
              <div className="message-content">
                <p className="loading">КОТ думает<span>.</span><span>.</span><span>.</span></p>
              </div>
            </div>
          )}
          
          {executionResult && (
            <div className={`execution-result ${executionResult.success ? 'success' : 'error'}`}>
              <CyberCorners />
              <div className="result-header">
                <span>{executionResult.success ? 'Результат выполнения:' : 'Ошибка:'}</span>
                <button 
                  onClick={() => setExecutionResult(null)}
                  aria-label="Закрыть результат выполнения"
                >
                  ✕
                </button>
              </div>
              <div className="result-content">
                {executionResult.success ? (
                  <>
                    {executionResult.output && (
                      <div className="output">
                        <strong>Вывод:</strong>
                        <pre>{executionResult.output}</pre>
                      </div>
                    )}
                    {executionResult.result !== undefined && (
                      <div className="return-value">
                        <strong>Возвращаемое значение:</strong>
                        <pre>{executionResult.result}</pre>
                      </div>
                    )}
                    {!executionResult.output && executionResult.result === undefined && (
                      <div className="no-output">Код выполнен без вывода</div>
                    )}
                  </>
                ) : (
                  <pre className="error-message">{executionResult.error}</pre>
                )}
              </div>
            </div>
          )}
          
          {/* Модальное окно для просмотра кода */}
          {codeViewFile && (
            <div className="code-view-modal">
              <div className="code-view-content">
                <div className="code-view-header">
                  <h3>{codeViewFile.name}</h3>
                  <button 
                    className="close-button"
                    onClick={() => setCodeViewFile(null)}
                    aria-label="Закрыть просмотр кода"
                  >
                    ✕
                  </button>
                </div>
                <div className="code-view-body">
                  <SyntaxHighlighter 
                    language={codeViewFile.language} 
                    style={vscDarkPlus}
                    showLineNumbers={true}
                    wrapLines={true}
                  >
                    {codeViewFile.content}
                  </SyntaxHighlighter>
                </div>
                <div className="code-view-footer">
                  <button 
                    className="copy-button"
                    onClick={() => {
                      navigator.clipboard.writeText(codeViewFile.content);
                      showNotification('Код скопирован в буфер обмена', 'success');
                    }}
                    aria-label="Копировать код"
                  >
                    Копировать
                  </button>
                  {codeViewFile.language === 'javascript' && (
                    <button 
                      className="execute-button"
                      onClick={() => {
                        const result = executeJavaScript(codeViewFile.content);
                        setExecutionResult(result);
                        setCodeViewFile(null); // Закрываем окно просмотра кода
                      }}
                      aria-label="Выполнить JavaScript код"
                    >
                      Выполнить
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        <div className="input-area">
          {uploadedFiles.length > 0 && (
            <div className="uploaded-files">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="uploaded-file">
                  {file.type && file.type.startsWith('image/') ? (
                    <img 
                      src={getImageUrl(file)} 
                      alt={file.name} 
                      className="file-thumbnail" 
                      onError={(e) => {
                        console.error('Ошибка загрузки миниатюры:', e);
                        e.target.onerror = null;
                        e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiBmaWxsPSIjZWVlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSIjOTk5Ij5FcnJvcjwvdGV4dD48L3N2Zz4=';
                      }}
                    />
                  ) : (
                    <span className="file-icon">📄</span>
                  )}
                  <span className="file-name">{decodeFileName(file)}</span>
                  <button 
                    className="remove-file"
                    onClick={() => removeFile(index)}
                    aria-label="Удалить файл"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="input-container">
            <button 
              className="upload-button"
              onClick={() => fileInputRef.current.click()}
              disabled={isLoading || !isConnected}
              aria-label="Загрузить файлы"
            >
              📎
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              multiple
              accept="image/*,.zip,.js,.py,.html,.css,.java,.cpp,.c,.cs,.php,.rb,.go,.ts,.jsx,.tsx,.json,.xml,.md,.txt"
            />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Напишите вопрос или задачу..."
              disabled={!isConnected || isLoading}
              aria-label="Текст сообщения"
            />
            <button 
              className="send-button"
              onClick={sendMessage}
              disabled={(!input.trim() && uploadedFiles.length === 0) || !isConnected || isLoading}
              aria-label="Отправить сообщение"
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
