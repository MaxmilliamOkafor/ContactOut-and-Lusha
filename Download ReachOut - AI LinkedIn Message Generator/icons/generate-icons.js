// Run this script with Node.js to generate placeholder icons
// Usage: node generate-icons.js

const fs = require('fs');
const { createCanvas } = require('canvas');

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const scale = size / 128;

  // Background
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Letter R
  ctx.fillStyle = 'white';
  ctx.font = `bold ${60 * scale}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', size / 2, size / 2 + 2 * scale);

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`icon${size}.png`, buffer);
  console.log(`Created icon${size}.png`);
});

console.log('Done! Icons created.');
