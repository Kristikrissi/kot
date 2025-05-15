const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const Tesseract = require('tesseract.js');
const chatService = require('./chatService');

const router = express.Router();

// Настройка хранилища для загруженных файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'application/zip',
      'text/plain', 'application/json', 'text/javascript',
      'text/html', 'text/css'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый тип файла'));
    }
  }
});

// Маршрут для загрузки файлов
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const filePath = req.file.path;
    const fileType = req.file.mimetype;
    let fileContent = '';
    let fileContext = '';

    // Обработка разных типов файлов
    if (fileType === 'application/zip') {
      // Обработка ZIP-архива
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      
      fileContent = zipEntries.map(entry => {
        if (!entry.isDirectory) {
          return `Файл: ${entry.entryName}\n${entry.getData().toString('utf8')}`;
        }
        return '';
      }).join('\n\n');
      
      fileContext = `ZIP-архив содержит ${zipEntries.length} файлов`;
    } 
    else if (fileType.startsWith('image/')) {
      // Обработка изображений с OCR
      const { data } = await Tesseract.recognize(filePath, 'rus+eng');
      fileContent = data.text;
      fileContext = 'Текст, распознанный из изображения';
    } 
    else {
      // Обработка текстовых файлов
      fileContent = fs.readFileSync(filePath, 'utf8');
      fileContext = `Содержимое файла ${path.basename(req.file.originalname)}`;
    }

    // Анализ содержимого файла с помощью AI
    const analysis = await chatService.analyzeFile(fileContent, fileContext);

    res.json({
      success: true,
      fileName: req.file.originalname,
      fileType,
      analysis
    });

    // Очистка временных файлов
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Ошибка при удалении временного файла:', err);
      });
    }, 3600000); // Удаляем через час

  } catch (error) {
    console.error('Ошибка при обработке файла:', error);
    res.status(500).json({ error: 'Ошибка при обработке файла' });
  }
});

// Маршрут для получения истории чата
router.get('/chat-history', (req, res) => {
  try {
    const history = chatService.getChatHistory();
    res.json(history);
  } catch (error) {
    console.error('Ошибка при получении истории чата:', error);
    res.status(500).json({ error: 'Ошибка при получении истории чата' });
  }
});

module.exports = router;
