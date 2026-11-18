import { createServer } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(projectRoot, 'public');

async function loadLocalEnv() {
  try {
    const contents = await readFile(path.join(projectRoot, '.env'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await loadLocalEnv();
const dataRoot = path.resolve(process.env.DATA_DIR || path.join(projectRoot, 'data'));
const uploadsRoot = path.join(dataRoot, 'uploads');
const catalogFile = path.join(dataRoot, 'products.json');
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD || '';
const sessionSecret = process.env.SESSION_SECRET || '';
const validAdminConfig = adminPassword.length >= 14 && /^[a-f0-9]{64,}$/i.test(sessionSecret) && sessionSecret.length % 2 === 0;
const sessionCookie = 'divas_admin';
const sessionDuration = 7 * 24 * 60 * 60;
const maxBodyBytes = 4 * 1024 * 1024;
const maxImageBytes = 2 * 1024 * 1024;
const imageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const staticTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};
const loginAttempts = new Map();

await mkdir(uploadsRoot, { recursive: true });

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function makeSession() {
  const payload = Buffer.from(JSON.stringify({
    token: randomBytes(32).toString('base64url'),
    expires: Math.floor(Date.now() / 1000) + sessionDuration,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function validSession(request) {
  const cookies = request.headers.cookie || '';
  const value = cookies.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
  if (!value) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).expires > Date.now() / 1000;
  } catch {
    return false;
  }
}

function send(response, status, data, extraHeaders = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders,
  });
  response.end(body);
}

function cookieOptions(request, maxAge) {
  const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
  return `${sessionCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Please send valid JSON.'), { status: 400 });
  }
}

async function loadProducts() {
  try {
    const value = JSON.parse(await readFile(catalogFile, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveProducts(products) {
  const tempFile = `${catalogFile}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tempFile, JSON.stringify(products, null, 2), { mode: 0o600 });
  await rename(tempFile, catalogFile);
}

function validateProduct(input) {
  const name = String(input?.name || '').trim();
  const description = String(input?.description || '').trim();
  const category = String(input?.category || '').trim();
  if (!name || name.length > 100) throw Object.assign(new Error('Add a product name (up to 100 characters).'), { status: 400 });
  if (description.length > 500) throw Object.assign(new Error('Description must be 500 characters or fewer.'), { status: 400 });
  if (!category || category.length > 60) throw Object.assign(new Error('Add a category (up to 60 characters).'), { status: 400 });
  if (!Array.isArray(input.sizes) || input.sizes.length < 1 || input.sizes.length > 12) {
    throw Object.assign(new Error('Add between 1 and 12 size and price options.'), { status: 400 });
  }
  const sizes = input.sizes.map((option) => {
    const label = String(option?.label || '').trim();
    const price = option?.price;
    if (!label || label.length > 60 || !Number.isSafeInteger(price) || price < 0 || price > 100000000) {
      throw Object.assign(new Error('Each size needs a label and a whole-number KSh price.'), { status: 400 });
    }
    return { label, price };
  });
  return { name, description, category, sizes, active: input.active !== false };
}

function parseImage(image) {
  if (!image) return null;
  if (typeof image.data !== 'string' || !imageTypes.has(image.type)) {
    throw Object.assign(new Error('Use a JPEG, PNG, or WebP product photo.'), { status: 400 });
  }
  const base64 = image.data.replace(/^data:image\/(?:jpeg|png|webp);base64,/, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw Object.assign(new Error('The product photo could not be read.'), { status: 400 });
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > maxImageBytes) {
    throw Object.assign(new Error('Product photos must be under 2 MB.'), { status: 413 });
  }
  return { buffer, extension: imageTypes.get(image.type) };
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = request.socket.encrypted || forwardedProto === 'https' ? 'https:' : 'http:';
  return origin === `${protocol}//${host}`;
}

async function routeApi(request, response, url) {
  const pathname = url.pathname;

  if (pathname === '/api/products' && request.method === 'GET') {
    const products = await loadProducts();
    return send(response, 200, products.filter((product) => product.active));
  }

  if (pathname === '/api/admin/session' && request.method === 'GET') {
    return send(response, 200, { authenticated: validSession(request) });
  }

  if (pathname === '/api/admin/login' && request.method === 'POST') {
    if (!isSameOrigin(request)) return send(response, 403, { error: 'Request origin not allowed.' });
    if (!validAdminConfig) return send(response, 503, { error: 'Admin access is not configured on the server yet.' });
    const ip = request.socket.remoteAddress || 'unknown';
    const attempts = loginAttempts.get(ip) || { count: 0, until: 0 };
    if (attempts.until > Date.now() && attempts.count >= 8) return send(response, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    const data = await readJson(request);
    if (typeof data.password !== 'string' || !safeEqual(data.password, adminPassword)) {
      const next = attempts.until > Date.now() ? attempts : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      next.count += 1;
      loginAttempts.set(ip, next);
      return send(response, 401, { error: 'That password did not match.' });
    }
    loginAttempts.delete(ip);
    return send(response, 200, { authenticated: true }, { 'Set-Cookie': `${sessionCookie}=${makeSession()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDuration}${request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}` });
  }

  if (pathname === '/api/admin/logout' && request.method === 'POST') {
    return send(response, 200, { authenticated: false }, { 'Set-Cookie': cookieOptions(request, 0) });
  }

  if (!pathname.startsWith('/api/admin/products')) return false;
  if (!validSession(request)) return send(response, 401, { error: 'Please sign in to manage products.' });
  if (!isSameOrigin(request)) return send(response, 403, { error: 'Request origin not allowed.' });

  const products = await loadProducts();
  if (pathname === '/api/admin/products' && request.method === 'GET') return send(response, 200, products);

  if (pathname === '/api/admin/products' && request.method === 'POST') {
    const data = await readJson(request);
    const productFields = validateProduct(data);
    const image = parseImage(data.image);
    if (!image) return send(response, 400, { error: 'Choose a product photo.' });
    const id = randomBytes(16).toString('hex');
    const imageName = `${id}.${image.extension}`;
    await writeFile(path.join(uploadsRoot, imageName), image.buffer, { flag: 'wx', mode: 0o644 });
    const product = { id, ...productFields, image: `/uploads/${imageName}`, createdAt: new Date().toISOString() };
    products.unshift(product);
    await saveProducts(products);
    return send(response, 201, product);
  }

  const match = pathname.match(/^\/api\/admin\/products\/([a-f0-9]{32})$/);
  if (!match) return send(response, 404, { error: 'Product not found.' });
  const index = products.findIndex((product) => product.id === match[1]);
  if (index < 0) return send(response, 404, { error: 'Product not found.' });

  if (request.method === 'PUT') {
    const data = await readJson(request);
    const productFields = validateProduct(data);
    const image = parseImage(data.image);
    const previousImage = products[index].image;
    let imageUrl = products[index].image;
    if (image) {
      const imageName = `${match[1]}-${randomBytes(4).toString('hex')}.${image.extension}`;
      await writeFile(path.join(uploadsRoot, imageName), image.buffer, { flag: 'wx', mode: 0o644 });
      imageUrl = `/uploads/${imageName}`;
    }
    const updated = { ...products[index], ...productFields, image: imageUrl, updatedAt: new Date().toISOString() };
    products[index] = updated;
    await saveProducts(products);
    if (image) await unlink(path.join(uploadsRoot, path.basename(previousImage))).catch(() => {});
    return send(response, 200, updated);
  }

  if (request.method === 'DELETE') {
    const [removed] = products.splice(index, 1);
    await saveProducts(products);
    await unlink(path.join(uploadsRoot, path.basename(removed.image))).catch(() => {});
    return send(response, 200, { deleted: true });
  }

  return send(response, 405, { error: 'Method not allowed.' });
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      const result = await routeApi(request, response, url);
      if (result === false) send(response, 404, { error: 'Not found.' });
      return;
    }

    if (url.pathname.startsWith('/uploads/')) {
      const name = path.basename(decodeURIComponent(url.pathname.slice('/uploads/'.length)));
      if (!/^[a-f0-9]{32}(?:-[a-f0-9]{8})?\.(?:jpg|png|webp)$/.test(name)) return send(response, 404, 'Not found.');
      const image = await readFile(path.join(uploadsRoot, name));
      response.writeHead(200, { 'Content-Type': staticTypes[path.extname(name)], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      response.end(image);
      return;
    }

    const relativePath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const filePath = path.resolve(publicRoot, relativePath);
    const relative = path.relative(publicRoot, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return send(response, 403, 'Forbidden.');
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': staticTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    response.end(body);
  } catch (error) {
    if (error.status) return send(response, error.status, { error: error.message });
    if (error.code === 'ENOENT') return send(response, 404, 'Not found.');
    console.error('Request failed:', error);
    return send(response, 500, { error: 'Something went wrong. Please try again.' });
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Divas Bakers website running on port ${port}`);
  if (!validAdminConfig) console.warn('Set an ADMIN_PASSWORD of at least 14 characters and a SESSION_SECRET of at least 32 random bytes encoded as hex to enable the product admin.');
});
