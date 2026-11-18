const navToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('.primary-nav');

function closeNav() {
  if (!navToggle || !primaryNav) return;
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Open navigation');
  primaryNav.classList.remove('is-open');
}

navToggle?.addEventListener('click', () => {
  const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!isOpen));
  navToggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
  primaryNav?.classList.toggle('is-open', !isOpen);
});

primaryNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', closeNav);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeNav();
});

const filterButtons = [...document.querySelectorAll('.menu-tab')];
const menuItems = [...document.querySelectorAll('.menu-item')];

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedCategory = button.dataset.filter;
    filterButtons.forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle('is-active', selected);
      candidate.setAttribute('aria-pressed', String(selected));
    });
    menuItems.forEach((item) => {
      item.hidden = selectedCategory !== 'all' && item.dataset.category !== selectedCategory;
    });
  });
});


const cakeForm = document.querySelector('#cake-form');
const cakeDate = document.querySelector('#cake-date');

if (cakeDate) {
  const today = new Date();
  const localDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  cakeDate.min = localDate;
}
const bakeryWhatsAppNumber = '254743694672';

cakeForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(cakeForm);
  const getValue = (field) => String(formData.get(field) ?? '').trim();
  const budget = getValue('budget');
  const message = [
    'Hi Divas Bakers! I would like to enquire about a custom cake.',
    '',
    `Name: ${getValue('name')}`,
    `My WhatsApp number: ${getValue('contact')}`,
    `Occasion: ${getValue('occasion') || 'Not specified'}`,
    `Event date: ${getValue('date')}`,
    `Approximate servings: ${getValue('servings')}`,
    `Flavour, colours, or design: ${getValue('style') || 'Not specified'}`,
    `Budget: ${budget ? `KSh ${budget}` : 'Not specified'}`,
    `Notes: ${getValue('notes') || 'None'}`,
    '',
    'I understand this is an inquiry, not a confirmed order. Please let me know availability and the next steps.',
  ].join('\n');

  const whatsappUrl = `https://wa.me/${bakeryWhatsAppNumber}?text=${encodeURIComponent(message)}`;
  window.location.assign(whatsappUrl);
});


// Customer reviews are intentionally kept in this browser only; no server is configured.
const reviewStorageKey = 'divas-bakers-customer-reviews-v1';
const reviewForm = document.querySelector('#review-form');
const reviewGrid = document.querySelector('#reviews-grid');
const reviewEmpty = document.querySelector('#reviews-empty');
const reviewSummary = document.querySelector('#reviews-summary');
const reviewSubmit = document.querySelector('#review-submit');
const reviewCancel = document.querySelector('#review-cancel');
let editingReviewId = null;
function readReviews() {
  try {
    const saved = JSON.parse(localStorage.getItem(reviewStorageKey) || '[]');
    return Array.isArray(saved) ? saved.filter((review) => review && typeof review.id === 'string' && typeof review.name === 'string' && typeof review.text === 'string' && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5) : [];
  } catch { return []; }
}
function saveReviews(reviews) {
  try { localStorage.setItem(reviewStorageKey, JSON.stringify(reviews)); return true; }
  catch { return false; }
}
function renderReviews() {
  if (!reviewGrid) return;
  const reviews = readReviews();
  reviewGrid.replaceChildren();
  reviewEmpty.hidden = reviews.length > 0;
  if (reviews.length) {
    const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
    reviewSummary.textContent = `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'} · ${average.toFixed(1)} out of 5 stars (on this device)`;
  } else reviewSummary.textContent = '';
  reviews.slice().reverse().forEach((review) => {
    const card = document.createElement('article');
    card.className = 'review-card';
    const stars = document.createElement('div');
    stars.className = 'review-card__stars';
    stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
    stars.textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
    const quote = document.createElement('span'); quote.className = 'review-card__quote'; quote.setAttribute('aria-hidden', 'true'); quote.textContent = '“';
    const blockquote = document.createElement('blockquote'); const text = document.createElement('p'); text.textContent = review.text; blockquote.append(text);
    const caption = document.createElement('div'); caption.className = 'review-card__caption'; const name = document.createElement('b'); name.textContent = review.name; caption.append(name);
    const actions = document.createElement('div'); actions.className = 'review-card__actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit this review'; edit.setAttribute('aria-label', `Edit review by ${review.name}`);
    edit.addEventListener('click', () => {
      editingReviewId = review.id;
      reviewForm.elements.name.value = review.name;
      reviewForm.elements.text.value = review.text;
      const rating = reviewForm.querySelector(`input[name="rating"][value="${review.rating}"]`);
      if (rating) rating.checked = true;
      document.querySelector('#review-form-title').textContent = 'Edit your review';
      reviewSubmit.textContent = 'Save changes'; reviewCancel.hidden = false;
      reviewForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      reviewForm.elements.name.focus({ preventScroll: true });
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove review by ${review.name}`);
    remove.addEventListener('click', () => {
      if (!saveReviews(readReviews().filter((item) => item.id !== review.id))) {
        document.querySelector('#review-notice').textContent = 'Could not update browser storage. Check your device storage settings and try again.'; return;
      }
      if (editingReviewId === review.id) resetReviewForm();
      renderReviews();
    });
    actions.append(edit, remove);
    card.append(quote, stars, blockquote, caption, actions); reviewGrid.append(card);
  });
}
function resetReviewForm() {
  reviewForm?.reset(); editingReviewId = null;
  document.querySelector('#review-form-title').textContent = 'Leave a review';
  reviewSubmit.textContent = 'Post review'; reviewCancel.hidden = true;
}
reviewForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = String(reviewForm.elements.name.value).trim();
  const text = String(reviewForm.elements.text.value).trim();
  const rating = Number(new FormData(reviewForm).get('rating'));
  if (!name || !text || rating < 1 || rating > 5) return;
  const reviews = readReviews();
  const updated = editingReviewId
    ? reviews.map((review) => review.id === editingReviewId ? { ...review, name, text, rating, updatedAt: new Date().toISOString() } : review)
    : [...reviews, { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, text, rating, createdAt: new Date().toISOString() }];
  if (!saveReviews(updated)) {
    document.querySelector('#review-notice').textContent = 'Could not save this review in browser storage. Check your device settings and try again.'; return;
  }
  document.querySelector('#review-notice').textContent = 'Your review is saved in this browser on this device.';
  resetReviewForm(); renderReviews();
});
reviewCancel?.addEventListener('click', resetReviewForm);
renderReviews();

// Subtle scroll-in reveals; content remains visible when motion is reduced or JS is unavailable.
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js-motion');
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.section-intro,.menu-heading,.story__copy,.gallery-heading,.cake-intro,.reviews-heading,.visit-heading,.review-card').forEach((element) => {
    element.setAttribute('data-reveal', ''); revealObserver.observe(element);
  });
}
