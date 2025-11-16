#!/usr/bin/env node

import { createWriteStream, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

async function getPackageVersion() {
  const packageJson = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf-8'));
  return packageJson.version;
}

async function packageExtension() {
  try {
    const version = await getPackageVersion();
    const distDir = join(rootDir, 'dist');
    const buildDir = join(rootDir, 'build');
    const outputPath = join(buildDir, `cuewise-extension-${version}.zip`);

    // Create build directory if it doesn't exist
    mkdirSync(buildDir, { recursive: true });

    // Create write stream for the zip file
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    // Pipe archive data to the file
    archive.pipe(output);

    // Add all files from dist directory, excluding .DS_Store and .vite
    archive.glob('**/*', {
      cwd: distDir,
      ignore: ['**/.DS_Store', '.vite/**'],
    });

    // Finalize the archive
    await archive.finalize();

    // Wait for the output stream to finish
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`✅ Package created: build/cuewise-extension-${version}.zip`);
    console.log(`📦 Size: ${sizeInMB} MB`);
  } catch (error) {
    console.error('❌ Error creating package:', error.message);
    process.exit(1);
  }
}

packageExtension();
