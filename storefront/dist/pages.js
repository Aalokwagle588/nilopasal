const PRODUCTS = [
  { id: 'fd-101', name: 'Studio Pro Wireless Headphones', category: 'Electronics', image: './assets/headphones.jpg', price: 4499, original: 6499, discount: 31, rating: 4.8, reviews: 126, label: 'Best seller', description: 'Immersive sound, all-day comfort and a battery made for your everyday playlists.' },
  { id: 'fd-102', name: 'ActiveFit Smart Watch S2', category: 'Wearables', image: './assets/smartwatch.jpg', price: 3299, original: 4999, discount: 34, rating: 4.7, reviews: 89, label: 'Popular', description: 'A light, capable smartwatch for movement, calls and a more mindful day.' },
  { id: 'fd-103', name: 'BrewMate Compact Coffee Maker', category: 'Appliances', image: './assets/coffee-maker.jpg', price: 5799, original: 7499, discount: 23, rating: 4.9, reviews: 74, label: 'Top rated', description: 'Cafe-style mornings at home with a compact footprint and easy-clean design.' },
  { id: 'fd-104', name: 'Everyday Runner Sneakers', category: 'Fashion', image: './assets/sneakers.jpg', price: 2699, original: 3999, discount: 33, rating: 4.6, reviews: 214, label: 'Best seller', description: 'Easy everyday sneakers with a lightweight sole and all-day support.' },
  { id: 'fp-201', name: 'Nova 5G Smartphone — 128 GB', category: 'Mobile', image: './assets/smartphone.jpg', price: 37999, original: 42999, discount: 12, rating: 4.8, reviews: 98, label: 'Best seller', description: 'A bright, fast 5G phone with a smooth camera-first experience.' },
  { id: 'fp-202', name: 'Dewdrop Brightening Face Serum', category: 'Beauty', image: './assets/skincare.jpg', price: 1299, original: 1599, discount: 19, rating: 4.7, reviews: 182, label: 'New', description: 'A light daily serum with a fresh, comfortable finish.' },
  { id: 'fp-203', name: 'Trailway Everyday Backpack', category: 'Sports', image: './assets/backpack.jpg', price: 2499, original: 2999, discount: 17, rating: 4.6, reviews: 67, description: 'A structured daypack for campus, commutes and weekend plans.' },
  { id: 'fp-208', name: 'Fresh Market Pantry Box', category: 'Grocery', image: './assets/grocery.jpg', price: 1899, original: 2199, discount: 14, rating: 4.9, reviews: 143, description: 'A thoughtful pantry edit for quick, easy meals.' },
  { id: 'na-303', name: 'City Edit Relaxed Overshirt', category: 'Fashion', image: './assets/fashion.jpg', price: 2999, rating: 4.6, reviews: 27, label: 'New', description: 'An easy layer with a relaxed cut for cool mornings and late evenings.' },
  { id: 'na-304', name: 'RoamLite Commuter Backpack', category: 'Sports', image: './assets/backpack.jpg', price: 2799, rating: 4.8, reviews: 19, label: 'New', description: 'A lighter commuter bag with room for the essentials.' }
];

const money = (value) => `Rs. ${value.toLocaleString('en-IN')}`;
const getCart = () => JSON.parse(localStorage.getItem('nilopasal-cart') || '[]');
const saveCart = (cart) => localStorage.setItem('nilopasal-cart', JSON.stringify(cart));
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const getProduct = (id) => PRODUCTS.find((product) => product.id === id) || PRODUCTS[0];
const API_BASE = window.NILOPASAL_API_BASE || localStorage.getItem('nilopasal-api-base') || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:4000' : '');

async function apiRequest(path, options = {}) {
  if (typeof window.nilopasalApiRequest === 'function') {
    return window.nilopasalApiRequest(path, options);
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new Error('Could not reach the Nilopasal API. Start the backend on port 4000 or set nilopasal-api-base in localStorage.');
  }
  const payload = await response.json().catch(() => null);
  if (!payload) throw new Error('The Nilopasal API is not available from this site yet. Configure an API base URL before using account login.');
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || 'Request failed. Please try again.');
  return payload.data;
}

function header() {
  return `<div class="page-service">Delivering across Nepal <span>100% genuine products</span><span>Easy returns</span><span>Help &amp; support</span></div>
  <header class="page-header"><div class="page-header__inner"><a class="page-brand" href="./index.html"><span class="page-brand__mark">N</span><span><strong>Nilopasal<span>.com</span></strong><small>SHOP SMART · LIVE BETTER</small></span></a><form class="page-search" id="page-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg><input type="search" placeholder="Search products, brands and categories" aria-label="Search products" /><button>Search</button></form><nav class="page-actions" aria-label="Account actions"><a href="./account.html">Account</a><a href="./wishlist.html">Wishlist</a><a class="page-cart-link" href="./cart.html">Cart <b>0</b></a></nav></div><nav class="page-nav"><a href="./shop.html">All Categories</a><a href="./shop.html?category=Electronics">Electronics</a><a href="./shop.html?category=Fashion">Fashion</a><a href="./shop.html?category=Home">Home &amp; Living</a><a href="./shop.html?category=Beauty">Beauty</a><a href="./shop.html?category=Mobile">Mobile &amp; Accessories</a><a href="./shop.html?category=Appliances">Appliances</a><a href="./shop.html?category=Grocery">Grocery</a><a href="./shop.html?category=Sports">Sports</a></nav></header>`;
}

function footer() {
  return `<footer class="page-footer"><div class="page-footer__grid"><div><a class="page-brand page-brand--footer" href="./index.html"><span class="page-brand__mark">N</span><span><strong>Nilopasal<span>.com</span></strong><small>SHOP SMART · LIVE BETTER</small></span></a><p>Your trusted online shopping destination for quality products, fair prices and dependable delivery across Nepal.</p></div><div><h3>Shop</h3><a href="./shop.html">Categories</a><a href="./shop.html?sort=new">New arrivals</a><a href="./shop.html?sort=popular">Best sellers</a><a href="./shop.html?sort=deal">Offers</a></div><div><h3>Customer service</h3><a href="./support.html">Contact us</a><a href="./support.html#faq">FAQ</a><a href="./support.html#shipping">Shipping</a><a href="./support.html#returns">Returns &amp; refunds</a></div><div><h3>Information</h3><a href="./account.html">Order tracking</a><a href="./index.html#trust-title">About Nilopasal</a><a href="./support.html#privacy">Privacy policy</a></div></div><div class="page-footer__bottom"><span>© 2026 Nilopasal. All rights reserved.</span><span>Secure payments: eSewa · Khalti · Cash on Delivery</span></div></footer>`;
}

function card(product) {
  return `<article class="page-product-card"><a class="page-product-card__media" href="./product.html?id=${product.id}">${product.discount ? `<span class="page-badge page-badge--orange">-${product.discount}%</span>` : ''}${product.label ? `<span class="page-badge">${escapeHtml(product.label)}</span>` : ''}<button class="page-heart" data-wish="${product.id}" type="button" aria-label="Save ${escapeHtml(product.name)}">♡</button><img src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy" /></a><div class="page-product-card__body"><small>${escapeHtml(product.category)}</small><h3><a href="./product.html?id=${product.id}">${escapeHtml(product.name)}</a></h3><div class="page-rating">★★★★★ <span>${product.rating} (${product.reviews})</span></div><div class="page-product-card__foot"><div><strong>${money(product.price)}</strong>${product.original ? `<del>${money(product.original)}</del>` : ''}</div><button class="page-add" data-add="${product.id}" type="button" aria-label="Add ${escapeHtml(product.name)} to cart">+</button></div></div></article>`;
}

function shell(content, title) {
  document.title = `${title} — Nilopasal`;
  document.querySelector('#app').innerHTML = `${header()}<main class="page-main">${content}</main>${footer()}<div class="page-toast" id="page-toast" role="status" aria-live="polite"></div>`;
  updateCartCount();
}

function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll('.page-cart-link b').forEach((el) => { el.textContent = count; });
}

function toast(message) {
  const element = document.querySelector('#page-toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('is-visible');
  window.setTimeout(() => element.classList.remove('is-visible'), 2400);
}

function addToCart(id, qty = 1) {
  const cart = getCart();
  const existing = cart.find((item) => item.id === id);
  if (existing) existing.qty += qty; else cart.push({ id, qty });
  saveCart(cart); updateCartCount(); toast(`${getProduct(id).name} added to your cart.`);
}

function renderShop() {
  const params = new URLSearchParams(location.search);
  const category = params.get('category') || 'All products';
  let products = PRODUCTS.filter((product) => category === 'All products' || product.category === category || (category === 'Electronics' && product.category === 'Wearables') || (category === 'Home' && product.category === 'Appliances'));
  const sort = params.get('sort');
  if (sort === 'new') products = [...products].reverse();
  if (sort === 'popular') products.sort((a, b) => b.reviews - a.reviews);
  if (sort === 'deal') products.sort((a, b) => (b.discount || 0) - (a.discount || 0));
  shell(`<section class="shop-hero"><span class="section-kicker">Explore Nilopasal</span><h1>Good finds, made simple.</h1><p>Shop trusted picks across everyday categories with fast delivery across supported locations.</p></section><div class="shop-toolbar"><div><span class="section-kicker">Browse</span><h2>${escapeHtml(category)}</h2><small>${products.length} products</small></div><label>Sort <select id="shop-sort"><option value="">Recommended</option><option value="new">New arrivals</option><option value="popular">Most loved</option><option value="deal">Biggest savings</option></select></label></div><div class="shop-layout"><aside class="shop-filters"><strong>Shop by category</strong>${['All products','Electronics','Fashion','Home','Beauty','Mobile','Appliances','Grocery','Sports'].map((item) => `<a class="${item === category ? 'is-active' : ''}" href="./shop.html${item === 'All products' ? '' : `?category=${item}`} ">${item}</a>`).join('')}<div class="filter-note"><strong>Need help choosing?</strong><p>Talk to our support team about delivery, returns or product questions.</p><a href="./support.html">Get support →</a></div></aside><div class="shop-grid">${products.map(card).join('')}</div></div>`, `${category} products`);
  document.querySelector('#shop-sort').value = sort || '';
  document.querySelector('#shop-sort').addEventListener('change', (event) => { const next = new URLSearchParams(location.search); if (event.target.value) next.set('sort', event.target.value); else next.delete('sort'); location.search = next.toString(); });
}

function renderProduct() {
  const product = getProduct(new URLSearchParams(location.search).get('id'));
  shell(`<div class="breadcrumbs"><a href="./index.html">Home</a><span>›</span><a href="./shop.html?category=${product.category}">${product.category}</a><span>›</span><strong>${escapeHtml(product.name)}</strong></div><section class="product-detail"><div class="product-detail__image"><img src="${product.image}" alt="${escapeHtml(product.name)}" /></div><div class="product-detail__copy"><span class="section-kicker">${escapeHtml(product.category)}</span><h1>${escapeHtml(product.name)}</h1><div class="page-rating page-rating--large">★★★★★ <span>${product.rating} · ${product.reviews} reviews</span></div><div class="product-detail__price"><strong>${money(product.price)}</strong>${product.original ? `<del>${money(product.original)}</del><span>Save ${money(product.original - product.price)}</span>` : ''}</div><p>${escapeHtml(product.description)}</p><ul class="product-benefits"><li>Genuine product promise</li><li>Delivery across supported locations</li><li>Easy returns on eligible items</li></ul><div class="product-detail__actions"><div class="qty-control"><button data-qty="-1" type="button">−</button><span id="qty">1</span><button data-qty="1" type="button">+</button></div><button class="button button--orange page-detail-add" data-add="${product.id}" type="button">Add to cart <span>→</span></button><button class="detail-wish" data-wish="${product.id}" type="button">♡</button></div><p class="sold-note">Secure checkout · eSewa · Khalti · Cash on Delivery</p></div></section><section class="detail-lower"><div><span class="section-kicker">Details</span><h2>Made for your everyday.</h2><p>${escapeHtml(product.description)} Designed for straightforward use, reliable value and a little more ease in your day.</p></div><div class="detail-trust"><span>✓</span><div><strong>Nilopasal quality check</strong><small>Every product is reviewed before it reaches our store.</small></div></div></section>`, product.name);
  let qty = 1;
  document.querySelectorAll('[data-qty]').forEach((button) => button.addEventListener('click', () => { qty = Math.max(1, qty + Number(button.dataset.qty)); document.querySelector('#qty').textContent = qty; }));
  document.querySelector('.page-detail-add').addEventListener('click', () => addToCart(product.id, qty));
}

function renderCart() {
  const cart = getCart();
  const rows = cart.map((item) => ({ ...getProduct(item.id), qty: item.qty }));
  const subtotal = rows.reduce((sum, item) => sum + item.price * item.qty, 0);
  shell(`<div class="page-title-row"><div><span class="section-kicker">Your bag</span><h1>Shopping cart</h1></div><a href="./shop.html">Continue shopping →</a></div>${rows.length ? `<div class="cart-layout"><section class="cart-items"><div class="cart-items__head"><span>Product</span><span>Quantity</span><span>Total</span></div>${rows.map((item) => `<article class="cart-row"><img src="${item.image}" alt="${escapeHtml(item.name)}" /><div><small>${escapeHtml(item.category)}</small><h2><a href="./product.html?id=${item.id}">${escapeHtml(item.name)}</a></h2><strong>${money(item.price)}</strong></div><div class="cart-qty"><button data-cart-qty="-1" data-id="${item.id}">−</button><span>${item.qty}</span><button data-cart-qty="1" data-id="${item.id}">+</button></div><strong>${money(item.price * item.qty)}</strong><button class="cart-remove" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">×</button></article>`).join('')}</section><aside class="cart-summary"><h2>Order summary</h2><div><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div><span>Delivery</span><strong class="free">Free</strong></div><hr /><div class="cart-total"><span>Total</span><strong>${money(subtotal)}</strong></div><button class="button button--orange cart-checkout" type="button">Proceed to checkout <span>→</span></button><p>Secure payments with eSewa, Khalti or Cash on Delivery.</p></aside></div>` : `<div class="empty-state"><div>◌</div><h2>Your cart is waiting for a good find.</h2><p>Browse our latest picks and add something that makes your day easier.</p><a class="button button--orange" href="./shop.html">Start shopping <span>→</span></a></div>`}`, 'Shopping cart');
  document.querySelectorAll('[data-cart-qty]').forEach((button) => button.addEventListener('click', () => { const next = getCart(); const item = next.find((row) => row.id === button.dataset.id); item.qty += Number(button.dataset.cartQty); if (item.qty <= 0) next.splice(next.indexOf(item), 1); saveCart(next); renderCart(); }));
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => { saveCart(getCart().filter((row) => row.id !== button.dataset.remove)); renderCart(); }));
  document.querySelector('.cart-checkout')?.addEventListener('click', () => { if (getCart().length) location.href = './checkout.html'; else toast('Add an item before checkout.'); });
}

function renderAccount() {
  shell(`<section class="account-wrap"><div class="account-intro"><span class="section-kicker">Welcome back</span><h1>Your Nilopasal account.</h1><p>Sign in or create an account to track orders, save favourites, manage delivery details and keep your shopping secure.</p><div class="account-benefit"><span>✓</span><div><strong>Secure session login</strong><small>Your account is protected by an HTTP-only session cookie from the Nilopasal API.</small></div></div></div><div class="account-panel"><div class="account-tabs" role="tablist" aria-label="Account access"><button class="is-active" type="button" data-auth-tab="login">Login</button><button type="button" data-auth-tab="signup">Sign up</button></div><form class="account-form account-auth-form" id="login-form" data-auth-panel="login"><span class="section-kicker">Sign in</span><h2>Good to see you.</h2><label>Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></label><label>Password<input name="password" type="password" autocomplete="current-password" required placeholder="Enter your password" /></label><button class="button button--orange" type="submit">Sign in <span>→</span></button><p class="auth-message" data-auth-message="login"></p></form><form class="account-form account-auth-form is-hidden" id="signup-form" data-auth-panel="signup"><span class="section-kicker">Create account</span><h2>Start shopping smarter.</h2><div class="auth-name-grid"><label>First name<input name="firstName" autocomplete="given-name" required placeholder="Aalok" /></label><label>Last name<input name="lastName" autocomplete="family-name" required placeholder="Wagle" /></label></div><label>Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></label><label>Phone number <small>Optional</small><input name="phone" autocomplete="tel" placeholder="98XXXXXXXX" /></label><label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="8+ chars, uppercase, lowercase, number" /></label><button class="button button--orange" type="submit">Create account <span>→</span></button><p class="auth-message" data-auth-message="signup"></p></form><section class="account-form account-profile is-hidden" id="account-profile" aria-live="polite"><span class="section-kicker">Signed in</span><h2 id="account-profile-name">Your account is active.</h2><p id="account-profile-email"></p><div class="account-profile-card"><span>Account roles</span><strong id="account-profile-roles">Customer</strong></div><button class="button button--orange" type="button" id="logout-button">Logout <span>→</span></button></section></div></section><section class="account-orders"><div><span class="section-kicker">Order tracking</span><h2>Your recent orders</h2><p>Sign in to see order details and delivery updates.</p></div><div class="order-placeholder"><span>⌁</span><strong>No orders loaded yet.</strong><small>Your real order history will appear after login and checkout integration.</small></div></section>`, 'Account');

  const showAuthMessage = (type, message, isError = false) => {
    const element = document.querySelector(`[data-auth-message="${type}"]`);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', isError);
  };

  const showPanel = (name) => {
    document.querySelectorAll('[data-auth-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.authTab === name));
    document.querySelectorAll('[data-auth-panel]').forEach((panel) => panel.classList.toggle('is-hidden', panel.dataset.authPanel !== name));
    document.querySelector('#account-profile')?.classList.add('is-hidden');
  };

  const showProfile = (user) => {
    document.querySelectorAll('[data-auth-panel]').forEach((panel) => panel.classList.add('is-hidden'));
    document.querySelector('#account-profile')?.classList.remove('is-hidden');
    document.querySelector('#account-profile-name').textContent = `${user.firstName} ${user.lastName}`;
    document.querySelector('#account-profile-email').textContent = user.email;
    const roles = user.roles || ['CUSTOMER'];
    document.querySelector('#account-profile-roles').textContent = roles.map((role) => role.replaceAll('_', ' ').toLowerCase()).join(', ');

    let retailerLink = document.querySelector('#profile-retailer-link');
    if (!retailerLink) {
      retailerLink = document.createElement('div');
      retailerLink.id = 'profile-retailer-link';
      retailerLink.style.margin = '16px 0';
      document.querySelector('#logout-button')?.before(retailerLink);
    }
    const isRetailer = roles.includes('RETAILER');
    retailerLink.innerHTML = isRetailer
      ? '<a href="./retailer-dashboard.html" class="button" style="display:inline-block; padding:11px 18px; background:#1c56d9; color:#fff; font-weight:700; border-radius:9px; text-decoration:none;">Open Retailer ERP Dashboard →</a>'
      : '<p style="font-size:13px; color:#536580; margin:0;">Are you a shop owner? <a href="./retailer-register.html" style="color:#1c56d9; font-weight:700;">Register for Retailer ERP →</a></p>';
  };

  document.querySelectorAll('[data-auth-tab]').forEach((button) => button.addEventListener('click', () => showPanel(button.dataset.authTab)));

  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    showAuthMessage('login', 'Signing in...');
    const form = new FormData(event.currentTarget);
    try {
      const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      showProfile(data.user);
      toast('You are signed in.');
    } catch (error) {
      showAuthMessage('login', error.message, true);
    }
  });

  document.querySelector('#signup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    showAuthMessage('signup', 'Creating your account...');
    const form = new FormData(event.currentTarget);
    try {
      const data = await apiRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      showProfile(data.user);
      toast('Your account has been created.');
    } catch (error) {
      showAuthMessage('signup', error.message, true);
    }
  });

  document.querySelector('#logout-button').addEventListener('click', async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      showPanel('login');
      toast('You are signed out.');
    } catch (error) {
      toast(error.message);
    }
  });

  apiRequest('/api/auth/me')
    .then((data) => showProfile(data.user))
    .catch(() => showPanel(location.hash === '#signup' || location.hash === '#register' ? 'signup' : 'login'));
}

function renderWishlist() {
  shell(`<div class="page-title-row"><div><span class="section-kicker">Saved for later</span><h1>Your wishlist</h1></div><a href="./shop.html">Discover more products →</a></div><div class="wishlist-grid">${PRODUCTS.slice(0, 6).map(card).join('')}</div>`, 'Wishlist');
}

function renderSupport() {
  shell(`<section class="support-hero"><span class="section-kicker">We are here to help</span><h1>How can we make shopping easier?</h1><p>Find quick answers or send our team a note. We are happy to help with orders, delivery and returns.</p><a class="button button--orange" href="#contact">Contact support <span>→</span></a></section><section class="support-grid" id="faq"><article><span>01</span><h2>Where is my order?</h2><p>Sign in to your account to view the latest delivery status and order details.</p><a href="./account.html">Track an order →</a></article><article id="shipping"><span>02</span><h2>Shipping &amp; delivery</h2><p>We deliver across supported locations in Nepal. Delivery timing is shown during checkout.</p><a href="#contact">Ask about delivery →</a></article><article id="returns"><span>03</span><h2>Returns &amp; refunds</h2><p>Eligible products can be returned easily. Our support team will guide you through the next steps.</p><a href="#contact">Start a return →</a></article></section><section class="contact-panel" id="contact"><div><span class="section-kicker">Talk to us</span><h2>Send a message</h2><p>Share a little context and our team will get back to you.</p></div><form id="support-form"><label>Name<input required placeholder="Your name" /></label><label>Email<input type="email" required placeholder="you@example.com" /></label><label>How can we help?<textarea required rows="3" placeholder="Tell us what you need"></textarea></label><button class="button button--orange" type="submit">Send message <span>→</span></button></form></section>`, 'Support');
  document.querySelector('#support-form').addEventListener('submit', (event) => { event.preventDefault(); toast('Thanks — your message is ready for our support team.'); event.currentTarget.reset(); });
}

function renderCheckout() {
  shell(`<div class="page-title-row"><div><span class="section-kicker">Secure checkout</span><h1>Complete your order</h1></div><a href="./cart.html">← Back to cart</a></div><section class="checkout-layout"><form class="checkout-form" id="checkout-form"><h2>Delivery details</h2><div class="form-grid"><label>Full name<input required placeholder="Your full name"></label><label>Phone number<input required placeholder="98XXXXXXXX"></label><label>Email address<input type="email" required placeholder="you@example.com"></label><label>Province<select required><option value="">Select province</option><option>Bagmati</option><option>Gandaki</option><option>Lumbini</option><option>Koshi</option><option>Madhesh</option><option>Karnali</option><option>Sudurpashchim</option></select></label><label>District<input required placeholder="Kathmandu"></label><label>City / municipality<input required placeholder="Your city"></label><label class="full">Street / Tole<input required placeholder="Address details"></label><label class="full">Delivery notes<textarea rows="3" placeholder="Optional delivery instructions"></textarea></label></div><h2>Payment method</h2><label class="payment-choice"><input type="radio" name="payment" checked> Cash on Delivery <small>Pay when your order arrives</small></label><label class="payment-choice"><input type="radio" name="payment"> eSewa / Khalti <small>Provider integration ready for secure credentials</small></label><button class="button button--orange" type="submit">Place order <span>→</span></button></form><aside class="cart-summary checkout-summary"><h2>Order summary</h2><div><span>Items</span><strong>${money(getCart().reduce((sum, item) => sum + getProduct(item.id).price * item.qty, 0))}</strong></div><div><span>Delivery</span><strong class="free">Free</strong></div><hr><div class="cart-total"><span>Total</span><strong>${money(getCart().reduce((sum, item) => sum + getProduct(item.id).price * item.qty, 0))}</strong></div><p>Secure payments with eSewa, Khalti or Cash on Delivery.</p></aside></section>`, 'Checkout');
  document.querySelector('#checkout-form').addEventListener('submit', (event) => { event.preventDefault(); localStorage.removeItem('nilopasal-cart'); location.href = './order-confirmation.html'; });
}

function renderConfirmation() { shell(`<div class="empty-state confirmation"><div>✓</div><span class="section-kicker">Order received</span><h1>Thank you for shopping with Nilopasal.</h1><p>Your order has been placed. We will confirm delivery details shortly.</p><a class="button button--orange" href="./shop.html">Continue shopping <span>→</span></a></div>`, 'Order confirmed'); }

function renderInfo() {
  const content = { about: ['About Nilopasal','A simpler, more trustworthy way to shop in Nepal.','We bring together quality everyday products, clear pricing and dependable delivery in one calm shopping experience.'], contact: ['Contact us','We are here to help.','For order support, delivery questions or product help, visit our support centre and send us a message.'], faq: ['Frequently asked questions','Quick answers for a smoother shopping experience.','Orders, delivery, returns and payments are handled with clarity. Our support team is ready when you need us.'], 'privacy-policy': ['Privacy policy','Your trust matters to us.','We only use account and order information to operate Nilopasal, support customers and improve the shopping experience.'], 'terms-and-conditions': ['Terms & conditions','Clear terms for confident shopping.','Product availability, pricing, delivery windows and returns are confirmed at checkout and in your order details.'], 'shipping-policy': ['Shipping policy','Delivery across supported locations in Nepal.','Delivery timing and charges depend on your location and are shown before you place an order.'], 'return-refund-policy': ['Returns & refunds','Easy support when something is not right.','Eligible items can be returned according to the product and order conditions. Contact support to get started.'] }[document.body.dataset.page] || ['Nilopasal','Shop smart. Live better.','Discover quality products at fair prices with fast and reliable delivery.'];
  shell(`<section class="support-hero"><span class="section-kicker">Nilopasal</span><h1>${content[0]}</h1><p>${content[1]}</p></section><section class="info-copy"><h2>${content[2]}</h2><p>Our goal is to make online shopping feel straightforward, human and dependable—from the first search to the moment your order arrives.</p><a class="button button--orange" href="./shop.html">Start shopping <span>→</span></a></section>`, content[0]);
}

document.addEventListener('click', (event) => {
  const addButton = event.target.closest('[data-add]');
  const wishButton = event.target.closest('[data-wish]');
  if (addButton) { event.preventDefault(); addToCart(addButton.dataset.add, Number(document.querySelector('#qty')?.textContent || 1)); }
  if (wishButton) { event.preventDefault(); wishButton.classList.toggle('is-saved'); wishButton.textContent = wishButton.classList.contains('is-saved') ? '♥' : '♡'; toast(wishButton.classList.contains('is-saved') ? 'Saved to your wishlist.' : 'Removed from your wishlist.'); }
});

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'page-search') return;
  event.preventDefault();
  const value = event.target.querySelector('input').value.trim();
  if (value) location.href = `./shop.html?q=${encodeURIComponent(value)}`;
});

const page = document.body.dataset.page;
if (page === 'shop') renderShop();
if (page === 'product') renderProduct();
if (page === 'cart') renderCart();
if (page === 'account') renderAccount();
if (page === 'wishlist') renderWishlist();
if (page === 'support') renderSupport();
if (page === 'checkout') renderCheckout();
if (page === 'order-confirmation') renderConfirmation();
if (['about','contact','faq','privacy-policy','terms-and-conditions','shipping-policy','return-refund-policy'].includes(page)) renderInfo();
