Code-Collab
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};
http.createServer((req, res) => {
    let filePath = req.url.split('?')[0];
    if (filePath === '/') filePath = '/index.html';
    filePath = path.join(__dirname, filePath);
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    fs.readFile(filePath, (err, data) => {
    if (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500);
        res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
        return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
    });
}).listen(PORT, () => {
    console.log(`\n ⟨⟩ CodeCollab dev server\n`);
    console.log(` http://localhost:${PORT}\n`);
});