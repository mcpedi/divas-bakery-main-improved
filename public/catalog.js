const catalogGrid = document.querySelector('#product-catalog-grid');
const catalogEmpty = document.querySelector('#product-catalog-empty');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function quoteLink(product) {
  const lines = [
    `Hello Divas Bakers, I would like to ask about ${product.name}.`,
    `Size: ${product.sizes[0].label}`,
    `Listed price: KSh ${product.sizes[0].price.toLocaleString('en-KE')}`,
  ];
  return `https://wa.me/254743694672?text=${encodeURIComponent(lines.join('\n'))}`;
}

function renderCatalog(products) {
  if (!catalogGrid || !catalogEmpty) return;
  catalogGrid.replaceChildren();
  catalogEmpty.hidden = products.length > 0;
  products.forEach((product) => {
    const card = element('article', 'product-card');
    const image = element('img', 'product-card__image');
    image.src = product.image;
    image.alt = product.name;
    image.loading = 'lazy';
    image.decoding = 'async';
    const details = element('div', 'product-card__content');
    details.append(element('span', 'product-card__category', product.category));
    details.append(element('h4', 'product-card__name', product.name));
    if (product.description) details.append(element('p', 'product-card__description', product.description));
    const prices = element('ul', 'product-card__sizes');
    product.sizes.forEach((size) => prices.append(element('li', '', `${size.label} · KSh ${size.price.toLocaleString('en-KE')}`)));
    details.append(prices);
    const ask = element('a', 'button button--dark product-card__quote', 'Ask about this product ↗');
    ask.href = quoteLink(product);
    ask.target = '_blank';
    ask.rel = 'noopener noreferrer';
    details.append(ask);
    card.append(image, details);
    catalogGrid.append(card);
  });
}

if (catalogGrid) {
  fetch('/api/products')
    .then((response) => {
      if (!response.ok) throw new Error('Could not load the product list.');
      return response.json();
    })
    .then(renderCatalog)
    .catch(() => {
      if (catalogEmpty) catalogEmpty.textContent = 'Product listings are temporarily unavailable. Please message us on WhatsApp to ask what’s available.';
    });
}
