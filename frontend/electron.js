const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'public/favicon.ico'),
    title: '投资助手',
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // 开发模式：加载 ng serve
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：加载打包后的文件
    const indexPath = path.join(__dirname, 'dist/investment-assistant/browser/index.html');
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      console.error(`Index not found: ${indexPath}`);
      app.quit();
      return;
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
