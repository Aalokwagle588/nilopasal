const menuButton = document.querySelector('.mobile-menu');
const categoryNav = document.querySelector('.category-nav');
const cartCount = document.querySelector('.cart-count');
const cartButton = document.querySelector('.cart-button');
const toast = document.querySelector('#toast');
const searchFeedback = document.querySelector('#search-feedback');

// Phase 1 renders Nilopasal-owned inventory only. Commerce metadata stays outside
// the card renderer so seller, offer and fulfilment data can be added later.
const commerce = { channel: 'nilopasal', sellerId: 'nilopasal-direct', fulfilment: 'first-party' };

const catalog = {
  flash: [
    { id: 'fd-101', name: 'Studio Pro Wireless Headphones', category: 'Electronics', image: './assets/headphones.jpg', price: 4499, original: 6499, discount: 31, rating: 4.8, reviews: 126, commerce },
    { id: 'fd-102', name: 'ActiveFit Smart Watch S2', category: 'Wearables', image: './assets/smartwatch.jpg', price: 3299, original: 4999, discount: 34, rating: 4.7, reviews: 89, commerce },
    { id: 'fd-103', name: 'BrewMate Compact Coffee Maker', category: 'Appliances', image: './assets/coffee-maker.jpg', price: 5799, original: 7499, discount: 23, rating: 4.9, reviews: 74, commerce },
    { id: 'fd-104', name: 'Everyday Runner Sneakers', category: 'Fashion', image: './assets/sneakers.jpg', price: 2699, original: 3999, discount: 33, rating: 4.6, reviews: 214, commerce }
  ],
  featured: [
    { id: 'fp-201', name: 'Nova 5G Smartphone — 128 GB', category: 'Mobile', image: './assets/smartphone.jpg', price: 37999, original: 42999, discount: 12, rating: 4.8, reviews: 98, label: 'Best seller', commerce },
    { id: 'fp-202', name: 'Dewdrop Brightening Face Serum', category: 'Beauty', image: './assets/skincare.jpg', price: 1299, original: 1599, discount: 19, rating: 4.7, reviews: 182, label: 'New', commerce },
    { id: 'fp-203', name: 'Trailway Everyday Backpack', category: 'Sports', image: './assets/backpack.jpg', price: 2499, original: 2999, discount: 17, rating: 4.6, reviews: 67, commerce },
    { id: 'fp-204', name: 'BrewMate Compact Coffee Maker', category: 'Appliances', image: './assets/coffee-maker.jpg', price: 5799, original: 7499, discount: 23, rating: 4.9, reviews: 74, label: 'Top rated', commerce },
    { id: 'fp-205', name: 'Studio Pro Wireless Headphones', category: 'Electronics', image: './assets/headphones.jpg', price: 4499, original: 6499, discount: 31, rating: 4.8, reviews: 126, commerce },
    { id: 'fp-206', name: 'Everyday Runner Sneakers', category: 'Fashion', image: './assets/sneakers.jpg', price: 2699, original: 3999, discount: 33, rating: 4.6, reviews: 214, label: 'Best seller', commerce },
    { id: 'fp-207', name: 'ActiveFit Smart Watch S2', category: 'Wearables', image: './assets/smartwatch.jpg', price: 3299, original: 4999, discount: 34, rating: 4.7, reviews: 89, commerce },
    { id: 'fp-208', name: 'Fresh Market Pantry Box', category: 'Grocery', image: './assets/grocery.jpg', price: 1899, original: 2199, discount: 14, rating: 4.9, reviews: 143, commerce }
  ],
  newArrivals: [
    { id: 'na-301', name: 'Dewdrop Hydration Skincare Set', category: 'Beauty', image: './assets/skincare.jpg', price: 2199, rating: 4.8, reviews: 32, label: 'New', commerce },
    { id: 'na-302', name: 'Nova Air Smartphone — 256 GB', category: 'Mobile', image: './assets/smartphone.jpg', price: 45999, rating: 4.7, reviews: 41, label: 'New', commerce },
    { id: 'na-303', name: 'City Edit Relaxed Overshirt', category: 'Fashion', image: './assets/fashion.jpg', price: 2999, rating: 4.6, reviews: 27, label: 'New', commerce },
    { id: 'na-304', name: 'RoamLite Commuter Backpack', category: 'Sports', image: './assets/backpack.jpg', price: 2799, rating: 4.8, reviews: 19, label: 'New', commerce }
  ],
  bestSellers: [
    { id: 'bs-401', name: 'ActiveFit Smart Watch S2', category: 'Wearables', image: './assets/smartwatch.jpg', price: 3299, original: 4999, discount: 34, rating: 4.7, reviews: 89, label: 'Best seller', commerce },
    { id: 'bs-402', name: 'Everyday Runner Sneakers', category: 'Fashion', image: './assets/sneakers.jpg', price: 2699, original: 3999, discount: 33, rating: 4.6, reviews: 214, label: 'Best seller', commerce },
    { id: 'bs-403', name: 'Dewdrop Brightening Face Serum', category: 'Beauty', image: './assets/skincare.jpg', price: 1299, original: 1599, discount: 19, rating: 4.7, reviews: 182, label: 'Best seller', commerce },
    { id: 'bs-404', name: 'BrewMate Compact Coffee Maker', category: 'Appliances', image: './assets/coffee-maker.jpg', price: 5799, original: 7499, discount: 23, rating: 4.9, reviews: 74, label: 'Best seller', commerce }
  ]
};

const money = (value) => `Rs. ${value.toLocaleString('en-IN')}`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const heartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
const cartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 7H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';

function productCard(product) {
  const name = escapeHtml(product.name);
  const originalPrice = product.original ? `<del>${money(product.original)}</del>` : '<span class="price-spacer" aria-hidden="true">&nbsp;</span>';
  const discountBadge = product.discount ? `<span class="discount-badge">-${product.discount}%</span>` : '';
  const productLabel = product.label ? `<span class="product-label">${escapeHtml(product.label)}</span>` : '';
  const searchable = escapeHtml(`${product.name} ${product.category}`.toLowerCase());
  return `<article class="product-card" data-product-id="${escapeHtml(product.id)}" data-search="${searchable}">
    <div class="product-media">${discountBadge}${productLabel}<button class="wishlist-button" type="button" aria-pressed="false" aria-label="Add ${name} to wishlist">${heartIcon}</button><img src="${escapeHtml(product.image)}" alt="${name}" loading="lazy" /></div>
    <div class="product-info"><span class="product-category">${escapeHtml(product.category)}</span><h3 class="product-name">${name}</h3><div class="product-rating" aria-label="${product.rating} out of 5 stars">★★★★★ <span>${product.rating} (${product.reviews})</span></div><div class="product-footer"><div class="product-price"><strong>${money(product.price)}</strong>${originalPrice}</div><button class="quick-cart" type="button" aria-label="Add ${name} to cart">${cartIcon}</button></div></div>
  </article>`;
}

[['#flash-products', catalog.flash], ['#featured-products', catalog.featured], ['#new-products', catalog.newArrivals], ['#best-seller-products', catalog.bestSellers]].forEach(([selector, products]) => {
  document.querySelector(selector)?.insertAdjacentHTML('beforeend', products.map(productCard).join(''));
});

let cartItems = Number(cartCount?.textContent || 0);
let toastTimer;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

menuButton?.addEventListener('click', () => {
  const isOpen = categoryNav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});

document.addEventListener('click', (event) => {
  const cartControl = event.target.closest('.quick-cart');
  const wishlistControl = event.target.closest('.wishlist-button');
  if (cartControl) {
    const name = cartControl.closest('.product-card')?.querySelector('.product-name')?.textContent || 'Product';
    cartItems += 1;
    cartCount.textContent = String(cartItems);
    cartButton?.setAttribute('aria-label', `Cart, ${cartItems} items`);
    cartControl.classList.add('is-added');
    cartControl.innerHTML = '<span aria-hidden="true">✓</span>';
    cartControl.setAttribute('aria-label', `${name} added to cart`);
    showToast(`${name} added to your cart.`);
    window.setTimeout(() => { cartControl.classList.remove('is-added'); cartControl.innerHTML = cartIcon; cartControl.setAttribute('aria-label', `Add ${name} to cart`); }, 1400);
  }
  if (wishlistControl) {
    const name = wishlistControl.closest('.product-card')?.querySelector('.product-name')?.textContent || 'Product';
    const isSaved = wishlistControl.classList.toggle('is-saved');
    wishlistControl.setAttribute('aria-pressed', String(isSaved));
    wishlistControl.setAttribute('aria-label', `${isSaved ? 'Remove' : 'Add'} ${name} ${isSaved ? 'from' : 'to'} wishlist`);
    showToast(isSaved ? `${name} saved to your wishlist.` : `${name} removed from your wishlist.`);
  }
});

function runSearch(query) {
  const normalizedQuery = query.trim().toLowerCase();
  const cards = [...document.querySelectorAll('.product-card')];
  cards.forEach((card) => { card.hidden = Boolean(normalizedQuery) && !card.dataset.search.includes(normalizedQuery); });
  document.querySelectorAll('.search input').forEach((input) => { input.value = query; });
  if (normalizedQuery) {
    searchFeedback.hidden = false;
    const visibleCount = cards.filter((card) => !card.hidden).length;
    searchFeedback.textContent = visibleCount ? `${visibleCount} products found for “${query.trim()}”. Clear the search to see everything again.` : `No products matched “${query.trim()}”. Try electronics, beauty, fashion or appliances.`;
    searchFeedback.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else searchFeedback.hidden = true;
}

document.querySelectorAll('.search').forEach((form) => {
  form.addEventListener('submit', (event) => { event.preventDefault(); runSearch(form.querySelector('input').value); });
  form.querySelector('input')?.addEventListener('search', (event) => { if (!event.currentTarget.value) runSearch(''); });
});
document.querySelectorAll('.category-card[data-category]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); runSearch(link.dataset.category); }));

let countdownSeconds = (8 * 60 * 60) + (24 * 60) + 16;
window.setInterval(() => {
  countdownSeconds = countdownSeconds > 0 ? countdownSeconds - 1 : (12 * 60 * 60);
  const values = [Math.floor(countdownSeconds / 3600), Math.floor((countdownSeconds % 3600) / 60), countdownSeconds % 60];
  document.querySelectorAll('.countdown strong').forEach((part, index) => { part.textContent = String(values[index]).padStart(2, '0'); });
  document.querySelector('.countdown')?.setAttribute('aria-label', `Sale ends in ${values[0]} hours ${values[1]} minutes ${values[2]} seconds`);
}, 1000);

document.querySelectorAll('[data-scroll]').forEach((control) => control.addEventListener('click', () => {
  const region = document.querySelector(`#${control.dataset.scroll}`);
  region?.scrollBy({ left: Math.min(region.clientWidth || 320, 760) * Number(control.dataset.direction), behavior: 'smooth' });
}));
document.querySelectorAll('.hero-dots button').forEach((dot, index, dots) => dot.addEventListener('click', () => { dots.forEach((item) => item.classList.remove('active')); dot.classList.add('active'); document.querySelector('.hero-dots')?.setAttribute('aria-label', `Slide ${index + 1} of ${dots.length}`); }));

document.querySelector('#newsletter-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = new FormData(event.currentTarget).get('email');
  showToast(`You're in! Deals will be sent to ${email}.`);
  event.currentTarget.reset();
});
