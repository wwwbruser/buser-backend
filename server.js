browser = await puppeteer.launch({
  headless: 'new',
  executablePath: require('puppeteer').executablePath(), // Linha adicionada
  protocolTimeout: 120000,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ]
});
