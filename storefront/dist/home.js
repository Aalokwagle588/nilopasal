(() => {
  const safeCart = () => {
    try { const value = JSON.parse(localStorage.getItem('nilopasal-cart') || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const count = safeCart().reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
  const badge = document.querySelector('#home-cart-count');
  if (badge) badge.textContent = String(count);

  document.querySelector('#home-search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('q')?.toString().trim();
    location.href = query ? `./shop.html?q=${encodeURIComponent(query)}` : './shop.html';
  });

  const menu = document.querySelector('#category-menu');
  const nav = document.querySelector('#nav-links');
  menu?.addEventListener('click', () => {
    const open = nav?.classList.toggle('is-open') || false;
    menu.setAttribute('aria-expanded', String(open));
  });

  const dialog = document.querySelector('#coming-dialog');
  const title = document.querySelector('#coming-title');
  document.querySelectorAll('[data-coming]').forEach((trigger) => trigger.addEventListener('click', () => {
    const subject = trigger.dataset.coming;
    if (title) title.textContent = `${subject || 'Nilopasal Business Marketplace'} is coming soon.`;
    dialog?.showModal();
  }));
  dialog?.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
  dialog?.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
})();
