(function () {
  'use strict';

  /* Mobile menu */
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const menuBackdrop = document.querySelector('.mobile-menu-backdrop');
  const mobileMenu = document.querySelector('.mobile-menu');
  const menuClose = mobileMenu ? mobileMenu.querySelector('.mobile-menu-head button') : null;

  function setMenuOpen(open) {
    if (!menuToggle || !menuBackdrop || !mobileMenu) return;
    menuToggle.classList.toggle('open', open);
    menuBackdrop.classList.toggle('open', open);
    mobileMenu.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }

  if (menuToggle) menuToggle.addEventListener('click', () => setMenuOpen(!menuToggle.classList.contains('open')));
  if (menuBackdrop) menuBackdrop.addEventListener('click', () => setMenuOpen(false));
  if (menuClose) menuClose.addEventListener('click', () => setMenuOpen(false));
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenuOpen(false)));
  }

  /* Count-up stats */
  const countEls = document.querySelectorAll('.count-up[data-target]');
  const countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        countObserver.unobserve(el);
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.textContent.replace(/^0+/, '');
        const duration = 1200;
        const start = performance.now();
        el.classList.add('is-counting');
        function tick(now) {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          const value = Math.round(target * eased);
          el.textContent = value + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.6 }
  );
  countEls.forEach((el) => countObserver.observe(el));

  /* Region filter */
  const filterBar = document.querySelector('.filter-bar');
  const propertyCards = document.querySelectorAll('.property-grid .property-card');
  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      filterBar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const region = btn.textContent.trim();
      propertyCards.forEach((card) => {
        const show = region === '전체' || card.dataset.region === region;
        card.style.display = show ? '' : 'none';
      });
    });
  }

  /* Hero property carousel (built from the property grid cards) */
  const heroWindow = document.querySelector('.hero-feature-window');
  const heroDotsWrap = document.querySelector('.hero-feature-controls div[aria-label="물건 슬라이드 선택"]');
  const heroNextBtn = document.querySelector('.hero-feature-controls > button');
  const heroCounter = document.querySelector('.hero-feature-controls > span');
  const heroProgress = document.querySelector('.hero-rotation-progress span');

  if (heroWindow && propertyCards.length) {
    const slides = Array.from(propertyCards)
      .slice(0, 3)
      .map((card) => ({
        region: card.querySelector('.region')?.textContent || '',
        type: card.querySelector('.property-card-overlay > span')?.textContent || '',
        price: card.querySelector('.property-card-overlay > strong')?.textContent || '',
        title: card.querySelector('h3')?.textContent || '',
        desc: card.querySelector('.property-card-overlay > p')?.textContent || '',
        visualClass: Array.from(card.querySelector('.property-image').classList).find((c) => c.startsWith('visual-')) || 'visual-1',
      }));

    let heroIndex = 0;
    let heroTimer = null;

    function renderHero(i) {
      const s = slides[i];
      heroWindow.innerHTML =
        '<a class="hero-feature-card" href="https://blog.naver.com/ykphone_edu" target="_blank" rel="noreferrer"><div class="hero-feature-image ' +
        s.visualClass +
        '"><span>' +
        s.region +
        '</span><time>' +
        s.type.split('·').pop().trim() +
        '</time></div><div class="hero-feature-copy"><small>대표 분석 물건</small><h3>' +
        s.title +
        '</h3><p>' +
        s.desc +
        '</p><div><strong>' +
        s.price +
        '</strong><b>상세 분석 보기 ↗</b></div></div></a>';
      if (heroDotsWrap) {
        const dots = heroDotsWrap.querySelectorAll('button');
        dots.forEach((d, di) => d.classList.toggle('active', di === i));
      }
      if (heroCounter) heroCounter.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
      if (heroProgress) {
        heroProgress.style.animation = 'none';
        void heroProgress.offsetWidth;
        heroProgress.style.animation = '';
      }
    }

    function goTo(i) {
      heroIndex = (i + slides.length) % slides.length;
      renderHero(heroIndex);
    }

    function restartTimer() {
      if (heroTimer) clearInterval(heroTimer);
      heroTimer = setInterval(() => goTo(heroIndex + 1), 3200);
    }

    if (heroDotsWrap) {
      heroDotsWrap.querySelectorAll('button').forEach((dot, i) => {
        dot.addEventListener('click', () => {
          goTo(i);
          restartTimer();
        });
      });
    }
    if (heroNextBtn) {
      heroNextBtn.addEventListener('click', () => {
        goTo(heroIndex + 1);
        restartTimer();
      });
    }

    renderHero(0);
    restartTimer();
  }

  /* Course finder quiz (single question -> recommended course) */
  const quiz = document.querySelector('.course-quiz');
  const quizQuestion = quiz ? quiz.querySelector('.quiz-question') : null;
  const RESULTS = {
    beginner: {
      badge: 'RECOMMENDED',
      title: '초급반',
      tagline: '경매가 처음이라면 여기서 시작하세요.',
      desc: '용어와 절차, 권리분석 기초부터 모의입찰까지 5주 동안 기본기를 완성합니다.',
      href: '#course-beginner',
      cta: '초급반 자세히 보기',
    },
    intermediate: {
      badge: 'RECOMMENDED',
      title: '중급반',
      tagline: '기초는 아는데 수익 계산이 막막하다면.',
      desc: '배당표 분석, 세금, 특수물건까지 다루며 실전 투자 전략을 익히는 과정입니다.',
      href: '#course-intermediate',
      cta: '중급반 자세히 보기',
    },
    coaching: {
      badge: 'RECOMMENDED',
      title: '낙찰반',
      tagline: '입찰 경험이 있고 실제 낙찰이 목표라면.',
      desc: '대표 추천 물건과 본인 물건 분석, 물건 브리핑과 개별 상담으로 낙찰 성공률을 높입니다.',
      href: '#course-coaching',
      cta: '낙찰반 자세히 보기',
    },
    consulting: {
      badge: 'RECOMMENDED',
      title: '1:1 컨설팅',
      tagline: '시간이 부족하다면 대표와 1:1로.',
      desc: '물건 선정부터 권리분석, 입찰가 산정, 낙찰 후 관리까지 맞춤으로 진행합니다.',
      href: '#course-consulting',
      cta: '1:1 컨설팅 알아보기',
    },
  };
  const QUIZ_OPTION_RESULTS = ['beginner', 'intermediate', 'coaching', 'consulting'];

  function showQuizResult(resultKey) {
    if (!quiz) return;
    const r = RESULTS[resultKey];
    const resultEl = document.createElement('div');
    resultEl.className = 'quiz-result';
    resultEl.innerHTML =
      '<small>진단 결과</small><span class="quiz-result-badge">' +
      r.badge +
      '</span><h3>' +
      r.title +
      '</h3><strong>' +
      r.tagline +
      '</strong><div>' +
      r.desc +
      '</div><a href="' +
      r.href +
      '">' +
      r.cta +
      ' <span>→</span></a><button type="button">다시 진단하기</button>';
    quiz.replaceChild(resultEl, quiz.querySelector('.quiz-question') || quiz.querySelector('.quiz-result'));
    resultEl.querySelector('button').addEventListener('click', () => {
      quiz.replaceChild(quizQuestion, resultEl);
    });
  }

  if (quizQuestion) {
    const options = quizQuestion.querySelectorAll('.quiz-options button');
    options.forEach((btn, i) => {
      btn.addEventListener('click', () => showQuizResult(QUIZ_OPTION_RESULTS[i]));
    });
  }

  /* Review tabs */
  const reviewTabs = document.querySelectorAll('.review-tabs button[role="tab"]');
  const reviewTrack = document.querySelector('.review-track');
  const reviewPlaceholder = document.querySelector('.review-placeholder');
  reviewTabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      reviewTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const showTrack = i === 0;
      if (reviewTrack) reviewTrack.style.display = showTrack ? '' : 'none';
      if (reviewPlaceholder) reviewPlaceholder.classList.toggle('show', !showTrack);
    });
  });

  /* Review image lightbox */
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML =
    '<button type="button" class="lightbox-close" aria-label="닫기">×</button><div class="lightbox-inner"><img alt=""/><div class="lightbox-caption"></div></div>';
  document.body.appendChild(lightbox);
  const lightboxImg = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('.lightbox-caption');

  function openLightbox(src, caption) {
    lightboxImg.src = src;
    lightboxImg.alt = caption || '';
    lightboxCaption.textContent = caption || '';
    lightbox.classList.add('open');
  }
  function closeLightbox() {
    lightbox.classList.remove('open');
    lightboxImg.src = '';
  }
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox-close')) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  document.querySelectorAll('.review-card').forEach((card) => {
    if (card.hasAttribute('tabindex') && card.getAttribute('tabindex') === '-1') return;
    card.addEventListener('click', () => {
      const img = card.querySelector('img');
      const caption = card.querySelector('.review-card-copy strong');
      if (img) openLightbox(img.src, caption ? caption.textContent : '');
    });
  });
})();
