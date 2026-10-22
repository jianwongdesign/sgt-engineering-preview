const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const motionEase = 'cubic-bezier(.16,1,.3,1)';
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#primary-nav');
if (toggle && nav) {
  const mobile = matchMedia('(max-width:760px)');
  const setMenu = (open, returnFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('span').textContent = open ? 'Close' : 'Menu';
    nav.classList.toggle('is-open', open);
    nav.inert = mobile.matches && !open;
    if (returnFocus) toggle.focus({preventScroll:true});
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false, true);
  });
  document.addEventListener('click', e => {
    if (mobile.matches && !e.target.closest('.site-header')) setMenu(false);
  });
  document.addEventListener('focusin', e => {
    if (mobile.matches && !e.target.closest('.site-header')) setMenu(false);
  });
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  mobile.addEventListener('change', () => setMenu(false));
  setMenu(false);
}
// One passive scroll update; header dimensions never change while scrolling.
const header = document.querySelector('.site-header');
if (header) {
  let scheduled = false;
  const updateHeader = () => { header.classList.toggle('is-scrolled', scrollY > 8); scheduled = false; };
  addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateHeader); }
  }, {passive:true});
  updateHeader();
}
document.querySelector('.back-to-top')?.addEventListener('click', event => {
  event.preventDefault();
  scrollTo({top:0, behavior:motionPreference.matches ? 'instant' : 'smooth'});
  document.querySelector('.brand')?.focus({preventScroll:true});
});

const filters = document.querySelectorAll('[data-filter]');
const projects = document.querySelectorAll('[data-sector]');
const count = document.querySelector('.filter-count');
function filterProjects(sector) {
  let visible = 0;
  projects.forEach(project => { const show = sector === 'all' || project.dataset.sector === sector; project.hidden = !show; if (show) visible++; });
  filters.forEach(filter => { const active = filter.dataset.filter === sector; filter.classList.toggle('active', active); filter.setAttribute('aria-pressed', String(active)); });
  if (count) count.textContent = `${visible} ${visible === 1 ? 'project' : 'projects'} shown`;
}
let filterTransition;
let requestedSector = 'all';
filters.forEach(filter => filter.addEventListener('click', () => {
  if (filter.dataset.filter === requestedSector) return;
  requestedSector = filter.dataset.filter;
  filterTransition?.skipTransition();
  const update = () => filterProjects(requestedSector);
  if (!motionPreference.matches && document.startViewTransition) {
    const grid = document.querySelector('.project-grid');
    grid?.setAttribute('aria-busy', 'true');
    const transition = document.startViewTransition(update);
    filterTransition = transition;
    transition.ready.catch(() => {}); // Unsupported snapshots still apply the filter.
    transition.finished.catch(() => {}).finally(() => {
      if (filterTransition === transition) { grid?.removeAttribute('aria-busy'); filterTransition = null; }
    });
  } else update();
}));
if (filters.length) filterProjects('all');

// Optional integrations must check this state before loading any tracking code.
(() => {
  const key = 'sgt_cookie_consent_v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const banner = document.querySelector('.cookie-banner');
  const settings = document.querySelector('[data-cookie-settings]');
  let saved;
  let openedFromSettings = false;
  try {
    const candidate = JSON.parse(localStorage.getItem(key));
    if (candidate?.version === 1 && ['essential', 'all'].includes(candidate.choice) && Number.isFinite(candidate.savedAt) && candidate.savedAt <= Date.now() && Date.now() - candidate.savedAt < lifetime) saved = candidate;
  } catch { /* Storage restrictions leave optional consent off. */ }
  const apply = choice => {
    window.sgtConsent = Object.freeze({essential: true, analytics: choice === 'all', marketing: choice === 'all'});
    window.dispatchEvent(new CustomEvent('sgt:consent', {detail: window.sgtConsent}));
  };
  apply(saved?.choice);
  if (!banner) return;
  banner.hidden = Boolean(saved);
  settings?.addEventListener('click', () => { openedFromSettings = true; banner.hidden = false; banner.querySelector('h2').focus({preventScroll:true}); });
  banner.querySelectorAll('[data-cookie-choice]').forEach(button => button.addEventListener('click', () => {
    const choice = button.dataset.cookieChoice;
    apply(choice);
    try { localStorage.setItem(key, JSON.stringify({version:1, choice, savedAt:Date.now()})); }
    catch { /* Consent remains valid in memory for this page only. */ }
    banner.hidden = true;
    if (openedFromSettings) settings?.focus({preventScroll:true});
    else button.blur();
    openedFromSettings = false;
  }));
})();

(() => {
  const timeline = document.querySelector('.project-timeline');
  if (!timeline) return;
  const track = timeline.querySelector('.timeline-track');
  const records = [...track.querySelectorAll('.timeline-record')];
  const previous = timeline.querySelector('[data-timeline-prev]');
  const next = timeline.querySelector('[data-timeline-next]');
  const years = [...timeline.querySelectorAll('[data-timeline-year]')];
  const position = timeline.querySelector('.timeline-position');
  const motion = timeline.querySelector('[data-timeline-motion]');
  // One visual duplicate makes the wrap seamless; assistive technology reads 24 originals.
  const copies = records.map(record => {
    const copy = record.cloneNode(true);
    copy.dataset.timelineCopy = '';
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    track.append(copy);
    return copy;
  });
  const allRecords = [...records, ...copies];
  track.classList.add('has-marquee');
  let frame = 0, lastTime = 0, lastUpdate = 0, offset = 0;
  let inView = false, hovered = timeline.matches(':hover'), touching = false;
  let wanted = !motionPreference.matches, holdUntil = 0, resumeTimer;
  const loopWidth = () => copies[0].offsetLeft - records[0].offsetLeft;
  const hold = () => {
    holdUntil = performance.now() + 1800;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(syncMotion, 1850);
    syncMotion();
  };
  const behavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  const step = () => records.length > 1 ? records[1].offsetLeft - records[0].offsetLeft : track.clientWidth;
  let destination = null;
  const go = index => {
    hold();
    destination = Math.max(0, Math.min(index, records.length - 1));
    track.scrollTo({left:records[destination].offsetLeft - records[0].offsetLeft, behavior:behavior()});
  };
  const current = () => destination ?? Math.round(track.scrollLeft / step());
  previous.addEventListener('click', () => go(current() - 1));
  next.addEventListener('click', () => go(current() + 1));
  years.forEach(button => button.addEventListener('click', () => go(records.findIndex(r => r.dataset.startYear === button.dataset.timelineYear))));
  track.addEventListener('keydown', event => {
    if (event.target !== track || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    go(event.key === 'Home' ? 0 : event.key === 'End' ? records.length - 1 : current() + (event.key === 'ArrowRight' ? 1 : -1));
  });
  const update = () => {
    previous.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= records.at(-1).offsetLeft - records[0].offsetLeft - 2;
    const bounds = track.getBoundingClientRect();
    const visible = allRecords.map((record,index) => ({record,index,bounds:record.getBoundingClientRect()})).filter(item => item.bounds.left < bounds.right - 20 && item.bounds.right > bounds.left + 20);
    if (!visible.length) return;
    const first = visible[0].index % records.length + 1;
    const last = visible.at(-1).index % records.length + 1;
    const label = `${first <= last ? `${first}–${last}` : visible.map(item => item.index % records.length + 1).join(', ')} of ${records.length} projects`;
    if (position.textContent !== label) position.textContent = label;
    years.forEach(button => { const active = button.dataset.timelineYear === visible[0].record.dataset.startYear; button.setAttribute('aria-pressed', String(active)); });
  };
  const tick = time => {
    const elapsed = lastTime ? Math.min(time - lastTime, 64) : 0;
    lastTime = time;
    offset = (offset + elapsed * .032) % loopWidth();
    track.scrollLeft = offset;
    if (time - lastUpdate > 250) { update(); lastUpdate = time; }
    frame = requestAnimationFrame(tick);
  };
  function syncMotion() {
    const focused = timeline.contains(document.activeElement) && document.activeElement !== motion;
    const running = wanted && !motionPreference.matches && inView && !hovered && !focused && !touching && !document.hidden && performance.now() >= holdUntil;
    motion.hidden = motionPreference.matches;
    motion.setAttribute('aria-label', wanted ? 'Pause automatic project scrolling' : 'Play automatic project scrolling');
    motion.querySelector('span').textContent = wanted ? 'Pause' : 'Play';
    motion.classList.toggle('is-paused', !wanted);
    position.setAttribute('aria-live', running ? 'off' : 'polite');
    if (running && !frame) { offset = track.scrollLeft % loopWidth(); lastTime = 0; frame = requestAnimationFrame(tick); }
    if (!running && frame) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; update(); }
  }
  motion.addEventListener('click', () => { wanted = !wanted; syncMotion(); });
  timeline.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; syncMotion(); } });
  timeline.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { hovered = false; syncMotion(); } });
  timeline.addEventListener('focusin', syncMotion);
  timeline.addEventListener('focusout', () => requestAnimationFrame(syncMotion));
  track.addEventListener('pointerdown', () => { touching = true; syncMotion(); }, {passive:true});
  const release = () => { if (touching) { touching = false; hold(); } };
  addEventListener('pointerup', release, {passive:true});
  addEventListener('pointercancel', release, {passive:true});
  track.addEventListener('wheel', hold, {passive:true});
  document.addEventListener('visibilitychange', syncMotion);
  motionPreference.addEventListener('change', () => { wanted = !motionPreference.matches; syncMotion(); });
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncMotion(); }, {threshold:.1}).observe(track);
  let timer;
  track.addEventListener('scroll', () => { if (frame) return; clearTimeout(timer); timer = setTimeout(() => { destination = null; update(); }, 120); }, {passive:true});
  // Mouse dragging complements the native touch pan, arrows and keyboard controls.
  let drag;
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('a,button')) return;
    drag = {id:event.pointerId, x:event.clientX, left:track.scrollLeft, moved:false};
    track.setPointerCapture(event.pointerId);
  });
  track.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    if (!drag.moved && Math.abs(delta) < 6) return;
    drag.moved = true;
    destination = null;
    track.classList.add('is-dragging');
    track.scrollLeft = drag.left - delta;
    event.preventDefault();
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    const id = drag.id;
    drag = null;
    track.classList.remove('is-dragging');
    if (track.hasPointerCapture(id)) track.releasePointerCapture(id);
    if (moved) go(Math.round(track.scrollLeft / step()));
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('lostpointercapture', endDrag);
  new ResizeObserver(() => { destination = null; offset = track.scrollLeft % loopWidth(); update(); }).observe(track);
  update();
})();

// Local decorative video: no download until motion is allowed or explicitly requested.
(() => {
  const video = document.querySelector('#hero-video');
  const button = document.querySelector('.hero-motion');
  if (!video || !button) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  let wanted = !reduced.matches && !connection?.saveData;
  let visible = true;
  let failed = false;
  video.muted = true;
  button.hidden = false;
  const reflect = () => {
    const playing = !video.paused;
    button.classList.toggle('is-playing', playing);
    button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} background video`);
    button.querySelector('span').textContent = `${playing ? 'Pause' : 'Play'} video`;
  };
  const sync = async () => {
    if (!wanted || !visible || document.hidden || failed) { video.pause(); return; }
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    try { await video.play(); } catch { /* Autoplay restrictions leave a working play control and poster. */ }
    reflect();
  };
  video.addEventListener('playing', () => { video.classList.add('is-ready'); reflect(); });
  video.addEventListener('pause', reflect);
  video.addEventListener('error', () => {
    failed = true;
    video.classList.remove('is-ready');
    button.hidden = true;
  });
  button.addEventListener('click', () => { wanted = video.paused; sync(); });
  const preferenceChanged = () => {
    wanted = !reduced.matches && !connection?.saveData;
    if (!wanted) video.classList.remove('is-ready');
    sync();
  };
  reduced.addEventListener('change', preferenceChanged);
  connection?.addEventListener('change', preferenceChanged);
  document.addEventListener('visibilitychange', sync);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    sync();
  }, {threshold: 0.05}).observe(video.closest('.hero'));
  sync();
})();


// Native details remain usable without JavaScript; animation is interruption-safe.
document.querySelectorAll('details.faq').forEach(details => {
  const summary = details.querySelector('summary');
  let animation;
  let expanded = details.open;
  const settle = () => {
    animation?.cancel();
    animation = null;
    details.open = expanded;
    details.style.height = '';
    details.style.overflow = '';
  };
  summary.addEventListener('click', event => {
    if (motionPreference.matches || !details.animate) return;
    event.preventDefault();
    const from = details.getBoundingClientRect().height;
    expanded = animation ? !expanded : !details.open;
    animation?.cancel();
    details.style.height = '';
    details.open = true;
    const border = parseFloat(getComputedStyle(details).borderTopWidth) + parseFloat(getComputedStyle(details).borderBottomWidth);
    const to = expanded ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + border;
    details.style.overflow = 'hidden';
    animation = details.animate({height:[`${from}px`,`${to}px`]}, {duration:expanded ? 280 : 200,easing:motionEase});
    animation.onfinish = settle;
  });
  motionPreference.addEventListener('change', () => { if (animation) settle(); });
  addEventListener('resize', () => { if (animation) settle(); }, {passive:true});
});


// Client marks remain a native scrollable list without JavaScript or with reduced motion.
(() => {
  const section = document.querySelector('.client-section');
  if (!section) return;
  const viewport = section.querySelector('.client-viewport');
  const belt = section.querySelector('.client-belt');
  const list = section.querySelector('.client-list');
  const button = section.querySelector('.client-motion');
  const copy = list.cloneNode(true);
  copy.setAttribute('aria-hidden','true'); copy.inert = true;
  copy.querySelectorAll('img').forEach(img => { img.alt = ''; });
  belt.append(copy);
  section.classList.add('is-enhanced');
  let wanted = true, visible = false, hover = section.matches(':hover'), touching = false;
  const sync = () => {
    const focused = section.contains(document.activeElement) && document.activeElement !== button;
    section.classList.toggle('is-running',wanted && visible && !hover && !touching && !focused && !document.hidden && !motionPreference.matches);
    button.hidden = motionPreference.matches;
    button.classList.toggle('is-paused',!wanted);
    button.setAttribute('aria-label',wanted ? 'Pause client logos' : 'Play client logos');
    button.querySelector('span').textContent = wanted ? 'Pause' : 'Play';
  };
  button.addEventListener('click',() => { wanted = !wanted; sync(); });
  section.addEventListener('pointerenter',e => { if(e.pointerType==='mouse'){hover=true;sync();} });
  section.addEventListener('pointerleave',e => { if(e.pointerType==='mouse'){hover=false;sync();} });
  viewport.addEventListener('pointerdown',() => {touching=true;sync();}, {passive:true});
  addEventListener('pointerup',() => {touching=false;sync();}, {passive:true});
  addEventListener('pointercancel',() => {touching=false;sync();}, {passive:true});
  section.addEventListener('focusin',sync);
  section.addEventListener('focusout',() => requestAnimationFrame(sync));
  document.addEventListener('visibilitychange',sync);
  motionPreference.addEventListener('change',sync);
  new IntersectionObserver(entries => {visible=entries[0].isIntersecting;sync();}, {threshold:.1}).observe(section);
  new ResizeObserver(() => {belt.style.setProperty('--client-duration',`${list.getBoundingClientRect().width/30}s`);}).observe(list);
  sync();
})();


// Keep direct WhatsApp contact clear of consent, navigation and footer links.
(() => {
  const chat = document.querySelector('.whatsapp-launcher');
  if (!chat) return;
  const cookie = document.querySelector('.cookie-banner');
  const footerBottom = document.querySelector('.footer-bottom');
  let footerVisible = false, queued = false;
  const place = () => {
    queued = false;
    const mobile = innerWidth <= 760;
    const base = mobile ? 16 : 22;
    const rect = cookie && !cookie.hidden ? cookie.getBoundingClientRect() : null;
    // Reserve the banner's whole width on small screens; desktop only lifts if paths intersect.
    const overlaps = rect && rect.right > innerWidth - (mobile ? 210 : 230);
    const bottom = overlaps ? innerHeight - rect.top + 12 : base;
    const menuOpen = mobile && toggle?.getAttribute('aria-expanded') === 'true';
    const insufficientSpace = overlaps && innerHeight - bottom < 160;
    chat.hidden = (menuOpen || footerVisible || insufficientSpace) && document.activeElement !== chat;
    chat.style.setProperty('--whatsapp-bottom', `${bottom}px`);
    chat.classList.add('is-positioned');
  };
  const schedule = () => { if (!queued) {queued=true;requestAnimationFrame(place);} };
  if(cookie) {new ResizeObserver(schedule).observe(cookie);new MutationObserver(schedule).observe(cookie,{attributes:true,attributeFilter:['hidden']});}
  if(toggle) new MutationObserver(schedule).observe(toggle,{attributes:true,attributeFilter:['aria-expanded']});
  if(footerBottom) new IntersectionObserver(entries=>{footerVisible=entries[0].isIntersecting;schedule();}).observe(footerBottom);
  chat.addEventListener('blur',schedule);
  addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  place();
})();
