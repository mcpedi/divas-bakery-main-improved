const loginPanel = document.querySelector('#login-panel');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');
const productForm = document.querySelector('#product-form');
const productStatus = document.querySelector('#product-status');
const sizeRows = document.querySelector('#size-rows');
const inventoryList = document.querySelector('#inventory-list');
const inventoryEmpty = document.querySelector('#inventory-empty');
const productCount = document.querySelector('#product-count');
const imageInput = document.querySelector('#product-image');
const imagePreview = document.querySelector('#image-preview');
const imageOptional = document.querySelector('#image-optional');
let products = [];
let existingImage = '';

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function showDashboard(isSignedIn) {
  loginPanel.hidden = isSignedIn;
  dashboard.hidden = !isSignedIn;
  if (isSignedIn) refreshProducts();
}

function addSizeRow(size = { label: '', price: '' }) {
  const row = node('div', 'size-row');
  const label = document.createElement('input');
  label.type = 'text';
  label.maxLength = 60;
  label.placeholder = 'e.g. 1 kg or 10 servings';
  label.setAttribute('aria-label', 'Size or serving option');
  label.value = size.label || '';
  label.required = true;
  const price = document.createElement('input');
  price.type = 'number';
  price.min = '0';
  price.max = '100000000';
  price.step = '1';
  price.inputMode = 'numeric';
  price.placeholder = 'Price (KSh)';
  price.setAttribute('aria-label', 'Price in Kenyan shillings');
  price.value = size.price ?? '';
  price.required = true;
  const remove = node('button', 'size-remove', 'Remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Remove this size option');
  remove.addEventListener('click', () => {
    if (sizeRows.children.length > 1) row.remove();
  });
  row.append(label, price, remove);
  sizeRows.append(row);
}

function sizeValues() {
  return [...sizeRows.children].map((row) => ({
    label: row.children[0].value.trim(),
    price: Number(row.children[1].value),
  }));
}

function renderInventory() {
  inventoryList.replaceChildren();
  inventoryEmpty.hidden = products.length > 0;
  productCount.textContent = String(products.length);
  products.forEach((product) => {
    const card = node('article', 'inventory-card');
    const image = node('img', 'inventory-card__image');
    image.src = product.image;
    image.alt = '';
    image.loading = 'lazy';
    const main = node('div', 'inventory-card__main');
    const top = node('div', 'inventory-card__title');
    top.append(node('h3', '', product.name), node(`span`, product.active ? 'product-status-pill' : 'product-status-pill is-hidden', product.active ? 'Published' : 'Hidden'));
    main.append(top, node('p', 'inventory-card__category', product.category));
    main.append(node('p', 'inventory-card__sizes', product.sizes.map((size) => `${size.label}: KSh ${Number(size.price).toLocaleString('en-KE')}`).join(' · ')));
    const actions = node('div', 'inventory-card__actions');
    const edit = node('button', 'admin-secondary', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => beginEdit(product));
    const remove = node('button', 'admin-danger', 'Delete');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteProduct(product));
    actions.append(edit, remove);
    card.append(image, main, actions);
    inventoryList.append(card);
  });
}

async function refreshProducts() {
  try {
    products = await api('/api/admin/products');
    renderInventory();
  } catch (error) {
    productStatus.textContent = error.message;
  }
}

function resetForm() {
  productForm.reset();
  document.querySelector('#product-id').value = '';
  document.querySelector('#product-active').checked = true;
  document.querySelector('#editor-title').textContent = 'Add a product';
  document.querySelector('#save-product').innerHTML = 'Save product <span aria-hidden="true">↗</span>';
  document.querySelector('#cancel-edit').hidden = true;
  imageOptional.textContent = '';
  imagePreview.hidden = true;
  imagePreview.removeAttribute('src');
  sizeRows.replaceChildren();
  addSizeRow();
  existingImage = '';
  productStatus.textContent = '';
}

function beginEdit(product) {
  document.querySelector('#product-id').value = product.id;
  document.querySelector('#product-name').value = product.name;
  document.querySelector('#product-category').value = product.category;
  document.querySelector('#product-description').value = product.description || '';
  document.querySelector('#product-active').checked = product.active;
  sizeRows.replaceChildren();
  product.sizes.forEach(addSizeRow);
  existingImage = product.image;
  imagePreview.src = existingImage;
  imagePreview.hidden = false;
  imageOptional.textContent = '(leave empty to keep current photo)';
  document.querySelector('#editor-title').textContent = 'Edit product';
  document.querySelector('#save-product').innerHTML = 'Save changes <span aria-hidden="true">↗</span>';
  document.querySelector('#cancel-edit').hidden = false;
  productStatus.textContent = '';
  document.querySelector('#editor-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function imageData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that photo. Please try another file.'));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  if (!file) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose a photo smaller than 12 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.86, 0.72, 0.58, 0.45]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= 2 * 1024 * 1024) return imageData(blob);
  }
  throw new Error('This photo is still too large after resizing. Please choose another image.');
}

async function deleteProduct(product) {
  if (!window.confirm(`Delete “${product.name}” from the product catalog?`)) return;
  try {
    await api(`/api/admin/products/${product.id}`, { method: 'DELETE' });
    productStatus.textContent = `${product.name} was deleted.`;
    await refreshProducts();
    if (document.querySelector('#product-id').value === product.id) resetForm();
  } catch (error) {
    productStatus.textContent = error.message;
  }
}

imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  if (!file) return;
  try {
    imagePreview.src = await compressImage(file);
    imagePreview.hidden = false;
  } catch (error) {
    imageInput.value = '';
    productStatus.textContent = error.message;
  }
});

document.querySelector('#add-size').addEventListener('click', () => {
  if (sizeRows.children.length < 12) addSizeRow();
});
document.querySelector('#cancel-edit').addEventListener('click', resetForm);
document.querySelector('#logout-button').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showDashboard(false);
  loginStatus.textContent = 'You have signed out.';
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button');
  button.disabled = true;
  loginStatus.textContent = 'Signing in…';
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: document.querySelector('#admin-password').value }) });
    loginForm.reset();
    loginStatus.textContent = '';
    showDashboard(true);
  } catch (error) {
    loginStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#save-product');
  button.disabled = true;
  productStatus.textContent = 'Saving product…';
  try {
    const id = document.querySelector('#product-id').value;
    const file = imageInput.files[0];
    const image = await compressImage(file);
    if (!id && !image) throw new Error('Choose a product photo.');
    const payload = {
      name: document.querySelector('#product-name').value.trim(),
      category: document.querySelector('#product-category').value.trim(),
      description: document.querySelector('#product-description').value.trim(),
      sizes: sizeValues(),
      active: document.querySelector('#product-active').checked,
      image,
    };
    await api(id ? `/api/admin/products/${id}` : '/api/admin/products', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    resetForm();
    productStatus.textContent = id ? 'Product changes saved.' : 'Product added to your catalog.';
    await refreshProducts();
  } catch (error) {
    productStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

addSizeRow();
api('/api/admin/session')
  .then((session) => showDashboard(session.authenticated))
  .catch((error) => { loginStatus.textContent = error.message; });
