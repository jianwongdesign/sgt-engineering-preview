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
// Animate only the six cards, not a screenshot of the whole scrolling page.
let filterAnimations = [];
let requestedSector = 'all';
filters.forEach(filter => filter.addEventListener('click', () => {
  if (filter.dataset.filter === requestedSector) return;
  requestedSector = filter.dataset.filter;
  const grid = document.querySelector('.project-grid');
  const before = new Map([...projects].filter(p => !p.hidden).map(p => [p, p.getBoundingClientRect()]));
  filterAnimations.forEach(animation => animation.cancel());
  filterProjects(requestedSector);
  filterAnimations = [];
  if (!motionPreference.matches) {
    const after = [...projects].filter(p => !p.hidden).map(p => [p, p.getBoundingClientRect()]);
    filterAnimations = after.map(([project, rect]) => {
      const old = before.get(project);
      return project.animate([
        {transform: old ? `translate(${old.left-rect.left}px,${old.top-rect.top}px)` : 'none', opacity:old ? 1 : 0},
        {transform:'none',opacity:1}
      ], {duration:240,easing:motionEase});
    });
    const current = filterAnimations;
    grid?.setAttribute('aria-busy','true');
    Promise.allSettled(current.map(a => a.finished)).then(() => {
      if (filterAnimations === current) { grid?.removeAttribute('aria-busy'); filterAnimations = []; }
    });
  } else grid?.removeAttribute('aria-busy');
}));
motionPreference.addEventListener('change', () => {
  if (motionPreference.matches) filterAnimations.forEach(animation => animation.finish());
});
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
  const belt = track.querySelector('.timeline-belt');
  const records = [...belt.querySelectorAll('.timeline-record')];
  const previous = timeline.querySelector('[data-timeline-prev]');
  const next = timeline.querySelector('[data-timeline-next]');
  const years = [...timeline.querySelectorAll('[data-timeline-year]')];
  const position = timeline.querySelector('.timeline-position');
  const motion = timeline.querySelector('[data-timeline-motion]');
  records.forEach(record => {
    const copy = record.cloneNode(true);
    copy.dataset.timelineCopy = '';
    copy.setAttribute('aria-hidden','true'); copy.inert = true;
    belt.append(copy);
  });
  track.classList.add('has-marquee');
  let animation, statusTimer, resumeTimer, scrollTimer;
  let stride = 1, recordWidth = 1, viewportWidth = 1, loopWidth = 1;
  let remainder = 0, destination = null;
  let inView = false, hovered = timeline.matches(':hover'), touching = false;
  let wanted = !motionPreference.matches, holdUntil = 0;
  const offset = () => animation ? (Number(animation.currentTime || 0) * .032) % loopWidth : track.scrollLeft + remainder;
  const update = () => {
    const left = offset();
    previous.disabled = left <= 2;
    next.disabled = left >= (records.length - 1) * stride - 2;
    const first = Math.max(0, Math.floor((left + 20 - recordWidth) / stride) + 1);
    const last = Math.max(first, Math.ceil((left + viewportWidth - 20) / stride) - 1);
    const visible = Array.from({length:last-first+1},(_,i)=>(first+i)%records.length+1);
    const label = `${visible[0] <= visible.at(-1) ? `${visible[0]}–${visible.at(-1)}` : visible.join(', ')} of ${records.length} projects`;
    if (position.textContent !== label) position.textContent = label;
    years.forEach(button => {
      const value = String(button.dataset.timelineYear === records[first % records.length].dataset.startYear);
      if (button.getAttribute('aria-pressed') !== value) button.setAttribute('aria-pressed', value);
    });
  };
  // Transfer the visual offset to native scrolling only when interaction pauses autoplay.
  // Retaining the fractional remainder prevents a half-pixel jump at pause/resume.
  const stop = () => {
    if (!animation) return;
    const left = offset();
    animation.cancel(); animation = null;
    belt.style.transform = '';
    track.scrollLeft = left;
    remainder = left - track.scrollLeft;
    belt.style.transform = `translate3d(${-remainder}px,0,0)`;
    clearInterval(statusTimer);
  };
  function syncMotion() {
    const focused = timeline.contains(document.activeElement) && document.activeElement !== motion;
    const running = wanted && !motionPreference.matches && inView && !hovered && !focused && !touching && !document.hidden && performance.now() >= holdUntil;
    motion.hidden = motionPreference.matches;
    motion.setAttribute('aria-label',wanted ? 'Pause automatic project scrolling' : 'Play automatic project scrolling');
    motion.querySelector('span').textContent = wanted ? 'Pause' : 'Play';
    motion.classList.toggle('is-paused',!wanted);
    position.setAttribute('aria-live',running ? 'off' : 'polite');
    if (running && !animation && loopWidth > 1) {
      const left = offset() % loopWidth;
      track.scrollLeft = 0; remainder = 0; belt.style.transform = '';
      animation = belt.animate([{transform:'translate3d(0,0,0)'},{transform:`translate3d(${-loopWidth}px,0,0)`}],{duration:loopWidth/.032,iterations:Infinity,easing:'linear'});
      animation.currentTime = left / .032;
      statusTimer = setInterval(update,250);
    } else if (!running) stop();
    update();
  }
  const hold = () => {
    holdUntil = performance.now() + 1800;
    clearTimeout(resumeTimer);resumeTimer = setTimeout(syncMotion,1850);syncMotion();
  };
  const go = index => {
    hold(); remainder = 0; belt.style.transform = '';
    destination = Math.max(0,Math.min(index,records.length-1));
    track.scrollTo({left:destination*stride,behavior:motionPreference.matches ? 'instant' : 'smooth'});
  };
  const current = () => destination ?? Math.round(offset()/stride) % records.length;
  previous.addEventListener('click',() => go(current()-1));
  next.addEventListener('click',() => go(current()+1));
  years.forEach(button => button.addEventListener('click',() => go(records.findIndex(r=>r.dataset.startYear===button.dataset.timelineYear))));
  track.addEventListener('keydown',event => {
    if(event.target!==track || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();go(event.key==='Home'?0:event.key==='End'?records.length-1:current()+(event.key==='ArrowRight'?1:-1));
  });
  motion.addEventListener('click',() => {wanted=!wanted;syncMotion();});
  timeline.addEventListener('pointerenter',event => {if(event.pointerType==='mouse'){hovered=true;syncMotion();}});
  timeline.addEventListener('pointerleave',event => {if(event.pointerType==='mouse'){hovered=false;syncMotion();}});
  timeline.addEventListener('focusin',syncMotion);
  timeline.addEventListener('focusout',() => requestAnimationFrame(syncMotion));
  track.addEventListener('pointerdown',() => {touching=true;syncMotion();},{passive:true});
  const release=()=>{if(touching){touching=false;hold();}};
  addEventListener('pointerup',release,{passive:true});addEventListener('pointercancel',release,{passive:true});
  track.addEventListener('wheel',hold,{passive:true});
  document.addEventListener('visibilitychange',syncMotion);
  motionPreference.addEventListener('change',() => {wanted=!motionPreference.matches;syncMotion();});
  new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;syncMotion();},{threshold:.1}).observe(track);
  track.addEventListener('scroll',() => {
    if(animation)return;
    clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{destination=null;update();},120);
  },{passive:true});
  let drag;
  track.addEventListener('pointerdown',event => {
    if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('a,button'))return;
    drag={id:event.pointerId,x:event.clientX,left:track.scrollLeft,moved:false};track.setPointerCapture(event.pointerId);
  });
  track.addEventListener('pointermove',event => {
    if(!drag||drag.id!==event.pointerId)return;
    const delta=event.clientX-drag.x;if(!drag.moved&&Math.abs(delta)<6)return;
    drag.moved=true;destination=null;remainder=0;belt.style.transform='';track.classList.add('is-dragging');
    track.scrollLeft=drag.left-delta;event.preventDefault();
  });
  const endDrag=()=>{
    if(!drag)return;const {moved,id}=drag;drag=null;track.classList.remove('is-dragging');
    if(track.hasPointerCapture(id))track.releasePointerCapture(id);
    if(moved)go(Math.round(track.scrollLeft/stride));
  };
  track.addEventListener('pointerup',endDrag);track.addEventListener('pointercancel',endDrag);track.addEventListener('lostpointercapture',endDrag);
  // Geometry is measured only at resize/font readiness, never on an animation frame.
  const measure=()=>{
    stop();destination=null;
    const first=records[0].getBoundingClientRect(),second=records[1]?.getBoundingClientRect();
    recordWidth=first.width;viewportWidth=track.clientWidth;stride=second?second.left-first.left:recordWidth;loopWidth=stride*records.length;
    syncMotion();
  };
  new ResizeObserver(measure).observe(track);document.fonts.ready.then(measure);measure();
})();

// Three project films: keep a poster visible and decode the next scene before fading.
(() => {
  const hero = document.querySelector('.hero');
  const scenes = [...document.querySelectorAll('[data-hero-scene]')];
  const videos = scenes.map(scene => scene.querySelector('video'));
  const button = hero?.querySelector('.hero-motion');
  const selectors = [...document.querySelectorAll('[data-hero-select]')];
  if (!hero || !scenes.length || !button) return;
  const connection = navigator.connection;
  const failed = new Set();
  let active = 0, wanted = !motionPreference.matches && !connection?.saveData;
  let visible = true, request = 0, fadeTimer;
  hero.querySelector('.hero-controls').hidden = false;
  const canPlay = () => wanted && visible && !document.hidden;
  const reflect = () => {
    const playing = !videos[active].paused;
    button.hidden = failed.has(active);
    button.classList.toggle('is-playing',playing);
    button.setAttribute('aria-label',`${playing ? 'Pause' : 'Play'} background video`);
    button.setAttribute('aria-controls',videos[active].id);
    button.querySelector('span').textContent = `${playing ? 'Pause' : 'Play'} video`;
  };
  const load = index => {
    const video = videos[index];
    if (!video.getAttribute('src') && !failed.has(index)) { video.preload = 'auto'; video.src = video.dataset.src; }
  };
  const ready = index => new Promise(resolve => {
    const video = videos[index];
    if (failed.has(index)) { resolve(false); return; }
    if (video.readyState >= 2) { resolve(true); return; }
    let timer;
    const done = () => {clearTimeout(timer);video.removeEventListener('loadeddata',done);video.removeEventListener('error',done);resolve(video.readyState>=2);};
    video.addEventListener('loadeddata',done);video.addEventListener('error',done);
    timer=setTimeout(done,8000);load(index);
  });
  const next = () => {
    for(let step=1;step<scenes.length;step++){const index=(active+step)%scenes.length;if(!failed.has(index))return index;}
    return active;
  };
  const activate = index => {
    clearTimeout(fadeTimer);
    scenes.forEach(scene=>scene.classList.remove('is-leaving'));
    if(index!==active){scenes[active].classList.add('is-leaving');videos[active].pause();}
    active=index;
    scenes.forEach((scene,i)=>scene.classList.toggle('is-active',i===active));
    selectors.forEach((selector,i)=>selector.setAttribute('aria-pressed',String(i===active)));
    hero.querySelector('.hero-caption>span').textContent=scenes[active].dataset.visualLabel;
    const link=hero.querySelector('.hero-caption a');link.href=scenes[active].dataset.projectUrl;
    link.querySelector('span').textContent=`View the ${scenes[active].dataset.projectTitle} project`;
    fadeTimer=setTimeout(()=>scenes.forEach(scene=>scene.classList.remove('is-leaving')),750);
    reflect();
  };
  const select = async (index,automatic=false) => {
    const token=++request;
    if(automatic&&!canPlay())return;
    if(canPlay()) {
      await ready(index);
      if(token!==request || (automatic&&!canPlay()))return;
      if(canPlay()&&!failed.has(index)) {
        const video=videos[index];
        if(index!==active || video.ended)video.currentTime=0;
        try{await video.play();}catch{/* Poster and manual Play survive autoplay restrictions. */}
        if(token!==request){if(index!==active||!canPlay())video.pause();return;}
        if(!canPlay())video.pause();
      }
    }
    if(automatic&&failed.has(index)){const available=next();if(available!==active)return select(available,true);}
    activate(index);
  };
  const sync = () => {
    if(!canPlay()){request++;videos.forEach(video=>video.pause());reflect();return;}
    select(active);
  };
  videos.forEach((video,index)=>{
    video.muted=true;
    video.addEventListener('playing',()=>{video.classList.add('is-ready');if(index===active)reflect();});
    video.addEventListener('pause',()=>{if(index===active)reflect();});
    video.addEventListener('error',()=>{failed.add(index);video.classList.remove('is-ready');if(index===active)reflect();});
    video.addEventListener('ended',()=>{
      if(index!==active||!canPlay())return;
      const following=next();select(following,true);
    });
    video.addEventListener('timeupdate',()=>{
      if(index===active&&canPlay()&&!connection?.saveData&&video.duration-video.currentTime<2)load(next());
    });
  });
  selectors.forEach((selector,index)=>selector.addEventListener('click',()=>select(index)));
  button.addEventListener('click',()=>{wanted=videos[active].paused;sync();});
  const preferenceChanged=()=>{
    wanted=!motionPreference.matches&&!connection?.saveData;
    if(!wanted)videos.forEach(video=>video.classList.remove('is-ready'));
    sync();
  };
  motionPreference.addEventListener('change',preferenceChanged);connection?.addEventListener('change',preferenceChanged);
  document.addEventListener('visibilitychange',sync);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.05}).observe(hero);
  sync();
})();


// Native details remain usable without JavaScript; animation is interruption-safe.
document.querySelectorAll('details.faq, details.career-role, .additional-capabilities details').forEach(details => {
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
    const styles = getComputedStyle(details);
    const chrome = ['borderTopWidth','borderBottomWidth','paddingTop','paddingBottom'].reduce((sum,key)=>sum+parseFloat(styles[key] || 0),0);
    const to = expanded ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + chrome;
    details.style.overflow = 'hidden';
    animation = details.animate({height:[`${from}px`,`${to}px`]}, {duration:expanded ? 260 : 200,easing:motionEase});
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
  const footerBottom = document.querySelector('.site-footer');
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
    chat.hidden = (menuOpen || footerVisible || insufficientSpace) && !chat.contains(document.activeElement);
    chat.style.setProperty('--whatsapp-bottom', `${bottom}px`);
    chat.classList.add('is-positioned');
  };
  const schedule = () => { if (!queued) {queued=true;requestAnimationFrame(place);} };
  if(cookie) {new ResizeObserver(schedule).observe(cookie);new MutationObserver(schedule).observe(cookie,{attributes:true,attributeFilter:['hidden']});}
  if(toggle) new MutationObserver(schedule).observe(toggle,{attributes:true,attributeFilter:['aria-expanded']});
  if(footerBottom) new IntersectionObserver(entries=>{footerVisible=entries[0].isIntersecting;schedule();}).observe(footerBottom);
  chat.addEventListener('focusout',schedule);
  chat.addEventListener('toggle',schedule);
  document.addEventListener('click',event=>{if(!chat.contains(event.target))chat.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && chat.open){chat.open=false;chat.querySelector('summary').focus();}});
  addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  place();
})();

// A role linked from Home opens directly, including when the hash changes in-page.
(() => {
  const revealRole = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const role = id ? document.getElementById(id) : null;
    if (role?.matches('details.career-role')) {
      document.querySelectorAll('details.career-role').forEach(item => { item.open = item === role; });
      document.fonts.ready.then(() => {
        role.scrollIntoView({block:'start',behavior:'instant'});
        role.querySelector('summary').focus({preventScroll:true});
      });
    }
  };
  addEventListener('hashchange',revealRole);
  revealRole();
})();
