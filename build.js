const fs = require('fs');
const path = require('path');

// Create dist directory if it doesn't exist
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy static files
const filesToCopy = [
  'manifest.json',
  'config.json',
  'popup.html',
  'popup.css',
  'src/content.css'
];

filesToCopy.forEach(file => {
  const dest = file.startsWith('src/') ? path.join('dist', path.basename(file)) : path.join('dist', file);
  fs.copyFileSync(file, dest);
  console.log(`Copied ${file} to ${dest}`);
});

// Copy icons directory if it exists
if (fs.existsSync('icons')) {
  if (!fs.existsSync('dist/icons')) {
    fs.mkdirSync('dist/icons');
  }
  fs.readdirSync('icons').forEach(file => {
    fs.copyFileSync(path.join('icons', file), path.join('dist/icons', file));
  });
  console.log('Copied icons directory');
}

console.log('\nBuild complete! Extension is ready in the dist/ directory.');
console.log('\nTo load in Chrome:');
console.log('1. Open chrome://extensions/');
console.log('2. Enable "Developer mode"');
console.log('3. Click "Load unpacked"');
console.log('4. Select the dist/ directory');
